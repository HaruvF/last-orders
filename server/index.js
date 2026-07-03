'use strict';
const path = require('path');
const os = require('os');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { RoomManager } = require('./room');

const PORT = process.env.PORT || process.argv[2] || 3044;
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const pub = path.join(__dirname, '..', 'public');
app.use(express.static(pub));
app.get('/host', (req, res) => res.sendFile(path.join(pub, 'host', 'index.html')));
app.get('/play', (req, res) => res.sendFile(path.join(pub, 'play', 'index.html')));

const rooms = new RoomManager(io);

io.on('connection', (socket) => {
  socket.on('host:create', (data, ack) => {
    const room = rooms.create(socket.id, data && data.reclaim);
    socket.data.role = 'host';
    socket.data.code = room.code;
    if (typeof ack === 'function') ack({ code: room.code });
    room.sync();
  });

  socket.on('player:join', (data, ack) => {
    const room = rooms.get(data && data.code);
    if (!room) return typeof ack === 'function' && ack({ error: 'No pub found with that code.' });
    const result = room.addPlayer(data.name, socket.id);
    if (result.error) return typeof ack === 'function' && ack({ error: result.error });
    socket.data.role = 'player';
    socket.data.code = room.code;
    if (typeof ack === 'function') ack({ ok: true, name: result.player.name, code: room.code });
    room.sync();
  });

  socket.on('player:input', (data) => {
    const room = rooms.get(socket.data.code);
    if (room) room.handleInput(socket.id, data);
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.code);
    if (!room) return;
    if (socket.data.role === 'player') {
      room.disconnectPlayer(socket.id);
    } else if (socket.data.role === 'host' && room.hostSocketId === socket.id) {
      // Keep the room alive for 3 minutes so the host can reload/reclaim
      setTimeout(() => {
        const r = rooms.get(socket.data.code);
        if (r && r.hostSocketId === socket.id) rooms.remove(r.code);
      }, 3 * 60 * 1000);
    }
  });
});

function lanAddresses() {
  const out = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  return out;
}

server.listen(PORT, () => {
  console.log('');
  console.log('  🍺 LAST ORDERS is open for business!');
  console.log('  ─────────────────────────────────────');
  console.log(`  Big screen (TV):   http://localhost:${PORT}/host`);
  for (const ip of lanAddresses()) {
    console.log(`  Phones (players):  http://${ip}:${PORT}/play`);
  }
  console.log('  ─────────────────────────────────────');
  if (process.env.FAST) console.log('  ⚡ FAST mode: timers are 10x shorter (testing).');
});
