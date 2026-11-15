// 서버 시뮬레이션 테스트: 실제 시간 없이 방 하나를 끝까지 돌려 본다.
//   node tools/simtest.mjs        → 모든 맵 규칙 × 봇 난이도로 게임을 끝까지 돌리고 ALL OK
// 사람 자리 하나(가짜 소켓)는 카드를 직접 고르고 아무렇게나 움직인다. 나머지는 봇.
import { CONFIG as C } from '../server/config.js';
import { Room } from '../server/room.js';
import { ABILITIES } from '../server/abilities.js';
import { SKILLS } from '../server/skills.js';

const DT = 1 / C.TICK_RATE;
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  ✗', msg); } };

function playGame(rule, level, testCards = [], shape = null) {
  C.MAP_SHAPES = shape ? { [shape]: 1 } : { full: 5, donut: 2, bridge: 2 };
  C.MAP_RULES = [rule];
  C.TEST_CARDS = testCards;
  const room = new Room('0000', { kind: 'practice' });
  const inbox = [];
  const sock = { readyState: 1, send: raw => inbox.push(JSON.parse(raw)) };
  const me = room.addPlayer(1, sock);
  room.setName(1, '시험');
  room.setProfile(1, 3, 7);
  room.setBotLevel(null, level);
  for (let i = 0; i < 3; i++) room.addBot();

  const seen = { ko: 0, hit: 0, fin: 0, falls: 0, slow: 0, rounds: 0 };
  let ticks = 0, lastPhase = '';
  while (room.phase !== 'gameOver' && ticks < 60 * 60 * C.TICK_RATE) {
    // 사람: 방향을 가끔 바꾸며 중앙 쪽으로 어슬렁, 자주 밀치고 스킬도 누름
    if (ticks % 10 === 0) {
      const a = Math.random() * Math.PI * 2, pull = Math.hypot(me.x, me.z) > 6 ? 1 : 0;
      room.setInput(1, { x: Math.cos(a) - pull * me.x / 8, z: Math.sin(a) - pull * me.z / 8, attack: Math.random() < 0.5, skill: Math.random() < 0.2 ? Math.floor(Math.random() * 2) : -1 });
    }
    room.tick(DT);
    ticks++;
    for (const m of inbox) {
      if (m.t === 'offer') room.pick(1, m.offers[0].id, 0);
      if (m.t !== 'state') continue;
      if (m.ts < 1) seen.slow++;
      if (m.phase !== lastPhase) { if (m.phase === 'countdown') seen.rounds++; lastPhase = m.phase; }
      for (const e of m.ev) {
        if (e.k === 'ko') {
          seen.ko++; if (e.fin) seen.fin++;
          check(room.players.has(e.id), 'ko 사건의 대상이 방에 있어야 함');
          if (e.id < 0) { seen.botFalls = (seen.botFalls ?? 0) + 1; if (e.by === null) seen.botSelf = (seen.botSelf ?? 0) + 1; }
        }
        if (e.k === 'hit') { seen.hit++; check(Number.isFinite(e.p) && Number.isFinite(e.nx), 'hit 사건 값이 숫자여야 함'); }
      }
      for (const p of m.players) check(Number.isFinite(p.x) && Number.isFinite(p.z), `위치가 숫자가 아님 (${p.name})`);
    }
    inbox.length = 0;
  }
  const tag = `[${rule} · 난이도 ${level}${shape ? ' · ' + shape : ''}]`;
  check(room.phase === 'gameOver', `${tag} 게임이 끝나지 않음 (${ticks}틱)`);
  if (room.phase !== 'gameOver') return;
  const res = room.results;
  check(res.length === 4, `${tag} 순위는 4명`);
  check(res[0].score === C.WIN_SCORE, `${tag} 1등 점수 = ${C.WIN_SCORE}`);
  check(res.every(r => r.aw?.name && r.st && Array.isArray(r.st.picks)), `${tag} 모두 상과 기록이 있어야 함`);
  check(new Set(res.filter(r => r.aw.id !== 'none').map(r => r.aw.id)).size === res.filter(r => r.aw.id !== 'none').length, `${tag} 같은 상이 두 번 나오면 안 됨`);
  const falls = res.reduce((s, r) => s + r.st.falls, 0), kills = res.reduce((s, r) => s + r.kills, 0);
  check(falls === seen.ko, `${tag} 떨어진 횟수(${falls}) = ko 사건 수(${seen.ko})`);
  check(kills <= falls, `${tag} 처치 수(${kills}) ≤ 떨어진 수(${falls})`);
  check(seen.fin >= C.WIN_SCORE, `${tag} 라운드마다 결정타가 있어야 함 (${seen.fin})`);
  check(seen.slow > 0, `${tag} 슬로모션이 한 번은 걸려야 함`);
  check(res.find(r => r.id === 1).title === 3 && res.find(r => r.id === 1).level === 7, `${tag} 칭호 · 레벨이 순위에 실려야 함`);
  check(room.round === seen.rounds, `${tag} 라운드 수 (${room.round} / ${seen.rounds})`);
  return { ticks, seen, res };
}

