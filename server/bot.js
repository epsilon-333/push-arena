import { CONFIG as C } from './config.js';

// 간단한 봇: 가까운 상대를 쫓아가 밀고, 떨어지는 곳은 피한다.
// 16방향 중 점수가 가장 높은 쪽으로 움직인다.
const DIRS = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2;
  return { x: Math.cos(a), z: Math.sin(a) };
});

// 난이도: 0 쉬움 / 1 보통 / 2 어려움
// think: 생각하는 간격(초, 최소~최대) · aggro: 상대를 쫓는 정도 · hit: 사거리 안에서 밀칠 확률
// skill: 한 번 생각할 때 스킬을 쓸지 볼 확률 · flank: 상대를 바깥으로 밀 수 있는 자리(중앙 쪽)로 돌아 들어가는 정도
const LEVELS = [
  { think: [0.24, 0.42], aggro: [0.35, 0.55], hit: 0.45, skill: 0.12, flank: 0 },
  { think: [0.12, 0.24], aggro: [0.6, 0.9], hit: 0.75, skill: 0.35, flank: 0.35 },
  { think: [0.06, 0.12], aggro: [0.85, 1.05], hit: 0.97, skill: 0.6, flank: 1 },
];

export function createBotState(level = 1) {
  const L = LEVELS[level] ?? LEVELS[1];
  return { think: 0, level, aggression: L.aggro[0] + Math.random() * (L.aggro[1] - L.aggro[0]) };
}

export function updateBot(p, room, dt) {
  const b = p.bot;
  b.think -= dt;
  if (b.think > 0) return;
  const L = LEVELS[b.level] ?? LEVELS[1];
  b.think = L.think[0] + Math.random() * (L.think[1] - L.think[0]); // 반응 속도

  p.input.x = 0; p.input.z = 0;
  if (room.phase !== 'playing' || !p.alive || p.stunned || p.fallTimer > 0) return;

  const arena = room.arena;
  const maxR = arena.size * 1.5 * arena.rings;
  const others = [...room.players.values()].filter(o => room.teamOf(o) !== room.teamOf(p) && o.alive && o.fallTimer === 0);
  // 가까운 상대를 노림. 어려움은 기절했거나 가장자리에 몰린 상대를 더 좋아함
  let target = null, best = Infinity, bestKey = Infinity;
  for (const o of others) {
    const d = Math.hypot(o.x - p.x, o.z - p.z);
    let key = d;
    if (b.level >= 2) key -= (o.stunned ? 4 : 0) + (Math.hypot(o.x, o.z) / maxR) * 3;
    if (key < bestKey) { bestKey = key; best = d; target = o; }
  }
  // 돌아 들어가기: 상대보다 중앙 쪽에 서야 바깥으로 밀어낼 수 있음
  let goal = target;
  if (target && L.flank > 0 && best > 1.6) {
    const tr = Math.hypot(target.x, target.z);
    if (tr > 1) {
      const back = Math.min(2.2, best * 0.6) * L.flank;
      const g = { x: target.x - (target.x / tr) * back, z: target.z - (target.z / tr) * back };
      if (arena.isGround(g.x, g.z)) goal = g; // 도넛 맵처럼 그 자리가 구멍이면 그냥 상대에게
    }
  }
  // 지금 속도로 미끄러질 자리에서 앞을 봄 (달리다가 구멍 앞에서 못 멈추는 일 줄이기)
  const lead = b.level >= 1 ? 0.22 : 0.1;
  const bx = p.x + p.vx * lead, bz = p.z + p.vz * lead;
  const goalDist = goal ? Math.hypot(goal.x - p.x, goal.z - p.z) : 0;

  const tiltMag = Math.hypot(room.tilt.x, room.tilt.z);
  const fromCenter = Math.hypot(p.x, p.z);
  let bestDir = null, bestScore = -Infinity;
  for (const d of DIRS) {
    let score = Math.random() * 0.3;
    if (goal && goalDist > 0.3) {
      const tx = (goal.x - p.x) / goalDist, tz = (goal.z - p.z) / goalDist;
      score += (d.x * tx + d.z * tz) * b.aggression;
    }
    // 남의 바나나는 피하기
    for (const bn of room.bananas) {
      if (bn.owner !== p.id && Math.hypot(p.x + d.x * 1.2 - bn.x, p.z + d.z * 1.2 - bn.z) < 1.1) score -= 1.5;
    }
    // 앞에 바닥이 없으면 크게 감점
    [0.8, 1.6, 2.6].forEach((dist, i) => {
      const t = arena.tileAt(bx + d.x * dist, bz + d.z * dist);
      if (!t || t.state === 'gone') score -= 3 - i;
      else if (t.state === 'crumbling') score -= 0.6;
      else if (t.state === 'cracked' && i === 0) score -= 0.35; // 균열 타일은 다시 밟으면 무너짐
    });
    // 가장자리일수록 중앙 쪽 선호
    if (fromCenter > 0.1) score -= ((d.x * p.x + d.z * p.z) / fromCenter) * (fromCenter / maxR) * 0.8;
    // 기울기: 내리막 쪽은 피하기
    if (tiltMag > 0.02) score -= ((d.x * room.tilt.x + d.z * room.tilt.z) / tiltMag) * (tiltMag / C.MAX_TILT) * 0.8;
    if (score > bestScore) { bestScore = score; bestDir = d; }
  }
  if (bestDir) { p.input.x = bestDir.x; p.input.z = bestDir.z; }

  // 사거리 안이고 대략 정면이면 밀기
  if (target && best < C.ATTACK_RANGE * p.mods.range && p.cooldown === 0) {
    let diff = Math.atan2(target.z - p.z, target.x - p.x) - p.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (Math.abs(diff) < C.ATTACK_ANGLE && Math.random() < L.hit) p.input.attack = true;
    // 상대를 바라보도록 그 방향으로 이동 입력
    p.input.x = Math.cos(p.facing + diff); p.input.z = Math.sin(p.facing + diff);
  }

  if (target && Math.random() < L.skill) useSkills(p, room, target, best, others);
}

