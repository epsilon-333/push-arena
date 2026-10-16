import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
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
// 방 만들기: 4자리 코드가 생기고 만든 사람이 방장. 코드 입력: 그 방에 들어감.
// 빠른 시작: 빠른 시작한 사람끼리 모임. 연습: 혼자 + 봇 3명.
// 게임이 시작된 방(대기실이 아닌 방)에는 아무도 들어갈 수 없다.
const rooms = new Map(); // code -> room
let nextPlayerId = 1;
const PRACTICE_BOTS = 3;

function newCode() {
  let code;
  do code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  while (rooms.has(code));
  return code;
}

function createRoom(kind) {
  const room = new Room(newCode(), { kind });
  rooms.set(room.code, room);
  return room;
}

function findQuickRoom() {
  for (const room of rooms.values()) if (room.kind === 'quick' && room.isOpen) return room;
  return createRoom('quick');
}

const catalog = ABILITIES.map(publicInfo);
const skillCd = Object.fromEntries(Object.entries(SKILLS).map(([k, s]) => [k, s.cd]));
const physics = { accel: CONFIG.MOVE_ACCEL, maxSpeed: CONFIG.MAX_SPEED, friction: CONFIG.FRICTION, iceFriction: CONFIG.ICE_FRICTION, iceAccel: CONFIG.ICE_ACCEL_MULT, tiltGravity: CONFIG.TILT_GRAVITY, tick: CONFIG.TICK_RATE,
  spin: CONFIG.SPIN_ACCEL, spinOut: CONFIG.SPIN_OUT, maxR: CONFIG.HEX_SIZE * 1.5 * CONFIG.HEX_RINGS }; // 회전판 예측용

const send = (socket, obj) => { if (socket?.readyState === 1) socket.send(JSON.stringify(obj)); };

// ---------- 접속 ----------
// conn = 플레이어 한 명. 연결(socket)이 끊겨도 RECONNECT_TIME 동안은 방에 자리를 남겨두고,
// 그 사이에 같은 token으로 다시 접속하면(폰에서 다른 앱 봤다가 돌아옴) 원래 자리로 돌아간다.
const conns = new Map(); // token -> conn

function welcome(conn, extra = {}) {
  const room = conn.room;
  send(conn.socket, { t: 'welcome', id: conn.id, token: conn.token, code: room.code, kind: room.kind, abilities: catalog, skillCd, winScore: CONFIG.WIN_SCORE, physics, ...extra });
}

function enter(conn, room) {
  const player = room.addPlayer(conn.id, conn.socket);
  room.setName(conn.id, conn.name);
  room.setHat(conn.id, conn.hat);
  conn.room = room;
  if (room.kind === 'practice') for (let i = 0; i < PRACTICE_BOTS; i++) room.addBot();
  welcome(conn);
  console.log(`[방 ${room.code} ${room.kind}] ${player.name} 입장 (${room.humans.length}명)`);
}

function leave(conn) {
  clearTimeout(conn.dropTimer);
  const room = conn.room;
  if (!room) return;
  room.removePlayer(conn.id);
  conn.room = null;
  console.log(`[방 ${room.code}] ${conn.name} 퇴장 (${room.humans.length}명)`);
  if (room.isEmpty) rooms.delete(room.code);
}

// 첫 메시지(hello): 방 만들기 / 코드로 입장 / 빠른 시작 / 연습
function join(conn, msg) {
  conn.name = msg.name;
  conn.hat = msg.hat;
  if (msg.mode === 'create') return enter(conn, createRoom('private'));
  if (msg.mode === 'practice') return enter(conn, createRoom('practice'));
  if (msg.mode === 'quick') return enter(conn, findQuickRoom());
  const room = rooms.get(String(msg.code ?? ''));
  if (!room || room.kind === 'practice') return send(conn.socket, { t: 'joinFail', reason: '그런 방이 없어요. 코드를 다시 확인해 주세요.' });
  if (room.phase !== 'waiting') return send(conn.socket, { t: 'joinFail', reason: '이미 게임이 시작된 방이에요.' });
  if (room.isFull) return send(conn.socket, { t: 'joinFail', reason: '방이 꽉 찼어요. (최대 4명)' });
  enter(conn, room);
}

