import { Emitter } from './util.js';
import { CFG } from './config.js';

/**
 * Client state. Two rules keep clients isolated from each other:
 *   1. `selection`, `editingId` and `settings` are LOCAL ONLY - they are never sent anywhere.
 *   2. Only objects the local user is allowed to edit can ever be selected (see canEdit).
 */
export class Store extends Emitter {
  constructor() {
    super();
    this.objects = new Map();
    this._sorted = null;
    this.selection = new Set();
    this.editingId = null; // object currently being edited in the text overlay (hidden from canvas)
    this.me = null; // { userId, name, color }
    this.hostId = null;
    this.policy = 'owner';
    this.users = new Map();
    this.drafts = new Map(); // other people's in-progress strokes
    this.cursors = new Map(); // other people's pointers
    this.status = 'connecting';
    this.settings = {
      color: CFG.colors[0],
      width: CFG.width.default,
      fill: false,
      fontSize: CFG.fontSize.default,
      stickyColor: CFG.stickyColors[0],
    };
  }

  _changed(kind) { this.emit(kind); this.emit('change'); }

  // ---- identity / room ----------------------------------------------------
  get isHost() { return !!this.me && this.me.userId === this.hostId; }

  canEdit(obj) {
    return !!obj && !!this.me && (this.policy === 'open' || obj.ownerId === this.me.userId);
  }

  load(snapshot) {
    this.objects.clear();
    this._sorted = null;
    for (const o of snapshot.objects) this.objects.set(o.id, o);
    this.users = new Map(snapshot.users.map((u) => [u.userId, u]));
    this.hostId = snapshot.hostId;
    this.policy = snapshot.policy;
    this.drafts.clear();
    this.cursors.clear();
    this.selection.clear();
    this._changed('objects');
    this._changed('users');
    this._changed('selection');
  }

  // ---- objects ------------------------------------------------------------
  list() {
    if (!this._sorted) {
      this._sorted = [...this.objects.values()].sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
    }
    return this._sorted;
  }
  get(id) { return this.objects.get(id); }

  upsert(obj) {
    this.objects.set(obj.id, obj);
    this._sorted = null;
    this._changed('objects');
  }

  patch(id, patch) {
    const o = this.objects.get(id);
    if (!o) return false;
    Object.assign(o, patch);
    if ('z' in patch) this._sorted = null;
    this._changed('objects');
    return true;
  }

  remove(ids) {
    let removed = false, selChanged = false;
    for (const id of ids) {
      if (this.objects.delete(id)) removed = true;
      if (this.selection.delete(id)) selChanged = true;
      if (this.editingId === id) this.editingId = null;
    }
    if (removed) { this._sorted = null; this._changed('objects'); }
    if (selChanged) this._changed('selection');
  }

  // ---- selection (local only) --------------------------------------------
  selected() { return [...this.selection].map((id) => this.objects.get(id)).filter(Boolean); }

  setSelection(ids) {
    this.selection = new Set(ids.filter((id) => this.canEdit(this.objects.get(id))));
    this._changed('selection');
  }
  toggleSelection(id) {
    const next = new Set(this.selection);
    next.has(id) ? next.delete(id) : next.add(id);
    this.setSelection([...next]);
  }
  clearSelection() {
    if (this.selection.size === 0) return;
    this.selection = new Set();
    this._changed('selection');
  }
  /** Drop anything we are no longer allowed to edit (e.g. host switched policy back to 'owner'). */
  pruneSelection() {
    this.setSelection([...this.selection]);
  }

  setPolicy(policy) { this.policy = policy; this.pruneSelection(); this._changed('policy'); }
  setHost(id) { this.hostId = id; this._changed('policy'); }

  // ---- other people -------------------------------------------------------
  addUser(u) { this.users.set(u.userId, u); this._changed('users'); }
  removeUser(userId) {
    this.users.delete(userId);
    this.cursors.delete(userId);
    for (const key of [...this.drafts.keys()]) if (key.startsWith(userId + ':')) this.drafts.delete(key);
    this._changed('users');
  }
  setCursor(userId, x, y) { this.cursors.set(userId, { x, y, t: performance.now() }); this._changed('cursors'); }

  setStatus(status) { this.status = status; this._changed('status'); }
}
