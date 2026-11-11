import { Emitter } from './util.js';

/** Local undo/redo. Each entry: { undo(), redo() }. Only YOUR actions are ever in here. */
export class History extends Emitter {
  constructor(limit = 100) { super(); this.undoStack = []; this.redoStack = []; this.limit = limit; }
  push(entry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.emit('change');
  }
  undo() {
    const e = this.undoStack.pop();
    if (!e) return false;
    this.redoStack.push(e);
    e.undo();
    this.emit('change');
    return true;
  }
  redo() {
    const e = this.redoStack.pop();
    if (!e) return false;
    this.undoStack.push(e);
    e.redo();
    this.emit('change');
    return true;
  }
  clear() { this.undoStack = []; this.redoStack = []; this.emit('change'); }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
}
