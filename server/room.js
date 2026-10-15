import { CONFIG as C } from './config.js';
import { Arena } from './arena.js';
import { computeMods, defaultMods, rollOffers, getAbility } from './abilities.js';
import { SKILLS, slamLand, updateOrbs } from './skills.js';
import { createBotState, updateBot } from './bot.js';

const NO_SOCKET = { readyState: 0, send() {} }; // 봇용

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ecf0f1'];

// 방 하나 = 게임 하나. 물리/판정은 전부 서버에서 계산한다.
// 흐름: waiting → picking → countdown → playing → roundEnd → picking → countdown ...
//       (최종 승자가 나오면 roundEnd 대신 gameOver → 점수/능력 초기화 → picking)
export class Room {
  constructor(id, { practice = false } = {}) {
    this.id = id;
    this.practice = practice; // 연습방: 혼자 + 봇, 다른 사람은 들어오지 않음
    this.nextBotId = -1;
    this.players = new Map(); // id -> player
    this.arena = new Arena(C.HEX_RINGS, C.HEX_SIZE);
    this.sentTilesVersion = -1;
    this.rule = 'collapse';      // 이번 라운드 맵 규칙
    this.tilt = { x: 0, z: 0 };  // 기울기: 이 방향으로 내려감 (라디안)
    this.orbs = [];              // 블랙홀 구슬
    this.nextOrbId = 1;
    this.iceTrail = [];          // 얼음 발자국 { x, z, t, owner }
    this.events = [];            // 이번 틱에 화면에 보낼 효과 (충격파, 교체 등)
    this.phase = 'waiting';
    this.timer = 0;
    this.message = '';
    this.nextPlayerNum = 1;
    this.lobbyTimer = C.LOBBY_TIME; // 대기실: 이 시간이 지나면 빈자리를 봇으로 채워 자동 시작
    this.startRequested = false;
    this.botsEnabled = true; // 대기실 설정: 빈자리를 AI로 채울지
  }

  // 사람 기준으로 꽉 찼는지 (봇 자리는 사람이 오면 비워줌)
  get humans() { return [...this.players.values()].filter(p => !p.bot); }
  get isFull() { return this.practice || this.humans.length >= C.MAX_PLAYERS; }
  get isEmpty() { return [...this.players.values()].every(p => p.bot); } // 사람이 없으면 빈 방
  get maxR() { return this.arena.size * 1.5 * this.arena.rings; }

  addPlayer(id, socket) {
    // 사람이 들어왔는데 자리가 없으면 봇 하나를 내보냄 (탈락한 봇 먼저)
    if (socket !== NO_SOCKET && this.players.size >= C.MAX_PLAYERS) {
      const bots = [...this.players.values()].filter(p => p.bot);
      const out = bots.find(b => !b.alive) ?? bots[0];
      if (out) this.players.delete(out.id);
    }
    const usedColors = new Set([...this.players.values()].map(p => p.color));
    const p = {
      id, socket,
      name: `P${this.nextPlayerNum++}`,
      color: COLORS.find(c => !usedColors.has(c)) ?? '#ffffff',
      x: 0, z: 0, vx: 0, vz: 0, facing: 0,
      hp: C.MAX_HP, stunned: false, immune: 0,
      cooldown: 0, attackFlash: 0, attackCount: 0, hitCount: 0,
      alive: false, fallTimer: 0,
      score: 0, kills: 0, ready: false,
      lastHitBy: null, lastHitTime: -99,
      abilities: [], mods: defaultMods(),
      skills: [null, null], skillCd: [0, 0],
      dash: 0, shield: 0, air: 0, airMax: 0, trailTimer: 0,
      offers: null, picked: false,
      emote: -1, emoteTimer: 0, emoteCooldown: 0,
      input: { x: 0, z: 0, attack: false, skill: -1 },
    };
    this.players.set(id, p);
    this.send(p, { t: 'tiles', ...this.arena.serialize() });
    return p;
  }

