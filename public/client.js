import * as THREE from 'three';
import { Character, toon } from './js/character.js';
import * as UI from './js/ui.js';
import { isTouch, initTouch } from './js/touch.js';
import * as Sound from './js/audio.js';

// ---------- 씬 기본 구성 ----------
// 폰은 가볍게: 안티앨리어싱 끔, 해상도·그림자 품질 낮춤
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(isTouch ? 1.25 : 2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = isTouch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 250);
const GAME_CAM = { pos: new THREE.Vector3(0, 19, 22), look: new THREE.Vector3(0, 0, 1.5) }; // 전체 보기

scene.add(new THREE.HemisphereLight('#cfe0ff', '#3a3550', 1.1));
const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
sun.position.set(6, 16, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -20;
sun.shadow.camera.right = sun.shadow.camera.top = 20;
sun.shadow.bias = -0.0005;
scene.add(sun);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 72 : 55; // 세로 화면이면 더 넓게
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// 판 전체(타일 + 캐릭터)를 담는 그룹. 기울기는 이 그룹을 회전시킨다.
const board = new THREE.Group();
scene.add(board);

// ---------- 육각형 타일 ----------
const SQRT3 = Math.sqrt(3);
const TILE_H = 0.7;
const tileMeshes = new Map(); // "q,r" -> mesh
const sideMat = toon('#4a4f73');
const topMats = [toon('#c9d3f0'), toon('#b6c1e6')];
// 맵 규칙별 타일 색 (빙판길은 하늘색 얼음)
const TILE_COLORS = {
  normal: { top: ['#c9d3f0', '#b6c1e6'], side: '#4a4f73' },
  ice: { top: ['#e8f8ff', '#c9ecfb'], side: '#6aa6cf' },
};
let tileTheme = 'normal';
function setTileTheme(name) {
  if (name === tileTheme) return;
  tileTheme = name;
  const c = TILE_COLORS[name];
  topMats.forEach((m, i) => m.color.set(c.top[i]));
  crackedTop.color.set(c.top[0]);
  sideMat.color.set(c.side);
}
const crumbleTop = toon('#ff8a5c');
// 균열 무늬 (윗면 텍스처)
const crackTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#2a2d45'; g.lineWidth = 7; g.lineCap = g.lineJoin = 'round';
  const crack = (x, y, a, len, depth) => {
    if (depth === 0) return;
    g.beginPath(); g.moveTo(x, y);
    let cx = x, cy = y;
    for (let i = 0; i < 4; i++) {
      a += (Math.random() - 0.5) * 0.9;
      cx += Math.cos(a) * len / 4; cy += Math.sin(a) * len / 4;
      g.lineTo(cx, cy);
    }
    g.stroke();
    g.lineWidth = Math.max(3, g.lineWidth - 2);
    crack(cx, cy, a + 0.6, len * 0.6, depth - 1);
    crack(cx, cy, a - 0.7, len * 0.5, depth - 1);
  };
  for (let i = 0; i < 5; i++) { g.lineWidth = 7; crack(128, 128, (i / 5) * Math.PI * 2, 90, 2); }
  return new THREE.CanvasTexture(c);
})();
const crackedTop = toon('#c9d3f0');
crackedTop.map = crackTex;
let tileGeo = null;

function tileGeometry(size) {
  if (!tileGeo) tileGeo = new THREE.CylinderGeometry(size * 0.94, size * 0.9, TILE_H, 6);
  return tileGeo;
}

function addTile(key, q, r, size) {
  const top = topMats[(((q - r) % 3) + 3) % 3 === 0 ? 1 : 0];
  const mesh = new THREE.Mesh(tileGeometry(size), [sideMat, top, sideMat]); // 옆, 윗면, 아랫면
  mesh.position.set(size * SQRT3 * (q + r / 2), -TILE_H / 2, size * 1.5 * r);
  mesh.receiveShadow = true; // 타일끼리는 그림자를 안 드리움 (가벼움)
  mesh.userData = { base: mesh.position.clone(), top, state: 1, fallV: 0 };
  board.add(mesh);
  tileMeshes.set(key, mesh);
  return mesh;
}

