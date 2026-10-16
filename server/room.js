import { CONFIG as C } from './config.js';
import { Arena } from './arena.js';
import { computeMods, defaultMods, rollOffers, getAbility } from './abilities.js';
import { SKILLS, slamLand, updateOrbs } from './skills.js';
import { createBotState, updateBot } from './bot.js';

const NO_SOCKET = { readyState: 0, send() {} }; // 봇용

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ecf0f1'];

// 방 하나 = 게임 하나. 물리/판정은 전부 서버에서 계산한다.
// 흐름: waiting → picking → countdown → playing → roundEnd → picking → countdown ...
//       (최종 승자가 나오면 roundEnd 대신 gameOver. "다시 하기"를 누른 사람은 새 방으로 옮겨감)
// kind: private(코드로 들어오는 방) / quick(빠른 시작) / practice(혼자 + 봇)
export class Room {
  constructor(code, { kind = 'private' } = {}) {
    this.code = code;
    this.kind = kind;
    this.practice = kind === 'practice'; // 연습방: 혼자 + 봇, 다른 사람은 들어오지 않음
    this.hostId = null;   // 방장: 방을 만든 사람 (나가면 다음 사람에게 넘어감)
    this.nextRoom = null; // 게임이 끝난 뒤 "다시 하기"를 누른 사람들이 모이는 방
    this.nextBotId = -1;
    this.players = new Map(); // id -> player
    this.arena = new Arena(C.HEX_RINGS, C.HEX_SIZE);
    this.sentTilesVersion = -1;
    this.rule = 'collapse';      // 이번 라운드 맵 규칙
    this.tilt = { x: 0, z: 0 };  // 기울기: 이 방향으로 내려감 (라디안)
    this.orbs = [];              // 블랙홀 구슬
    this.nextOrbId = 1;
    this.iceTrail = [];          // 얼음 발자국 { x, z, t, owner }
    this.bananas = [];           // 바나나 껍질 { id, owner, x, z, life }
    this.nextBananaId = 1;
    this.mines = [];             // 지뢰 { id, owner(편 id), x, z, arm, life }
    this.nextMineId = 1;
    this.iceZones = [];          // 얼음 지대 { id, owner(편 id), x, z, r, life }
    this.nextZoneId = 1;
    this.meteors = [];           // 떨어지는 중인 운석 { id, owner(편 id), x, z, timer, warn }
    this.nextMeteorId = 1;
    this.shrink = { t: 0, ring: 0 };  // 축소 규칙: 다음 줄어들기까지 / 다음에 사라질 겹
    this.bounces = [];                // 튀는 바닥 규칙: { tile, timer, phase('warn'|'air'), riders }
    this.bounceTimer = 0;             // 다음 튀는 타일까지
    this.rainTimer = 0;               // 구멍 비 규칙: 다음 비까지
    this.quakes = [];            // 지진으로 흔들리거나 뚫린 타일 { tile, timer, open, owner }
    this.events = [];            // 이번 틱에 화면에 보낼 효과 (충격파, 교체 등)
    this.phase = 'waiting';
    this.timer = 0;
    this.message = '';
    this.nextPlayerNum = 1;
    this.startRequested = false;
    this.autoStart = null;    // 빠른 시작 방: 자동 시작까지 남은 시간 (2명 이상일 때만)
    this.botsEnabled = false; // 대기실 설정: 빈자리를 AI로 채울지 (기본 끔, 방장만 바꿈)
  }

