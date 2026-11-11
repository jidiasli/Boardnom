// Validation + sanitising for EVERYTHING that arrives from a client.
// The server never stores or relays a field it has not explicitly allowed.

export const LIMITS = {
  maxObjectsPerRoom: 5000,
  maxPoints: 8000, // points per stroke (each point = 2 numbers)
  maxTextLength: 5000,
  coord: 1e6,
  size: 1e6,
  maxStrokeWidth: 200,
};

const TYPES = new Set(['stroke', 'line', 'rect', 'ellipse', 'text', 'image']);
const ID_RE = /^[A-Za-z0-9_-]{6,40}$/;
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const ASSET_RE = /^[A-Za-z0-9_-]{6,64}$/;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, lo, hi, fallback) => (isNum(v) ? clamp(v, lo, hi) : fallback);
const color = (v, fallback) => (typeof v === 'string' && COLOR_RE.test(v) ? v : fallback);

export const isValidId = (id) => typeof id === 'string' && ID_RE.test(id);

/** Build a trusted object from untrusted input, or return null. */
export function sanitizeNewObject(raw, ownerId) {
  if (!raw || typeof raw !== 'object') return null;
  if (!isValidId(raw.id) || !TYPES.has(raw.type)) return null;
  const C = LIMITS.coord;

  const o = {
    id: raw.id,
    type: raw.type,
    ownerId, // always set by the server from the authenticated socket - never trusted from the client
    x: num(raw.x, -C, C, 0),
    y: num(raw.y, -C, C, 0),
    w: num(raw.w, 0, LIMITS.size, 0),
    h: num(raw.h, 0, LIMITS.size, 0),
    z: 0,
    v: 1,
  };

  switch (o.type) {
    case 'stroke':
    case 'line': {
      const p = raw.pts;
      if (!Array.isArray(p) || p.length < 2 || p.length % 2 !== 0) return null;
      if (p.length > LIMITS.maxPoints * 2) return null;
      if (o.type === 'line' && p.length !== 4) return null;
      if (!p.every(isNum)) return null;
      o.pts = p.map((n) => clamp(n, -LIMITS.size, LIMITS.size));
      o.bw = num(raw.bw, 0, LIMITS.size, o.w);
      o.bh = num(raw.bh, 0, LIMITS.size, o.h);
      o.width = num(raw.width, 0.5, LIMITS.maxStrokeWidth, 4);
      o.color = color(raw.color, '#1a1a2e');
      o.alpha = num(raw.alpha, 0.05, 1, 1);
      if (o.type === 'line') o.arrow = raw.arrow === true;
      break;
    }
    case 'rect':
    case 'ellipse':
      o.width = num(raw.width, 0.5, LIMITS.maxStrokeWidth, 4);
      o.color = color(raw.color, '#1a1a2e');
      o.fill = raw.fill == null ? null : color(raw.fill, null);
      o.alpha = num(raw.alpha, 0.05, 1, 1);
      break;
    case 'text':
      if (typeof raw.text !== 'string') return null;
      o.text = raw.text.slice(0, LIMITS.maxTextLength);
      o.fontSize = num(raw.fontSize, 6, 400, 24);
      o.color = color(raw.color, '#1a1a2e');
      o.bg = raw.bg == null ? null : color(raw.bg, null);
      o.wrap = raw.wrap === true;
      break;
    case 'image':
      if (typeof raw.assetId !== 'string' || !ASSET_RE.test(raw.assetId)) return null;
      o.assetId = raw.assetId;
      break;
  }
  return o;
}

/** Fields that may change after creation, per type. Geometry (pts) is immutable. */
const PATCHABLE = {
  stroke: ['width', 'color', 'alpha'],
  line: ['width', 'color', 'alpha'],
  rect: ['width', 'color', 'fill', 'alpha'],
  ellipse: ['width', 'color', 'fill', 'alpha'],
  text: ['text', 'fontSize', 'color', 'bg'],
  image: [],
};

export function sanitizePatch(obj, raw) {
  const patch = {};
  if (!raw || typeof raw !== 'object') return patch;
  const C = LIMITS.coord;
  if (isNum(raw.x)) patch.x = clamp(raw.x, -C, C);
  if (isNum(raw.y)) patch.y = clamp(raw.y, -C, C);
  if (isNum(raw.w)) patch.w = clamp(raw.w, 0, LIMITS.size);
  if (isNum(raw.h)) patch.h = clamp(raw.h, 0, LIMITS.size);

  for (const key of PATCHABLE[obj.type] || []) {
    if (!(key in raw)) continue;
    const v = raw[key];
    switch (key) {
      case 'width': if (isNum(v)) patch.width = clamp(v, 0.5, LIMITS.maxStrokeWidth); break;
      case 'alpha': if (isNum(v)) patch.alpha = clamp(v, 0.05, 1); break;
      case 'fontSize': if (isNum(v)) patch.fontSize = clamp(v, 6, 400); break;
      case 'text': if (typeof v === 'string') patch.text = v.slice(0, LIMITS.maxTextLength); break;
      case 'color': if (typeof v === 'string' && COLOR_RE.test(v)) patch.color = v; break;
      case 'fill':
      case 'bg':
        if (v === null) patch[key] = null;
        else if (typeof v === 'string' && COLOR_RE.test(v)) patch[key] = v;
        break;
    }
  }
  return patch;
}