  addBot() {
    const id = this.nextBotId--;
    const p = this.addPlayer(id, NO_SOCKET);
    p.bot = createBotState();
    p.name = `봇 ${-id}`;
    return p;
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  setInput(id, input) {
    const p = this.players.get(id);
    if (!p) return;
    // 이동 입력은 길이 1 이하로 제한
    let x = Number(input.x) || 0, z = Number(input.z) || 0;
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    p.input.x = x; p.input.z = z;
    if (input.attack) p.input.attack = true; // 다음 틱에서 소비
    if (input.skill === 0 || input.skill === 1) p.input.skill = input.skill;
    if (Number.isFinite(input.seq)) p.inputSeq = input.seq; // 클라이언트 예측용
  }

  setName(id, name) {
    const p = this.players.get(id);
    const clean = String(name ?? '').replace(/[<>&"']/g, '').trim().slice(0, 10);
    if (p && clean) p.name = clean;
  }

  emote(id, n) {
    const p = this.players.get(id);
    n = Math.floor(Number(n));
    if (!p || !(n >= 0 && n < C.EMOTE_COUNT) || p.emoteCooldown > 0) return;
    p.emote = n;
    p.emoteTimer = C.EMOTE_TIME;
    p.emoteCooldown = C.EMOTE_COOLDOWN;
  }

  // 대기실에서 "시작하기"
  requestStart(id) {
    if (this.phase === 'waiting' && this.players.has(id)) this.startRequested = true;
  }

  // 대기실에서 "빈자리 AI 채우기" 켬/끔
  setBots(id, on) {
    if (this.phase === 'waiting' && this.players.has(id) && !this.practice) {
      this.botsEnabled = !!on;
      if (!on) for (const p of [...this.players.values()]) if (p.bot) this.players.delete(p.id);
    }
  }

  // 빈자리(최대 인원까지)를 봇으로 채움
  fillBots() {
    while (this.players.size < C.MAX_PLAYERS) this.addBot();
  }

  toLobby() {
    this.phase = 'waiting';
    this.lobbyTimer = C.LOBBY_TIME;
  }

  // 최종 순위 화면에서 "다시 하기"
  restart(id) {
    const p = this.players.get(id);
    if (p && this.phase === 'gameOver') p.ready = true;
  }

  // slot: 스킬 칸이 다 찼을 때 바꿀 칸 (0=Q, 1=E)
  pick(id, abilityId, slot) {
    const p = this.players.get(id);
    if (this.phase !== 'picking' || !p?.offers || p.picked) return;
    if (!p.offers.some(o => o.id === abilityId)) return;
    this.grantAbility(p, abilityId, slot);
  }

  grantAbility(p, abilityId, slot) {
    const card = getAbility(abilityId);
    if (!card) return;
    if (card.skill) {
      let i = p.skills.indexOf(null);
      if (i < 0) i = slot === 0 || slot === 1 ? slot : Math.floor(Math.random() * C.SKILL_SLOTS);
      // 밀려난 스킬 카드는 목록에서 뺀다
      const old = p.skills[i];
      if (old) p.abilities.splice(p.abilities.findIndex(a => getAbility(a)?.skill === old), 1);
      p.skills[i] = card.skill;
      p.skillCd[i] = 0;
    }
    p.abilities.push(abilityId);
    p.mods = computeMods(p.abilities);
    p.picked = true;
  }

  // ---------- 라운드 흐름 ----------

  startCountdown() {
    this.phase = 'countdown';
    this.timer = C.COUNTDOWN_TIME;
    this.rule = C.MAP_RULES[Math.floor(Math.random() * C.MAP_RULES.length)];
    this.tilt = { x: 0, z: 0 };
    this.orbs = [];
    this.iceTrail = [];
    this.arena.reset();
    this.spawnAll();
  }

  startPicking() {
    this.phase = 'picking';
    this.timer = C.PICK_TIME;
    this.message = '능력 선택 중';
    for (const p of this.players.values()) {
      p.offers = rollOffers(C.PICK_OPTIONS, p.abilities);
      p.picked = false;
      if (p.bot) this.grantAbility(p, p.offers[Math.floor(Math.random() * p.offers.length)].id);
      else this.send(p, { t: 'offer', offers: p.offers, skills: p.skills, time: C.PICK_TIME });
    }
  }

  finishPicking() {
    // 시간 안에 못 고른 사람은 제시된 것 중 랜덤
    for (const p of this.players.values()) {
      if (p.offers && !p.picked) {
        this.grantAbility(p, p.offers[Math.floor(Math.random() * p.offers.length)].id);
      }
      p.offers = null;
    }
  }

  spawnAll() {
    const list = [...this.players.values()];
    list.forEach((p, i) => {
      const a = (i / list.length) * Math.PI * 2;
      const r = this.arena.spawnRadius;
      Object.assign(p, {
        x: Math.cos(a) * r, z: Math.sin(a) * r, vx: 0, vz: 0,
        facing: a + Math.PI, // 중앙을 바라봄
        hp: C.MAX_HP, stunned: false, immune: 0, cooldown: 0, attackFlash: 0,
        alive: true, fallTimer: 0,
        skillCd: [0, 0], dash: 0, shield: 0, air: 0, lastHitBy: null,
      });
    });
  }

  updatePhase(dt) {
    const count = this.players.size;
    switch (this.phase) {
      case 'waiting': // 대기실: 누가 "시작하기"를 누르거나 시간이 다 되면 시작
        this.message = '';
        this.lobbyTimer -= dt;
        // AI를 끄면 사람이 2명 이상일 때만 시작 (자동 시작도 안 함)
        if (!this.practice && !this.botsEnabled && this.humans.length < C.MIN_PLAYERS) {
          this.startRequested = false;
          this.lobbyTimer = C.LOBBY_TIME;
          break;
        }
        if (this.practice || this.startRequested || (this.botsEnabled && this.lobbyTimer <= 0)) {
          if (this.botsEnabled) this.fillBots();
          this.startRequested = false;
          this.startPicking(); // 게임 시작: 첫 라운드 전에 카드 1장
        }
        break;
      case 'countdown':
        this.timer -= dt;
        if (count < C.MIN_PLAYERS) { this.toLobby(); break; }
        if (this.timer <= 0) { this.phase = 'playing'; this.message = ''; }
        break;
      case 'playing': {
        const alive = [...this.players.values()].filter(p => p.alive);
        if (alive.length <= 1) {
          const winner = alive[0];
          if (winner) winner.score += 1;
          if (winner?.bot) this.emote(winner.id, 0); // 봇도 이기면 신남
          if (winner && winner.score >= C.WIN_SCORE) {
            this.phase = 'gameOver';
            this.timer = C.RESULT_TIME;
            this.message = `${winner.name} 최종 승리!`;
            this.results = this.ranking();
            this.players.forEach(p => { p.ready = false; });
          } else {
            this.phase = 'roundEnd';
            this.timer = C.ROUND_END_TIME;
            this.message = winner ? `${winner.name} 라운드 승리!` : '무승부!';
          }
        }
        break;
      }
      case 'roundEnd':
        this.timer -= dt;
        if (this.timer <= 0) {
          if (count >= C.MIN_PLAYERS) this.startPicking();
          else this.toLobby();
        }
        break;
      case 'picking': {
        this.timer -= dt;
        const allPicked = [...this.players.values()].every(p => !p.offers || p.picked);
        if (this.timer <= 0 || allPicked) {
          this.finishPicking();
          if (count >= C.MIN_PLAYERS) this.startCountdown();
          else this.toLobby();
        }
        break;
      }
      case 'gameOver': {
        this.timer -= dt;
        const humans = [...this.players.values()].filter(p => !p.bot);
        const allReady = humans.length > 0 && humans.every(p => p.ready);
        if (this.timer <= 0 || allReady) {
          this.results = null;
          this.players.forEach(p => {
            Object.assign(p, { score: 0, kills: 0, ready: false, abilities: [], mods: defaultMods(), skills: [null, null] });
          });
          if (count >= C.MIN_PLAYERS) this.startPicking(); // 새 게임도 카드 1장부터
          else this.toLobby();
        }
        break;
      }
    }
  }

  // 최종 순위: 승리 라운드 → 떨어뜨린 수
  ranking() {
    return [...this.players.values()]
      .sort((a, b) => b.score - a.score || b.kills - a.kills)
      .map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, color: p.color, score: p.score, kills: p.kills, ab: p.abilities, bot: !!p.bot }));
  }