// 끊겼던 플레이어가 다시 접속: 원래 방, 원래 자리로
function resume(socket, token) {
  const conn = conns.get(String(token ?? ''));
  if (!conn?.room?.players.has(conn.id)) return null;
  clearTimeout(conn.dropTimer);
  const old = conn.socket;
  conn.socket = socket; // 옛 연결의 close가 이 사람을 내보내지 않도록 먼저 바꿈
  if (old !== socket) old.terminate();
  conn.room.reattach(conn.id, socket);
  welcome(conn, { resumed: true });
  conn.room.resendOffer(conn.id);
  console.log(`[방 ${conn.room.code}] ${conn.name} 다시 연결`);
  return conn;
}

// 최종 순위 화면에서 "다시 하기": 바로 새 방으로. 먼저 누른 사람이 새 방 방장, 뒤에 누른 사람은 그 방으로.
function restart(conn) {
  const old = conn.room;
  if (old.phase !== 'gameOver') return;
  let next = old.nextRoom;
  if (!next || !rooms.has(next.code) || !next.isOpen) {
    next = createRoom(old.kind);
    old.nextRoom = next;
  }
  leave(conn);
  enter(conn, next);
}

const wss = new WebSocketServer({ server });
wss.on('connection', socket => {
  let conn = null;
  socket.alive = true;
  socket.on('pong', () => { socket.alive = true; });

  socket.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (msg.t === 'hello') {
      if (msg.mode === 'resume') {
        if (conn) return;
        conn = resume(socket, msg.token);
        if (!conn) send(socket, { t: 'resumeFail' });
        return;
      }
      if (!conn) {
        conn = { id: nextPlayerId++, token: randomUUID(), socket, name: '', room: null, dropTimer: null };
        conns.set(conn.token, conn);
      }
      if (!conn.room) join(conn, msg);
      return;
    }
    const room = conn?.room;
    if (!room) return;
    const id = conn.id;
    if (msg.t === 'input') room.setInput(id, msg);
    else if (msg.t === 'pick') room.pick(id, msg.id, msg.slot);
    else if (msg.t === 'restart') restart(conn);
    else if (msg.t === 'start') room.requestStart(id);
    else if (msg.t === 'bots') room.setBots(id, msg.on);
    else if (msg.t === 'emote') room.emote(id, msg.n);
    else if (msg.t === 'leave') { leave(conn); conns.delete(conn.token); }
    else if (msg.t === 'kick') {
      const target = room.kick(id, Number(msg.id));
      const tc = target && [...conns.values()].find(c => c.id === target.id);
      if (tc) {
        tc.room = null; // 다시 연결해도 이 방으로 못 돌아옴
        send(tc.socket, { t: 'kicked' });
        tc.socket.close();
        console.log(`[방 ${room.code}] ${tc.name} 퇴출`);
      }
    }
  });

  socket.on('close', () => {
    if (!conn || conn.socket !== socket) return; // 이미 새 연결로 바뀐 옛 연결
    if (!conn.room) { conns.delete(conn.token); return; }
    // 바로 내보내지 않고 잠깐 기다림
    conn.room.setAway(conn.id);
    console.log(`[방 ${conn.room.code}] ${conn.name} 연결 끊김 (${CONFIG.RECONNECT_TIME}초 기다림)`);
    const c = conn;
    c.dropTimer = setTimeout(() => { leave(c); conns.delete(c.token); }, CONFIG.RECONNECT_TIME * 1000);
  });
});

// 응답 없는 연결 정리 (폰이 화면을 끄면 close가 늦게 오기도 함)
setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.alive) { socket.terminate(); continue; }
    socket.alive = false;
    socket.ping();
  }
}, 5000);

const dt = 1 / CONFIG.TICK_RATE;
setInterval(() => { for (const room of rooms.values()) room.tick(dt); }, 1000 * dt);

server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
