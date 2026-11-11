import { Store } from './store.js';
import { Camera } from './camera.js';
import { History } from './history.js';
import { Net } from './net.js';
import { bindSync } from './sync.js';
import { Actions } from './actions.js';
import { ImageStore } from './images.js';
import { Renderer } from './renderer.js';
import { TextEditor } from './editor.js';
import { createTools } from './tools/index.js';
import { InputRouter } from './input.js';
import { installClipboard } from './clipboard.js';
import { UI } from './ui.js';
import { unionFrames } from './objects.js';
import { uid, loadOrCreate, randomToken } from './util.js';

const $ = (s) => document.querySelector(s);
const ROOM_RE = /^[A-Za-z0-9_-]{3,32}$/;

/** Room id comes from /b/<id>. Old-style #<id> links still work. */
function resolveRoomId() {
  const m = location.pathname.match(/^\/b\/([A-Za-z0-9_-]{3,32})\/?$/);
  if (m) return m[1];
  const hash = location.hash.slice(1);
  const id = ROOM_RE.test(hash) ? hash : uid().slice(0, 10);
  history.replaceState(null, '', `/b/${id}`);
  return id;
}

function startApp(name) {
  const roomId = resolveRoomId();
  const token = loadOrCreate('boardnom.token', randomToken); // private secret; only a hash of it is ever shared

  const store = new Store();
  const camera = new Camera();
  const net = new Net();
  const history = new History();
  const app = {
    roomId, token, store, camera, net, history,
    canvas: $('#board'), stage: $('#stage'),
    tool: null,
  };
  window.__boardnom = app; // handy for debugging in the browser console

  app.ui = new UI(app);
  app.images = new ImageStore(() => roomId, () => app.renderer.invalidate());
  app.actions = new Actions({ store, net, history, notify: (m) => app.ui.toast(m) });
  app.renderer = new Renderer({ canvas: app.canvas, store, camera, images: app.images, getTool: () => app.tool });
  app.editor = new TextEditor(app, $('#overlay'));
  app.tools = createTools(app);

  app.render = () => app.renderer.invalidate();
  app.setCursor = (c) => { app.canvas.style.cursor = c; };
  app.fitView = () => camera.fit(unionFrames(store.list()));
  app.setTool = (id) => {
    const next = app.tools[id];
    if (!next) return;
    app.input?.reset(); // never carry an interaction across a tool switch
    app.tool?.onDeactivate?.();
    app.tool = next;
    if (id !== 'select') store.clearSelection();
    app.setCursor(next.cursor);
    app.ui.syncTool(id);
    app.render();
  };

  // ---- viewport ----
  const ro = new ResizeObserver(() => {
    const r = app.stage.getBoundingClientRect();
    camera.setViewport(Math.max(1, r.width), Math.max(1, r.height));
    app.renderer.resize(r.width, r.height);
  });
  ro.observe(app.stage);

  // any state change => redraw
  store.on('change', app.render);
  camera.on('change', app.render);
  document.fonts?.ready.then(app.render);

  app.input = new InputRouter(app);
  installClipboard(app);
  bindSync({ net, store, onNotice: (m) => app.ui.toast(m) });
  net.on('joined', () => history.clear()); // after a (re)join our undo history no longer matches the server
  app.ui.init();
  app.setTool('pen');

  $('#app').hidden = false;
  net.connect({ roomId, token, name }).catch((err) => {
    app.ui.toast(err.message === 'bad-room' ? 'That board link is not valid.' : 'Could not join the board.');
  });
}

// ---- join screen ----
const form = $('#joinForm');
const nameInput = $('#joinName');
try { nameInput.value = localStorage.getItem('boardnom.name') || ''; } catch { /* storage blocked */ }
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = nameInput.value.trim() || 'Guest';
  try { localStorage.setItem('boardnom.name', name); } catch { /* ignore */ }
  $('#join').hidden = true;
  startApp(name);
});
nameInput.focus();