  // 떨어진 사람을 최근(4초 안)에 민 사람에게 처치 기록
  creditKill(p) {
    const killer = this.players.get(p.lastHitBy);
    if (killer && killer !== p && this.time - p.lastHitTime < 4) {
      killer.kills++;
      // 봇은 떨어뜨리면 가끔 도발 (메롱, 잘 가, 겁쟁이, 약하다)
      if (killer.bot && Math.random() < 0.6) this.emote(killer.id, [4, 5, 8, 7][Math.floor(Math.random() * 4)]);
    }
  }

  // ---------- 물리/전투 ----------

  // 맵 규칙 적용: 바닥 붕괴 또는 무게 기울기 (빙판길은 이동 계산에서 처리)
  updateMap(dt, list) {
    const onGround = list.filter(p => p.fallTimer === 0 && p.air <= 0);
    if (this.rule === 'collapse') {
      this.arena.updateCrumble(dt, onGround, C.CRUMBLE_TIME, C.TILE_RESPAWN_TIME);
    } else if (this.rule === 'tilt') {
      // 플레이어 무게중심이 중앙에서 멀수록 그쪽으로 기움
      let target = { x: 0, z: 0 };
      if (onGround.length) {
        const cx = onGround.reduce((s, p) => s + p.x, 0) / onGround.length;
        const cz = onGround.reduce((s, p) => s + p.z, 0) / onGround.length;
        const sens = C.MAX_TILT * C.TILT_SENSITIVITY;
        target = { x: (cx / this.maxR) * sens, z: (cz / this.maxR) * sens };
        const mag = Math.hypot(target.x, target.z);
        if (mag > C.MAX_TILT) { target.x *= C.MAX_TILT / mag; target.z *= C.MAX_TILT / mag; }
      }
      const step = C.TILT_SPEED * dt;
      const dx = target.x - this.tilt.x, dz = target.z - this.tilt.z;
      const d = Math.hypot(dx, dz);
      if (d <= step) this.tilt = target;
      else { this.tilt.x += (dx / d) * step; this.tilt.z += (dz / d) * step; }
    }
  }

