import { CFG } from './config.js';
import { FONT, LINE_HEIGHT, STICKY_PAD, measureText } from './objects.js';

/**
 * Text editing overlay. A plain <textarea> that exists only on THIS client while you type.
 * It never follows the pointer, never captures wheel events, and is removed on commit,
 * so it cannot lock the board. Other users only ever see the committed object.
 */
export class TextEditor {
  constructor(app, host) {
    this.app = app; this.host = host;
    this.active = null; // { mode, id?, kind, x, y, w, h, fontSize, color, bg, wrap, ta, openedAt }
    app.camera.on('change', () => this.#position());
    app.store.on('objects', () => {
      const a = this.active;
      if (a?.mode === 'edit' && !app.store.get(a.id)) this.#teardown(); // deleted remotely while editing
    });
  }

  get isOpen() { return !!this.active; }

  openNew({ kind, x, y }) {
    this.commit();
    const s = this.app.store.settings;
    if (kind === 'sticky') {
      const { w, h } = CFG.stickySize;
      this.#open({ mode: 'new', kind, x: x - w / 2, y: y - h / 2, w, h, fontSize: 20, color: CFG.stickyTextColor, bg: s.stickyColor, wrap: true, text: '' });
    } else {
      this.#open({ mode: 'new', kind, x, y, w: 0, h: 0, fontSize: s.fontSize, color: s.color, bg: null, wrap: false, text: '' });
    }
  }

  openFor(obj) {
    if (!this.app.store.canEdit(obj) || obj.type !== 'text') return;
    this.commit();
    this.app.store.editingId = obj.id;
    this.app.store._changed('objects');
    this.#open({ mode: 'edit', id: obj.id, kind: obj.bg ? 'sticky' : 'text', x: obj.x, y: obj.y, w: obj.w, h: obj.h, fontSize: obj.fontSize, color: obj.color, bg: obj.bg, wrap: obj.wrap, text: obj.text });
  }

  #open(a) {
    const ta = document.createElement('textarea');
    ta.className = `text-editor ${a.bg ? 'is-sticky' : ''}`;
    ta.value = a.text;
    ta.spellcheck = false;
    ta.setAttribute('wrap', a.wrap ? 'soft' : 'off');
    ta.style.color = a.color;
    if (a.bg) ta.style.background = a.bg;
    a.ta = ta;
    a.openedAt = performance.now();
    this.active = a;

    ta.addEventListener('keydown', (e) => {
      e.stopPropagation(); // global shortcuts must not fire while typing
      if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) { e.preventDefault(); this.commit(); }
    });
    ta.addEventListener('input', () => this.#position());
    ta.addEventListener('pointerdown', (e) => e.stopPropagation());
    ta.addEventListener('blur', () => {
      // A blur right after opening is a stray focus change (e.g. touch compatibility events), not the user leaving.
      if (this.active === a && performance.now() - a.openedAt < 300) { ta.focus(); return; }
      if (this.active === a) this.commit();
    });

    this.host.appendChild(ta);
    this.#position();
    ta.focus();
  }

  #position() {
    const a = this.active;
    if (!a) return;
    const { camera } = this.app;
    const z = camera.zoom;
    const { x, y } = camera.toScreen(a.x, a.y);
    const st = a.ta.style;
    st.left = `${x}px`; st.top = `${y}px`;
    st.fontFamily = FONT;
    st.fontSize = `${a.fontSize * z}px`;
    st.lineHeight = String(LINE_HEIGHT);
    if (a.wrap) {
      st.width = `${a.w * z}px`; st.height = `${a.h * z}px`; st.padding = `${STICKY_PAD * z}px`;
    } else {
      const m = measureText(a.ta.value || ' ', a.fontSize);
      st.width = `${(m.w + a.fontSize) * z}px`; st.height = `${(m.h + 4) * z}px`; st.padding = '0';
    }
  }

  /** Save and close. Safe to call any time (no-op when nothing is open). */
  commit() {
    const a = this.active;
    if (!a) return;
    const text = a.ta.value;
    this.#teardown();
    const { actions, store } = this.app;
    const trimmed = text.trim();

    if (a.mode === 'new') {
      if (!trimmed) return;
      const size = a.wrap ? { w: a.w, h: a.h } : measureText(text, a.fontSize);
      const [obj] = actions.create({ type: 'text', x: a.x, y: a.y, ...size, text, fontSize: a.fontSize, color: a.color, bg: a.bg, wrap: a.wrap });
      if (obj) { this.app.setTool('select'); store.setSelection([obj.id]); } // ready to move straight away
    } else {
      const o = store.get(a.id);
      if (!o) return;
      if (!trimmed) { actions.remove([a.id]); return; }
      if (text === o.text) return;
      const before = { text: o.text, w: o.w, h: o.h };
      const patch = a.wrap ? { text } : { text, ...measureText(text, o.fontSize) };
      actions.patch(a.id, patch);
      actions.commit([{ id: a.id, before, after: { text: patch.text, w: patch.w ?? o.w, h: patch.h ?? o.h } }]);
    }
  }

  /** Close without saving. */
  cancel() { if (this.active) this.#teardown(); }

  #teardown() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    a.ta.remove();
    if (this.app.store.editingId) { this.app.store.editingId = null; this.app.store._changed('objects'); }
  }
}
