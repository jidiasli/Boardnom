import { CFG } from '../config.js';
import { uid, round1 } from '../util.js';
import { strokeFromPoints, strokePath } from '../objects.js';

/** Freehand drawing. `kind` is 'pen' or 'highlighter'. */
export class PenTool {
  constructor(app, kind = 'pen') {
    this.app = app; this.kind = kind; this.id = kind; this.cursor = 'crosshair';
    this.draft = null; this.outbox = []; this.lastSend = 0;
  }

  #style() {
    const s = this.app.store.settings;
    return this.kind === 'highlighter'
      ? { width: s.width * CFG.highlighterMultiplier, color: s.color, alpha: CFG.highlighterAlpha }
      : { width: s.width, color: s.color, alpha: 1 };
  }

  onDown(ev) {
    const style = this.#style();
    this.draft = { id: uid(), pts: [round1(ev.wx), round1(ev.wy)], ...style };
    this.outbox = [...this.draft.pts];
    this.app.net.draftBegin({ id: this.draft.id, color: style.color, width: style.width, alpha: style.alpha });
    this.#send(true);
    this.app.render();
  }

  onMove(ev) {
    const d = this.draft;
    if (!d) return;
    const minDist = 0.7 / this.app.camera.zoom;
    for (const p of ev.points || [ev]) {
      const lx = d.pts[d.pts.length - 2], ly = d.pts[d.pts.length - 1];
      if (Math.hypot(p.wx - lx, p.wy - ly) < minDist) continue;
      const x = round1(p.wx), y = round1(p.wy);
      d.pts.push(x, y);
      this.outbox.push(x, y);
    }
    this.#send(false);
    this.app.render();
  }

  onUp() {
    const d = this.draft;
    if (!d) return;
    this.draft = null;
    this.#send(true);
    const obj = strokeFromPoints(d.pts, d);
    obj.id = d.id;
    this.app.actions.create(obj);
    this.app.net.draftEnd(d.id);
    this.app.render();
  }

  onCancel() {
    if (!this.draft) return;
    this.app.net.draftEnd(this.draft.id);
    this.draft = null;
    this.app.render();
  }

  #send(force) {
    const now = performance.now();
    if (!force && now - this.lastSend < 60) return;
    this.lastSend = now;
    while (this.outbox.length) this.app.net.draftPts(this.draft?.id ?? '', this.outbox.splice(0, 300));
  }

  drawOverlay(ctx) {
    if (this.draft) strokePath(ctx, this.draft.pts, this.draft.width, this.draft.color, this.draft.alpha);
  }
}
