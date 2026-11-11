/**
 * Text and sticky-note tool. A simple tap/click opens the editor at that spot.
 * Dragging (e.g. someone trying to pan with a finger) never creates anything.
 */
export class TextTool {
  constructor(app, kind) { this.app = app; this.kind = kind; this.id = kind; this.cursor = 'text'; this.start = null; }
  onDown(ev) { this.start = { sx: ev.sx, sy: ev.sy, wx: ev.wx, wy: ev.wy }; }
  onMove(ev) { if (this.start && Math.hypot(ev.sx - this.start.sx, ev.sy - this.start.sy) > 8) this.start = null; }
  onCancel() { this.start = null; }
  onUp() {
    const s = this.start;
    this.start = null;
    if (s) this.app.editor.openNew({ kind: this.kind, x: s.wx, y: s.wy });
  }
}