// 스킬: 상황이 맞으면 가끔 쓴다
function useSkills(p, room, target, dist, others) {
  const facingTarget = Math.abs(Math.atan2(Math.sin(Math.atan2(target.z - p.z, target.x - p.x) - p.facing),
    Math.cos(Math.atan2(target.z - p.z, target.x - p.x) - p.facing))) < 0.4;
  const near = r => others.filter(o => Math.hypot(o.x - p.x, o.z - p.z) < r).length;
  p.skills.forEach((skill, i) => {
    if (!skill || p.skillCd[i] > 0 || p.input.skill >= 0) return;
    const ok = {
      dash: facingTarget && dist < 6,
      shield: near(3) > 0,
      shockwave: near(3.3) > 0,
      swap: Math.hypot(p.x, p.z) > room.maxR * 0.7, // 가장자리에 몰렸으면 가장 먼 상대와 교체
      slam: dist < 2.8,
      blackhole: facingTarget && dist < 9,
      banana: dist < 4 && Math.random() < 0.5,       // 쫓아오는 상대 앞에 깔기
      mirror: dist < 5,
      magnet: facingTarget && dist > 2.5 && dist < 6.5 && Math.hypot(p.x, p.z) < room.maxR * 0.5, // 가운데서 끌어오기
      ghost: near(2.8) > 1 || (near(2.5) > 0 && Math.hypot(p.x, p.z) > room.maxR * 0.7), // 몰리면 빠져나가기
      quake: others.length > 0 && Math.random() < 0.3,
      mine: dist < 4.5,                                  // 쫓아오는 상대 앞에 깔기
      jump: near(2.2) > 0 && Math.random() < 0.3,        // 붙었을 때 가끔 뜀
      restore: [...room.arena.tiles.values()].some(t => t.state !== 'alive' && Math.hypot(t.x - p.x, t.z - p.z) < C.RESTORE_RADIUS * 0.7),
      teleport: facingTarget && dist > 4.5 && dist < 9,  // 멀리 있는 상대 앞으로
      icezone: near(3.5) > 0,
      bowling: facingTarget && dist < 7,
      clone: dist < 7,
      giant: dist < 5,
      timestop: near(5) > 0,
      meteor: others.length > 0 && Math.random() < 0.4,
      phoenix: Math.hypot(p.x, p.z) > room.maxR * 0.7,   // 가장자리로 몰렸을 때
    }[skill];
    if (ok) p.input.skill = i;
  });
}