  // 얼음 발자국: 다른 사람이 남긴 얼음 위인지
  onIceTrail(p) {
    const r2 = C.ICE_TRAIL_RADIUS ** 2;
    return this.iceTrail.some(t => t.owner !== p.id && (t.x - p.x) ** 2 + (t.z - p.z) ** 2 < r2);
  }

  updateIceTrail(dt, list) {
    const now = this.time;
    this.iceTrail = this.iceTrail.filter(t => now - t.t < C.ICE_TRAIL_TIME);
    for (const p of list) {
      if (!p.mods.iceTrail || p.fallTimer > 0 || p.air > 0) continue;
      p.trailTimer -= dt;
      if (p.trailTimer > 0) continue;
      p.trailTimer = 0.12;
      this.iceTrail.push({ x: p.x, z: p.z, t: now, owner: p.id });
    }
  }

  updatePlayers(dt) {
    const canAct = this.phase === 'playing';
    const list = [...this.players.values()].filter(p => p.alive);
    if (canAct) {
      this.updateMap(dt, list);
      this.updateIceTrail(dt, list);
      updateOrbs(this, dt, list);
    }

    for (const p of list) {
      const m = p.mods;
      p.cooldown = Math.max(0, p.cooldown - dt);
      p.attackFlash = Math.max(0, p.attackFlash - dt);
      p.immune = Math.max(0, p.immune - dt);
      p.shield = Math.max(0, p.shield - dt);
      p.skillCd = p.skillCd.map(c => Math.max(0, c - dt));

      // 체력 회복 / 기절 해제
      p.hp = Math.min(C.MAX_HP, p.hp + (p.stunned ? C.STUN_HP_REGEN * m.stunRecover : C.HP_REGEN * m.regen) * dt);
      if (p.stunned && p.hp >= C.STUN_RECOVER_HP) {
        p.stunned = false;
        p.immune = C.STUN_IMMUNE_TIME;
      }

      // 바닥 상태: 빙판길 / 얼음 발자국이면 미끄러움 (쫀득한 바닥은 덜 미끄러움)
      const ice = this.rule === 'ice' || this.onIceTrail(p);
      let friction = C.FRICTION, accelMult = 1;
      if (ice) {
        friction = C.ICE_FRICTION + (C.FRICTION - C.ICE_FRICTION) * m.slideResist;
        accelMult = C.ICE_ACCEL_MULT + (1 - C.ICE_ACCEL_MULT) * m.slideResist;
      }
      friction *= m.friction;

      // 이동
      const control = canAct && !p.stunned && p.fallTimer === 0;
      const accel = C.MOVE_ACCEL * m.speed * accelMult, maxSpeed = C.MAX_SPEED * m.speed;
      if (p.dash > 0) {
        p.dash = Math.max(0, p.dash - dt); // 돌진 중에는 방향/속도 고정
      } else {
        if (control && (p.input.x || p.input.z)) {
          p.vx += p.input.x * accel * dt;
          p.vz += p.input.z * accel * dt;
          p.facing = Math.atan2(p.input.z, p.input.x);
        }
        // 이동 입력으로는 최고 속도를 넘지 못하지만, 넉백은 넘을 수 있음
        const speed = Math.hypot(p.vx, p.vz);
        if (control && speed > maxSpeed && (p.input.x || p.input.z)) {
          const over = Math.max(maxSpeed, speed - accel * dt);
          p.vx *= over / speed; p.vz *= over / speed;
        }
        // 기울어진 쪽으로 미끄러짐 (공중에서는 영향 없음)
        if (p.air <= 0) {
          const g = C.TILT_GRAVITY * (1 - m.slideResist);
          p.vx += this.tilt.x * g * dt;
          p.vz += this.tilt.z * g * dt;
        }
        const fr = Math.max(0, 1 - friction * dt);
        p.vx *= fr; p.vz *= fr;
      }

      // 공격
      if (control && p.input.attack && p.cooldown === 0 && p.air <= 0) {
        p.cooldown = C.ATTACK_COOLDOWN * m.cooldown;
        p.attackFlash = 0.15;
        p.attackCount++;
        this.doAttack(p, list);
      }
      p.input.attack = false;

      // 스킬 (Q·E)
      const s = p.input.skill;
      if (control && s >= 0 && p.skills[s] && p.skillCd[s] === 0 && p.air <= 0) {
        const skill = SKILLS[p.skills[s]];
        if (skill.use(this, p) !== false) p.skillCd[s] = skill.cd;
      }
      p.input.skill = -1;

      // 내려찍기 체공 → 착지
      if (p.air > 0) {
        p.air -= dt;
        if (p.air <= 0) { p.air = 0; slamLand(this, p); }
      }
    }

    // 위치 갱신
    for (const p of list) {
      p.x += p.vx * dt;
      p.z += p.vz * dt;
    }

    this.resolveCollisions(list);

    // 낙하 판정: 발밑에 살아있는 타일이 없으면 떨어짐 (공중에서는 판정 안 함)
    for (const p of list) {
      if (p.fallTimer > 0) {
        p.fallTimer += dt;
        if (p.fallTimer >= C.FALL_TIME) { p.alive = false; this.creditKill(p); }
      } else if (p.air <= 0 && !this.arena.isStanding(p.x, p.z, C.FALL_MARGIN * p.mods.size)) {
        p.fallTimer = dt;
        p.dash = 0;
        p.vx *= 0.35; p.vz *= 0.35; // 떨어지기 시작하면 옆으로 덜 미끄러짐 (구멍 안으로 쑥)
      }
    }
  }

