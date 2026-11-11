// Selection geometry. `computeResize` is a pure function (unit-tested).

export const HANDLES = [
  { id: 'nw', fx: 0, fy: 0, sx: -1, sy: -1, cursor: 'nwse-resize' },
  { id: 'n', fx: 0.5, fy: 0, sx: 0, sy: -1, cursor: 'ns-resize' },
  { id: 'ne', fx: 1, fy: 0, sx: 1, sy: -1, cursor: 'nesw-resize' },
  { id: 'e', fx: 1, fy: 0.5, sx: 1, sy: 0, cursor: 'ew-resize' },
  { id: 'se', fx: 1, fy: 1, sx: 1, sy: 1, cursor: 'nwse-resize' },
  { id: 's', fx: 0.5, fy: 1, sx: 0, sy: 1, cursor: 'ns-resize' },
  { id: 'sw', fx: 0, fy: 1, sx: -1, sy: 1, cursor: 'nesw-resize' },
  { id: 'w', fx: 0, fy: 0.5, sx: -1, sy: 0, cursor: 'ew-resize' },
];

/** Images and auto-sized text keep their proportions when resized. */
export const needsUniform = (o) => o.type === 'image' || (o.type === 'text' && !o.wrap);

export function getSelectionBox(store, zoom) {
  const sel = store.selected();
  if (!sel.length) return null;

  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  let half = 0;
  for (const o of sel) {
    x1 = Math.min(x1, o.x); y1 = Math.min(y1, o.y);
    x2 = Math.max(x2, o.x + o.w); y2 = Math.max(y2, o.y + o.h);
    if (o.type !== 'text' && o.type !== 'image') half = Math.max(half, (o.width || 0) / 2);
  }
  const frame = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  const pad = half + 6 / zoom; // box floats a few screen-px outside the content
  const box = { x: frame.x - pad, y: frame.y - pad, w: frame.w + pad * 2, h: frame.h + pad * 2 };
  const uniform = sel.some(needsUniform);
  const handles = HANDLES
    .filter((h) => !uniform || (h.sx !== 0 && h.sy !== 0)) // uniform => corners only
    .map((h) => ({ ...h, x: box.x + box.w * h.fx, y: box.y + box.h * h.fy }));
  return { frame, box, pad, uniform, handles };
}

export function hitHandle(sb, camera, sx, sy, slop = 12) {
  for (const h of sb.handles) {
    const s = camera.toScreen(h.x, h.y);
    if (Math.abs(sx - s.x) <= slop && Math.abs(sy - s.y) <= slop) return h;
  }
  return null;
}

/**
 * @param snaps   [{id, type, wrap, x, y, w, h, fontSize}] state at drag start
 * @param frame0  union frame at drag start
 * @param handle  one of HANDLES
 * @param px,py   pointer in world coords
 * @param pad     selection-box padding in world units
 * @param uniform keep aspect ratio
 * @returns [{id, patch}]
 */
export function computeResize(snaps, frame0, handle, px, py, pad, uniform) {
  const f = frame0;
  // pointer -> frame edge (the handle sits `pad` outside the frame)
  const ex = px - handle.sx * pad;
  const ey = py - handle.sy * pad;
  const MIN = 4;

  let left = f.x, right = f.x + f.w, top = f.y, bottom = f.y + f.h;
  let scale = 1;

  if (uniform) {
    const ax = handle.sx < 0 ? right : left; // fixed (opposite) corner
    const ay = handle.sy < 0 ? bottom : top;
    const sw = f.w > 0 ? Math.abs(ex - ax) / f.w : 0;
    const sh = f.h > 0 ? Math.abs(ey - ay) / f.h : 0;
    scale = Math.max(sw, sh, MIN / Math.max(f.w, f.h, 1));
    const nw = f.w * scale, nh = f.h * scale;
    left = handle.sx < 0 ? ax - nw : ax;
    right = left + nw;
    top = handle.sy < 0 ? ay - nh : ay;
    bottom = top + nh;
  } else {
    if (handle.sx < 0) left = Math.min(ex, right - Math.min(MIN, f.w));
    else if (handle.sx > 0) right = Math.max(ex, left + Math.min(MIN, f.w));
    if (handle.sy < 0) top = Math.min(ey, bottom - Math.min(MIN, f.h));
    else if (handle.sy > 0) bottom = Math.max(ey, top + Math.min(MIN, f.h));
  }

  const kx = f.w > 0 ? (right - left) / f.w : 1;
  const ky = f.h > 0 ? (bottom - top) / f.h : 1;

  return snaps.map((s) => {
    const patch = {
      x: left + (s.x - f.x) * kx,
      y: top + (s.y - f.y) * ky,
      w: s.w * kx,
      h: s.h * ky,
    };
    if (s.type === 'text' && !s.wrap) patch.fontSize = Math.max(6, Math.round(s.fontSize * (uniform ? scale : ky) * 10) / 10);
    return { id: s.id, patch };
  });
}
