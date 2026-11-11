import { isTypingTarget } from './util.js';
import { measureText } from './objects.js';
import { prepareImage, uploadImage } from './images.js';

/** Add an image (from paste, upload or drag-and-drop) to the board and select it. */
export async function insertImageFile(app, file, at, offset = 0) {
  const { store, camera, actions, images, ui } = app;
  if (!store.me) return;
  try {
    ui.toast('Adding image…', { id: 'img', persist: true });
    const { blob, img, width, height } = await prepareImage(file);
    const assetId = await uploadImage(app.roomId, app.token, blob);
    images.seed(assetId, img); // already decoded here, so it appears instantly

    // fit inside ~60% of the visible area, never upscale
    const k = Math.min(1, (0.6 * camera.w) / camera.zoom / width, (0.6 * camera.h) / camera.zoom / height);
    const w = width * k, h = height * k;
    const c = at || camera.center();
    const [obj] = actions.create({ type: 'image', x: c.x - w / 2 + offset, y: c.y - h / 2 + offset, w, h, assetId });
    if (obj) { app.setTool('select'); store.setSelection([obj.id]); }
  } catch (err) {
    ui.toast(err.message || 'Could not add that image.');
  } finally {
    ui.dismissToast('img');
  }
}

export function pasteText(app, text) {
  const { store, camera, actions } = app;
  const clean = text.slice(0, 2000);
  const c = camera.center();
  const size = measureText(clean, store.settings.fontSize);
  const [obj] = actions.create({ type: 'text', x: c.x - size.w / 2, y: c.y - size.h / 2, ...size, text: clean, fontSize: store.settings.fontSize, color: store.settings.color, bg: null, wrap: false });
  if (obj) { app.setTool('select'); store.setSelection([obj.id]); }
}

export function installClipboard(app) {
  // Ctrl/Cmd+V anywhere on the board
  document.addEventListener('paste', (e) => {
    if (isTypingTarget(e.target)) return; // text boxes handle their own paste
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) {
      e.preventDefault();
      files.forEach((f, i) => insertImageFile(app, f, undefined, i * 28));
      return;
    }
    const text = e.clipboardData?.getData('text/plain')?.trim();
    if (text) { e.preventDefault(); pasteText(app, text); }
  });

  // drag files in from the desktop
  const stage = app.stage;
  stage.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); stage.classList.add('drop'); } });
  stage.addEventListener('dragleave', () => stage.classList.remove('drop'));
  stage.addEventListener('drop', (e) => {
    stage.classList.remove('drop');
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const r = app.canvas.getBoundingClientRect();
    const at = app.camera.toWorld(e.clientX - r.left, e.clientY - r.top);
    files.forEach((f, i) => insertImageFile(app, f, at, i * 28));
  });
}

/** The toolbar's Paste button (needs the browser's clipboard permission). */
export async function pasteFromButton(app) {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) return insertImageFile(app, new File([await item.getType(type)], 'pasted', { type }));
      if (item.types.includes('text/plain')) {
        const text = await (await item.getType('text/plain')).text();
        if (text.trim()) return pasteText(app, text.trim());
      }
    }
    app.ui.toast('Nothing to paste. Copy an image or some text first.');
  } catch {
    app.ui.toast('Your browser blocked clipboard access. Press Ctrl+V (Cmd+V on Mac) on the board instead.');
  }
}

