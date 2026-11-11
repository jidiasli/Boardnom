import { CFG } from './config.js';
import { ICONS } from './icons.js';
import { measureText } from './objects.js';
import { insertImageFile, pasteFromButton } from './clipboard.js';
import { unionFrames } from './objects.js';

const $ = (sel, root = document) => root.querySelector(sel);

const TOOLBAR = [
  { tool: 'select', label: 'Select', icon: 'select', key: 'V' },
  { tool: 'pan', label: 'Hand', icon: 'hand', key: 'H' },
  'sep',
  { tool: 'pen', label: 'Pen', icon: 'pen', key: 'P' },
  { tool: 'highlighter', label: 'Highlight', icon: 'highlighter', key: 'M' },
  { tool: 'eraser', label: 'Eraser', icon: 'eraser', key: 'E' },
  'sep',
  { tool: 'rect', label: 'Rectangle', icon: 'rect', key: 'R' },
  { tool: 'ellipse', label: 'Ellipse', icon: 'ellipse', key: 'O' },
  { tool: 'line', label: 'Line', icon: 'line', key: 'L' },
  { tool: 'arrow', label: 'Arrow', icon: 'arrow', key: 'A' },
  'sep',
  { tool: 'text', label: 'Text', icon: 'text', key: 'T' },
  { tool: 'sticky', label: 'Sticky', icon: 'sticky', key: 'N' },
  'sep',
  { action: 'upload', label: 'Upload', icon: 'image', title: 'Upload an image from your device' },
  { action: 'paste', label: 'Paste', icon: 'paste', title: 'Paste an image or text from the clipboard (Ctrl+V)' },
  'sep',
  { action: 'undo', label: 'Undo', icon: 'undo', title: 'Undo (Ctrl+Z)' },
  { action: 'redo', label: 'Redo', icon: 'redo', title: 'Redo (Ctrl+Shift+Z)' },
  { action: 'clear', label: 'Clear', icon: 'trash', title: 'Clear the board' },
];

/** Which property controls are relevant for each tool. */
const PROPS_FOR_TOOL = {
  pen: ['color', 'width'], highlighter: ['color', 'width'], eraser: ['width'],
  rect: ['color', 'width', 'fill'], ellipse: ['color', 'width', 'fill'], line: ['color', 'width'], arrow: ['color', 'width'],
  text: ['color', 'font'], sticky: ['sticky'],
};

const fmt = (n) => (Math.round(n * 10) / 10).toString();

export class UI {
  constructor(app) {
    this.app = app;
    this.toasts = new Map();
    this.styleEdit = null;
  }

