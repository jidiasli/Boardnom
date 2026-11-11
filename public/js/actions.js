import { CFG } from './config.js';
import { uid } from './util.js';

/**
 * The ONLY place that mutates shared board state. Tools call these methods; they never touch
 * the store or the network directly. Each action: apply locally (optimistic) -> send -> record undo.
 */
export class Actions {
  constructor({ store, net, history, notify }) {
    this.store = store; this.net = net; this.history = history; this.notify = notify;
    this.pending = new Map(); // id -> merged patch waiting to be flushed
    this.timer = null;
  }

  get online() { return this.net.connected; }

  #maxZ() {
    let m = 0;
    for (const o of this.store.objects.values()) if (o.z > m) m = o.z;
    return m;
  }

  /** @param objs partial objects: {type, x, y, w, h, ...type fields}. id/owner/z are filled in here. */
  create(objs, { record = true } = {}) {
    if (!this.online) { this.notify('You are offline - reconnecting…'); return []; }
    const created = [];
    let z = this.#maxZ();
    for (const partial of [].concat(objs)) {
      const o = { v: 1, ...partial, id: partial.id || uid(), ownerId: this.store.me.userId, z: ++z };
      this.store.upsert(o);
      created.push(o);
      this.net.create(structuredClone(o), (res) => {
        if (!res?.ok) {
          this.store.remove([o.id]);
          this.notify(res?.error === 'room-full' ? 'This board is full.' : 'Could not save that item.');
        } else if (res.z !== o.z) {
          this.store.patch(o.id, { z: res.z, v: res.v });
        }
      });
    }
    if (record && created.length) {
      const snaps = created.map((o) => structuredClone(o));
      const ids = created.map((o) => o.id);
      this.history.push({
        undo: () => this.remove(ids, { record: false }),
        redo: () => this.create(snaps.map((s) => structuredClone(s)), { record: false }),
      });
    }
    return created;
  }

  /** Apply a change locally now; the network send is batched (see flush). */
  patch(id, patch) {
    const o = this.store.get(id);
    if (!o || !this.store.canEdit(o) || !this.online) return false;
    this.store.patch(id, patch);
    this.pending.set(id, { ...(this.pending.get(id) || {}), ...patch });
    if (!this.timer) this.timer = setTimeout(() => this.flush(), CFG.patchSendMs);
    return true;
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    for (const [id, p] of this.pending) this.net.patch(id, p);
    this.pending.clear();
  }

  /** Record an already-applied move/resize/style change so it can be undone. */
  commit(entries) {
    const changed = entries.filter((e) => JSON.stringify(e.before) !== JSON.stringify(e.after));
    this.flush();
    if (!changed.length) return;
    const apply = (key) => () => { changed.forEach((e) => this.patch(e.id, e[key])); this.flush(); };
    this.history.push({ undo: apply('before'), redo: apply('after') });
  }

  remove(ids, { record = true } = {}) {
    if (!this.online) { this.notify('You are offline - reconnecting…'); return []; }
    const targets = ids.map((id) => this.store.get(id)).filter((o) => o && this.store.canEdit(o));
    if (!targets.length) return [];
    const snaps = targets.map((o) => structuredClone(o));
    const removeIds = targets.map((o) => o.id);
    this.store.remove(removeIds);
    this.net.remove(removeIds);
    if (record) {
      this.history.push({
        undo: () => this.create(snaps.map((s) => structuredClone(s)), { record: false }),
        redo: () => this.remove(removeIds, { record: false }),
      });
    }
    return removeIds;
  }

  /** Record deletions that were already applied (the eraser removes things continuously). */
  recordRemoved(snaps) {
    const ids = snaps.map((s) => s.id);
    this.history.push({
      undo: () => this.create(snaps.map((s) => structuredClone(s)), { record: false }),
      redo: () => this.remove(ids, { record: false }),
    });
  }

  duplicate(ids) {
    const copies = ids
      .map((id) => this.store.get(id))
      .filter((o) => o && this.store.canEdit(o))
      .map((o) => ({ ...structuredClone(o), id: uid(), x: o.x + 24, y: o.y + 24 }));
    const created = this.create(copies);
    this.store.setSelection(created.map((o) => o.id));
  }

  clear(scope) {
    this.net.clear(scope, (res) => {
      if (!res?.ok) this.notify(res?.error === 'forbidden' ? 'Only the board host can clear everything.' : 'Could not clear the board.');
      else this.history.clear();
    });
  }
}
