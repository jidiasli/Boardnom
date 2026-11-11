import { CFG } from './config.js';

/** Loads + caches images served by the asset endpoint. */
export class ImageStore {
  constructor(getRoomId, onChange) {
    this.getRoomId = getRoomId;
    this.onChange = onChange;
    this.cache = new Map(); // assetId -> { status: 'loading'|'ready'|'error', img }
  }

  url(assetId) { return `/api/rooms/${this.getRoomId()}/assets/${assetId}`; }

  get(assetId) {
    let e = this.cache.get(assetId);
    if (!e) {
      const img = new Image();
      e = { status: 'loading', img };
      img.onload = () => { e.status = 'ready'; this.onChange(); };
      img.onerror = () => { e.status = 'error'; this.onChange(); };
      img.src = this.url(assetId);
      this.cache.set(assetId, e);
    }
    return e;
  }

  /** Put an already-decoded image in the cache so our own paste shows instantly. */
  seed(assetId, img) { this.cache.set(assetId, { status: 'ready', img }); }
}

const PASSTHROUGH = new Set(['image/png', 'image/jpeg', 'image/webp']);

function decode(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a readable image.')); };
    img.src = url;
  });
}

const toBlob = (canvas, type, quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Validate -> decode -> (downscale / re-encode only if needed).
 * @returns {{blob: Blob, img: HTMLImageElement, width: number, height: number}}
 */
export async function prepareImage(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Only image files can be added.');
  const src = await decode(file);
  const nw = src.naturalWidth, nh = src.naturalHeight;
  if (!nw || !nh) throw new Error('That image has no size.');

  const longSide = Math.max(nw, nh);
  const fine = PASSTHROUGH.has(file.type) && longSide <= CFG.maxImageDim && file.size <= CFG.maxImageBytes;
  if (fine) return { blob: file, img: src, width: nw, height: nh };

  // Re-encode: downscale, keep PNG for PNG (transparency), otherwise JPEG.
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  let scale = Math.min(1, CFG.maxImageDim / longSide);
  for (let attempt = 0; attempt < 5; attempt++) {
    const w = Math.max(1, Math.round(nw * scale)), h = Math.max(1, Math.round(nh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (type === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(src, 0, 0, w, h);
    const blob = await toBlob(canvas, type, 0.88);
    if (blob && blob.size <= CFG.maxImageBytes) {
      const img = await decode(blob);
      return { blob, img, width: w, height: h };
    }
    scale *= 0.7; // too big still - shrink and try again
  }
  throw new Error('That image is too large to add.');
}

export async function uploadImage(roomId, token, blob) {
  const res = await fetch(`/api/rooms/${roomId}/assets`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type, 'x-board-token': token },
    body: blob,
  });
  if (!res.ok) {
    const why = { 413: 'The board has reached its image storage limit.', 403: 'You are not connected to this board.' }[res.status];
    throw new Error(why || 'Image upload failed. Please try again.');
  }
  return (await res.json()).assetId;
}