  init() {
    this.#buildToolbar();
    this.#buildProps();
    this.#buildZoom();
    this.#buildTopbar();
    const { store, history, camera } = this.app;
    store.on('selection', () => this.#syncProps());
    store.on('users', () => this.#renderUsers());
    store.on('policy', () => this.#renderShare());
    store.on('status', () => this.#renderStatus());
    history.on('change', () => this.#syncHistory());
    camera.on('change', () => { $('#zoomPct').textContent = `${Math.round(camera.zoom * 100)}%`; });
    this.#renderStatus(); this.#renderUsers(); this.#syncHistory(); this.#syncProps();
  }

  // ---- toasts -------------------------------------------------------------
  toast(msg, { id = null, persist = false, ms = 3200 } = {}) {
    const host = $('#toasts');
    if (id && this.toasts.has(id)) this.dismissToast(id);
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    el.setAttribute('role', 'status');
    host.appendChild(el);
    const key = id || Symbol('toast');
    this.toasts.set(key, el);
    if (!persist) setTimeout(() => this.dismissToast(key), ms);
  }
  dismissToast(id) {
    const el = this.toasts.get(id);
    if (el) { el.remove(); this.toasts.delete(id); }
  }

  // ---- toolbar ------------------------------------------------------------
  #buildToolbar() {
    const nav = $('#toolbar');
    nav.innerHTML = '';
    for (const item of TOOLBAR) {
      if (item === 'sep') { const s = document.createElement('div'); s.className = 'tsep'; nav.appendChild(s); continue; }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tbtn';
      b.innerHTML = `${ICONS[item.icon]}<span class="tlabel">${item.label}</span>`;
      b.title = item.title || `${item.label} (${item.key})`;
      b.setAttribute('aria-label', item.label);
      if (item.tool) { b.dataset.tool = item.tool; b.addEventListener('click', () => this.app.setTool(item.tool)); }
      else { b.dataset.action = item.action; b.addEventListener('click', () => this.#action(item.action)); }
      nav.appendChild(b);
    }
    const file = document.createElement('input');
    file.type = 'file'; file.accept = 'image/png,image/jpeg,image/webp,image/gif,image/*'; file.multiple = true; file.hidden = true; file.id = 'fileInput';
    file.addEventListener('change', () => {
      [...file.files].forEach((f, i) => insertImageFile(this.app, f, undefined, i * 28));
      file.value = '';
    });
    nav.appendChild(file);
  }

  syncTool(id) {
    document.querySelectorAll('#toolbar .tbtn[data-tool]').forEach((b) => {
      const on = b.dataset.tool === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    this.#syncProps();
  }

  #syncHistory() {
    const { history } = this.app;
    $('[data-action="undo"]').disabled = !history.canUndo;
    $('[data-action="redo"]').disabled = !history.canRedo;
  }

  #action(name) {
    const app = this.app;
    if (name === 'upload') $('#fileInput').click();
    else if (name === 'paste') pasteFromButton(app);
    else if (name === 'undo') app.history.undo();
    else if (name === 'redo') app.history.redo();
    else if (name === 'clear') this.#clearDialog();
  }

  // ---- properties panel ---------------------------------------------------
  #buildProps() {
    const { store } = this.app;
    const sw = $('#swatches');
    sw.innerHTML = '';
    for (const c of CFG.colors) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'swatch'; b.style.setProperty('--c', c); b.dataset.color = c; b.setAttribute('aria-label', `Colour ${c}`);
      b.addEventListener('click', () => this.#setColor(c));
      sw.appendChild(b);
    }
    $('#colorInput').addEventListener('input', (e) => this.#setColor(e.target.value, true));
    $('#colorInput').addEventListener('change', () => this.#endStyleEdit());

    const ss = $('#stickySwatches');
    ss.innerHTML = '';
    for (const c of CFG.stickyColors) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'swatch sticky'; b.style.setProperty('--c', c); b.dataset.sticky = c; b.setAttribute('aria-label', `Sticky colour ${c}`);
      b.addEventListener('click', () => {
        store.settings.stickyColor = c;
        this.#styleSelection((o) => (o.type === 'text' && o.bg ? { bg: c } : null));
        this.#syncProps();
      });
      ss.appendChild(b);
    }

    // ---- THICKNESS: a continuous slider (no presets) ----
    const range = $('#widthRange');
    range.min = CFG.width.min; range.max = CFG.width.max; range.step = '0.1'; range.value = store.settings.width;
    range.addEventListener('input', () => {
      const v = parseFloat(range.value);
      store.settings.width = v;
      this.#updateWidthReadout();
      this.#styleSelection((o) => ('width' in o && o.type !== 'text' ? { width: v } : null), true);
    });
    range.addEventListener('change', () => this.#endStyleEdit());

    const font = $('#fontRange');
    font.min = CFG.fontSize.min; font.max = CFG.fontSize.max; font.step = '1'; font.value = store.settings.fontSize;
    font.addEventListener('input', () => {
      const v = parseFloat(font.value);
      store.settings.fontSize = v;
      $('#fontOut').textContent = `${v}px`;
      this.#styleSelection((o) => {
        if (o.type !== 'text') return null;
        return o.wrap ? { fontSize: v } : { fontSize: v, ...measureText(o.text, v) };
      }, true);
    });
    font.addEventListener('change', () => this.#endStyleEdit());

    $('#fillCheck').addEventListener('change', (e) => {
      store.settings.fill = e.target.checked;
      this.#styleSelection((o) => (o.type === 'rect' || o.type === 'ellipse' ? { fill: e.target.checked ? `${o.color}44` : null } : null));
    });
    this.#updateWidthReadout();
  }

  #setColor(c, live = false) {
    this.app.store.settings.color = c;
    this.#styleSelection((o) => {
      if (o.type === 'text') return o.bg ? null : { color: c };
      if (o.type === 'image') return null;
      const p = { color: c };
      if ((o.type === 'rect' || o.type === 'ellipse') && o.fill) p.fill = `${c}44`;
      return p;
    }, live);
    this.#syncProps();
  }

  #updateWidthReadout() {
    const w = this.app.store.settings.width;
    $('#widthOut').textContent = fmt(w);
    const dot = $('#widthDot');
    const d = Math.min(w, 34);
    dot.style.width = dot.style.height = `${d}px`;
    dot.style.background = this.app.store.settings.color;
  }

  /** Apply a style change to the selected objects (only ones you may edit) with ONE undo step. */
  #styleSelection(fn, live = false) {
    const { store, actions } = this.app;
    const sel = store.selected().filter((o) => store.canEdit(o));
    if (!sel.length) return;
    if (!this.styleEdit) this.styleEdit = { before: new Map(sel.map((o) => [o.id, structuredClone(o)])), keys: new Set() };
    for (const o of sel) {
      const patch = fn(o);
      if (!patch) continue;
      Object.keys(patch).forEach((k) => this.styleEdit.keys.add(k));
      actions.patch(o.id, patch);
    }
    if (!live) this.#endStyleEdit();
  }

  #endStyleEdit() {
    const se = this.styleEdit;
    this.styleEdit = null;
    if (!se) return;
    const { store, actions } = this.app;
    const pick = (o, keys) => Object.fromEntries([...keys].filter((k) => k in o).map((k) => [k, o[k]]));
    const entries = [];
    for (const [id, before] of se.before) {
      const now = store.get(id);
      if (now) entries.push({ id, before: pick(before, se.keys), after: pick(now, se.keys) });
    }
    actions.commit(entries);
  }

