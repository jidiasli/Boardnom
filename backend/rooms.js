// Pure room logic (no sockets, no HTTP) so every permission rule is unit-testable.
//
// OWNERSHIP RULES (the heart of the "text is shared between users" fix):
//   * Every object has an immutable `ownerId` assigned by the SERVER at creation.
//   * policy 'owner' (default): only the owner may patch or delete an object.
//   * policy 'open'           : anyone may patch or delete any object.
//   * Only the host may change the policy or clear the whole board.

import { sanitizeNewObject, sanitizePatch, LIMITS } from './schema.js';

export const POLICIES = new Set(['owner', 'open']);
const MAX_ASSET_BYTES_PER_ROOM = 64 * 1024 * 1024;

export class Room {
  constructor(id) {
    this.id = id;
    this.objects = new Map(); // id -> object
    this.presence = new Map(); // userId -> { userId, name, color, count }
    this.hostId = null;
    this.policy = 'owner';
    this.zCounter = 0;
    this.assets = new Map(); // assetId -> { buf, type }
    this.assetBytes = 0;
    this.lastActive = Date.now();
  }

  touch() { this.lastActive = Date.now(); }
  get isEmpty() { return this.presence.size === 0; }

  // ---- presence -----------------------------------------------------------
  join(userId, name, color) {
    let p = this.presence.get(userId);
    if (!p) {
      p = { userId, name, color, count: 0 };
      this.presence.set(userId, p);
    }
    p.name = name;
    p.count += 1;
    if (!this.hostId) this.hostId = userId; // first person in becomes host
    this.touch();
    return p;
  }

  /** @returns {boolean} true when this was the user's last connection */
  leave(userId) {
    const p = this.presence.get(userId);
    if (!p) return false;
    p.count -= 1;
    if (p.count > 0) return false;
    this.presence.delete(userId);
    if (this.hostId === userId) {
      // promote the longest-present remaining user (Map keeps insertion order)
      this.hostId = this.presence.keys().next().value ?? null;
    }
    this.touch();
    return true;
  }

  publicUsers() {
    return [...this.presence.values()].map(({ userId, name, color }) => ({ userId, name, color }));
  }

  // ---- permissions --------------------------------------------------------
  canEdit(userId, obj) {
    return this.policy === 'open' || obj.ownerId === userId;
  }

  // ---- objects ------------------------------------------------------------
  createObject(userId, raw) {
    if (this.objects.size >= LIMITS.maxObjectsPerRoom) return { error: 'room-full' };
    const o = sanitizeNewObject(raw, userId);
    if (!o) return { error: 'invalid' };

    const existing = this.objects.get(o.id);
    if (existing) {
      // idempotent for the owner (e.g. a retry); a hard error for anybody else
      return existing.ownerId === userId ? { ok: true, obj: existing, duplicate: true } : { error: 'exists' };
    }
    if (o.type === 'image' && !this.assets.has(o.assetId)) return { error: 'no-asset' };

    o.z = ++this.zCounter;
    this.objects.set(o.id, o);
    this.touch();
    return { ok: true, obj: o };
  }

  patchObject(userId, id, rawPatch) {
    const obj = typeof id === 'string' ? this.objects.get(id) : undefined;
    if (!obj) return { error: 'missing' };
    if (!this.canEdit(userId, obj)) return { error: 'forbidden', obj };
    const patch = sanitizePatch(obj, rawPatch);
    if (Object.keys(patch).length === 0) return { ok: true, obj, patch, noop: true };
    Object.assign(obj, patch);
    obj.v += 1;
    this.touch();
    return { ok: true, obj, patch };
  }

  deleteObjects(userId, ids) {
    const deleted = [];
    const rejected = [];
    for (const id of ids) {
      const obj = typeof id === 'string' ? this.objects.get(id) : undefined;
      if (!obj) continue;
      if (this.canEdit(userId, obj)) {
        this.objects.delete(id);
        deleted.push(id);
      } else {
        rejected.push(obj);
      }
    }
    if (deleted.length) this.touch();
    return { deleted, rejected };
  }

  clear(userId, scope) {
    if (scope === 'all') {
      if (userId !== this.hostId) return { error: 'forbidden' };
      const ids = [...this.objects.keys()];
      this.objects.clear();
      this.touch();
      return { ok: true, ids };
    }
    // 'mine': remove only objects the caller created
    const ids = [];
    for (const [id, obj] of this.objects) if (obj.ownerId === userId) ids.push(id);
    ids.forEach((id) => this.objects.delete(id));
    this.touch();
    return { ok: true, ids };
  }

  setPolicy(userId, policy) {
    if (userId !== this.hostId) return { error: 'forbidden' };
    if (!POLICIES.has(policy)) return { error: 'invalid' };
    this.policy = policy;
    this.touch();
    return { ok: true };
  }

  // ---- image assets -------------------------------------------------------
  addAsset(assetId, buf, type) {
    if (this.assetBytes + buf.length > MAX_ASSET_BYTES_PER_ROOM) return false;
    this.assets.set(assetId, { buf, type });
    this.assetBytes += buf.length;
    this.touch();
    return true;
  }
  getAsset(assetId) { return this.assets.get(assetId); }
}

export class RoomManager {
  constructor({ idleMs = 60 * 60 * 1000 } = {}) {
    this.rooms = new Map();
    this.idleMs = idleMs;
  }
  get(id) { return this.rooms.get(id); }
  getOrCreate(id) {
    let r = this.rooms.get(id);
    if (!r) { r = new Room(id); this.rooms.set(id, r); }
    return r;
  }
  /** Drop rooms nobody has touched for a while so memory (and images) get freed. */
  sweep(now = Date.now()) {
    for (const [id, room] of this.rooms) {
      if (room.isEmpty && now - room.lastActive > this.idleMs) this.rooms.delete(id);
    }
  }
}
