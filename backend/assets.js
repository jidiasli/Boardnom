import express from 'express';
import crypto from 'node:crypto';
import { userIdFromToken } from './sockets.js';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
const ROOM_RE = /^[A-Za-z0-9_-]{3,32}$/;
const ASSET_RE = /^[A-Za-z0-9_-]{6,64}$/;

/** Check the file's real header so a client cannot upload HTML/SVG labelled as an image. */
function sniffType(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export function assetRouter(rooms) {
  const router = express.Router();

  router.post(
    '/rooms/:room/assets',
    express.raw({ type: ALLOWED, limit: '6mb' }),
    (req, res) => {
      if (!ROOM_RE.test(req.params.room)) return res.status(400).json({ error: 'bad-room' });
      const room = rooms.get(req.params.room);
      if (!room) return res.status(404).json({ error: 'no-room' });

      // Only people currently in the room may upload.
      const token = req.get('x-board-token');
      if (!token || !room.presence.has(userIdFromToken(token))) return res.status(403).json({ error: 'not-in-room' });

      const claimed = (req.get('content-type') || '').split(';')[0].trim();
      if (!Buffer.isBuffer(req.body) || req.body.length === 0 || !ALLOWED.includes(claimed)) {
        return res.status(415).json({ error: 'unsupported-type' });
      }
      if (sniffType(req.body) !== claimed) return res.status(415).json({ error: 'type-mismatch' });

      const assetId = 'a' + crypto.randomBytes(12).toString('base64url');
      if (!room.addAsset(assetId, req.body, claimed)) return res.status(413).json({ error: 'room-storage-full' });
      res.status(201).json({ assetId });
    },
  );

  router.get('/rooms/:room/assets/:asset', (req, res) => {
    if (!ROOM_RE.test(req.params.room) || !ASSET_RE.test(req.params.asset)) return res.sendStatus(400);
    const asset = rooms.get(req.params.room)?.getAsset(req.params.asset);
    if (!asset) return res.sendStatus(404);
    res.set({
      'Content-Type': asset.type,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(asset.buf);
  });

  // Return JSON (not an HTML error page) for oversize bodies etc.
  router.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ error: status === 413 ? 'too-large' : 'upload-failed' });
  });

  return router;
}