function applyTiles(msg) {
  const seen = new Set();
  for (const [q, r, state] of msg.tiles) { // state: 0 사라짐, 1 정상, 2 무너지는 중, 3 균열
    const key = `${q},${r}`;
    seen.add(key);
    const mesh = tileMeshes.get(key) ?? addTile(key, q, r, msg.size);
    const d = mesh.userData;
    if (state === 1 && d.state !== 1) { // 다시 생김 / 새 라운드: 아래에서 올라옴
      mesh.position.set(d.base.x, d.base.y - 6, d.base.z);
      mesh.visible = true; d.fallV = 0; d.rising = true;
      mesh.rotation.set(0, 0, 0);
    }
    d.state = state;
    mesh.material[1] = state === 2 ? crumbleTop : state === 3 ? crackedTop : d.top;
  }
  for (const [key, mesh] of tileMeshes) {
    if (!seen.has(key)) { board.remove(mesh); tileMeshes.delete(key); }
  }
}

// 서버 연결 전(표지 화면)에 보여줄 맵
applyTiles({ size: 1.2, tiles: (() => {
  const out = [];
  const N = 7;
  for (let q = -N; q <= N; q++) for (let r = Math.max(-N, -q - N); r <= Math.min(N, -q + N); r++) out.push([q, r, 1]);
  return out;
})() });

// 배경: 아래쪽에 떠다니는 작은 육각형들
const decoGeo = new THREE.CylinderGeometry(0.6, 0.55, 0.3, 6);
const decoMat = toon('#3b3f66');
const decos = [];
for (let i = 0; i < (isTouch ? 12 : 40); i++) {
  const m = new THREE.Mesh(decoGeo, decoMat);
  const a = Math.random() * Math.PI * 2, r = 18 + Math.random() * 20;
  m.position.set(Math.cos(a) * r, -4 - Math.random() * 10, Math.sin(a) * r);
  m.scale.setScalar(0.5 + Math.random() * 1.5);
  m.userData.spin = (Math.random() - 0.5) * 0.4;
  m.userData.phase = Math.random() * 10;
  scene.add(m);
  decos.push(m);
}

// ---------- 효과 ----------
const burstTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  g.fillStyle = '#fff';
  g.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, rr = i % 2 ? 26 : 60;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.fill();
  return new THREE.CanvasTexture(c);
})();
const effects = [];

function spawnBurst(pos, color = '#ffffff') {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: burstTex, color, transparent: true, depthWrite: false }));
  s.position.copy(pos);
  board.add(s);
  effects.push({ obj: s, life: 0, max: 0.3, update: (e, k) => { s.scale.setScalar(0.6 + k * 1.6); s.material.opacity = 1 - k; } });
}

const waveGeo = new THREE.RingGeometry(0.5, 0.75, 24, 1, -Math.PI * 0.4, Math.PI * 0.8); // 서버 ATTACK_ANGLE과 맞춤
function spawnPushWave(group, range) {
  const m = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(group.position.x, 0.6, group.position.z);
  m.rotation.z = group.rotation.y; // 바라보는 방향
  board.add(m);
  effects.push({ obj: m, life: 0, max: 0.28, update: (e, k) => {
    m.scale.setScalar(1 + k * (range / 0.75 - 1));
    m.material.opacity = 0.7 * (1 - k);
  } });
}

// 바닥 원형 충격파 (충격파, 내려찍기)
const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
function spawnRing(x, z, radius, color = '#ffffff') {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.1, z);
  board.add(m);
  effects.push({ obj: m, life: 0, max: 0.4, update: (e, k) => { m.scale.setScalar(0.3 + k * radius); m.material.opacity = 0.9 * (1 - k); } });
}

// 블랙홀 구슬
const orbMeshes = new Map();
const orbCore = new THREE.MeshBasicMaterial({ color: '#1a0f2e' });
const orbRingMat = new THREE.MeshBasicMaterial({ color: '#b07bff', transparent: true, opacity: 0.8, side: THREE.DoubleSide });
function syncOrbs(list) {
  const seen = new Set();
  for (const o of list) {
    seen.add(o.id);
    let g = orbMeshes.get(o.id);
    if (!g) {
      g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), orbCore));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 40), orbRingMat);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      const pull = new THREE.Mesh(new THREE.RingGeometry(5.3, 5.5, 64), new THREE.MeshBasicMaterial({ color: '#b07bff', transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      pull.rotation.x = -Math.PI / 2; pull.position.y = -1.05;
      g.add(pull);
      g.userData = { ring, pull, target: new THREE.Vector3(o.x, 1.1, o.z) };
      g.position.set(o.x, 1.1, o.z);
      board.add(g);
      orbMeshes.set(o.id, g);
    }
    g.userData.target.set(o.x, 1.1, o.z);
    g.userData.pull.visible = !o.fly;
  }
  for (const [id, g] of orbMeshes) if (!seen.has(id)) { board.remove(g); orbMeshes.delete(id); }
}

