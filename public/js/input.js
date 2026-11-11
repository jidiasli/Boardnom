import { CFG } from './config.js';
import { clamp, isTypingTarget } from './util.js';
import { unionFrames } from './objects.js';

const KEYMAP = { v: 'select', h: 'pan', p: 'pen', m: 'highlighter', e: 'eraser', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', t: 'text', n: 'sticky' };

/**
 * Single entry point for ALL pointer / wheel / keyboard input.
 *
 * Why this cannot lock the board (bug #3):
 *  - Interaction state lives in ONE place (pointers / gesture / pan / activeTool).
 *  - Pointer capture guarantees we always receive the matching pointerup.
 *  - pointercancel, lostpointercapture, window blur, tab hidden, Escape and any tool change
 *    all call reset(), which returns everything to idle.
 *  - Wheel zoom is bound to the whole stage and never depends on tool or editor state.
 */
export class InputRouter {
  constructor(app) {
    this.app = app;
    this.canvas = app.canvas;
    this.stage = app.stage;
    this.pointers = new Map(); // pointerId -> {x, y} in client px
    this.gesture = null; // two-finger pinch/pan
    this.pan = null; // single-pointer pan (Hand tool / Space / middle mouse)
    this.blocked = false; // after a gesture: ignore the remaining finger until all are lifted
    this.activeTool = null;
    this.spaceDown = false;
    this.lastCursorSend = 0;
    this.#bind();
  }

  #bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.#down(e));
    c.addEventListener('pointermove', (e) => this.#move(e));
    c.addEventListener('pointerup', (e) => this.#up(e));
    c.addEventListener('pointercancel', (e) => this.#cancel(e));
    c.addEventListener('lostpointercapture', (e) => { if (this.pointers.has(e.pointerId)) this.#cancel(e); });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    this.stage.addEventListener('wheel', (e) => this.#wheel(e), { passive: false });
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
    document.addEventListener('keydown', (e) => this.#keydown(e));
    document.addEventListener('keyup', (e) => this.#keyup(e));
    document.addEventListener('gesturestart', (e) => e.preventDefault()); // iOS page-pinch
  }

  /** Return to idle no matter what was happening. */
  reset() {
    this.pointers.clear();
    this.gesture = null;
    this.pan = null;
    this.blocked = false;
    this.spaceDown = false;
    this.#cancelTool();
    this.#refreshCursor();
  }

  #cancelTool() {
    const t = this.activeTool;
    this.activeTool = null;
    try { t?.onCancel?.(); } catch (err) { console.error(err); }
  }

  #refreshCursor() {
    this.app.setCursor(this.pan ? 'grabbing' : this.spaceDown ? 'grab' : (this.app.tool?.cursor ?? 'default'));
  }

  #ev(e, extra) {
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const w = this.app.camera.toWorld(sx, sy);
    return { sx, sy, wx: w.x, wy: w.y, pointerId: e.pointerId, pointerType: e.pointerType, shiftKey: e.shiftKey, altKey: e.altKey, button: e.button, ...extra };
  }

  #sendCursor(ev) {
    const now = performance.now();
    if (now - this.lastCursorSend < CFG.cursorSendMs) return;
    this.lastCursorSend = now;
    this.app.net.cursor(ev.wx, ev.wy);
  }

  // ---- pointer ------------------------------------------------------------
  #down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    this.app.editor.commit(); // finish any text edit before doing anything else
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.pointers.size >= 2) return this.#startGesture();
    if (this.blocked) return;

    const tool = this.app.tool;
    if (e.button === 1 || this.spaceDown || tool.id === 'pan') {
      this.pan = { x: e.clientX, y: e.clientY };
      this.#refreshCursor();
      return;
    }
    this.activeTool = tool;
    tool.onDown(this.#ev(e));
  }

  #move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) { // hover (mouse / pen without contact)
      if (e.pointerType === 'mouse' && !this.gesture) {
        const ev = this.#ev(e);
        this.#sendCursor(ev);
        this.app.tool.onHover?.(ev);
      }
      return;
    }
    p.x = e.clientX; p.y = e.clientY;

    if (this.gesture && this.pointers.size >= 2) return this.#updateGesture();
    if (this.pan) {
      this.app.camera.panBy(e.clientX - this.pan.x, e.clientY - this.pan.y);
      this.pan.x = e.clientX; this.pan.y = e.clientY;
      return;
    }
    if (this.blocked || !this.activeTool) return;

    const ev = this.#ev(e);
    const batch = e.getCoalescedEvents?.() ?? [];
    ev.points = (batch.length ? batch : [e]).map((ce) => {
      const w = this.app.camera.toWorld(ce.clientX - this.canvas.getBoundingClientRect().left, ce.clientY - this.canvas.getBoundingClientRect().top);
      return { wx: w.x, wy: w.y };
    });
    this.#sendCursor(ev);
    this.activeTool.onMove(ev);
  }

  #up(e) {
    if (!this.pointers.delete(e.pointerId)) return;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }

    const wasGesture = !!this.gesture;
    if (this.gesture && this.pointers.size < 2) this.gesture = null;
    if (wasGesture || this.blocked) {
      if (this.pointers.size === 0) this.blocked = false;
      return;
    }
    if (this.pan) { this.pan = null; this.#refreshCursor(); return; }

    const tool = this.activeTool;
    this.activeTool = null;
    tool?.onUp(this.#ev(e));
  }

  #cancel(e) {
    this.pointers.delete(e.pointerId);
    this.#cancelTool();
    this.pan = null;
    if (this.pointers.size < 2) this.gesture = null;
    if (this.pointers.size === 0) this.blocked = false;
    this.#refreshCursor();
  }

  // ---- two-finger pinch + pan --------------------------------------------
  #startGesture() {
    this.#cancelTool(); // whatever the first finger was drawing/dragging is discarded cleanly
    this.pan = null;
    this.blocked = true;
    this.gesture = this.#measure();
  }

  #measure() {
    const [a, b] = [...this.pointers.values()];
    const r = this.canvas.getBoundingClientRect();
    return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2 - r.left, cy: (a.y + b.y) / 2 - r.top };
  }

  #updateGesture() {
    const g = this.gesture, n = this.#measure();
    this.app.camera.panBy(n.cx - g.cx, n.cy - g.cy);
    this.app.camera.zoomAt(n.cx, n.cy, n.dist / g.dist);
    this.gesture = n;
  }

  // ---- wheel zoom ---------------------------------------------------------
  #wheel(e) {
    if (e.target.closest?.('#props, #zoombar, #toolbar, #topbar')) return;
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const unit = e.deltaMode === 1 ? 16 : 1;
    const dy = clamp(e.deltaY * unit, -300, 300);
    if (e.shiftKey && !e.ctrlKey) {
      this.app.camera.panBy(-(e.deltaX * unit || dy), 0);
    } else {
      this.app.camera.zoomAt(sx, sy, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0015)));
    }
  }

  // ---- keyboard -----------------------------------------------------------
  #keydown(e) {
    if (isTypingTarget(e.target)) return;
    const app = this.app;
    const key = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;

    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) { this.spaceDown = true; this.#refreshCursor(); }
      return;
    }
    if (mod) {
      if (key === 'z') { e.preventDefault(); e.shiftKey ? app.history.redo() : app.history.undo(); }
      else if (key === 'y') { e.preventDefault(); app.history.redo(); }
      else if (key === 'd') { e.preventDefault(); app.actions.duplicate([...app.store.selection]); }
      else if (key === 'a') {
        e.preventDefault();
        app.setTool('select');
        app.store.setSelection(app.store.list().filter((o) => app.store.canEdit(o)).map((o) => o.id));
      }
      return;
    }
    if (key === 'escape') { this.reset(); app.editor.cancel(); app.store.clearSelection(); return; }
    if (key === 'delete' || key === 'backspace') {
      e.preventDefault();
      if (app.store.selection.size) { app.actions.remove([...app.store.selection]); }
      return;
    }
    if (key === 'enter') {
      const sel = app.store.selected();
      if (sel.length === 1 && sel[0].type === 'text') { e.preventDefault(); app.editor.openFor(sel[0]); }
      return;
    }
    if (KEYMAP[key]) { app.setTool(KEYMAP[key]); return; }
    const c = app.camera;
    if (key === '+' || key === '=') c.zoomAt(c.w / 2, c.h / 2, 1.25);
    else if (key === '-') c.zoomAt(c.w / 2, c.h / 2, 0.8);
    else if (key === '0') app.fitView();
  }

  #keyup(e) {
    if (e.code === 'Space') { this.spaceDown = false; this.#refreshCursor(); }
  }
}
