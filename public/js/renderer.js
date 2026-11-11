import { drawObject, strokePath } from './objects.js';
import { getSelectionBox } from './selection.js';

/** Draws the whole scene on one canvas, at most once per animation frame. */
export class Renderer {
  constructor({ canvas, store, camera, images, getTool }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.store = store; this.camera = camera; this.images = images; this.getTool = getTool;
    this.dpr = 1;
    this.raf = 0;
  }

  resize(w, h) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.invalidate();
  }

  invalidate() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }

  draw() {
    const { ctx, camera: cam, store, dpr } = this;
    const W = cam.w, H = cam.h;
    if (!W || !H) return;

    // ---- background + grid (screen space) ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#f2f3f6';
    ctx.fillRect(0, 0, W, H);
    this.#grid(W, H);

    // ---- world space ----
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * cam.x, dpr * cam.y);
    const tl = cam.toWorld(0, 0), br = cam.toWorld(W, H);
    const env = { images: this.images };

    for (const o of store.list()) {
      if (o.id === store.editingId) continue; // being edited in the overlay
      const pad = (o.width || 0) / 2 + 24;
      if (o.x > br.x + pad || o.x + o.w < tl.x - pad || o.y > br.y + pad || o.y + o.h < tl.y - pad) continue;
      drawObject(ctx, o, env);
    }
    for (const d of store.drafts.values()) if (d.pts.length >= 2) strokePath(ctx, d.pts, d.width, d.color, d.alpha);
    this.getTool()?.drawOverlay?.(ctx, cam);

    // ---- screen-space UI ----
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.#selection();
    this.#cursors();
  }

  #grid(W, H) {
    const { ctx, camera: cam } = this;
    let step = 40;
    while (step * cam.zoom < 16) step *= 2;
    const px = step * cam.zoom;
    const startX = ((cam.x % px) + px) % px;
    const startY = ((cam.y % px) + px) % px;
    ctx.fillStyle = '#c9ccd6';
    const size = px > 60 ? 2 : 1.5;
    for (let x = startX; x < W; x += px) for (let y = startY; y < H; y += px) ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }

  #selection() {
    const { ctx, camera: cam, store } = this;
    const sb = getSelectionBox(store, cam.zoom);
    if (!sb || store.editingId) return;
    const a = cam.toScreen(sb.box.x, sb.box.y);
    const b = cam.toScreen(sb.box.x + sb.box.w, sb.box.y + sb.box.h);
    ctx.save();
    ctx.strokeStyle = '#3b5bdb';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    for (const h of sb.handles) {
      const s = cam.toScreen(h.x, h.y);
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(s.x - 5, s.y - 5, 10, 10, 2) : ctx.rect(s.x - 5, s.y - 5, 10, 10);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  #cursors() {
    const { ctx, camera: cam, store } = this;
    const now = performance.now();
    for (const [userId, c] of store.cursors) {
      const u = store.users.get(userId);
      if (!u || now - c.t > 15000) continue;
      const s = cam.toScreen(c.x, c.y);
      if (s.x < -40 || s.y < -40 || s.x > cam.w + 40 || s.y > cam.h + 40) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = u.color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(0, 16); ctx.lineTo(4.5, 12); ctx.lineTo(8.5, 19); ctx.lineTo(11, 17.8); ctx.lineTo(7, 11); ctx.lineTo(12.5, 11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.font = '600 11px "DM Sans", system-ui, sans-serif';
      const tw = ctx.measureText(u.name).width;
      ctx.fillStyle = u.color;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(12, 18, tw + 12, 18, 5) : ctx.rect(12, 18, tw + 12, 18);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(u.name, 18, 27.5);
      ctx.restore();
    }
  }
}