// 얼음 발자국
const iceGeo = new THREE.CircleGeometry(0.9, 20);
const iceDecals = [];
function syncIce(list) {
  while (iceDecals.length < list.length) {
    const m = new THREE.Mesh(iceGeo, new THREE.MeshBasicMaterial({ color: '#dff6ff', transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    board.add(m);
    iceDecals.push(m);
  }
  iceDecals.forEach((m, i) => {
    const t = list[i];
    m.visible = !!t;
    if (t) { m.position.set(t[0], 0.03, t[1]); m.material.opacity = 0.75 * (1 - t[2] / 2); }
  });
}

// 서버 효과 이벤트
// 내 캐릭터에서 멀수록 작게
function volAt(x, z) {
  const me = views.get(myId);
  if (!me) return 0.6;
  const d = Math.hypot(me.char.root.position.x - x, me.char.root.position.z - z);
  return Math.max(0, 1 - d / 22);
}

function playEvents(events) {
  for (const e of events ?? []) {
    if (e.k === 'ring') { spawnRing(e.x, e.z, e.r); Sound.play('boom', volAt(e.x, e.z)); }
    else if (e.k === 'dash') Sound.play('whoosh', e.id === myId ? 1 : 0.5);
    else if (e.k === 'swap') {
      Sound.play('warp', 1);
      spawnBurst(tmp.set(e.ax, 1.1, e.az), '#b07bff');
      spawnBurst(tmp.set(e.bx, 1.1, e.bz), '#b07bff');
    }
  }
}

let shake = 0;

// ---------- 플레이어 ----------
const views = new Map(); // id -> { char, label, state, ... }

function createView(p) {
  const char = new Character(p.color);
  board.add(char.root);
  char.root.position.set(p.x, 0, p.z);
  // 방어막 구체
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 16),
    new THREE.MeshBasicMaterial({ color: '#7fd6ff', transparent: true, opacity: 0.3, depthWrite: false }));
  shield.position.y = 1.1;
  shield.visible = false;
  char.root.add(shield);
  return { char, shield, dashPuff: 0, label: UI.createLabel(), target: { x: p.x, z: p.z }, prev: { x: p.x, z: p.z }, speed: 0, atk: p.atk, hit: p.hit };
}

function removeView(id) {
  const v = views.get(id);
  board.remove(v.char.root);
  v.label.remove();
  views.delete(id);
}

// ---------- 네트워크 ----------
let myId = null, ws = null, latest = null;
const tiltTarget = { x: 0, z: 0 };

let physics = null;
let joined = null; // 다시 접속할 때 쓰는 { name, gameMode }

function connect(name, gameMode) {
  joined = { name, gameMode };
  UI.setConnecting('서버에 연결하는 중…', '무료 서버라 처음 접속하면 깨어나는 데 최대 1분 걸려요');
  // https로 접속했으면 wss (Cloudflare 터널, 호스팅 대비)
  const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws = sock;
  sock.onopen = () => sock.send(JSON.stringify({ t: 'hello', name, mode: gameMode }));
  sock.onmessage = e => {
    if (ws !== sock) return; // 옛 연결에서 오는 메시지는 무시 (화면·소리 두 번 방지)
    const msg = JSON.parse(e.data);
    if (msg.t === 'welcome') {
      myId = msg.id; physics = msg.physics;
      UI.setCatalog(msg.abilities, msg.winScore, msg.skillCd);
      UI.setConnecting(null);
    }
    else if (msg.t === 'state') applyState(msg);
    else if (msg.t === 'tiles') applyTiles(msg);
    else if (msg.t === 'offer') {
      UI.showOffers(msg.offers, msg.skills, (id, slot) => { Sound.play('pick'); ws.send(JSON.stringify({ t: 'pick', id, slot })); });
      msg.offers.forEach((_, i) => setTimeout(() => Sound.play('card'), 500 + i * 160)); // 카드 뒤집는 소리
    }
  };
  // 끊기면 화면을 비우고 2초 뒤 다시 접속
  sock.onclose = () => {
    if (ws !== sock) return; // 이미 새 연결로 바뀐 옛 연결이면 무시
    UI.setConnecting('연결이 끊겼어요', '다시 연결하는 중…');
    resetWorld();
    setTimeout(() => connect(joined.name, joined.gameMode), 2000);
  };
}
setInterval(sendInput, 1000 / 30);

// 재접속 전에 이전 게임 화면 정리
function resetWorld() {
  for (const id of [...views.keys()]) removeView(id);
  myId = null; latest = null; pred = null; inputHistory.length = 0;
  syncOrbs([]); syncIce([]);
  tiltTarget.x = tiltTarget.z = 0;
}

function applyState(s) {
  latest = s;
  const seen = new Set();
  for (const p of s.players) {
    seen.add(p.id);
    let v = views.get(p.id);
    if (!v) { v = createView(p); views.set(p.id, v); }
    // 공격/피격 카운터가 바뀌면 모션 재생
    // 내 소리는 크게, 다른 사람 소리는 거리에 따라 작게 (봇이 많으면 소리가 겹치므로)
    const isMe = p.id === myId, vol = isMe ? 1 : volAt(p.x, p.z);
    if (p.atk !== v.atk) { v.atk = p.atk; v.char.playPush(); v.pushQueued = p.rg; Sound.play('push', isMe ? 1 : vol * 0.35); }
    if (p.hit !== v.hit) { v.hit = p.hit; v.char.playHit(); v.hitQueued = true; Sound.play('hit', isMe ? 1 : vol * 0.6); }
    if (p.st && !v.state?.st) Sound.play('stun', isMe ? 1 : vol * 0.5);
    if (p.fall > 0 && !(v.state?.fall > 0)) Sound.play('fall', isMe ? 1 : vol * 0.6);
    if (p.em >= 0 && v.state?.em !== p.em) Sound.play('emote', isMe ? 1 : vol * 0.6);
    v.state = p;
    v.target.x = p.x; v.target.z = p.z;
    if (p.id === myId) reconcile(p);
  }
  for (const id of views.keys()) if (!seen.has(id)) removeView(id);
  tiltTarget.x = s.tilt.x; tiltTarget.z = s.tilt.z;
  setTileTheme(s.rule === 'ice' ? 'ice' : 'normal');
  // 라운드 시작하면 카메라를 내 캐릭터 정면 방향으로
  const me = s.players.find(p => p.id === myId);
  if (me && s.phase === 'countdown' && latestPhase !== 'countdown') camYaw = me.f;
  playPhaseSounds(s, me);
  latestPhase = s.phase;
  syncOrbs(s.orbs);
  syncIce(s.ice);
  playEvents(s.ev);
  UI.renderHud(s, myId);
  UI.updateSkillHud(me);
  if (s.phase === 'gameOver' && prevPhase !== 'gameOver') resultsAt = performance.now() + 2500;
  prevPhase = s.phase;
  UI.updateResults(s, myId, resultsAt);
  UI.updateLobby(s, myId);
}
let latestPhase = null, prevPhase = null, resultsAt = 0, lastCount = 0;

// 카운트다운 삑, 시작, 라운드/게임 승패
function playPhaseSounds(s, me) {
  if (s.phase === 'countdown') {
    const n = Math.ceil(s.timer);
    if (n !== lastCount && n > 0) Sound.play('beep');
    lastCount = n;
  } else lastCount = 0;
  if (s.phase === latestPhase) return;
  if (s.phase === 'playing' && latestPhase === 'countdown') Sound.play('go');
  if (s.phase === 'roundEnd') Sound.play(me?.al ? 'win' : 'lose');
  if (s.phase === 'gameOver') Sound.play(s.results?.[0]?.id === myId ? 'win' : 'lose');
}
UI.initLobby(() => ws?.readyState === 1 && ws.send(JSON.stringify({ t: 'start' })));
UI.initResults(
  () => ws?.readyState === 1 && ws.send(JSON.stringify({ t: 'restart' })),
  () => location.reload(), // 처음 화면으로
);

// ---------- 입력 ----------
const keys = new Set();
let attackQueued = false, skillQueued = -1;
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { if (!e.repeat) attackQueued = true; e.preventDefault(); }
  if (!e.repeat && (e.code === 'KeyQ' || e.code === 'KeyE')) skillQueued = e.code === 'KeyQ' ? 0 : 1; // 스킬
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
  if (n >= 0 && !e.repeat) sendEmote(n);
  keys.add(e.code);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// 시점: 마우스 (화면 클릭하면 마우스 고정, Esc로 해제). Q/E는 스킬
let camYaw = 0; // 카메라가 바라보는 방향 (x,z 평면 각도)
const canvas = renderer.domElement;
canvas.addEventListener('click', () => {
  if (mode !== 'game' || isTouch) return; // 폰은 마우스 고정 대신 드래그로 시점
  if (document.pointerLockElement === canvas) attackQueued = true; // 고정 중 클릭 = 밀치기
  else canvas.requestPointerLock?.();
});
addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas) camYaw += e.movementX * 0.0035;
});