const rules = ['collapse', 'tilt', 'ice', 'shrink', 'rain', 'lowgrav', 'spin', 'big', 'bounce'];
const t0 = Date.now();
let games = 0;
for (const rule of rules) for (const level of [0, 1, 2]) {
  const out = playGame(rule, level);
  games++;
  if (out) console.log(`${rule.padEnd(8)} 난이도 ${level}: ${(out.ticks / C.TICK_RATE).toFixed(0).padStart(4)}초 · 라운드 ${String(out.seen.rounds).padStart(2)} · KO ${String(out.seen.ko).padStart(2)} · 1등 ${out.res[0].name} · 상 ${out.res.map(r => r.aw.icon).join('')}`);
}
// 맵 모양: 모양마다 모든 규칙으로 한 판씩 (보통 난이도). 시작 자리가 구멍이면 안 되고, 봇이 제 발로 너무 자주 떨어지면 안 됨
for (const shape of ['full', 'donut', 'bridge']) {
  let ko = 0, self = 0, time = 0, rounds = 0;
  for (const rule of rules) {
    const out = playGame(rule, 1, [], shape);
    games++;
    if (out) { ko += out.seen.botFalls ?? 0; self += out.seen.botSelf ?? 0; time += out.ticks / C.TICK_RATE; rounds += out.seen.rounds; }
  }
  // 봇이 아무에게도 안 밀렸는데 떨어진 비율 (서든데스로 바닥이 다 사라져 떨어진 것 포함)
  console.log(`맵 모양 ${shape.padEnd(6)}: 라운드 평균 ${(time / rounds - 6).toFixed(0)}초 · 봇이 떨어진 ${ko}번 중 혼자 떨어짐 ${self} (${Math.round(self / ko * 100)}%)`);
  check(self / ko < 0.3, `${shape}: 봇이 제 발로 너무 자주 떨어짐 (${self}/${ko})`);
}
{ // 어떤 모양 · 인원이든 시작 자리는 멀쩡한 타일 위
  for (const shape of ['full', 'donut', 'bridge']) for (const n of [2, 3, 4]) {
    C.MAP_SHAPES = { [shape]: 1 };
    const room = new Room('0002', { kind: 'private' });
    for (let i = 0; i < n; i++) room.addBot();
    room.startCountdown();
    for (const p of room.players.values()) {
      const t = room.arena.tileAt(p.x, p.z);
      check(t && t.state === 'alive' && !t.dead, `${shape} · ${n}명: 시작 자리가 타일 위여야 함`);
    }
    const spots = [...room.players.values()].map(p => `${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    check(new Set(spots).size === n, `${shape} · ${n}명: 시작 자리가 겹치면 안 됨`);
  }
}

// 스킬 전부: 스킬 카드를 둘씩 쥐여 주고 한 판씩
const skillCards = ABILITIES.filter(a => a.skill).map(a => a.id);
check(skillCards.length === Object.keys(SKILLS).length, '스킬 카드 수와 스킬 수가 같아야 함');
for (let i = 0; i < skillCards.length; i += 2) { playGame('collapse', 1, skillCards.slice(i, i + 2)); games++; }

// 난이도별 승률: 봇 4명(쉬움 2 · 어려움 2)이 붙으면 어려움이 더 많이 이겨야 함
{
  C.MAP_RULES = rules; C.TEST_CARDS = [];
  let hard = 0, total = 30;
  for (let g = 0; g < total; g++) {
    const room = new Room('0001', { kind: 'private' });
    room.botLevel = 0; room.addBot(); room.addBot();
    room.botLevel = 2; room.addBot(); room.addBot();
    room.hostId = -1; room.botsEnabled = true; room.startRequested = true;
    for (let t = 0; t < 60 * 60 * C.TICK_RATE && room.phase !== 'gameOver'; t++) room.tick(DT);
    if (room.results?.[0].id <= -3) hard++;
    games++;
  }
  console.log(`어려움 봇 승률 (쉬움 2 vs 어려움 2): ${hard}/${total}`);
  check(hard > total * 0.6, `어려움 봇이 쉬움 봇보다 뚜렷이 많이 이겨야 함 (${hard}/${total})`);
}
console.log(`${games}판 · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
console.log(failed ? `실패 ${failed}건` : 'ALL OK');
process.exit(failed ? 1 : 0);
