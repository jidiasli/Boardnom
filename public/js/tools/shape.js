import { normRect } from '../util.js';
import { drawObject } from '../objects.js';

/** Rectangle, ellipse, line and arrow. `kind` selects which. Hold Shift to constrain. */
export class ShapeTool {
  constructor(app, kind) { this.app = app; this.kind = kind; this.id = kind; this.cursor = 'crosshair'; this.start = null; this.cur = null; this.shift = false; }

  onDown(ev) { this.start = { x: ev.wx, y: ev.wy }; this.cur = { ...this.start }; this.shift = ev.shiftKey; }
  onMove(ev) { if (!this.start) return; this.cur = { x: ev.wx, y: ev.wy }; this.shift = ev.shiftKey; this.app.render(); }
  onCancel() { this.start = null; this.cur = null; this.app.render(); }

  onUp() {
    const obj = this.#build();
    const minSize = 4 / this.app.camera.zoom;
    this.start = this.cur = null;
    this.app.render();
    if (!obj) return;
    if (obj.w < minSize && obj.h < minSize) return; // a tap, not a drag
    this.app.actions.create(obj);
  }

  #build() {
    if (!this.start || !this.cur) return null;
    const s = this.app.store.settings;
    let { x: x1, y: y1 } = this.start;
    let { x: x2, y: y2 } = this.cur;
    const style = { width: s.width, color: s.color, alpha: 1 };

    if (this.kind === 'rect' || this.kind === 'ellipse') {
      if (this.shift) {
        const size = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
        x2 = x1 + Math.sign(x2 - x1 || 1) * size;
        y2 = y1 + Math.sign(y2 - y1 || 1) * size;
      }
      const f = normRect(x1, y1, x2, y2);
      return { type: this.kind, ...f, ...style, fill: s.fill ? `${s.color}44` : null };
    }

    if (this.shift) { // snap to 45 degree steps
      const ang = Math.round(Math.atan2(y2 - y1, x2 - x1) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(x2 - x1, y2 - y1);
      x2 = x1 + Math.cos(ang) * len; y2 = y1 + Math.sin(ang) * len;
    }
    const f = normRect(x1, y1, x2, y2);
    const r = (n) => Math.round(n * 10) / 10;
    return { type: 'line', arrow: this.kind === 'arrow', ...f, bw: f.w, bh: f.h, pts: [r(x1 - f.x), r(y1 - f.y), r(x2 - f.x), r(y2 - f.y)], ...style };
  }

  drawOverlay(ctx) {
    const o = this.#build();
    if (o) drawObject(ctx, o, {});
  }
}