function sendEmote(n) {
  if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'emote', n }));
}
UI.initEmoteBar(sendEmote);
// 음량: 스피커 버튼을 누르면 슬라이더가 열림
const muteBtn = document.getElementById('mute');
const volBox = document.getElementById('volume');
const volSlider = volBox.querySelector('input');
const showVol = () => {
  const v = Sound.getVolume();
  muteBtn.textContent = v === 0 ? '🔇' : v < 0.4 ? '🔉' : '🔊';
  volSlider.value = Math.round(v * 100);
  volBox.querySelector('span').textContent = Math.round(v * 100);
};
showVol();
muteBtn.onclick = () => { Sound.unlock(); volBox.hidden = !volBox.hidden; muteBtn.blur(); };
volSlider.oninput = () => { Sound.unlock(); Sound.setVolume(volSlider.value / 100); showVol(); };
volSlider.onchange = () => { Sound.play('click'); volSlider.blur(); };

const stick = initTouch({
  canvas,
  onAttack: () => { attackQueued = true; },
  onSkill: i => { skillQueued = i; },
  onLook: dx => { camYaw += dx * 0.008; },
});

// ---------- 클라이언트 예측 ----------
// 서버(room.js)의 이동 계산과 같은 식. 서버 결과가 오면 아직 처리 안 된 입력만 다시 계산해서 맞춘다.
let pred = null, inputSeq = 0;
const inputHistory = [];

