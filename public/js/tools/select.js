import { hitTest } from '../objects.js';
import { getSelectionBox, hitHandle, computeResize } from '../selection.js';
import { normRect, rectsIntersect } from '../util.js';

const pickKeys = (o, keys) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));
const GEOM = ['x', 'y', 'w', 'h', 'fontSize'];

/**
 * Select / move / resize / marquee. Works on ANY object type through the shared frame,
 * so a pasted image behaves exactly like a shape or a stroke.
 * Objects you may not edit are invisible to this tool (clicks pass straight through them).
 */
export class SelectTool {
  constructor(app) {
    this.app = app; this.id = 'select'; this.cursor = 'default';
    this.mode = 'idle';
    this.marquee = null;
    this.lastTap = { t: 0, id: null, sx: 0, sy: 0 };
  }

  pick(wx, wy, tolPx) {
    const { store, camera } = this.app;
    const tol = tolPx / camera.zoom;
    const list = store.list();
    for (let i = list.length - 1; i >= 0; i--) {
      const o = list[i];
      if (o.id === store.editingId || !store.canEdit(o)) continue;
      if (hitTest(o, wx, wy, tol)) return o;
    }
    return null;
  }

  onHover(ev) {
    const { store, camera } = this.app;
    let cur = 'default';
    const sb = getSelectionBox(store, camera.zoom);
    const h = sb && hitHandle(sb, camera, ev.sx, ev.sy, 12);
    if (h) cur = h.cursor;
    else if (this.pick(ev.wx, ev.wy, 7)) cur = 'move';
    this.app.setCursor(cur);
  }

  onDown(ev) {
    const { store, camera, editor } = this.app;
    const touch = ev.pointerType === 'touch';

    const sb = getSelectionBox(store, camera.zoom);
    if (sb) {
      const h = hitHandle(sb, camera, ev.sx, ev.sy, touch ? 22 : 12);
      if (h) return this.#beginResize(h, sb);
    }

    const hit = this.pick(ev.wx, ev.wy, touch ? 14 : 7);
    if (!hit) {
      if (!ev.shiftKey) store.clearSelection();
      this.mode = 'marquee';
      this.marquee = { x1: ev.wx, y1: ev.wy, x2: ev.wx, y2: ev.wy, base: ev.shiftKey ? new Set(store.selection) : new Set() };
      return;
    }

    // double click / double tap on text => edit it
    const now = performance.now();
    const lt = this.lastTap;
    const isDouble = lt.id === hit.id && now - lt.t < 400 && Math.hypot(ev.sx - lt.sx, ev.sy - lt.sy) < 10;
    this.lastTap = { t: now, id: hit.id, sx: ev.sx, sy: ev.sy };
    if (isDouble && hit.type === 'text') {
      this.lastTap = { t: 0, id: null, sx: 0, sy: 0 };
      store.setSelection([hit.id]);
      this.mode = 'idle';
      editor.openFor(hit);
      return;
    }

    if (ev.shiftKey) {
      store.toggleSelection(hit.id);
      if (!store.selection.has(hit.id)) return;
    } else if (!store.selection.has(hit.id)) {
      store.setSelection([hit.id]);
    }
    this.#beginMove(ev);
  }

  #beginMove(ev) {
    this.mode = 'move';
    this.start = { x: ev.wx, y: ev.wy, sx: ev.sx, sy: ev.sy };
    this.moved = false;
    this.snaps = this.app.store.selected().map((o) => ({ id: o.id, x: o.x, y: o.y }));
  }

  #beginResize(handle, sb) {
    const { store } = this.app;
    this.mode = 'resize';
    this.rs = {
      handle, pad: sb.pad, frame0: { ...sb.frame }, uniform: sb.uniform,
      snaps: store.selected().map((o) => ({ id: o.id, type: o.type, wrap: o.wrap, x: o.x, y: o.y, w: o.w, h: o.h, fontSize: o.fontSize })),
    };
  }

  onMove(ev) {
    const { actions, store } = this.app;
    if (this.mode === 'move') {
      if (!this.moved && Math.hypot(ev.sx - this.start.sx, ev.sy - this.start.sy) < 3) return; // dead zone
      this.moved = true;
      const dx = ev.wx - this.start.x, dy = ev.wy - this.start.y;
      for (const s of this.snaps) actions.patch(s.id, { x: s.x + dx, y: s.y + dy });
    } else if (this.mode === 'resize') {
      const { handle, frame0, pad, snaps, uniform } = this.rs;
      const corner = handle.sx !== 0 && handle.sy !== 0;
      const useUniform = uniform || (ev.shiftKey && corner);
      for (const r of computeResize(snaps, frame0, handle, ev.wx, ev.wy, pad, useUniform)) actions.patch(r.id, r.patch);
    } else if (this.mode === 'marquee') {
      const m = this.marquee;
      m.x2 = ev.wx; m.y2 = ev.wy;
      const rect = normRect(m.x1, m.y1, m.x2, m.y2);
      const ids = store.list()
        .filter((o) => store.canEdit(o) && rectsIntersect(rect, { x: o.x, y: o.y, w: o.w, h: o.h }))
        .map((o) => o.id);
      store.setSelection([...m.base, ...ids]);
      this.app.render();
    }
  }

  onUp() {
    const { store, actions } = this.app;
    if (this.mode === 'move' && this.moved) {
      actions.commit(this.snaps.map((s) => {
        const o = store.get(s.id);
        return { id: s.id, before: { x: s.x, y: s.y }, after: o ? { x: o.x, y: o.y } : { x: s.x, y: s.y } };
      }));
    } else if (this.mode === 'resize') {
      actions.commit(this.rs.snaps.map((s) => {
        const o = store.get(s.id);
        return { id: s.id, before: pickKeys(s, GEOM), after: o ? pickKeys(o, GEOM) : pickKeys(s, GEOM) };
      }));
    }
    this.#reset();
  }

  /** Interrupted (second finger, lost capture, Escape): put things back exactly as they were. */
  onCancel() {
    const { actions } = this.app;
    if (this.mode === 'move') for (const s of this.snaps) actions.patch(s.id, { x: s.x, y: s.y });
    if (this.mode === 'resize') for (const s of this.rs.snaps) actions.patch(s.id, pickKeys(s, GEOM));
    actions.flush();
    this.#reset();
  }

  #reset() {
    this.mode = 'idle';
    this.marquee = null;
    this.snaps = null;
    this.rs = null;
    this.app.render();
  }

  drawOverlay(ctx, cam) {
    const m = this.marquee;
    if (!m) return;
    const r = normRect(m.x1, m.y1, m.x2, m.y2);
    ctx.save();
    ctx.fillStyle = 'rgba(59, 91, 219, 0.08)';
    ctx.strokeStyle = 'rgba(59, 91, 219, 0.9)';
    ctx.lineWidth = 1 / cam.zoom;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  }
}
