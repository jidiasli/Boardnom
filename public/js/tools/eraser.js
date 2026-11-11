import { hitTest } from '../objects.js';
import { clamp } from '../util.js';

/** Removes objects the pointer touches. Only objects YOU may edit are ever erased. */
export class EraserTool {
  constructor(app) {
    this.app = app; this.id = 'eraser'; this.cursor = 'none';
    this.down = false; this.pos = null; this.batch = [];
  }

  #radius() { return clamp(this.app.store.settings.width * 1.5, 8, 90) / this.app.camera.zoom; }

  #sweep(wx, wy) {
    const { store, actions } = this.app;
    const r = this.#radius();
    const hits = store.list().filter((o) => store.canEdit(o) && o.id !== store.editingId && hitTest(o, wx, wy, r));
    if (!hits.length) return;
    const snaps = hits.map((o) => structuredClone(o));
    const removed = new Set(actions.remove(hits.map((o) => o.id), { record: false }));
    this.batch.push(...snaps.filter((s) => removed.has(s.id)));
  }

  onHover(ev) { this.pos = ev; this.app.render(); }
  onDown(ev) { this.down = true; this.batch = []; this.pos = ev; this.#sweep(ev.wx, ev.wy); this.app.render(); }
  onMove(ev) {
    this.pos = ev;
    if (this.down) for (const p of ev.points || [ev]) this.#sweep(p.wx, p.wy);
    this.app.render();
  }
  onUp() { this.#finish(); }
  onCancel() { this.#finish(); }

  #finish() {
    if (this.batch.length) this.app.actions.recordRemoved(this.batch);
    this.batch = []; this.down = false;
  }

  onDeactivate() { this.pos = null; }

  drawOverlay(ctx, cam) {
    if (!this.pos) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.pos.wx, this.pos.wy, this.#radius(), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(224, 49, 49, 0.10)';
    ctx.strokeStyle = 'rgba(224, 49, 49, 0.75)';
    ctx.lineWidth = 1.5 / cam.zoom;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