  radius(p) { return C.PLAYER_RADIUS * p.mods.size; }

  // 공격자의 힘 배율 (도박사, 가장자리의 왕 포함)
  powerOf(p) {
    let power = p.mods.power;
    if (p.mods.gambler) power *= C.GAMBLER_MIN + Math.random() * (C.GAMBLER_MAX - C.GAMBLER_MIN);
    if (p.mods.edgeKing) power *= 1 + C.EDGE_KING_MAX * Math.min(1, Math.hypot(p.x, p.z) / this.maxR);
    return power;
  }

  // 피해: 기절 해제 직후 면역 중에는 체력이 깎이지 않음
  damage(t, amount) {
    if (t.stunned || t.immune > 0) return;
    t.hp = Math.max(0, t.hp - amount);
    if (t.hp <= 0) t.stunned = true;
  }

  // 넉백 하나로 모음: 방어막, 공중, 무게, 기절, 빙판, 반사
  knock(t, nx, nz, strength, source) {
    if (t.shield > 0 || t.air > 0) return;
    const kb = C.KNOCKBACK * strength / t.mods.weight * (t.stunned ? C.STUN_KNOCKBACK_MULT : 1)
      * (this.rule === 'ice' ? C.ICE_KNOCKBACK_MULT : 1);
    t.vx += nx * kb;
    t.vz += nz * kb;
    t.hitCount++;
    if (source) { t.lastHitBy = source.id; t.lastHitTime = this.time; }
    if (source && t.mods.reflect > 0 && source.shield <= 0) {
      source.vx -= nx * kb * t.mods.reflect;
      source.vz -= nz * kb * t.mods.reflect;
    }
  }