  #syncProps() {
    const { store, tool } = this.app;
    if (!tool) return;
    let show = PROPS_FOR_TOOL[tool.id] || [];
    if (tool.id === 'select') {
      const sel = store.selected();
      const s = new Set();
      for (const o of sel) {
        if (o.type === 'text') { o.bg ? s.add('sticky') : (s.add('color'), s.add('font')); }
        else if (o.type !== 'image') { s.add('color'); s.add('width'); if (o.type === 'rect' || o.type === 'ellipse') s.add('fill'); }
      }
      show = [...s];
      const first = sel[0];
      if (first) {
        if (first.color && first.type !== 'image') store.settings.color = first.color;
        if (first.width && first.type !== 'text') store.settings.width = first.width;
        if (first.type === 'text' && !first.bg) store.settings.fontSize = first.fontSize;
        $('#widthRange').value = store.settings.width;
        $('#fontRange').value = store.settings.fontSize;
        $('#fontOut').textContent = `${Math.round(store.settings.fontSize)}px`;
      }
    }
    const props = $('#props');
    props.hidden = show.length === 0;
    for (const row of props.querySelectorAll('[data-for]')) row.hidden = !show.includes(row.dataset.for);
    $('#widthLabel').textContent = tool.id === 'eraser' ? 'Eraser size' : 'Thickness';
    $('#fillCheck').checked = !!store.settings.fill;
    document.querySelectorAll('#swatches .swatch').forEach((b) => b.classList.toggle('on', b.dataset.color.toLowerCase() === store.settings.color.toLowerCase()));
    document.querySelectorAll('#stickySwatches .swatch').forEach((b) => b.classList.toggle('on', b.dataset.sticky === store.settings.stickyColor));
    $('#colorInput').value = /^#[0-9a-f]{6}$/i.test(store.settings.color) ? store.settings.color : '#1a1a2e';
    this.#updateWidthReadout();
  }

  // ---- zoom bar -----------------------------------------------------------
  #buildZoom() {
    const { camera } = this.app;
    $('#zoomIn').innerHTML = ICONS.plus; $('#zoomOut').innerHTML = ICONS.minus; $('#zoomFit').innerHTML = ICONS.fit;
    $('#zoomIn').addEventListener('click', () => camera.zoomAt(camera.w / 2, camera.h / 2, 1.25));
    $('#zoomOut').addEventListener('click', () => camera.zoomAt(camera.w / 2, camera.h / 2, 0.8));
    $('#zoomFit').addEventListener('click', () => this.app.fitView());
    $('#zoomPct').addEventListener('click', () => camera.reset());
  }

  // ---- top bar ------------------------------------------------------------
  #buildTopbar() {
    $('#shareBtn').innerHTML = `${ICONS.share}<span>Share</span>`;
    $('#shareBtn').addEventListener('click', () => this.#shareDialog());
  }

  #renderStatus() {
    const st = this.app.store.status;
    const dot = $('#statusDot');
    dot.dataset.state = st;
    $('#statusText').textContent = st === 'online' ? 'Live' : st === 'offline' ? 'Reconnecting…' : 'Connecting…';
  }

  #renderUsers() {
    const { store } = this.app;
    const host = $('#users');
    host.innerHTML = '';
    const all = store.me ? [store.me, ...[...store.users.values()].filter((u) => u.userId !== store.me.userId)] : [];
    for (const u of all.slice(0, 8)) {
      const a = document.createElement('span');
      a.className = 'avatar' + (u.userId === store.me.userId ? ' me' : '');
      a.style.background = u.color;
      a.textContent = (u.name[0] || '?').toUpperCase();
      a.title = u.userId === store.me.userId ? `${u.name} (you)` : u.name;
      host.appendChild(a);
    }
    if (all.length > 8) { const m = document.createElement('span'); m.className = 'avatar more'; m.textContent = `+${all.length - 8}`; host.appendChild(m); }
    $('#peopleCount').textContent = `${all.length} here`;
  }

  // ---- dialogs ------------------------------------------------------------
  #dialog(html) {
    const host = $('#dialogs');
    host.innerHTML = `<div class="scrim"><div class="dialog" role="dialog" aria-modal="true">${html}</div></div>`;
    const scrim = host.firstElementChild;
    const close = () => { host.innerHTML = ''; this.shareOpen = false; };
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(); });
    scrim.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); } });
    return { root: scrim, close };
  }

  #shareDialog() {
    const url = location.origin + location.pathname;
    const d = this.#dialog(`
      <h2>Share this board</h2>
      <p class="muted">Anyone with this link can join and draw with you. No account needed.</p>
      <div class="copyrow"><input id="shareUrl" readonly value="${url}" aria-label="Board link"><button id="copyBtn" class="btn primary" type="button">Copy link</button></div>
      <div id="policyBox"></div>
      <div class="actions"><button class="btn" data-close type="button">Done</button></div>`);
    this.shareOpen = true;
    const input = $('#shareUrl', d.root);
    input.addEventListener('focus', () => input.select());
    $('#copyBtn', d.root).addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(url); this.toast('Link copied'); }
      catch { input.select(); this.toast('Press Ctrl+C to copy the link'); }
    });
    this.#renderShare();
  }

  #renderShare() {
    const box = $('#policyBox');
    if (!box) return;
    const { store, net } = this.app;
    const open = store.policy === 'open';
    if (store.isHost) {
      box.innerHTML = `
        <fieldset class="policy"><legend>Who can change items?</legend>
          <label><input type="radio" name="policy" value="owner" ${open ? '' : 'checked'}> <span><b>Only the creator</b> of each item (recommended)</span></label>
          <label><input type="radio" name="policy" value="open" ${open ? 'checked' : ''}> <span><b>Everyone</b> can edit everything</span></label>
        </fieldset>`;
      box.querySelectorAll('input[name="policy"]').forEach((r) => r.addEventListener('change', () => net.setPolicy(r.value)));
    } else {
      box.innerHTML = `<p class="muted policy-note">${open ? 'Everyone can edit everything on this board.' : 'You can change items you created. Items from others are view-only.'}</p>`;
    }
  }

  #clearDialog() {
    const { store, actions } = this.app;
    const host = store.isHost;
    const d = this.#dialog(`
      <h2>Clear the board?</h2>
      <p class="muted">This cannot be undone.</p>
      <div class="stack">
        <button class="btn danger" id="clearMine" type="button">Clear my items</button>
        ${host ? '<button class="btn danger" id="clearAll" type="button">Clear everything (host)</button>' : ''}
        <button class="btn" data-close type="button">Cancel</button>
      </div>`);
    $('#clearMine', d.root).addEventListener('click', () => { actions.clear('mine'); d.close(); });
    $('#clearAll', d.root)?.addEventListener('click', () => { actions.clear('all'); d.close(); });
  }
}
