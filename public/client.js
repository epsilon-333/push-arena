import * as THREE from 'three';
import { Character, toon } from './js/character.js';
import * as UI from './js/ui.js';

// ---------- 씬 기본 구성 ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 250);
const GAME_CAM = { pos: new THREE.Vector3(0, 19, 22), look: new THREE.Vector3(0, 0, 1.5) }; // 전체 보기

scene.add(new THREE.HemisphereLight('#cfe0ff', '#3a3550', 1.1));
const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
sun.position.set(6, 16, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -20;
sun.shadow.camera.right = sun.shadow.camera.top = 20;
sun.shadow.bias = -0.0005;
scene.add(sun);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
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
  mesh.receiveShadow = true;
  mesh.castShadow = true;
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
for (let i = 0; i < 40; i++) {
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
function playEvents(events) {
  for (const e of events ?? []) {
    if (e.k === 'ring') spawnRing(e.x, e.z, e.r);
    else if (e.k === 'swap') {
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

function connect(name, gameMode) {
  // https로 접속했으면 wss (Cloudflare 터널, 호스팅 대비)
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name, mode: gameMode }));
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.t === 'welcome') { myId = msg.id; UI.setCatalog(msg.abilities, msg.winScore, msg.skillCd); }
    else if (msg.t === 'state') applyState(msg);
    else if (msg.t === 'tiles') applyTiles(msg);
    else if (msg.t === 'offer') UI.showOffers(msg.offers, msg.skills, (id, slot) => ws.send(JSON.stringify({ t: 'pick', id, slot })));
  };
  ws.onclose = () => UI.setMessage('서버 연결이 끊겼어요');
  setInterval(sendInput, 1000 / 30);
}

function applyState(s) {
  latest = s;
  const seen = new Set();
  for (const p of s.players) {
    seen.add(p.id);
    let v = views.get(p.id);
    if (!v) { v = createView(p); views.set(p.id, v); }
    // 공격/피격 카운터가 바뀌면 모션 재생
    if (p.atk !== v.atk) { v.atk = p.atk; v.char.playPush(); v.pushQueued = p.rg; }
    if (p.hit !== v.hit) { v.hit = p.hit; v.char.playHit(); v.hitQueued = true; }
    v.state = p;
    v.target.x = p.x; v.target.z = p.z;
  }
  for (const id of views.keys()) if (!seen.has(id)) removeView(id);
  tiltTarget.x = s.tilt.x; tiltTarget.z = s.tilt.z;
  setTileTheme(s.rule === 'ice' ? 'ice' : 'normal');
  // 라운드 시작하면 카메라를 내 캐릭터 정면 방향으로
  const me = s.players.find(p => p.id === myId);
  if (me && s.phase === 'countdown' && latestPhase !== 'countdown') camYaw = me.f;
  latestPhase = s.phase;
  syncOrbs(s.orbs);
  syncIce(s.ice);
  playEvents(s.ev);
  UI.renderHud(s, myId);
  UI.updateSkillHud(me);
}
let latestPhase = null;

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
  if (mode !== 'game') return;
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

function sendInput() {
  if (ws?.readyState !== 1) return;
  // 카메라 기준 이동: W = 카메라가 보는 방향
  const fwd = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const right = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const fx = Math.cos(camYaw), fz = Math.sin(camYaw);
  let x = fx * fwd - fz * right, z = fz * fwd + fx * right;
  const len = Math.hypot(x, z);
  if (len > 0) { x /= len; z /= len; }
  ws.send(JSON.stringify({ t: 'input', x, z, attack: attackQueued, skill: skillQueued }));
  attackQueued = false; skillQueued = -1;
}

// ---------- 표지 화면 ----------
let mode = 'title';
const demo = new Character('#3f6fd8');
board.add(demo.root);
let demoTimer = 0;

UI.initTitle((name, gameMode) => {
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
    if (me?.state?.al && me.state.fall === 0) {
      // 내 캐릭터 뒤에서 따라가기
      const fx = Math.cos(camYaw), fz = Math.sin(camYaw);
      const pos = board.localToWorld(tmp.copy(me.char.root.position));
      camGoal.set(pos.x - fx * 9.5, pos.y + 6.5, pos.z - fz * 9.5);
      lookGoal.set(pos.x + fx * 5, pos.y, pos.z + fz * 5);
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

    const far = Math.hypot(v.target.x - root.position.x, v.target.z - root.position.z) > 3; // 리스폰 시 순간이동
    const k = far ? 1 : 1 - Math.exp(-dt * 20);
    root.position.x += (v.target.x - root.position.x) * k;
    root.position.z += (v.target.z - root.position.z) * k;
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
    let dr = -p.f - root.rotation.y;
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
