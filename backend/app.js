import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { RoomManager } from './rooms.js';
import { attachSockets } from './sockets.js';
import { assetRouter } from './assets.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

export function createBoardServer() {
  const app = express();
  app.disable('x-powered-by');

  const rooms = new RoomManager();
  const sweeper = setInterval(() => rooms.sweep(), 5 * 60 * 1000);
  sweeper.unref();

  app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.rooms.size }));
  app.use('/api', assetRouter(rooms));

  // no-cache = browsers always revalidate, so a new deploy is picked up without a hard refresh
  app.use(express.static(PUBLIC_DIR, { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
  const sendIndex = (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  app.get('/', sendIndex);
  app.get('/b/:room', sendIndex);

  const server = http.createServer(app);
  const io = new Server(server, { maxHttpBufferSize: 1e6 }); // same-origin only (no CORS)
  attachSockets(io, rooms);

  return { app, server, io, rooms };
}
