import { Emitter } from './util.js';

const SERVER_EVENTS = [
  'obj:add', 'obj:update', 'obj:delete', 'obj:reject',
  'draft:begin', 'draft:pts', 'draft:end',
  'cursor', 'user:join', 'user:leave', 'room:policy', 'room:host',
];

/** Thin Socket.IO wrapper. Knows nothing about the store - it only sends and re-emits. */
export class Net extends Emitter {
  constructor() { super(); this.socket = null; this.joinInfo = null; }

  get connected() { return !!this.socket?.connected; }

  /** Resolves with the full room snapshot on the first successful join. */
  connect(joinInfo) {
    this.joinInfo = joinInfo;
    this.socket = window.io();
    let first = true;

    return new Promise((resolve, reject) => {
      const doJoin = () => {
        this.socket.emit('join', this.joinInfo, (res) => {
          if (!res?.ok) {
            if (first) { first = false; reject(new Error(res?.error || 'join-failed')); }
            return;
          }
          this.emit('joined', res); // fires again after every reconnect with a fresh snapshot
          if (first) { first = false; resolve(res); }
        });
      };
      this.socket.on('connect', () => { this.emit('status', 'online'); doJoin(); });
      this.socket.on('disconnect', () => this.emit('status', 'offline'));
      this.socket.on('connect_error', () => { if (first) this.emit('status', 'offline'); });
      for (const ev of SERVER_EVENTS) this.socket.on(ev, (payload) => this.emit(ev, payload));
    });
  }

  // Updates are dropped while offline instead of being buffered: on reconnect we
  // reload the authoritative snapshot, so replaying stale edits would corrupt it.
  create(obj, cb) {
    if (!this.connected) return cb?.({ ok: false, error: 'offline' });
    this.socket.emit('obj:create', obj, cb);
  }
  patch(id, patch) { if (this.connected) this.socket.emit('obj:patch', { id, patch }); }
  remove(ids) { if (this.connected) this.socket.emit('obj:delete', { ids }); }
  clear(scope, cb) {
    if (!this.connected) return cb?.({ ok: false, error: 'offline' });
    this.socket.emit('board:clear', { scope }, cb);
  }
  setPolicy(policy, cb) { if (this.connected) this.socket.emit('room:policy', { policy }, cb); }
  cursor(x, y) { if (this.connected) this.socket.volatile.emit('cursor', { x, y }); }
  draftBegin(d) { if (this.connected) this.socket.emit('draft:begin', d); }
  draftPts(id, pts) { if (this.connected) this.socket.emit('draft:pts', { id, pts }); }
  draftEnd(id) { if (this.connected) this.socket.emit('draft:end', { id }); }
}
