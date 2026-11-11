import test from 'node:test';
import assert from 'node:assert/strict';
import { computeResize } from '../../public/js/selection.js';
import { hitTest, strokeFromPoints, unionFrames } from '../../public/js/objects.js';
import { Camera } from '../../public/js/camera.js';

const SE = { id: 'se', sx: 1, sy: 1 };
const NW = { id: 'nw', sx: -1, sy: -1 };
const E = { id: 'e', sx: 1, sy: 0 };
const snap = (o) => ({ id: 'a', type: 'rect', x: 0, y: 0, w: 100, h: 50, ...o });

test('free resize from SE corner scales the object', () => {
  const [r] = computeResize([snap()], { x: 0, y: 0, w: 100, h: 50 }, SE, 200, 100, 0, false);
  assert.deepEqual([r.patch.x, r.patch.y, r.patch.w, r.patch.h], [0, 0, 200, 100]);
});

test('free resize from NW corner keeps the SE corner fixed', () => {
  const [r] = computeResize([snap()], { x: 0, y: 0, w: 100, h: 50 }, NW, -50, -25, 0, false);
  assert.deepEqual([r.patch.x, r.patch.y, r.patch.w, r.patch.h], [-50, -25, 150, 75]);
});

test('edge handle only changes one axis', () => {
  const [r] = computeResize([snap()], { x: 0, y: 0, w: 100, h: 50 }, E, 300, 999, 0, false);
  assert.equal(r.patch.w, 300);
  assert.equal(r.patch.h, 50);
});

test('uniform resize (images) keeps aspect ratio', () => {
  const [r] = computeResize([snap({ type: 'image', w: 240, h: 160 })], { x: 0, y: 0, w: 240, h: 160 }, SE, 480, 200, 0, true);
  assert.ok(Math.abs(r.patch.w / r.patch.h - 1.5) < 1e-9);
  assert.equal(r.patch.w, 480);
});

test('resize never flips or collapses below the minimum size', () => {
  const [r] = computeResize([snap()], { x: 0, y: 0, w: 100, h: 50 }, SE, -500, -500, 0, false);
  assert.ok(r.patch.w >= 4 && r.patch.h >= 4);
  assert.ok(r.patch.w > 0 && r.patch.h > 0);
});

test('plain text scales its font size with a uniform resize', () => {
  const t = snap({ type: 'text', wrap: false, w: 100, h: 30, fontSize: 20 });
  const [r] = computeResize([t], { x: 0, y: 0, w: 100, h: 30 }, SE, 200, 60, 0, true);
  assert.equal(r.patch.fontSize, 40);
});

test('multi-select resize moves every object proportionally', () => {
  const a = snap({ id: 'a', x: 0, y: 0, w: 50, h: 50 });
  const b = snap({ id: 'b', x: 50, y: 0, w: 50, h: 50 });
  const out = computeResize([a, b], { x: 0, y: 0, w: 100, h: 50 }, SE, 200, 50, 0, false);
  assert.deepEqual([out[1].patch.x, out[1].patch.w], [100, 100]);
});

test('stroke hit-testing uses distance to the line, not the bounding box', () => {
  const s = strokeFromPoints([0, 0, 100, 100], { width: 4, color: '#000', alpha: 1 });
  assert.equal(hitTest(s, 50, 50, 2), true); // on the diagonal
  assert.equal(hitTest(s, 90, 10, 2), false); // inside the bbox but far from the line
});

test('a moved + resized stroke still hits where it is drawn', () => {
  const s = strokeFromPoints([0, 0, 100, 0], { width: 4, color: '#000', alpha: 1 });
  s.x = 500; s.y = 300; s.w = 200; // moved and stretched
  assert.equal(hitTest(s, 600, 300, 2), true);
  assert.equal(hitTest(s, 50, 0, 2), false);
});

test('a single tap becomes a dot that can be hit', () => {
  const s = strokeFromPoints([10, 10], { width: 8, color: '#000', alpha: 1 });
  assert.equal(hitTest(s, 12, 10, 0), true);
  assert.equal(hitTest(s, 40, 10, 0), false);
});

test('unfilled rect is hit on its edge but not in the middle', () => {
  const r = { type: 'rect', x: 0, y: 0, w: 100, h: 100, width: 4, fill: null };
  assert.equal(hitTest(r, 0, 50, 3), true);
  assert.equal(hitTest(r, 50, 50, 3), false);
  assert.equal(hitTest({ ...r, fill: '#ff000044' }, 50, 50, 3), true);
});

test('images and text are hit anywhere inside their frame', () => {
  assert.equal(hitTest({ type: 'image', x: 0, y: 0, w: 100, h: 80 }, 50, 40, 0), true);
  assert.equal(hitTest({ type: 'image', x: 0, y: 0, w: 100, h: 80 }, 150, 40, 0), false);
});

test('unionFrames bounds a group', () => {
  assert.deepEqual(unionFrames([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 5, w: 10, h: 10 }]), { x: 0, y: 0, w: 30, h: 15 });
});

test('camera zoomAt keeps the point under the cursor fixed and clamps zoom', () => {
  const c = new Camera();
  c.setViewport(800, 600);
  const before = c.toWorld(300, 200);
  c.zoomAt(300, 200, 2);
  const after = c.toWorld(300, 200);
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
  for (let i = 0; i < 100; i++) c.zoomAt(300, 200, 3);
  assert.ok(c.zoom <= 16);
  for (let i = 0; i < 200; i++) c.zoomAt(300, 200, 0.1);
  assert.ok(c.zoom >= 0.05);
});

test('camera recovers from NaN instead of blanking the board', () => {
  const c = new Camera();
  c.setViewport(800, 600);
  c.panBy(NaN, 5);
  assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.zoom));
  c.zoomAt(100, 100, Infinity);
  assert.ok(Number.isFinite(c.zoom));
});