  doAttack(attacker, list) {
    const range = C.ATTACK_RANGE * attacker.mods.range;
    const power = this.powerOf(attacker);
    for (const t of list) {
      if (t === attacker || t.fallTimer > 0) continue;
      const dx = t.x - attacker.x, dz = t.z - attacker.z;
      const dist = Math.hypot(dx, dz);
      // 상대가 클수록 맞히기 쉬움
      if (dist - (this.radius(t) - C.PLAYER_RADIUS) > range || dist === 0) continue;
      let diff = Math.atan2(dz, dx) - attacker.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) > C.ATTACK_ANGLE) continue;
      const wasStunned = t.stunned;
      this.damage(t, C.ATTACK_DAMAGE); // 이번 타격으로 막 기절했으면 넉백은 보통 세기
      this.knockRaw(t, dx / dist, dz / dist, power, attacker, wasStunned);
    }
  }

  // 이번 타격으로 막 기절한 경우 기절 배율을 적용하지 않기 위한 래퍼
  knockRaw(t, nx, nz, power, source, wasStunned) {
    const stunned = t.stunned;
    t.stunned = wasStunned;
    this.knock(t, nx, nz, power, source);
    t.stunned = stunned;
  }

  // 충격파류 스킬: 반경 안 모두 바깥쪽으로 (가까울수록 셈)
  // falloff: 범위 끝에서 줄어드는 비율 (0이면 거리 상관없이 같은 세기)
  radialPush(src, radius, strength, dmg, falloff = 0.5) {
    const power = this.powerOf(src) * strength;
    for (const t of this.players.values()) {
      if (t === src || !t.alive || t.fallTimer > 0) continue;
      const dx = t.x - src.x, dz = t.z - src.z, d = Math.hypot(dx, dz);
      if (d > radius || d === 0) continue;
      const wasStunned = t.stunned;
      this.damage(t, dmg);
      this.knockRaw(t, dx / d, dz / d, power * (1 - (d / radius) * falloff), src, wasStunned);
    }
  }

  resolveCollisions(list) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.air > 0 || b.air > 0) continue; // 공중에 있으면 안 부딪힘
        const minDist = this.radius(a) + this.radius(b);
        const dx = b.x - a.x, dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        // 돌진 중 부딪힘 → 상대를 강하게 밀침
        for (const [d, o, s] of [[a, b, 1], [b, a, -1]]) {
          if (d.dash > 0 && !d.dashHit.has(o.id) && dist < minDist + 0.35 && dist > 0) {
            d.dashHit.add(o.id);
            const wasStunned = o.stunned;
            this.damage(o, 20);
            this.knockRaw(o, (dx / dist) * s, (dz / dist) * s, this.powerOf(d) * C.DASH_HIT_MULT, d, wasStunned);
            d.dash = 0; d.vx *= 0.3; d.vz *= 0.3;
          }
        }
        if (dist >= minDist || dist === 0) continue;
        const nx = dx / dist, nz = dz / dist;
        // 겹친 만큼 밀어내기 (방어막/무거운 쪽은 덜 밀림)
        const wa = a.shield > 0 ? 100 : a.mods.weight, wb = b.shield > 0 ? 100 : b.mods.weight;
        const overlap = minDist - dist;
        a.x -= nx * overlap * wb / (wa + wb); a.z -= nz * overlap * wb / (wa + wb);
        b.x += nx * overlap * wa / (wa + wb); b.z += nz * overlap * wa / (wa + wb);
        // 법선 방향 속도 교환 (탄성 충돌)
        const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rel < 0) {
          const ka = a.shield > 0 ? 0 : 1, kb = b.shield > 0 ? 0 : 1;
          a.vx += rel * nx * ka; a.vz += rel * nz * ka;
          b.vx -= rel * nx * kb; b.vz -= rel * nz * kb;
        }
      }
    }
  }

  event(e) { this.events.push(e); }

  tick(dt) {
    this.time = (this.time ?? 0) + dt;
    for (const p of this.players.values()) {
      p.emoteTimer = Math.max(0, p.emoteTimer - dt);
      p.emoteCooldown = Math.max(0, p.emoteCooldown - dt);
    }
    for (const p of this.players.values()) if (p.bot) updateBot(p, this, dt);
    this.updatePhase(dt);
    if (this.phase === 'playing' || this.phase === 'roundEnd') this.updatePlayers(dt);
    if (this.arena.version !== this.sentTilesVersion) {
      this.sentTilesVersion = this.arena.version;
      this.sendAll({ t: 'tiles', ...this.arena.serialize() });
    }
    this.broadcast();
    this.events = [];
  }

  send(p, obj) {
    if (p.socket.readyState === 1) p.socket.send(JSON.stringify(obj));
  }

  sendAll(obj) {
    const msg = JSON.stringify(obj);
    for (const p of this.players.values()) if (p.socket.readyState === 1) p.socket.send(msg);
  }

  broadcast() {
    const r2 = n => Math.round(n * 100) / 100;
    this.sendAll({
      t: 'state',
      phase: this.phase,
      lobby: this.phase === 'waiting' ? Math.max(0, Math.ceil(this.lobbyTimer)) : 0,
      bots: this.botsEnabled,
      timer: r2(Math.max(0, this.timer)),
      message: this.message,
      rule: this.rule,
      tilt: { x: r2(this.tilt.x), z: r2(this.tilt.z) },
      orbs: this.orbs.map(o => ({ id: o.id, x: r2(o.x), z: r2(o.z), fly: o.fly > 0 })),
      ice: this.iceTrail.map(t => [r2(t.x), r2(t.z), r2(this.time - t.t)]),
      ev: this.events,
      results: this.phase === 'gameOver' ? this.results : null,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, color: p.color,
        x: r2(p.x), z: r2(p.z), f: r2(p.facing),
        hp: Math.round(p.hp), st: p.stunned, im: p.immune > 0,
        al: p.alive, fall: r2(p.fallTimer), atk: p.attackCount, hit: p.hitCount,
        rg: r2(C.ATTACK_RANGE * p.mods.range), sz: r2(p.mods.size),
        vx: r2(p.vx), vz: r2(p.vz), sq: p.inputSeq ?? 0, bot: !!p.bot,
        ms: r2(p.mods.speed), mf: r2(p.mods.friction), mr: r2(p.mods.slideResist), ctl: !p.stunned && p.dash <= 0 && p.air <= 0,
        sc: p.score, kl: p.kills, rd: p.ready, ab: p.abilities, pk: p.picked,
        em: p.emoteTimer > 0 ? p.emote : -1,
        sk: p.skills, cd: p.skillCd.map(r2),
        sh: p.shield > 0, dash: p.dash > 0, air: p.airMax ? r2(Math.max(0, p.air) / p.airMax) : 0,
      })),
    });
  }
}
