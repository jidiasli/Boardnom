// One place that knows how every object type is drawn, measured and hit-tested.
// Because ALL types share the same frame {x, y, w, h}, move / resize / select / erase
// work identically for strokes, shapes, text, stickies and images. (Bug #1 fix.)

import { distToSegment } from './util.js';
import { CFG } from './config.js';

export const FONT = '"DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const LINE_HEIGHT = 1.3;
export const STICKY_PAD = 14;

// ---- text measuring / wrapping ---------------------------------------------
let _measureCtx;
function measureCtx() {
  _measureCtx ??= document.createElement('canvas').getContext('2d');
  return _measureCtx;
}

/** Size of unwrapped text. */
export function measureText(text, fontSize) {
  const c = measureCtx();
  c.font = `${fontSize}px ${FONT}`;
  const lines = String(text).split('\n');
  let w = 0;
  for (const l of lines) w = Math.max(w, c.measureText(l).width);
  return { w: Math.ceil(w) + 2, h: Math.ceil(lines.length * fontSize * LINE_HEIGHT) };
}

export function wrapLines(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxW) {
        line = test;
      } else if (!line) {
        // a single word wider than the box: hard-break it
        let chunk = '';
        for (const ch of word) {
          if (ctx.measureText(chunk + ch).width > maxW && chunk) { lines.push(chunk); chunk = ch; } else chunk += ch;
        }
        line = chunk;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

// ---- stroke geometry --------------------------------------------------------
// pts are stored relative to the object's frame at creation size (bw x bh).
// Resizing just changes w/h; points are re-mapped at draw time.
const mapCache = new WeakMap();
export function mapPts(o) {
  const key = `${o.x}|${o.y}|${o.w}|${o.h}`;
  const hit = mapCache.get(o);
  if (hit && hit.key === key) return hit.pts;
  const sx = o.bw > 0 ? o.w / o.bw : 1;
  const sy = o.bh > 0 ? o.h / o.bh : 1;
  const p = o.pts;
  const out = new Array(p.length);
  for (let i = 0; i < p.length; i += 2) {
    out[i] = o.x + p[i] * sx;
    out[i + 1] = o.y + p[i + 1] * sy;
  }
  mapCache.set(o, { key, pts: out });
  return out;
}

/** Smooth polyline through absolute points. Also used for live (not yet committed) strokes. */
export function strokePath(ctx, p, width, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const n = p.length / 2;
  ctx.beginPath();
  if (n === 1) {
    ctx.arc(p[0], p[1], width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(p[0], p[1]);
    if (n === 2) {
      ctx.lineTo(p[2], p[3]);
    } else {
      for (let i = 1; i < n - 1; i++) {
        const cx = p[2 * i], cy = p[2 * i + 1];
        ctx.quadraticCurveTo(cx, cy, (cx + p[2 * i + 2]) / 2, (cy + p[2 * i + 3]) / 2);
      }
      ctx.lineTo(p[2 * n - 2], p[2 * n - 1]);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function arrowHead(ctx, p, width, color, alpha) {
  const [x1, y1, x2, y2] = p;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.max(12, width * 4);
  const spread = Math.PI / 7;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - len * Math.cos(ang - spread), y2 - len * Math.sin(ang - spread));
  ctx.lineTo(x2 - len * Math.cos(ang + spread), y2 - len * Math.sin(ang + spread));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---- drawing ----------------------------------------------------------------
export function drawObject(ctx, o, env) {
  switch (o.type) {
    case 'stroke':
      strokePath(ctx, mapPts(o), o.width, o.color, o.alpha);
      break;
    case 'line': {
      const p = mapPts(o);
      strokePath(ctx, p, o.width, o.color, o.alpha);
      if (o.arrow) arrowHead(ctx, p, o.width, o.color, o.alpha);
      break;
    }
    case 'rect':
      ctx.save();
      ctx.globalAlpha = o.alpha;
      ctx.lineJoin = 'round';
      ctx.lineWidth = o.width;
      if (o.fill) { ctx.fillStyle = o.fill; ctx.fillRect(o.x, o.y, o.w, o.h); }
      ctx.strokeStyle = o.color;
      ctx.strokeRect(o.x, o.y, o.w, o.h);
      ctx.restore();
      break;
    case 'ellipse':
      ctx.save();
      ctx.globalAlpha = o.alpha;
      ctx.lineWidth = o.width;
      ctx.beginPath();
      ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, Math.max(0.5, o.w / 2), Math.max(0.5, o.h / 2), 0, 0, Math.PI * 2);
      if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
      ctx.strokeStyle = o.color;
      ctx.stroke();
      ctx.restore();
      break;
    case 'text':
      drawText(ctx, o);
      break;
    case 'image':
      drawImage(ctx, o, env);
      break;
  }
}

function drawText(ctx, o) {
  ctx.save();
  ctx.font = `${o.fontSize}px ${FONT}`;
  ctx.textBaseline = 'top';
  const sticky = !!o.bg;
  if (sticky) {
    ctx.shadowColor = 'rgba(20, 20, 40, 0.22)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = o.bg;
    roundRectPath(ctx, o.x, o.y, o.w, o.h, 6);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.rect(o.x, o.y, o.w, o.h);
    ctx.clip();
  }
  ctx.fillStyle = o.color;
  const pad = sticky ? STICKY_PAD : 0;
  const lines = o.wrap ? wrapLines(ctx, o.text, Math.max(10, o.w - pad * 2)) : String(o.text).split('\n');
  const lh = o.fontSize * LINE_HEIGHT;
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], o.x + pad, o.y + pad + i * lh);
  ctx.restore();
}

function drawImage(ctx, o, env) {
  const entry = env.images.get(o.assetId);
  if (entry.status === 'ready') {
    ctx.drawImage(entry.img, o.x, o.y, o.w, o.h);
    return;
  }
  ctx.save();
  ctx.fillStyle = '#e9ecef';
  ctx.fillRect(o.x, o.y, o.w, o.h);
  ctx.strokeStyle = '#adb5bd';
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(o.x, o.y, o.w, o.h);
  ctx.fillStyle = '#868e96';
  ctx.font = `${Math.max(12, Math.min(o.w / 8, 28))}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(entry.status === 'error' ? 'Image unavailable' : 'Loading…', o.x + o.w / 2, o.y + o.h / 2);
  ctx.restore();
}

// ---- hit testing ------------------------------------------------------------
/** @param tol extra slop in WORLD units (callers pass pixels / zoom) */
export function hitTest(o, x, y, tol = 0) {
  switch (o.type) {
    case 'stroke':
    case 'line': {
      const r = o.width / 2 + tol;
      if (x < o.x - r || x > o.x + o.w + r || y < o.y - r || y > o.y + o.h + r) return false;
      const p = mapPts(o);
      if (p.length === 2) return Math.hypot(x - p[0], y - p[1]) <= r;
      for (let i = 0; i < p.length - 2; i += 2) {
        if (distToSegment(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= r) return true;
      }
      return false;
    }
    case 'rect': {
      const r = o.width / 2 + tol;
      if (x < o.x - r || x > o.x + o.w + r || y < o.y - r || y > o.y + o.h + r) return false;
      if (o.fill) return true;
      const inner = x > o.x + r && x < o.x + o.w - r && y > o.y + r && y < o.y + o.h - r;
      return !inner;
    }
    case 'ellipse': {
      const rx = Math.max(o.w / 2, 0.5), ry = Math.max(o.h / 2, 0.5);
      const d = Math.hypot((x - (o.x + rx)) / rx, (y - (o.y + ry)) / ry);
      const r = (o.width / 2 + tol) / Math.min(rx, ry);
      return o.fill ? d <= 1 + r : Math.abs(d - 1) <= r;
    }
    default: // text, sticky, image: the whole frame is solid
      return x >= o.x - tol && x <= o.x + o.w + tol && y >= o.y - tol && y <= o.y + o.h + tol;
  }
}

export const frameOf = (o) => ({ x: o.x, y: o.y, w: o.w, h: o.h });

export function unionFrames(objs) {
  if (!objs.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const o of objs) {
    x1 = Math.min(x1, o.x); y1 = Math.min(y1, o.y);
    x2 = Math.max(x2, o.x + o.w); y2 = Math.max(y2, o.y + o.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** Build the object for a finished freehand stroke from absolute world points. */
export function strokeFromPoints(absPts, { width, color, alpha }) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (let i = 0; i < absPts.length; i += 2) {
    x1 = Math.min(x1, absPts[i]); x2 = Math.max(x2, absPts[i]);
    y1 = Math.min(y1, absPts[i + 1]); y2 = Math.max(y2, absPts[i + 1]);
  }
  const rel = new Array(absPts.length);
  for (let i = 0; i < absPts.length; i += 2) {
    rel[i] = Math.round((absPts[i] - x1) * 10) / 10;
    rel[i + 1] = Math.round((absPts[i + 1] - y1) * 10) / 10;
  }
  const w = x2 - x1, h = y2 - y1;
  return { type: 'stroke', x: x1, y: y1, w, h, bw: w, bh: h, pts: rel, width, color, alpha };
}

export { CFG };