function canPredict(me) {
  return physics && me && latest.phase === 'playing' && me.al && me.fall === 0 && me.ctl;
}

function stepPred(st, ix, iz, me, dt) {
  const P = physics, slide = me.mr;
  let friction = P.friction, accelMult = 1;
  if (latest.rule === 'ice') {
    friction = P.iceFriction + (P.friction - P.iceFriction) * slide;
    accelMult = P.iceAccel + (1 - P.iceAccel) * slide;
  }
  friction *= me.mf;
  const accel = P.accel * me.ms * accelMult, maxSpeed = P.maxSpeed * me.ms;
  const moving = ix || iz;
  if (moving) { st.vx += ix * accel * dt; st.vz += iz * accel * dt; st.f = Math.atan2(iz, ix); }
  const sp = Math.hypot(st.vx, st.vz);
  if (moving && sp > maxSpeed) { const over = Math.max(maxSpeed, sp - accel * dt); st.vx *= over / sp; st.vz *= over / sp; }
  const g = P.tiltGravity * (1 - slide);
  st.vx += latest.tilt.x * g * dt; st.vz += latest.tilt.z * g * dt;
  const fr = Math.max(0, 1 - friction * dt);
  st.vx *= fr; st.vz *= fr;
  st.x += st.vx * dt; st.z += st.vz * dt;
}

// 서버 상태가 오면: 서버 위치에서 시작해 서버가 아직 안 받은 입력을 다시 적용
function reconcile(me) {
  if (!canPredict(me)) { pred = null; inputHistory.length = 0; return; }
  while (inputHistory.length && inputHistory[0].seq <= me.sq) inputHistory.shift();
  const st = { x: me.x, z: me.z, vx: me.vx, vz: me.vz, f: me.f };
  for (const inp of inputHistory) stepPred(st, inp.x, inp.z, me, 1 / physics.tick);
  pred = st;
}

