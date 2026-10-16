import { CONFIG as C } from './config.js';

// 스킬 6종. 수치는 여기서 조정한다.
// use(room, p): 사용. false를 돌려주면 쿨다운을 쓰지 않음 (대상 없음 등)
export const SKILLS = {
  // 돌진: 바라보는 방향으로 대시, 부딪힌 상대를 강하게 밀침
  dash: {
    cd: 6,
    use(room, p) {
      p.dash = 0.28;
      p.bowl = false;
      p.dashHit = new Set();
      p.vx = Math.cos(p.facing) * 24;
      p.vz = Math.sin(p.facing) * 24;
      room.event({ k: 'dash', id: p.id });
    },
  },
  // 방어막: 2초간 넉백 무시
  shield: {
    cd: 10,
    use(room, p) { p.shield = 2; },
  },
  // 충격파: 내 주변 원형으로 밀어냄
  shockwave: {
    cd: 8,
    // 범위 안 어디서 맞든 일반 밀치기의 1.5배
    use(room, p) { room.radialPush(p, 3.8, 1.5, 15, 0); room.event({ k: 'ring', x: p.x, z: p.z, r: 3.8 }); },
  },
  // 순간교체: 맵에서 가장 멀리 있는 상대와 위치 교환
  swap: {
    cd: 12,
    use(room, p) {
      let target = null, best = 0;
      for (const o of room.players.values()) {
        if (room.teamOf(o) === room.teamOf(p) || !o.alive || o.fallTimer > 0) continue;
        const d = Math.hypot(o.x - p.x, o.z - p.z);
        if (d > best) { best = d; target = o; }
      }
      if (!target) return false; // 상대가 없으면 쿨다운 안 씀
      [p.x, target.x] = [target.x, p.x];
      [p.z, target.z] = [target.z, p.z];
      p.vx = p.vz = target.vx = target.vz = 0;
      room.event({ k: 'swap', ax: p.x, az: p.z, bx: target.x, bz: target.z });
    },
  },
  // 내려찍기: 점프했다가 착지할 때 충격파 + 착지 타일에 금
  slam: {
    cd: 9,
    use(room, p) { p.air = C.SLAM_AIR_TIME; p.airMax = C.SLAM_AIR_TIME; p.slamming = true; },
  },
  // 바나나 껍질: 발밑에 놓음. 다른 사람이 밟으면 미끄러짐 (놓은 사람은 안 미끄러짐)
  banana: {
    cd: 7,
    use(room, p) {
      room.bananas.push({ id: room.nextBananaId++, owner: p.id, x: p.x - Math.cos(p.facing) * 0.9, z: p.z - Math.sin(p.facing) * 0.9, life: C.BANANA_LIFE });
    },
  },
  // 거울 세계: 살아 있는 상대 중 랜덤 한 명의 방향키를 반대로
  mirror: {
    cd: 12,
    use(room, p) {
      const list = [...room.players.values()].filter(o => room.teamOf(o) !== room.teamOf(p) && o.alive && o.fallTimer === 0);
      if (!list.length) return false;
      const t = list[Math.floor(Math.random() * list.length)];
      t.mirror = C.MIRROR_TIME;
      room.event({ k: 'mirror', id: p.id, target: t.id });
    },
  },
  // 자석 손: 앞쪽 부채꼴 안의 상대를 내 쪽으로 끌어당김
  magnet: {
    cd: 8,
    use(room, p) {
      const hit = [];
      for (const t of room.players.values()) {
        if (t === p || !t.alive || t.fallTimer > 0 || room.teamOf(t) === room.teamOf(p)) continue;
        const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz);
        if (d > C.MAGNET_RANGE || d < 0.5) continue;
        let diff = Math.atan2(dz, dx) - p.facing;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (Math.abs(diff) > C.MAGNET_ANGLE) continue;
        // 멀수록 세게 당겨서 대략 내 앞까지 옴
        room.knock(t, -dx / d, -dz / d, C.MAGNET_PULL * Math.min(1, d / C.MAGNET_RANGE + 0.35), p);
        hit.push([t.x, t.z]);
      }
      room.event({ k: 'magnet', id: p.id, x: p.x, z: p.z, f: p.facing, hit });
    },
  },
  // 유령: 잠깐 통과 상태
  ghost: {
    cd: 10,
    use(room, p) { p.ghost = C.GHOST_TIME; room.event({ k: 'ghost', id: p.id }); },
  },
  // 지진: 내 주변을 뺀 타일 중 랜덤 7개가 흔들리다가 3초간 뚫림
  quake: {
    cd: 16,
    use(room, p) {
      const tiles = [...room.arena.tiles.values()].filter(t =>
        (t.state === 'alive' || t.state === 'cracked') && !t.protected && !room.quakes.some(q => q.tile === t)
        && Math.hypot(t.x - p.x, t.z - p.z) > C.QUAKE_SAFE_RADIUS);
      for (let i = 0; i < C.QUAKE_TILES && tiles.length; i++) {
        const t = tiles.splice(Math.floor(Math.random() * tiles.length), 1)[0];
        room.arena.shakeTile(t);
        room.quakes.push({ tile: t, timer: C.QUAKE_WARN, open: false, owner: p.id });
      }
      room.event({ k: 'quake', id: p.id });
    },
  },
  // 블랙홀 구슬: 앞으로 던지면 멈춰서 3초간 주변을 끌어당김
  blackhole: {
    cd: 15,
    use(room, p) {
      room.orbs.push({
        id: room.nextOrbId++, owner: p.id, x: p.x, z: p.z,
        vx: Math.cos(p.facing) * 12, vz: Math.sin(p.facing) * 12, life: 3.5, fly: 0.5,
      });
    },
  },
  // 지뢰: 발밑에 설치. 잠깐 뒤 켜지고, 다른 편이 밟으면 폭발해서 주변을 밀어냄
  mine: {
    cd: 8,
    use(room, p) {
      room.mines.push({ id: room.nextMineId++, owner: room.teamOf(p), x: p.x, z: p.z, arm: C.MINE_ARM, life: C.MINE_LIFE });
    },
  },
  // 점프: 잠깐 공중에 뜸 (내려찍기와 달리 착지 충격 없음). 공중에서는 안 밀리고 낙하 판정도 없음
  jump: {
    cd: 6,
    use(room, p) { p.air = C.JUMP_TIME; p.airMax = C.JUMP_TIME; p.slamming = false; },
  },
  // 타일 복구: 주변 구멍·금 간 타일을 되돌림 (흔들리던 지진 타일은 지진이 취소됨). 고칠 게 없으면 쿨다운 안 씀
  restore: {
    cd: 12,
    use(room, p) {
      const fixed = room.arena.restoreArea(p.x, p.z, C.RESTORE_RADIUS);
      if (!fixed.length) return false;
      room.quakes = room.quakes.filter(q => !fixed.includes(q.tile));
      room.event({ k: 'restore', x: p.x, z: p.z, r: C.RESTORE_RADIUS });
    },
  },
  // 텔레포트: 바라보는 방향으로 순간이동. 앞이 허공이면 가까운 바닥까지 거리를 줄임
  teleport: {
    cd: 8,
    use(room, p) {
      const cx = Math.cos(p.facing), cz = Math.sin(p.facing);
      for (let d = C.TELEPORT_DIST; d >= 1.5; d -= 0.5) {
        const x = p.x + cx * d, z = p.z + cz * d;
        if (!room.arena.isGround(x, z)) continue;
        const ax = p.x, az = p.z;
        p.x = x; p.z = z; p.vx *= 0.3; p.vz *= 0.3;
        room.event({ k: 'swap', ax, az, bx: x, bz: z });
        return;
      }
      return false; // 갈 곳이 없음
    },
  },
  // 얼음 지대: 주변을 약하게 밀어내고, 그 자리가 몇 초간 얼음이 됨 (내 편은 안 미끄러짐)
  icezone: {
    cd: 10,
    use(room, p) {
      room.radialPush(p, C.ICEZONE_RADIUS, C.ICEZONE_PUSH, 0, 0.3);
      room.iceZones.push({ id: room.nextZoneId++, owner: room.teamOf(p), x: p.x, z: p.z, r: C.ICEZONE_RADIUS, life: C.ICEZONE_TIME });
      room.event({ k: 'ring', x: p.x, z: p.z, r: C.ICEZONE_RADIUS });
    },
  },
  // 볼링: 몸을 굴려 직진. 돌진과 달리 부딪혀도 멈추지 않고 지나간 상대를 모두 밀침
  bowling: {
    cd: 9,
    use(room, p) {
      p.dash = C.BOWL_TIME;
      p.bowl = true;
      p.dashHit = new Set();
      p.vx = Math.cos(p.facing) * C.BOWL_SPEED;
      p.vz = Math.sin(p.facing) * C.BOWL_SPEED;
      room.event({ k: 'dash', id: p.id });
    },
  },
  // 거인 변신: 잠깐 크고 세짐 (시간이 끝나면 원래 능력치로). 이미 변신 중이면 쓸 수 없음
  giant: {
    cd: 25,
    use(room, p) {
      if (p.giant > 0) return false;
      p.baseMods = p.mods;
      p.mods = { ...p.mods, size: p.mods.size * C.GIANT_SIZE, power: p.mods.power * C.GIANT_POWER, weight: p.mods.weight * C.GIANT_WEIGHT, speed: p.mods.speed * C.GIANT_SPEED };
      p.giant = C.GIANT_TIME;
      room.event({ k: 'ring', x: p.x, z: p.z, r: 3.5 });
    },
  },
  // 시간 정지 (신화): 상대 전원이 잠깐 멈춤. 멈춘 동안 맞은 충격은 모아뒀다가 풀릴 때 한꺼번에 터짐
  timestop: {
    cd: 40,
    use(room, p) {
      for (const o of room.players.values()) {
        if (!o.alive || o.fallTimer > 0 || room.teamOf(o) === room.teamOf(p)) continue;
        o.frozen = C.TIMESTOP_TIME;
        o.dash = 0; o.bowl = false;
      }
      room.event({ k: 'timestop', x: p.x, z: p.z });
    },
  },
  // 운석 (신화): 경고 뒤 여러 곳에 운석이 떨어져 밀어내고 타일을 뚫음
  meteor: {
    cd: 35,
    use(room, p) { room.castMeteors(p); },
  },
  // 불사조 (신화): 쓰고 PHOENIX_WINDOW초 안에 떨어지면 맵 중앙에서 부활
  phoenix: {
    cd: 45,
    use(room, p) { p.phoenix = C.PHOENIX_WINDOW; room.event({ k: 'phoenixon', id: p.id }); },
  },
  // 분신: 3초 동안 봇처럼 알아서 싸우는 분신을 옆에 세움 (한 번에 한 명)
  clone: {
    cd: 18,
    use(room, p) { room.spawnClone(p); },
  },
};

