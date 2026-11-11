import crypto from 'node:crypto';
import { isValidId } from './schema.js';

const USER_COLORS = ['#e03131', '#1971c2', '#2f9e44', '#e8590c', '#7048e8', '#c2255c', '#0c8599', '#862e9c', '#5c7cfa', '#099268'];
const ROOM_RE = /^[A-Za-z0-9_-]{3,32}$/;

/**
 * Identity model: the browser keeps a random secret `token` in localStorage.
 * The server derives a PUBLIC userId = sha256(token). Only the userId is ever shared
 * with other clients, so nobody can act as someone else without knowing their token.
 */
export const userIdFromToken = (token) =>
  crypto.createHash('sha256').update(String(token)).digest('hex').slice(0, 16);

const colorFor = (userId) => USER_COLORS[parseInt(userId.slice(0, 4), 16) % USER_COLORS.length];
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const cleanName = (n) => (typeof n === 'string' ? n.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) : '') || 'Guest';

/** Tiny token bucket so one client cannot flood the room with ephemeral events. */
function limiter(perSec, burst) {
  let tokens = burst;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(burst, tokens + ((now - last) / 1000) * perSec);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

export function attachSockets(io, rooms) {
  io.on('connection', (socket) => {
    let room = null;
    let user = null; // { userId, name, color }
    const allowCursor = limiter(40, 40);
    const allowDraft = limiter(60, 80);

    const on = (event, handler) =>
      socket.on(event, (...args) => {
        try { handler(...args); } catch (err) { console.error(`[socket:${event}]`, err); }
      });
    const ack = (cb, payload) => { if (typeof cb === 'function') cb(payload); };
    const toOthers = () => socket.to(room.id);

    on('join', (payload, cb) => {
      if (room) return ack(cb, { ok: false, error: 'already-joined' });
      const roomId = payload?.roomId;
      const token = payload?.token;
      if (typeof roomId !== 'string' || !ROOM_RE.test(roomId)) return ack(cb, { ok: false, error: 'bad-room' });
      if (typeof token !== 'string' || token.length < 16 || token.length > 128) return ack(cb, { ok: false, error: 'bad-token' });

      const userId = userIdFromToken(token);
      user = { userId, name: cleanName(payload.name), color: colorFor(userId) };
      room = rooms.getOrCreate(roomId);
      const wasPresent = room.presence.has(userId);
      room.join(userId, user.name, user.color);
      socket.join(room.id);

      ack(cb, {
        ok: true,
        you: user,
        hostId: room.hostId,
        policy: room.policy,
        users: room.publicUsers(),
        objects: [...room.objects.values()],
      });
      if (!wasPresent) toOthers().emit('user:join', user);
    });

    on('obj:create', (raw, cb) => {
      if (!room) return ack(cb, { ok: false, error: 'not-joined' });
      const res = room.createObject(user.userId, raw);
      if (res.error) return ack(cb, { ok: false, error: res.error });
      ack(cb, { ok: true, z: res.obj.z, v: res.obj.v });
      if (!res.duplicate) toOthers().emit('obj:add', res.obj);
    });

    on('obj:patch', (msg) => {
      if (!room || !msg) return;
      const res = room.patchObject(user.userId, msg.id, msg.patch);
      if (res.error === 'forbidden') return socket.emit('obj:reject', { id: msg.id, obj: res.obj, reason: 'forbidden' });
      if (res.error === 'missing') return socket.emit('obj:reject', { id: msg.id, obj: null, reason: 'missing' });
      if (res.noop) return;
      toOthers().emit('obj:update', { id: res.obj.id, patch: res.patch, v: res.obj.v });
    });

    on('obj:delete', (msg) => {
      if (!room || !Array.isArray(msg?.ids)) return;
      const { deleted, rejected } = room.deleteObjects(user.userId, msg.ids.slice(0, 500));
      if (deleted.length) toOthers().emit('obj:delete', { ids: deleted });
      for (const obj of rejected) socket.emit('obj:reject', { id: obj.id, obj, reason: 'forbidden' });
    });

    on('board:clear', (msg, cb) => {
      if (!room) return ack(cb, { ok: false, error: 'not-joined' });
      const res = room.clear(user.userId, msg?.scope === 'all' ? 'all' : 'mine');
      if (res.error) return ack(cb, { ok: false, error: res.error });
      if (res.ids.length) io.to(room.id).emit('obj:delete', { ids: res.ids });
      ack(cb, { ok: true });
    });

    on('room:policy', (msg, cb) => {
      if (!room) return;
      const res = room.setPolicy(user.userId, msg?.policy);
      if (res.error) return ack(cb, { ok: false, error: res.error });
      io.to(room.id).emit('room:policy', { policy: room.policy });
      ack(cb, { ok: true });
    });

    // ---- ephemeral relays (never stored) ----------------------------------
    on('cursor', (msg) => {
      if (!room || !isNum(msg?.x) || !isNum(msg?.y) || !allowCursor()) return;
      socket.volatile.to(room.id).emit('cursor', { userId: user.userId, x: msg.x, y: msg.y });
    });

    on('draft:begin', (msg) => {
      if (!room || !isValidId(msg?.id)) return;
      const { id, color, width, alpha } = msg;
      if (typeof color !== 'string' || !/^#[0-9a-fA-F]{3,8}$/.test(color) || !isNum(width) || !isNum(alpha)) return;
      toOthers().emit('draft:begin', { userId: user.userId, id, color, width: Math.min(200, Math.max(0.5, width)), alpha: Math.min(1, Math.max(0.05, alpha)) });
    });

    on('draft:pts', (msg) => {
      if (!room || !isValidId(msg?.id) || !Array.isArray(msg.pts) || msg.pts.length > 400) return;
      if (!msg.pts.every(isNum) || !allowDraft()) return;
      toOthers().emit('draft:pts', { userId: user.userId, id: msg.id, pts: msg.pts });
    });

    on('draft:end', (msg) => {
      if (!room || !isValidId(msg?.id)) return;
      toOthers().emit('draft:end', { userId: user.userId, id: msg.id });
    });

    socket.on('disconnect', () => {
      if (!room || !user) return;
      if (room.leave(user.userId)) io.to(room.id).emit('user:leave', { userId: user.userId });
      // tell clients if the host changed
      io.to(room.id).emit('room:host', { hostId: room.hostId });
    });
  });
}