function sendInput() {
  if (ws?.readyState !== 1) return;
  // 카메라 기준 이동: W = 카메라가 보는 방향
  // 키보드 + 폰 조이스틱 (조이스틱 위쪽 = 앞)
  const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - stick.y;
  const right = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + stick.x;
  const fx = Math.cos(camYaw), fz = Math.sin(camYaw);
  let x = fx * fwd - fz * right, z = fz * fwd + fx * right;
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; } // 조이스틱을 조금만 밀면 천천히
  // 내 캐릭터는 서버를 기다리지 않고 바로 움직임 (클라이언트 예측)
  const me = latest?.players.find(p => p.id === myId);
  let seq;
  if (canPredict(me)) {
    if (!pred) pred = { x: me.x, z: me.z, vx: me.vx, vz: me.vz, f: me.f };
    seq = ++inputSeq;
    inputHistory.push({ seq, x, z });
    if (inputHistory.length > 60) inputHistory.shift();
    stepPred(pred, x, z, me, 1 / physics.tick);
  } else { pred = null; inputHistory.length = 0; }
  ws.send(JSON.stringify({ t: 'input', x, z, seq, attack: attackQueued, skill: skillQueued }));
  attackQueued = false; skillQueued = -1;
}

// ---------- 표지 화면 ----------
let mode = 'title';
const demo = new Character('#3f6fd8');
board.add(demo.root);
let demoTimer = 0;

UI.initTitle((name, gameMode) => {
  Sound.unlock(); // 버튼을 누른 순간에만 소리를 켤 수 있음
  mode = 'game';
  board.remove(demo.root);
  connect(name, gameMode);
});