// 내려찍기 착지
export function slamLand(room, p) {
  room.radialPush(p, 3.2, 1.5, 15, 0); // 충격파와 같이 일반 밀치기의 1.5배
  room.event({ k: 'ring', x: p.x, z: p.z, r: 3.2 });
  if (room.rule === 'collapse') room.arena.crackAt(p.x, p.z, C.CRUMBLE_TIME);
}

// 블랙홀 구슬: 날아가다 멈추면 그 자리 타일을 뚫고 빨아들임, 사라지면 구멍을 메움
export function updateOrbs(room, dt, list) {
  for (const o of room.orbs) {
    o.life -= dt;
    if (o.fly > 0) {
      o.fly -= dt;
      o.x += o.vx * dt; o.z += o.vz * dt;
      if (o.fly <= 0) {
        o.hole = room.arena.punchHole(o.x, o.z);
        if (o.hole) { o.x = o.hole.x; o.z = o.hole.z; } // 구멍 한가운데로
      }
      continue;
    }
    for (const p of list) {
      if (room.teamOf(p) === o.owner || p.fallTimer > 0 || p.shield > 0) continue;
      const dx = o.x - p.x, dz = o.z - p.z, d = Math.hypot(dx, dz);
      if (d > C.ORB_RADIUS || d < 0.2) continue;
      const pull = C.ORB_PULL * (1 - d / C.ORB_RADIUS * 0.6) / p.mods.weight;
      p.vx += (dx / d) * pull * dt;
      p.vz += (dz / d) * pull * dt;
      p.lastHitBy = o.owner; p.lastHitTime = room.time; // 빨려 들어가 떨어지면 던진 사람 처치
    }
  }
  for (const o of room.orbs) if (o.life <= 0) room.arena.fillHole(o.hole);
  room.orbs = room.orbs.filter(o => o.life > 0);
}
