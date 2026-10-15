import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { CONFIG } from './config.js';
import { Room } from './room.js';
import { ABILITIES, publicInfo } from './abilities.js';
import { SKILLS } from './skills.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 3000;

// 정적 파일: public/ 과 three.js 모듈만 제공
const STATIC = {
  '/': path.join(ROOT, 'public'),
  '/three/': path.join(ROOT, 'node_modules/three/build'),
};
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const prefix = url.startsWith('/three/') ? '/three/' : '/';
  const base = STATIC[prefix];
  let file = path.join(base, url.slice(prefix.length));
  if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
  if (url === '/') file = path.join(base, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- 방 관리 ----------
// 일반: 빈 자리가 있는 방에 넣고, 없으면 새 방. 연습: 혼자 쓰는 방 + 봇 3명.
const rooms = new Map();
let nextRoomId = 1, nextPlayerId = 1;
const PRACTICE_BOTS = 3;

function findRoom(practice) {
  if (!practice) for (const room of rooms.values()) if (!room.isFull) return room;
  const room = new Room(nextRoomId++, { practice });
  rooms.set(room.id, room);
  return room;
}

const catalog = ABILITIES.map(publicInfo);
const skillCd = Object.fromEntries(Object.entries(SKILLS).map(([k, s]) => [k, s.cd]));

const wss = new WebSocketServer({ server });
wss.on('connection', socket => {
  const id = nextPlayerId++;
  let room = null, player = null;

  // 첫 메시지(hello)를 받으면 방에 넣는다
  function join(msg) {
    const practice = msg.mode === 'practice';
    room = findRoom(practice);
    player = room.addPlayer(id, socket);
    room.setName(id, msg.name);
    if (practice) for (let i = 0; i < PRACTICE_BOTS; i++) room.addBot();
    socket.send(JSON.stringify({ t: 'welcome', id, roomId: room.id, practice, abilities: catalog, skillCd, winScore: CONFIG.WIN_SCORE,
      physics: { accel: CONFIG.MOVE_ACCEL, maxSpeed: CONFIG.MAX_SPEED, friction: CONFIG.FRICTION, iceFriction: CONFIG.ICE_FRICTION, iceAccel: CONFIG.ICE_ACCEL_MULT, tiltGravity: CONFIG.TILT_GRAVITY, tick: CONFIG.TICK_RATE } }));
    console.log(`[room ${room.id}${practice ? ' 연습' : ''}] ${player.name} 입장 (${room.players.size}명)`);
  }

  socket.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.t === 'hello') { if (!room) join(msg); return; }
    if (!room) return;
    if (msg.t === 'input') room.setInput(id, msg);
    else if (msg.t === 'pick') room.pick(id, msg.id, msg.slot);
    else if (msg.t === 'restart') room.restart(id);
    else if (msg.t === 'start') room.requestStart(id);
    else if (msg.t === 'bots') room.setBots(id, msg.on);
    else if (msg.t === 'emote') room.emote(id, msg.n);
  });

  socket.on('close', () => {
    if (!room) return;
    room.removePlayer(id);
    console.log(`[room ${room.id}] ${player.name} 퇴장 (${room.players.size}명)`);
    if (room.isEmpty) rooms.delete(room.id);
  });
});

const dt = 1 / CONFIG.TICK_RATE;
setInterval(() => { for (const room of rooms.values()) room.tick(dt); }, 1000 * dt);

server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
