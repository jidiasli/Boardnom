import { Emitter, clamp } from './util.js';
import { CFG } from './config.js';

/** Viewport transform. world -> screen:  sx = wx * zoom + x */
export class Camera extends Emitter {
  constructor() {
    super();
    this.x = 0; this.y = 0; this.zoom = 1;
    this.w = 0; this.h = 0; // viewport size in CSS px
  }

  setViewport(w, h) {
    const first = this.w === 0;
    this.w = w; this.h = h;
    if (first) { this.x = w / 2; this.y = h / 2; } // world origin starts in the middle
    this.emit('change');
  }

  toWorld(sx, sy) { return { x: (sx - this.x) / this.zoom, y: (sy - this.y) / this.zoom }; }
  toScreen(wx, wy) { return { x: wx * this.zoom + this.x, y: wy * this.zoom + this.y }; }
  center() { return this.toWorld(this.w / 2, this.h / 2); }

  panBy(dx, dy) {
    this.x += dx; this.y += dy;
    this.#sanitize(); this.emit('change');
  }

  /** Zoom keeping the world point under (sx, sy) fixed. */
  zoomAt(sx, sy, factor) {
    const nz = clamp(this.zoom * factor, CFG.minZoom, CFG.maxZoom);
    const k = nz / this.zoom;
    this.x = sx - (sx - this.x) * k;
    this.y = sy - (sy - this.y) * k;
    this.zoom = nz;
    this.#sanitize(); this.emit('change');
  }

  reset() {
    this.zoom = 1; this.x = this.w / 2; this.y = this.h / 2;
    this.emit('change');
  }

  fit(bounds, padding = 80) {
    if (!bounds || bounds.w + bounds.h === 0) return this.reset();
    const z = clamp(Math.min((this.w - padding * 2) / Math.max(bounds.w, 1), (this.h - padding * 2) / Math.max(bounds.h, 1)), CFG.minZoom, 2);
    this.zoom = z;
    this.x = this.w / 2 - (bounds.x + bounds.w / 2) * z;
    this.y = this.h / 2 - (bounds.y + bounds.h / 2) * z;
    this.#sanitize(); this.emit('change');
  }

  /** Last line of defence: a NaN/Infinity camera can never persist (that would blank the board). */
  #sanitize() {
    if (![this.x, this.y, this.zoom].every(Number.isFinite)) this.reset();
    const lim = 1e7;
    this.x = clamp(this.x, -lim, lim);
    this.y = clamp(this.y, -lim, lim);
  }
}