  // 사람 기준으로 꽉 찼는지 (봇 자리는 사람이 오면 비워줌)
  get humans() { return [...this.players.values()].filter(p => !p.bot); }
  get isFull() { return this.practice || this.humans.length >= C.MAX_PLAYERS; }
  get isOpen() { return this.phase === 'waiting' && !this.isFull; } // 게임이 시작되면 아무도 못 들어옴
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
      score: 0, kills: 0,
      lastHitBy: null, lastHitTime: -99,
      abilities: [], mods: defaultMods(),
      skills: [null, null], skillCd: [0, 0],
      dash: 0, shield: 0, air: 0, airMax: 0, trailTimer: 0,
      frozen: 0, pend: { vx: 0, vz: 0 }, giant: 0, baseMods: null, phoenix: 0,
      offers: null, picked: false,
      emote: -1, emoteTimer: 0, emoteCooldown: 0, hat: 0,
      input: { x: 0, z: 0, attack: false, skill: -1 },
    };
    this.players.set(id, p);
    if (socket !== NO_SOCKET && this.hostId === null) this.hostId = id;
    this.send(p, { t: 'tiles', ...this.arena.serialize() });
    return p;
  }

  addBot() {
    const id = this.nextBotId--;
    const p = this.addPlayer(id, NO_SOCKET);
    p.bot = createBotState();
    p.name = `봇 ${-id}`;
    p.hat = 1 + Math.floor(Math.random() * (C.HAT_COUNT - 1));
    return p;
  }

  removePlayer(id) {
    this.players.delete(id);
    if (id === this.hostId) this.hostId = this.humans[0]?.id ?? null; // 먼저 들어온 사람이 방장을 이어받음
  }

  // 연결이 끊김: 자리는 남겨두고 제자리에 멈춤 (index.js가 잠시 뒤 내보냄)
  setAway(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.away = true;
    p.input = { x: 0, z: 0, attack: false, skill: -1 };
  }

  // 다시 연결됨: 새 소켓으로 바꾸고 맵 상태를 다시 보냄
  reattach(id, socket) {
    const p = this.players.get(id);
    if (!p) return;
    p.socket = socket;
    p.away = false;
    this.send(p, { t: 'tiles', ...this.arena.serialize() });
  }

  // 능력 선택 중에 다시 연결되면 아직 안 고른 카드를 다시 보여줌
  resendOffer(id) {
    const p = this.players.get(id);
    if (this.phase === 'picking' && p?.offers && !p.picked) {
      this.send(p, { t: 'offer', offers: p.offers, skills: p.skills, time: Math.max(1, this.timer), luck: p.behind });
    }
  }

  // 방장이 다른 사람을 내보냄. 내보낸 플레이어를 돌려줌 (소켓 정리는 index.js)
  kick(id, targetId) {
    const t = this.players.get(targetId);
    if (id !== this.hostId || !t || t.bot || targetId === id) return null;
    this.removePlayer(targetId);
    return t;
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

  setHat(id, n) {
    const p = this.players.get(id);
    n = Math.floor(Number(n));
    if (p) p.hat = n >= 0 && n < C.HAT_COUNT ? n : 0;
  }

  emote(id, n) {
    const p = this.players.get(id);
    n = Math.floor(Number(n));
    if (!p || !(n >= 0 && n < C.EMOTE_COUNT) || p.emoteCooldown > 0) return;
    p.emote = n;
    p.emoteTimer = C.EMOTE_TIME;
    p.emoteCooldown = C.EMOTE_COOLDOWN;
  }

  // 대기실에서 "시작하기" (방장만)
  requestStart(id) {
    if (this.phase === 'waiting' && id === this.hostId) this.startRequested = true;
  }

  // 대기실에서 "빈자리 AI 채우기" 켬/끔 (방장만)
  setBots(id, on) {
    if (this.phase === 'waiting' && id === this.hostId && !this.practice) {
      this.botsEnabled = !!on;
      if (!on) for (const p of [...this.players.values()]) if (p.bot) this.players.delete(p.id);
    }
  }

  // 빈자리(최대 인원까지)를 봇으로 채움
  fillBots() {
    while (this.players.size < C.MAX_PLAYERS) this.addBot();
  }

  // 게임 중 사람이 나가서 혼자 남으면 대기실로 (점수/능력 초기화)
  toLobby() {
    this.phase = 'waiting';
    this.startRequested = false;
    for (const p of [...this.players.values()]) if (p.bot) this.players.delete(p.id);
    this.players.forEach(p => {
      Object.assign(p, { score: 0, kills: 0, abilities: [], mods: defaultMods(), skills: [null, null], alive: false, offers: null });
    });
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
    this.bananas = [];
    this.quakes = [];
    this.mines = [];
    this.iceZones = [];
    this.meteors = [];
    this.shrink = { t: C.SHRINK_FIRST, ring: C.HEX_RINGS };
    this.rainTimer = C.RAIN_FIRST;
    this.bounces = [];
    this.bounceTimer = C.BOUNCE_FIRST;
    this.arena.reset();
    this.spawnAll();
  }

  startPicking() {
    this.phase = 'picking';
    this.timer = C.PICK_TIME;
    this.message = '능력 선택 중';
    const top = Math.max(...[...this.players.values()].map(p => p.score));
    for (const p of this.players.values()) {
      if (!p.abilities.length) for (const id of C.TEST_CARDS) this.grantAbility(p, id);
      p.behind = top - p.score; // 뒤진 만큼 좋은 카드가 잘 나옴
      p.offers = rollOffers(C.PICK_OPTIONS, p.abilities, p.behind);
      p.picked = false;
      if (p.bot) this.grantAbility(p, p.offers[Math.floor(Math.random() * p.offers.length)].id);
      else this.send(p, { t: 'offer', offers: p.offers, skills: p.skills, time: C.PICK_TIME, luck: p.behind });
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
        skillCd: [0, 0], dash: 0, bowl: false, shield: 0, air: 0, slamming: false, lastHitBy: null,
        frozen: 0, pend: { vx: 0, vz: 0 }, giant: 0, baseMods: null, phoenix: 0, mods: computeMods(p.abilities), // 거인 변신 등으로 바뀐 능력치를 되돌림
        mirror: 0, ghost: 0, slip: 0, standKey: null, standTime: 0,
        sneezeTimer: C.SNEEZE_MIN + Math.random() * (C.SNEEZE_MAX - C.SNEEZE_MIN),
      });
      if (this.rule === 'big') p.mods.size *= C.BIG_SIZE; // 거대화: 모두 크기 2배 (mods는 라운드마다 새로 계산한 사본)
    });
  }

  updatePhase(dt) {
    const count = [...this.players.values()].filter(p => !p.clone).length; // 분신은 인원에 안 셈
    // 게임 도중 사람이 나가서 혼자 남으면 바로 대기실로
    if (this.phase !== 'waiting' && this.phase !== 'gameOver' && count < C.MIN_PLAYERS) { this.toLobby(); return; }
    switch (this.phase) {
      case 'waiting': // 대기실: 방장이 "시작하기"를 누르면 시작 (연습방은 바로)
        this.message = '';
        // AI를 끄면 사람이 2명 이상일 때만 시작
        if (!this.practice && !this.botsEnabled && this.humans.length < C.MIN_PLAYERS) {
          this.startRequested = false;
          this.autoStart = null;
          break;
        }
        // 빠른 시작 방: 방장이 안 눌러도 2명 이상이면 잠시 뒤, 꽉 차면 곧 자동 시작
        if (this.kind === 'quick') {
          const n = this.humans.length;
          if (n < C.MIN_PLAYERS) this.autoStart = null;
          else {
            if (this.autoStart === null) this.autoStart = C.QUICK_AUTO_START;
            if (n >= C.MAX_PLAYERS) this.autoStart = Math.min(this.autoStart, C.QUICK_FULL_START);
            this.autoStart -= dt;
            if (this.autoStart <= 0) this.startRequested = true;
          }
        }
        if (this.practice || this.startRequested) {
          this.autoStart = null;
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
        const alive = [...this.players.values()].filter(p => p.alive && !p.clone);
        if (alive.length <= 1) {
          const winner = alive[0];
          if (winner) winner.score += 1;
          if (winner?.bot) this.emote(winner.id, 0); // 봇도 이기면 신남
          if (winner && winner.score >= C.WIN_SCORE) {
            this.phase = 'gameOver'; // 이 방은 여기서 끝. 다시 하려면 새 방으로
            this.message = `${winner.name} 최종 승리!`;
            this.results = this.ranking();
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
    }
  }

  // 최종 순위: 승리 라운드 → 떨어뜨린 수
  ranking() {
    return [...this.players.values()].filter(p => !p.clone)
      .sort((a, b) => b.score - a.score || b.kills - a.kills)
      .map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, color: p.color, hat: p.hat, score: p.score, kills: p.kills, ab: p.abilities, bot: !!p.bot }));
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
      const walkers = onGround.map(p => ({ id: p.id, x: p.x, z: p.z, delay: p.mods.slideResist > 0 ? C.STICKY_CRUMBLE_DELAY : 0 }));
      this.arena.updateCrumble(dt, walkers, C.CRUMBLE_TIME, C.TILE_RESPAWN_TIME);
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
    } else if (this.rule === 'shrink') {
      this.updateShrink(dt);
    } else if (this.rule === 'rain') {
      this.updateRain(dt, onGround);
    } else if (this.rule === 'bounce') {
      this.updateBounce(dt, onGround);
    }
  }

  // 얼음 발자국: 다른 사람이 남긴 얼음 위인지
  onIceTrail(p) {
    const r2 = C.ICE_TRAIL_RADIUS ** 2;
    const team = this.teamOf(p);
    return this.iceTrail.some(t => t.owner !== team && (t.x - p.x) ** 2 + (t.z - p.z) ** 2 < r2)
      || this.iceZones.some(z => z.owner !== team && (z.x - p.x) ** 2 + (z.z - p.z) ** 2 < z.r ** 2);
  }

  updateIceTrail(dt, list) {
    const now = this.time;
    this.iceTrail = this.iceTrail.filter(t => now - t.t < C.ICE_TRAIL_TIME);
    for (const p of list) {
      if (!p.mods.iceTrail || p.fallTimer > 0 || p.air > 0) continue;
      p.trailTimer -= dt;
      if (p.trailTimer > 0) continue;
      p.trailTimer = 0.12;
      this.iceTrail.push({ x: p.x, z: p.z, t: now, owner: this.teamOf(p) });
    }
  }

  updatePlayers(dt) {
    const canAct = this.phase === 'playing';
    const list = [...this.players.values()].filter(p => p.alive);
    if (canAct) {
      this.updateMap(dt, list);
      this.updateIceTrail(dt, list);
      updateOrbs(this, dt, list);
      this.updateBananas(dt, list);
      this.updateQuakes(dt, list);
      this.updateMines(dt, list);
      this.updateMeteors(dt);
      this.iceZones.forEach(z => { z.life -= dt; });
      this.iceZones = this.iceZones.filter(z => z.life > 0);
    }

    for (const p of list) {
      // 시간 정지: 멈춰 있는 동안은 아무것도 못 하고 (쿨다운도 멈춤), 맞은 충격은 pend에 모였다가 풀릴 때 터짐
      if (p.frozen > 0) {
        p.frozen = Math.max(0, p.frozen - dt);
        p.vx = 0; p.vz = 0;
        if (p.frozen === 0) { p.vx = p.pend.vx; p.vz = p.pend.vz; p.pend.vx = p.pend.vz = 0; }
        p.input.attack = false; p.input.skill = -1;
        continue;
      }
      // 거인 변신 끝: 원래 능력치로
      if (p.giant > 0) {
        p.giant -= dt;
        if (p.giant <= 0) { p.giant = 0; if (p.baseMods) p.mods = p.baseMods; p.baseMods = null; }
      }
      p.phoenix = Math.max(0, p.phoenix - dt);
      const m = p.mods;
      p.cooldown = Math.max(0, p.cooldown - dt);
      p.attackFlash = Math.max(0, p.attackFlash - dt);
      p.immune = Math.max(0, p.immune - dt);
      p.shield = Math.max(0, p.shield - dt);
      p.skillCd = p.skillCd.map(c => Math.max(0, c - dt));
      p.mirror = Math.max(0, p.mirror - dt);
      p.ghost = Math.max(0, p.ghost - dt);
      p.slip = Math.max(0, p.slip - dt);
      if (p.clone && canAct) p.life -= dt; // 분신 수명
      if (canAct) { this.updateSneeze(p, dt); this.updateTerritory(p, dt); }

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
      if (p.slip > 0) friction *= 0.12; // 바나나: 쭉 미끄러짐

      // 이동 (거울 세계에 걸리면 방향키가 반대)
      const control = canAct && !p.stunned && p.fallTimer === 0 && p.slip <= 0;
      const ix = p.mirror > 0 ? -p.input.x : p.input.x, iz = p.mirror > 0 ? -p.input.z : p.input.z;
      const accel = C.MOVE_ACCEL * m.speed * accelMult, maxSpeed = C.MAX_SPEED * m.speed;
      if (p.dash > 0) {
        p.dash = Math.max(0, p.dash - dt); // 돌진 중에는 방향/속도 고정
        if (p.dash === 0) p.bowl = false;
      } else {
        if (control && (ix || iz)) {
          p.vx += ix * accel * dt;
          p.vz += iz * accel * dt;
          p.facing = Math.atan2(iz, ix);
        }
        // 이동 입력으로는 최고 속도를 넘지 못하지만, 넉백은 넘을 수 있음
        const speed = Math.hypot(p.vx, p.vz);
        if (control && speed > maxSpeed && (ix || iz)) {
          const over = Math.max(maxSpeed, speed - accel * dt);
          p.vx *= over / speed; p.vz *= over / speed;
        }
        // 기울어진 쪽으로 미끄러짐 (공중에서는 영향 없음)
        if (p.air <= 0) {
          const g = C.TILT_GRAVITY * (1 - m.slideResist);
          p.vx += this.tilt.x * g * dt;
          p.vz += this.tilt.z * g * dt;
          // 회전판: 도는 방향으로 쓸리고 바깥으로 밀려남 (가장자리일수록 셈). 클라이언트 예측(client.js stepPred)과 같은 식
          if (this.rule === 'spin') {
            const rr = Math.hypot(p.x, p.z);
            if (rr > 0.05) {
              const k = Math.min(1, rr / this.maxR) * (1 - m.slideResist);
              p.vx += (-p.z / rr * C.SPIN_ACCEL + p.x / rr * C.SPIN_OUT) * k * dt;
              p.vz += (p.x / rr * C.SPIN_ACCEL + p.z / rr * C.SPIN_OUT) * k * dt;
            }
          }
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
        if (p.air <= 0) { p.air = 0; if (p.slamming) { p.slamming = false; slamLand(this, p); } }
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
        if (p.phoenix > 0 && this.revive(p)) continue; // 불사조: 떨어지는 대신 부활
        p.fallTimer = dt;
        p.dash = 0;
        p.vx *= 0.35; p.vz *= 0.35; // 떨어지기 시작하면 옆으로 덜 미끄러짐 (구멍 안으로 쑥)
      }
    }
  }

  radius(p) { return C.PLAYER_RADIUS * p.mods.size; }

  // 공격자의 힘 배율 (도박사, 가장자리의 왕, 복수, 왕의 귀환 포함). t: 맞는 상대
  powerOf(p, t) {
    let power = p.mods.power;
    if (p.mods.grit) power *= 1 + C.GRIT_MAX * (1 - Math.max(0, p.hp) / C.MAX_HP); // 오기: 체력이 낮을수록 셈
    if (p.mods.gambler) power *= C.GAMBLER_MIN + Math.random() * (C.GAMBLER_MAX - C.GAMBLER_MIN);
    if (p.mods.edgeKing) power *= 1 + C.EDGE_KING_MAX * Math.min(1, Math.hypot(p.x, p.z) / this.maxR);
    if (t && p.mods.revenge && p.lastHitBy === t.id) power *= C.REVENGE_MULT;
    if (t && p.mods.king && this.isLeader(t)) power *= C.KING_MULT;
    return power;
  }

  // 점수 1등 (0점끼리는 1등 없음, 공동 1등은 모두 1등)
  isLeader(t) {
    const top = Math.max(...[...this.players.values()].map(o => o.score));
    return top > 0 && t.score === top;
  }

  // ---------- 새 카드 효과 ----------

  // 바나나 껍질: 놓은 사람 말고 밟으면 지금 가던 방향으로 쭉 미끄러짐
  updateBananas(dt, list) {
    for (const b of this.bananas) {
      b.life -= dt;
      for (const p of list) {
        if (this.teamOf(p) === b.owner || p.fallTimer > 0 || p.air > 0 || p.ghost > 0 || p.slip > 0 || b.life <= 0) continue;
        if (Math.hypot(p.x - b.x, p.z - b.z) > C.BANANA_RADIUS) continue;
        const sp = Math.hypot(p.vx, p.vz);
        const dx = sp > 0.5 ? p.vx / sp : Math.cos(p.facing), dz = sp > 0.5 ? p.vz / sp : Math.sin(p.facing);
        p.vx = dx * C.SLIP_SPEED; p.vz = dz * C.SLIP_SPEED;
        p.slip = C.SLIP_TIME;
        p.hitCount++;
        p.lastHitBy = b.owner; p.lastHitTime = this.time;
        b.life = 0;
        this.event({ k: 'slip', id: p.id, x: b.x, z: b.z });
      }
    }
    this.bananas = this.bananas.filter(b => b.life > 0);
  }

  // 지진: 흔들림(경고) → 뚫림 → 메움. 뚫릴 때 그 위에 있던 사람이 떨어지면 지진 쓴 사람 처치
  updateQuakes(dt, list) {
    for (const q of this.quakes) {
      q.timer -= dt;
      if (q.timer > 0) continue;
      if (!q.open) {
        q.open = true;
        q.timer = q.perm ? Infinity : C.QUAKE_OPEN; // perm: 축소 규칙에서 사라진 타일은 다시 안 생김
        this.arena.openTile(q.tile);
        for (const p of list) {
          if (p.id !== q.owner && this.arena.tileAt(p.x, p.z) === q.tile) { p.lastHitBy = q.owner; p.lastHitTime = this.time; }
        }
      } else {
        this.arena.fillHole(q.tile);
        q.done = true;
      }
    }
    this.quakes = this.quakes.filter(q => !q.done);
  }

  // 같은 편 id: 분신은 본체와 한 편 (밀치기·스킬이 서로 안 맞고, 처치도 본체 몫)
  teamOf(p) { return p.clone ? p.owner : p.id; }

  // 지뢰: 설치 뒤 MINE_ARM초가 지나면 켜지고, 다른 편이 밟으면 폭발
  updateMines(dt, list) {
    for (const m of this.mines) {
      m.life -= dt;
      m.arm -= dt;
      if (m.arm > 0 || m.life <= 0) continue;
      const stepped = list.some(p => this.teamOf(p) !== m.owner && p.fallTimer === 0 && p.air <= 0 && p.ghost <= 0
        && Math.hypot(p.x - m.x, p.z - m.z) < C.MINE_TRIGGER);
      if (!stepped) continue;
      m.life = 0;
      this.blast(m.x, m.z, C.MINE_RADIUS, C.MINE_POWER, 15, m.owner);
      this.event({ k: 'ring', x: m.x, z: m.z, r: C.MINE_RADIUS });
    }
    this.mines = this.mines.filter(m => m.life > 0);
  }

  // 폭발: 중심에서 바깥으로 밀어냄 (가까울수록 셈). ownerId 편은 안 맞음 (지뢰, 운석)
  blast(x, z, radius, strength, dmg, ownerId) {
    const owner = this.players.get(ownerId) ?? null;
    for (const t of this.players.values()) {
      if (!t.alive || this.teamOf(t) === ownerId || t.fallTimer > 0 || t.ghost > 0) continue;
      const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz);
      if (d > radius) continue;
      const nx = d > 0.2 ? dx / d : Math.cos(t.facing), nz = d > 0.2 ? dz / d : Math.sin(t.facing);
      const wasStunned = t.stunned;
      this.damage(t, dmg);
      this.knockRaw(t, nx, nz, (owner ? this.powerOf(owner, t) : 1) * strength * (1 - (d / radius) * 0.5), owner, wasStunned);
    }
  }

  // 운석: 상대 위치를 노린 것 + 랜덤 2개. 경고(METEOR_WARN) 뒤에 떨어짐. 내 주변(METEOR_SAFE)은 노리지 않음
  castMeteors(p) {
    const foes = [...this.players.values()].filter(o => o.alive && o.fallTimer === 0 && this.teamOf(o) !== this.teamOf(p));
    const tiles = [...this.arena.tiles.values()].filter(t => t.state !== 'gone' && Math.hypot(t.x - p.x, t.z - p.z) > C.METEOR_SAFE);
    for (let i = 0; i < C.METEOR_COUNT; i++) {
      let x, z;
      const aim = foes.length && i < C.METEOR_COUNT - 2 ? foes[i % foes.length] : null;
      if (aim && Math.hypot(aim.x - p.x, aim.z - p.z) > C.METEOR_SAFE) { x = aim.x + (Math.random() - 0.5) * 1.5; z = aim.z + (Math.random() - 0.5) * 1.5; }
      else if (tiles.length) { const t = tiles[Math.floor(Math.random() * tiles.length)]; x = t.x; z = t.z; }
      else continue;
      this.meteors.push({ id: this.nextMeteorId++, owner: this.teamOf(p), x, z, timer: C.METEOR_WARN + i * 0.12, warn: C.METEOR_WARN + i * 0.12 });
    }
    this.event({ k: 'rumble' });
  }

  updateMeteors(dt) {
    for (const m of this.meteors) {
      m.timer -= dt;
      if (m.timer > 0) continue;
      m.done = true;
      this.blast(m.x, m.z, C.METEOR_RADIUS, C.METEOR_POWER, 20, m.owner);
      const t = this.arena.tileAt(m.x, m.z);
      if (t && t.state !== 'gone' && !t.protected && !this.quakes.some(q => q.tile === t)) {
        this.arena.openTile(t);
        this.quakes.push({ tile: t, timer: C.QUAKE_OPEN, open: true, owner: m.owner }); // 3초 뒤 메워짐
      }
      this.event({ k: 'meteor', x: m.x, z: m.z, r: C.METEOR_RADIUS });
    }
    this.meteors = this.meteors.filter(m => !m.done);
  }

  // 불사조 부활: 중앙 근처 바닥으로. 갈 곳이 없으면 false
  revive(p) {
    const spots = [[0, 0], ...Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4) * 3, Math.sin(i * Math.PI / 4) * 3])];
    const s = spots.find(([x, z]) => this.arena.isGround(x, z));
    if (!s) return false;
    this.event({ k: 'phoenix', ax: p.x, az: p.z, bx: s[0], bz: s[1] });
    p.x = s[0]; p.z = s[1]; p.vx = p.vz = 0; p.dash = 0; p.phoenix = 0;
    p.immune = Math.max(p.immune, 1.2);
    return true;
  }

  // 축소: 처음 SHRINK_FIRST초 뒤부터 SHRINK_INTERVAL초마다 가장 바깥 겹이 흔들리다가 영구히 사라짐
  updateShrink(dt) {
    const s = this.shrink;
    s.t -= dt;
    if (s.t > 0 || s.ring <= C.SHRINK_MIN_RING) return;
    for (const t of this.arena.tiles.values()) {
      if (t.state === 'gone' || this.arena.ringOf(t) !== s.ring || this.quakes.some(q => q.tile === t)) continue;
      this.arena.shakeTile(t);
      this.quakes.push({ tile: t, timer: C.SHRINK_WARN, open: false, owner: null, perm: true });
    }
    s.ring--;
    s.t = C.SHRINK_INTERVAL;
    this.event({ k: 'rumble' });
  }

  // 튀는 바닥: 타일 몇 개가 흔들리다(경고) 위로 튀어오르고, 그 위에 있던 사람도 같이 떠올랐다가,
  // 내려앉을 때 충격파가 퍼짐 (타고 있던 사람도 맞음). 절반은 사람 근처를 노림
  updateBounce(dt, onGround) {
    this.bounceTimer -= dt;
    if (this.bounceTimer <= 0) {
      this.bounceTimer = C.BOUNCE_INTERVAL;
      const free = t => t && (t.state === 'alive' || t.state === 'cracked') && !t.protected && !this.bounces.some(b => b.tile === t);
      const all = [...this.arena.tiles.values()].filter(free);
      for (let i = 0; i < C.BOUNCE_TILES; i++) {
        let t = null;
        if (i % 2 === 0 && onGround.length) {
          const p = onGround[Math.floor(Math.random() * onGround.length)];
          t = this.arena.tileAt(p.x, p.z);
        }
        if (!free(t)) t = all.length ? all[Math.floor(Math.random() * all.length)] : null;
        if (!t || !free(t)) continue;
        this.arena.shakeTile(t); // 흔들리는 타일 = 경고
        this.bounces.push({ tile: t, timer: C.BOUNCE_WARN, phase: 'warn', riders: [] });
      }
      this.event({ k: 'rumble' });
    }
    for (const b of this.bounces) {
      b.timer -= dt;
      if (b.timer > 0) continue;
      const t = b.tile;
      if (b.phase === 'warn') {
        b.phase = 'air';
        b.timer = C.BOUNCE_AIR;
        t.state = 'alive'; t.timer = 0; this.arena.version++;
        b.riders = onGround.filter(p => this.arena.tileAt(p.x, p.z) === t);
        for (const r of b.riders) { r.air = C.BOUNCE_AIR; r.airMax = C.BOUNCE_AIR; r.slamming = false; }
        this.event({ k: 'bounce', key: `${t.q},${t.r}`, dur: C.BOUNCE_AIR });
      } else {
        b.done = true;
        for (const r of b.riders) if (!r.slamming) r.air = 0; // 착지
        this.blast(t.x, t.z, C.BOUNCE_RADIUS, C.BOUNCE_POWER, C.BOUNCE_DMG, null);
        this.event({ k: 'ring', x: t.x, z: t.z, r: C.BOUNCE_RADIUS });
      }
    }
    this.bounces = this.bounces.filter(b => !b.done);
  }

  // 구멍 비: 일정 간격으로 타일 몇 개가 흔들리다 뚫림 (절반은 사람 근처를 노림)
  updateRain(dt, onGround) {
    this.rainTimer -= dt;
    if (this.rainTimer > 0) return;
    this.rainTimer = C.RAIN_INTERVAL;
    const free = t => t && (t.state === 'alive' || t.state === 'cracked') && !t.protected && !this.quakes.some(q => q.tile === t);
    const all = [...this.arena.tiles.values()].filter(free);
    for (let i = 0; i < C.RAIN_TILES; i++) {
      let t = null;
      if (i % 2 === 0 && onGround.length) {
        const p = onGround[Math.floor(Math.random() * onGround.length)];
        t = this.arena.tileAt(p.x + (Math.random() - 0.5) * 4, p.z + (Math.random() - 0.5) * 4);
      }
      if (!free(t)) t = all.length ? all[Math.floor(Math.random() * all.length)] : null;
      if (!t || !free(t)) continue;
      this.arena.shakeTile(t);
      this.quakes.push({ tile: t, timer: C.RAIN_WARN, open: false, owner: null });
    }
    this.event({ k: 'rumble' });
  }

  // 분신: 본체 옆에 서서 봇 AI로 CLONE_TIME초 동안 싸움 (본체의 힘·무게 등을 그대로 가짐)
  spawnClone(p) {
    for (const c of [...this.players.values()]) if (c.clone && c.owner === p.id) this.players.delete(c.id); // 한 번에 한 명
    const c = this.addPlayer(this.nextBotId--, NO_SOCKET);
    const spot = [Math.PI / 2, -Math.PI / 2, Math.PI, 0]
      .map(a => ({ x: p.x + Math.cos(p.facing + a) * 1.6, z: p.z + Math.sin(p.facing + a) * 1.6 }))
      .find(s => this.arena.isGround(s.x, s.z)) ?? { x: p.x, z: p.z };
    c.bot = createBotState();
    c.bot.aggression = 1;
    Object.assign(c, {
      clone: true, owner: p.id, life: C.CLONE_TIME,
      name: `${p.name}의 분신`, color: p.color, hat: p.hat,
      alive: true, x: spot.x, z: spot.z, facing: p.facing,
      mods: { ...p.mods, sneeze: false, territory: false, iceTrail: false }, // 규칙 카드 중 분신이 쓰면 이상한 것은 뺌
    });
    this.event({ k: 'clone', x: spot.x, z: spot.z });
  }

  // 재채기: 가끔 저절로 주변을 밀치고 나도 뒤로 휘청
  updateSneeze(p, dt) {
    if (!p.mods.sneeze || p.fallTimer > 0 || p.air > 0) return;
    p.sneezeTimer -= dt;
    if (p.sneezeTimer > 0) return;
    p.sneezeTimer = C.SNEEZE_MIN + Math.random() * (C.SNEEZE_MAX - C.SNEEZE_MIN);
    this.radialPush(p, C.SNEEZE_RADIUS, C.SNEEZE_POWER, 0, 0.3);
    p.vx -= Math.cos(p.facing) * 7; p.vz -= Math.sin(p.facing) * 7;
    p.emote = C.EMOTE_COUNT; p.emoteTimer = 1.3; // 화면의 EMOTES 마지막 칸 = 에취!
    this.event({ k: 'sneeze', id: p.id, x: p.x, z: p.z, r: C.SNEEZE_RADIUS });
  }

  // 영역 표시: 같은 타일에 TERRITORY_TIME 동안 서 있으면 그 타일은 이번 라운드 동안 보호
  updateTerritory(p, dt) {
    if (!p.mods.territory || p.fallTimer > 0 || p.air > 0) return;
    const t = this.arena.tileAt(p.x, p.z);
    const key = t ? `${t.q},${t.r}` : null;
    if (key !== p.standKey) { p.standKey = key; p.standTime = 0; return; }
    p.standTime += dt;
    if (t && p.standTime >= C.TERRITORY_TIME && !this.quakes.some(q => q.tile === t) && this.arena.protect(t, p.id)) {
      this.event({ k: 'flag', id: p.id, x: t.x, z: t.z });
    }
  }

  // 피해: 기절 해제 직후 면역 중에는 체력이 깎이지 않음
  damage(t, amount) {
    if (t.stunned || t.immune > 0) return;
    t.hp = Math.max(0, t.hp - amount);
    if (t.hp <= 0) t.stunned = true;
  }

  // 넉백 하나로 모음: 방어막, 공중, 무게, 기절, 빙판, 반사
  knock(t, nx, nz, strength, source) {
    if (t.shield > 0 || t.air > 0 || t.ghost > 0) return;
    // 영역 표시: 내가 표시한 타일 위에서는 더 무거움
    const home = t.mods.territory && this.arena.tileAt(t.x, t.z)?.protected === t.id ? C.TERRITORY_WEIGHT : 1;
    const kb = C.KNOCKBACK * strength / (t.mods.weight * home) * (t.stunned ? C.STUN_KNOCKBACK_MULT : 1)
      * (this.rule === 'ice' ? C.ICE_KNOCKBACK_MULT : 1)
      * (this.rule === 'lowgrav' ? C.LOWGRAV_KNOCKBACK_MULT : 1);
    const sink = t.frozen > 0 ? t.pend : t; // 시간이 멈춘 상대는 충격이 쌓였다가 풀릴 때 한꺼번에
    sink.vx += nx * kb;
    sink.vz += nz * kb;
    t.hitCount++;
    if (source) { t.lastHitBy = this.teamOf(source); t.lastHitTime = this.time; } // 분신이 밀어도 본체 처치로 기록
    if (source && t.mods.reflect > 0 && source.shield <= 0) {
      source.vx -= nx * kb * t.mods.reflect;
      source.vz -= nz * kb * t.mods.reflect;
    }
  }

  doAttack(attacker, list) {
    const range = C.ATTACK_RANGE * attacker.mods.range;
    for (const t of list) {
      if (t === attacker || t.fallTimer > 0 || t.ghost > 0 || this.teamOf(t) === this.teamOf(attacker)) continue;
      const dx = t.x - attacker.x, dz = t.z - attacker.z;
      const dist = Math.hypot(dx, dz);
      // 상대가 클수록 맞히기 쉬움
      if (dist - (this.radius(t) - C.PLAYER_RADIUS) > range || dist === 0) continue;
      let diff = Math.atan2(dz, dx) - attacker.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) > C.ATTACK_ANGLE) continue;
      const wasStunned = t.stunned;
      this.damage(t, C.ATTACK_DAMAGE); // 이번 타격으로 막 기절했으면 넉백은 보통 세기
      this.knockRaw(t, dx / dist, dz / dist, this.powerOf(attacker, t), attacker, wasStunned);
      if (attacker.mods.combo) attacker.skillCd = attacker.skillCd.map(c => Math.max(0, c - C.COMBO_CD)); // 콤보
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
    for (const t of this.players.values()) {
      if (t === src || !t.alive || t.fallTimer > 0 || t.ghost > 0 || this.teamOf(t) === this.teamOf(src)) continue;
      const dx = t.x - src.x, dz = t.z - src.z, d = Math.hypot(dx, dz);
      if (d > radius || d === 0) continue;
      const wasStunned = t.stunned;
      this.damage(t, dmg);
      this.knockRaw(t, dx / d, dz / d, this.powerOf(src, t) * strength * (1 - (d / radius) * falloff), src, wasStunned);
    }
  }

  resolveCollisions(list) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.air > 0 || b.air > 0 || a.ghost > 0 || b.ghost > 0) continue; // 공중·유령이면 안 부딪힘
        if (this.teamOf(a) === this.teamOf(b)) continue; // 본체와 분신은 서로 통과
        const minDist = this.radius(a) + this.radius(b);
        const dx = b.x - a.x, dz = b.z - a.z;
        const dist = Math.hypot(dx, dz);
        // 돌진 중 부딪힘 → 상대를 강하게 밀침
        for (const [d, o, s] of [[a, b, 1], [b, a, -1]]) {
          if (d.dash > 0 && !d.dashHit.has(o.id) && dist < minDist + 0.35 && dist > 0) {
            d.dashHit.add(o.id);
            const wasStunned = o.stunned;
            this.damage(o, d.bowl ? 15 : 20);
            this.knockRaw(o, (dx / dist) * s, (dz / dist) * s, this.powerOf(d, o) * (d.bowl ? C.BOWL_HIT_MULT : C.DASH_HIT_MULT), d, wasStunned);
            if (!d.bowl) { d.dash = 0; d.vx *= 0.3; d.vz *= 0.3; } // 볼링은 멈추지 않고 계속 굴러감
          }
        }
        if (dist >= minDist || dist === 0) continue;
        const nx = dx / dist, nz = dz / dist;
        // 겹친 만큼 밀어내기 (방어막/무거운 쪽은 덜 밀림)
        const wa = a.shield > 0 || a.frozen > 0 ? 100 : a.mods.weight, wb = b.shield > 0 || b.frozen > 0 ? 100 : b.mods.weight;
        const overlap = minDist - dist;
        a.x -= nx * overlap * wb / (wa + wb); a.z -= nz * overlap * wb / (wa + wb);
        b.x += nx * overlap * wa / (wa + wb); b.z += nz * overlap * wa / (wa + wb);
        if ((a.bowl && a.dash > 0) || (b.bowl && b.dash > 0)) continue; // 굴러가는 중에는 속도를 뺏기지 않음
        // 법선 방향 속도 교환 (탄성 충돌)
        const rel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rel < 0) {
          const ka = a.shield > 0 || a.frozen > 0 ? 0 : 1, kb = b.shield > 0 || b.frozen > 0 ? 0 : 1;
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
    // 분신: 수명이 다했거나 떨어졌거나 라운드가 끝나면 사라짐
    for (const p of [...this.players.values()]) {
      if (!p.clone || (this.phase === 'playing' && p.alive && p.life > 0)) continue;
      this.event({ k: 'clone', x: p.x, z: p.z });
      this.players.delete(p.id);
    }
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
      code: this.code,
      kind: this.kind,
      host: this.hostId,
      bots: this.botsEnabled,
      auto: this.autoStart === null ? null : Math.max(0, Math.ceil(this.autoStart)),
      timer: r2(Math.max(0, this.timer)),
      message: this.message,
      rule: this.rule,
      tilt: { x: r2(this.tilt.x), z: r2(this.tilt.z) },
      orbs: this.orbs.map(o => ({ id: o.id, x: r2(o.x), z: r2(o.z), fly: o.fly > 0 })),
      ice: this.iceTrail.map(t => [r2(t.x), r2(t.z), r2(this.time - t.t)]),
      bananas: this.bananas.map(b => [b.id, r2(b.x), r2(b.z)]),
      mines: this.mines.map(m => [m.id, r2(m.x), r2(m.z), m.arm <= 0 ? 1 : 0]),
      meteors: this.meteors.map(m => [m.id, r2(m.x), r2(m.z), r2(Math.max(0, m.timer)), r2(m.warn), C.METEOR_RADIUS]),
      zones: this.iceZones.map(z => [z.id, r2(z.x), r2(z.z), z.r, r2(z.life)]),
      ev: this.events,
      results: this.phase === 'gameOver' ? this.results : null,
      players: [...this.players.values()].map(p => ({
        id: p.id, name: p.name, color: p.color,
        x: r2(p.x), z: r2(p.z), f: r2(p.facing),
        hp: Math.round(p.hp), st: p.stunned, im: p.immune > 0,
        al: p.alive, fall: r2(p.fallTimer), atk: p.attackCount, hit: p.hitCount,
        rg: r2(C.ATTACK_RANGE * p.mods.range), sz: r2(p.mods.size),
        vx: r2(p.vx), vz: r2(p.vz), sq: p.inputSeq ?? 0, bot: !!p.bot, cl: !!p.clone, fz: p.frozen > 0, ph: p.phoenix > 0,
        ms: r2(p.mods.speed), mf: r2(p.mods.friction), mr: r2(p.mods.slideResist), ctl: !p.stunned && p.dash <= 0 && p.air <= 0 && p.slip <= 0 && p.frozen <= 0,
        sc: p.score, kl: p.kills, ab: p.abilities, pk: p.picked,
        em: p.emoteTimer > 0 ? p.emote : -1, away: !!p.away, hat: p.hat,
        sk: p.skills, cd: p.skillCd.map(r2),
        mir: r2(p.mirror), gh: p.ghost > 0, sl: p.slip > 0,
        sh: p.shield > 0, dash: p.dash > 0, air: p.airMax ? r2(Math.max(0, p.air) / p.airMax) : 0,
      })),
    });
  }
}