// ---------- 렌더 루프 ----------
const tmp = new THREE.Vector3();
const camLook = new THREE.Vector3();
const camGoal = new THREE.Vector3(), lookGoal = new THREE.Vector3();
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  // 카메라
  if (mode === 'title') {
    const a = t * 0.25;
    camera.position.set(Math.cos(a) * 6.5 + 2, 3.2, Math.sin(a) * 6.5 + 2);
    camLook.set(0, 1.1, 0);
    demoTimer -= dt;
    if (demoTimer <= 0) { demo.playPush(); demoTimer = 2.2; }
    demo.update(dt, t, { speed: 0 });
  } else {
    const me = views.get(myId);
    const k = 1 - Math.exp(-dt * 6);
    if (me?.state?.al && me.state.fall < 0.7) {
      // 내 캐릭터 뒤에서 따라가기. 떨어지기 시작해도 0.7초 동안은 그 자리에서 떨어지는 모습을 내려다봄
      const fx = Math.cos(camYaw), fz = Math.sin(camYaw);
      const falling = me.state.fall > 0;
      const pos = board.localToWorld(tmp.copy(me.char.root.position));
      const groundY = falling ? 0 : pos.y;
      if (!falling) camGoal.set(pos.x - fx * 9.5, groundY + 6.5, pos.z - fz * 9.5);
      lookGoal.set(pos.x + (falling ? 0 : fx * 5), pos.y, pos.z + (falling ? 0 : fz * 5));
    } else {
      // 탈락/대기 중: 맵 전체 보기
      camGoal.copy(GAME_CAM.pos); lookGoal.copy(GAME_CAM.look);
    }
    camera.position.lerp(camGoal, k);
    camLook.lerp(lookGoal, k);
  }
  if (shake > 0) {
    shake = Math.max(0, shake - dt);
    camera.position.x += (Math.random() - 0.5) * shake * 0.6;
    camera.position.y += (Math.random() - 0.5) * shake * 0.6;
  }
  camera.lookAt(camLook);

  // 판 기울기: tilt 방향이 내려가도록 회전
  const kt = 1 - Math.exp(-dt * 10);
  board.rotation.z += (-tiltTarget.x - board.rotation.z) * kt;
  board.rotation.x += (tiltTarget.z - board.rotation.x) * kt;

  // 타일: 무너지는 중 = 흔들림, 사라짐 = 아래로 떨어짐
  for (const mesh of tileMeshes.values()) {
    const d = mesh.userData;
    if (d.rising) {
      mesh.position.y += (d.base.y - mesh.position.y) * (1 - Math.exp(-dt * 10));
      if (Math.abs(mesh.position.y - d.base.y) < 0.01) { mesh.position.y = d.base.y; d.rising = false; }
    } else if (d.state === 2) {
      const b = d.base;
      mesh.position.set(b.x + (Math.random() - 0.5) * 0.1, b.y - Math.random() * 0.06, b.z + (Math.random() - 0.5) * 0.1);
    } else if (d.state === 0 && mesh.visible) {
      d.fallV += 25 * dt;
      mesh.position.y -= d.fallV * dt;
      mesh.rotation.x += dt * 1.5;
      if (mesh.position.y < -30) mesh.visible = false;
    }
  }

  for (const m of decos) {
    m.rotation.y += m.userData.spin * dt;
    m.position.y += Math.sin(t + m.userData.phase) * 0.003;
  }

  for (const g of orbMeshes.values()) {
    g.position.lerp(g.userData.target, 1 - Math.exp(-dt * 15));
    g.userData.ring.rotation.z += dt * 4;
    g.userData.pull.rotation.z -= dt * 1.5;
  }

  // 효과
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life += dt;
    const k = Math.min(1, e.life / e.max);
    e.update(e, k);
    if (k >= 1) { board.remove(e.obj); effects.splice(i, 1); }
  }

  // 플레이어
  const winnerPhase = latest && (latest.phase === 'roundEnd' || latest.phase === 'gameOver');
  for (const v of views.values()) {
    const p = v.state;
    const root = v.char.root;
    root.visible = p.al;
    v.label.hidden = !p.al;
    if (!p.al) continue;

    const mine = p.id === myId && pred;
    const tx = mine ? pred.x : v.target.x, tz = mine ? pred.z : v.target.z;
    const far = Math.hypot(tx - root.position.x, tz - root.position.z) > 3; // 리스폰 시 순간이동
    const k = far ? 1 : 1 - Math.exp(-dt * (p.id === myId ? 30 : 20)); // 내 캐릭터는 더 바로 따라옴
    root.position.x += (tx - root.position.x) * k;
    root.position.z += (tz - root.position.z) * k;
    // 낙하 / 내려찍기 점프
    root.position.y = p.air > 0 ? Math.sin(p.air * Math.PI) * 2.4 : -p.fall * p.fall * 12;
    root.scale.setScalar(1.05 * (p.sz || 1)); // 크기 카드
    v.shield.visible = p.sh;
    if (p.sh) v.shield.material.opacity = 0.22 + Math.sin(t * 8) * 0.08;
    if (p.dash) { // 돌진 흔적
      v.dashPuff -= dt;
      if (v.dashPuff <= 0) { spawnBurst(tmp.set(root.position.x, 0.4, root.position.z), '#dfe8ff'); v.dashPuff = 0.04; }
    }
    // 방향 전환도 부드럽게
    let dr = -(mine ? pred.f : p.f) - root.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    root.rotation.y += dr * (1 - Math.exp(-dt * 15));

    const sp = Math.hypot(root.position.x - v.prev.x, root.position.z - v.prev.z) / Math.max(dt, 1e-3);
    v.speed += (sp - v.speed) * 0.3;
    v.prev.x = root.position.x; v.prev.z = root.position.z;

    v.char.update(dt, t, { speed: v.speed, stunned: p.st, falling: p.fall > 0, winner: winnerPhase && p.al, emoteFace: UI.EMOTES[p.em]?.face });
    root.visible = !(p.im && Math.floor(t * 12) % 2 === 0) || p.fall > 0; // 면역 중 깜빡임

    if (v.pushQueued) { spawnPushWave(root, v.pushQueued); v.pushQueued = 0; }
    if (v.hitQueued) {
      spawnBurst(tmp.set(root.position.x, 1.1, root.position.z), p.st ? '#ffd84a' : '#ffffff');
      if (p.id === myId) shake = 0.25;
      v.hitQueued = false;
    }

    // 이름/체력바를 화면 좌표로
    tmp.set(root.position.x, root.position.y + 2.35, root.position.z);
    board.localToWorld(tmp).project(camera);
    UI.updateLabel(v.label, p, p.id === myId, (tmp.x * 0.5 + 0.5) * innerWidth, (-tmp.y * 0.5 + 0.5) * innerHeight);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
