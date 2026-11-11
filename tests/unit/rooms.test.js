import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, RoomManager } from '../../backend/rooms.js';
import { sanitizeNewObject, sanitizePatch } from '../../backend/schema.js';

const text = (id, extra = {}) => ({ id, type: 'text', x: 10, y: 20, w: 100, h: 30, text: 'hello', fontSize: 24, color: '#112233', ...extra });

function roomWith(...users) {
  const r = new Room('testroom');
  users.forEach((u) => r.join(u, u, '#000000'));
  return r;
}

test('server assigns ownerId and ignores a forged one from the client', () => {
  const r = roomWith('alice', 'bob');
  const res = r.createObject('alice', text('aaaaaa01', { ownerId: 'bob' }));
  assert.equal(res.obj.ownerId, 'alice');
});

test('BUG 2: another user cannot move or edit your text (owner policy)', () => {
  const r = roomWith('alice', 'bob');
  r.createObject('alice', text('aaaaaa01'));
  const res = r.patchObject('bob', 'aaaaaa01', { x: 999, y: 999, text: 'hijacked' });
  assert.equal(res.error, 'forbidden');
  const o = r.objects.get('aaaaaa01');
  assert.equal(o.x, 10);
  assert.equal(o.text, 'hello');
  assert.equal(o.v, 1);
});

test('owner can move their own object; version increments', () => {
  const r = roomWith('alice');
  r.createObject('alice', text('aaaaaa01'));
  const res = r.patchObject('alice', 'aaaaaa01', { x: 55, y: 66 });
  assert.equal(res.ok, true);
  assert.deepEqual([res.obj.x, res.obj.y, res.obj.v], [55, 66, 2]);
});

test('another user cannot delete your object; owner can', () => {
  const r = roomWith('alice', 'bob');
  r.createObject('alice', text('aaaaaa01'));
  let out = r.deleteObjects('bob', ['aaaaaa01']);
  assert.equal(out.deleted.length, 0);
  assert.equal(out.rejected.length, 1);
  assert.ok(r.objects.has('aaaaaa01'));
  out = r.deleteObjects('alice', ['aaaaaa01']);
  assert.deepEqual(out.deleted, ['aaaaaa01']);
});

test('open policy lets everyone edit; only host can change policy', () => {
  const r = roomWith('alice', 'bob'); // alice is host (first in)
  r.createObject('alice', text('aaaaaa01'));
  assert.equal(r.setPolicy('bob', 'open').error, 'forbidden');
  assert.equal(r.setPolicy('alice', 'open').ok, true);
  assert.equal(r.patchObject('bob', 'aaaaaa01', { x: 5 }).ok, true);
  assert.equal(r.setPolicy('alice', 'chaos').error, 'invalid');
});

test('clear: "mine" only removes own objects; "all" is host-only', () => {
  const r = roomWith('alice', 'bob');
  r.createObject('alice', text('aaaaaa01'));
  r.createObject('bob', text('bbbbbb01'));
  assert.equal(r.clear('bob', 'all').error, 'forbidden');
  assert.deepEqual(r.clear('bob', 'mine').ids, ['bbbbbb01']);
  assert.ok(r.objects.has('aaaaaa01'));
  assert.deepEqual(r.clear('alice', 'all').ids, ['aaaaaa01']);
});

test('a second user cannot overwrite an existing id; owner retry is idempotent', () => {
  const r = roomWith('alice', 'bob');
  r.createObject('alice', text('aaaaaa01'));
  assert.equal(r.createObject('bob', text('aaaaaa01')).error, 'exists');
  assert.equal(r.createObject('alice', text('aaaaaa01')).duplicate, true);
});

test('host is promoted when the host leaves, and reset when room empties', () => {
  const r = roomWith('alice', 'bob');
  assert.equal(r.hostId, 'alice');
  r.leave('alice');
  assert.equal(r.hostId, 'bob');
  r.leave('bob');
  assert.equal(r.hostId, null);
});

test('multi-tab: user is only "gone" after the last connection closes', () => {
  const r = new Room('testroom');
  r.join('alice', 'alice', '#000');
  r.join('alice', 'alice', '#000');
  assert.equal(r.leave('alice'), false);
  assert.equal(r.leave('alice'), true);
});

test('image objects need an uploaded asset', () => {
  const r = roomWith('alice');
  const img = { id: 'imgimg01', type: 'image', x: 0, y: 0, w: 50, h: 50, assetId: 'a123456789' };
  assert.equal(r.createObject('alice', img).error, 'no-asset');
  r.addAsset('a123456789', Buffer.from('x'), 'image/png');
  assert.equal(r.createObject('alice', img).ok, true);
});

test('validation rejects bad ids, unknown types, bad stroke data', () => {
  assert.equal(sanitizeNewObject({ id: 'x', type: 'text', text: 'a' }, 'u'), null);
  assert.equal(sanitizeNewObject({ id: 'abcdef12', type: 'script' }, 'u'), null);
  assert.equal(sanitizeNewObject({ id: 'abcdef12', type: 'stroke', pts: [1, 2, 3] }, 'u'), null);
  assert.equal(sanitizeNewObject({ id: 'abcdef12', type: 'stroke', pts: [1, NaN] }, 'u'), null);
  assert.equal(sanitizeNewObject({ id: 'abcdef12', type: 'line', pts: [1, 2, 3, 4, 5, 6] }, 'u'), null);
  const ok = sanitizeNewObject({ id: 'abcdef12', type: 'text', text: 'hi', color: 'red; drop', x: 1e12 }, 'u');
  assert.equal(ok.color, '#1a1a2e');
  assert.equal(ok.x, 1e6);
});

test('patch whitelist: geometry points and owner are immutable', () => {
  const o = sanitizeNewObject({ id: 'abcdef12', type: 'stroke', pts: [0, 0, 5, 5], w: 5, h: 5 }, 'u');
  const p = sanitizePatch(o, { x: 3, pts: [9, 9], ownerId: 'evil', type: 'text', width: 9999, text: 'nope' });
  assert.deepEqual(p, { x: 3, width: 200 });
});

test('thickness accepts continuous (fractional) values', () => {
  const o = sanitizeNewObject({ id: 'abcdef12', type: 'stroke', pts: [0, 0, 5, 5], width: 7.35 }, 'u');
  assert.equal(o.width, 7.35);
  assert.equal(sanitizePatch(o, { width: 12.4 }).width, 12.4);
});

test('idle empty rooms are swept; occupied rooms are kept', () => {
  const m = new RoomManager({ idleMs: 1000 });
  const a = m.getOrCreate('roomaaa');
  const b = m.getOrCreate('roombbb');
  b.join('u', 'u', '#000');
  m.sweep(Date.now() + 5000);
  assert.equal(m.get('roomaaa'), undefined);
  assert.ok(m.get('roombbb'));
});
