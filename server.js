const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─── In-memory room storage ───────────────────────────────────────
// rooms[roomId] = { elements: Map<id, el>, users: Map<socketId, user> }
const rooms = new Map();

function getRoom(id) {
  if (!rooms.has(id)) rooms.set(id, { elements: new Map(), users: new Map() });
  return rooms.get(id);
}

function randomRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const USER_COLORS = [
  '#FF6B6B','#4ECDC4','#45B7D1','#FFA07A',
  '#98D8C8','#DDA0DD','#F7DC6F','#BB8FCE',
  '#85C1E9','#FF9FF3','#A3CB38','#FDA7DF'
];
let colorIdx = 0;

// ─── Socket handlers ──────────────────────────────────────────────
io.on('connection', socket => {
  let roomId = null;
  let user   = null;

  // Join or create a room
  socket.on('join', ({ room, name }) => {
    roomId = (room || '').trim().toUpperCase() || randomRoomId();
    user   = {
      id    : socket.id,
      name  : (name || 'Guest').trim().slice(0, 30),
      color : USER_COLORS[colorIdx++ % USER_COLORS.length],
    };

    socket.join(roomId);
    const rm = getRoom(roomId);
    rm.users.set(socket.id, user);

    // Send full board state to the joiner
    socket.emit('init', {
      user,
      roomId,
      elements : [...rm.elements.values()],
      users    : [...rm.users.values()],
    });

    // Announce to everyone else
    socket.to(roomId).emit('user:join', user);
    console.log(`[${roomId}] "${user.name}" joined  (${rm.users.size} online)`);
  });

  // ── Element events ──────────────────────────────────────────────
  socket.on('el:add', el => {
    if (!roomId) return;
    getRoom(roomId).elements.set(el.id, el);
    socket.to(roomId).emit('el:add', el);
  });

  socket.on('el:update', el => {
    if (!roomId) return;
    const rm  = getRoom(roomId);
    const old = rm.elements.get(el.id);
    if (old) rm.elements.set(el.id, { ...old, ...el });
    socket.to(roomId).emit('el:update', el);
  });

  socket.on('el:delete', ids => {
    if (!roomId) return;
    const rm = getRoom(roomId);
    ids.forEach(id => rm.elements.delete(id));
    socket.to(roomId).emit('el:delete', ids);
  });

  // ── Streaming path points while drawing ─────────────────────────
  socket.on('path:pt', data => {
    if (!roomId) return;
    socket.to(roomId).emit('path:pt', data);
  });

  // ── Cursor position ─────────────────────────────────────────────
  socket.on('cursor', pos => {
    if (!roomId) return;
    socket.to(roomId).emit('cursor', { id: socket.id, ...pos });
  });

  // ── Clear entire board ───────────────────────────────────────────
  socket.on('clear', () => {
    if (!roomId) return;
    getRoom(roomId).elements.clear();
    io.to(roomId).emit('clear');
  });

  // ── Disconnect ───────────────────────────────────────────────────
  socket.on('disconnect', () => {
    if (!roomId) return;
    const rm = rooms.get(roomId);
    if (!rm) return;
    rm.users.delete(socket.id);
    io.to(roomId).emit('user:leave', socket.id);
    if (rm.users.size === 0) {
      rooms.delete(roomId);
      console.log(`[${roomId}] Room closed (empty)`);
    }
  });
});

// ─── Start ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('  ⬡  Boardnom is running!');
  console.log(`  →  http://localhost:${PORT}`);
  console.log('');
});
