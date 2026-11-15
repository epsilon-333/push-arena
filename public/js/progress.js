// 성장: 경험치 · 레벨 · 해금(모자 · 칭호) · 도전 과제 · 일일 미션 · 카드 도감.
// 계산만 한다 (화면은 js/meta.js). 저장은 브라우저(localStorage) 한 칸 — 서버에는 계정이 없다.
// 게임이 끝나면 서버가 준 순위(results)에서 내 줄을 꺼내 applyMatch()에 넣는다.

const KEY = 'pushArenaSave';
export const MAX_LEVEL = 40;
// 레벨 L → L+1 에 필요한 경험치. 첫 판이면 2레벨, 뒤로 갈수록 천천히
export const xpForLevel = L => 100 + (L - 1) * 50;

export function levelInfo(xp) {
  let level = 1, cur = Math.max(0, Math.floor(xp));
  while (level < MAX_LEVEL && cur >= xpForLevel(level)) { cur -= xpForLevel(level); level++; }
  const need = level >= MAX_LEVEL ? 0 : xpForLevel(level);
  return { level, cur: need ? cur : 0, need, pct: need ? cur / need : 1 };
}

// ---------- 칭호 (서버는 번호만 안다. 순서를 바꾸면 안 됨 — 서버 TITLE_COUNT와 개수 맞춤) ----------
// lv: 그 레벨이 되면 / ach: 그 도전 과제를 끝내면
export const TITLES = [
  { name: '', lv: 1 },
  { name: '새내기', lv: 2 },
  { name: '밀치기 꿈나무', lv: 5 },
  { name: '동네 장사', lv: 10 },
  { name: '아레나 단골', lv: 15 },
  { name: '밀치기 달인', lv: 20 },
  { name: '아레나의 전설', lv: 30 },
  { name: '푸쉬 마스터', lv: 40 },
  { name: '승리의 맛', ach: 'first_win' },
  { name: '챔피언', ach: 'win10' },
  { name: '아레나의 왕', ach: 'win50' },
  { name: '철거반장', ach: 'ko100' },
  { name: '낙하 유도 전문가', ach: 'ko500' },
  { name: '트리플!', ach: 'triple' },
  { name: '신화를 본 자', ach: 'mythic' },
  { name: '카드 박사', ach: 'dex_all' },
  { name: '무결점', ach: 'perfect' },
  { name: '역전의 명수', ach: 'comeback' },
  { name: '낙하산 없는 다이버', ach: 'fall100' },
  { name: '기계 사냥꾼', ach: 'hard_win' },
  { name: '성실왕', ach: 'daily7' },
  { name: '연승 행진', ach: 'streak3' },
  { name: '출석왕', ach: 'games100' },
  { name: '수집가', ach: 'dex_half' },
];

// ---------- 모자 해금 (js/character.js HATS와 같은 순서) ----------
export const HAT_UNLOCK = [
  { lv: 1 },            // 0 없음
  { ach: 'win10' },     // 1 왕관
  { lv: 1 },            // 2 고깔모자
  { lv: 3 },            // 3 토끼 귀
  { lv: 4 },            // 4 고양이 귀
  { lv: 2 },            // 5 새싹
  { lv: 1 },            // 6 야구모자
  { lv: 6 },            // 7 리본
  { ach: 'perfect' },   // 8 천사 링
  { ach: 'hard_win' },  // 9 악마 뿔
  { lv: 8 },            // 10 헤드폰
  { lv: 14 },           // 11 신사 모자
  { lv: 10 },           // 12 개구리 눈
  { lv: 20 },           // 13 마법사 모자
  { lv: 12 },           // 14 버섯
  { lv: 17 },           // 15 프로펠러 모자
  { lv: 25 },           // 16 유니콘 뿔
  { lv: 30 },           // 17 병아리
  { ach: 'mythic' },    // 18 신화의 별
];

// ---------- 도전 과제 ----------
// value(s, ctx): 지금까지의 진행 (s = save.stats, ctx.dex = 모은 카드 수, ctx.total = 카드 전체 수)
// goal: 숫자 또는 ctx => 숫자. xp: 끝냈을 때 경험치
export const ACHIEVEMENTS = [
  { id: 'first_win', icon: '🏆', name: '첫 우승', desc: '게임에서 처음으로 우승하기', goal: 1, value: s => s.wins, xp: 100 },
  { id: 'win10', icon: '👑', name: '챔피언', desc: '10번 우승하기', goal: 10, value: s => s.wins, xp: 300 },
  { id: 'win50', icon: '🤴', name: '아레나의 왕', desc: '50번 우승하기', goal: 50, value: s => s.wins, xp: 1000 },
  { id: 'streak3', icon: '🔥', name: '연승 행진', desc: '3판 연속 우승하기', goal: 3, value: s => s.bestStreak, xp: 200 },
  { id: 'perfect', icon: '😇', name: '완벽한 승리', desc: '한 라운드도 내주지 않고 우승하기', goal: 1, value: s => s.perfect, xp: 250 },
  { id: 'comeback', icon: '🎢', name: '역전의 명수', desc: '2점 넘게 뒤지다가 우승하기', goal: 1, value: s => s.comeback, xp: 200 },
  { id: 'online_win', icon: '🌐', name: '진짜 승부', desc: '사람과 붙은 게임에서 우승하기', goal: 1, value: s => s.onlineWins, xp: 150 },
  { id: 'hard_win', icon: '🤖', name: '기계 사냥꾼', desc: '어려움 봇을 상대로 우승하기', goal: 1, value: s => s.hardWins, xp: 200 },
  { id: 'ko10', icon: '💥', name: '첫 손맛', desc: '상대를 10번 떨어뜨리기', goal: 10, value: s => s.kos, xp: 50 },
  { id: 'ko100', icon: '🏗️', name: '철거반장', desc: '상대를 100번 떨어뜨리기', goal: 100, value: s => s.kos, xp: 200 },
  { id: 'ko500', icon: '🕳️', name: '낙하 유도 전문가', desc: '상대를 500번 떨어뜨리기', goal: 500, value: s => s.kos, xp: 600 },
  { id: 'double', icon: '⚡', name: '더블 KO', desc: '4초 안에 2명 떨어뜨리기', goal: 1, value: s => s.double, xp: 80 },
  { id: 'triple', icon: '🌩️', name: '트리플 KO', desc: '4초 안에 3명 떨어뜨리기', goal: 1, value: s => s.triple, xp: 200 },
  { id: 'hits1000', icon: '👊', name: '천 번의 밀치기', desc: '밀치기·스킬을 1000번 맞히기', goal: 1000, value: s => s.hits, xp: 300 },
  { id: 'fall100', icon: '🪂', name: '낙하산 없는 다이버', desc: '100번 떨어지기', goal: 100, value: s => s.falls, xp: 100 },
  { id: 'mythic', icon: '✨', name: '신화 강림', desc: '신화 카드를 고르기 (확률 1%)', goal: 1, value: s => s.mythic, xp: 200 },
  { id: 'legend5', icon: '🌟', name: '전설 수집', desc: '전설 카드를 5번 고르기', goal: 5, value: s => s.legend, xp: 150 },
  { id: 'dex_half', icon: '🃏', name: '수집가', desc: '카드 도감 절반 채우기', goal: c => Math.ceil(c.total / 2), value: (s, c) => c.dex, xp: 200 },
  { id: 'dex_all', icon: '📚', name: '카드 박사', desc: '카드 도감 전부 채우기', goal: c => c.total, value: (s, c) => c.dex, xp: 800 },
  { id: 'games10', icon: '🎮', name: '몸풀기', desc: '게임 10판 끝까지 하기', goal: 10, value: s => s.games, xp: 80 },
  { id: 'games100', icon: '📆', name: '출석왕', desc: '게임 100판 끝까지 하기', goal: 100, value: s => s.games, xp: 500 },
  { id: 'daily7', icon: '📅', name: '성실왕', desc: '일일 미션 3개를 모두 끝낸 날 7번', goal: 7, value: s => s.dailyClears, xp: 300 },
];
const ACH_BY_ID = new Map(ACHIEVEMENTS.map(a => [a.id, a]));
export const achGoal = (a, ctx) => (typeof a.goal === 'function' ? a.goal(ctx) : a.goal);

// ---------- 일일 미션 ----------
// 날마다 이 중 3개. gain(m, ctx): 이번 판에서 얻은 진행 (m = 내 한 판 기록)
const RARE_UP = new Set(['rare', 'legend', 'mythic']);
export const MISSIONS = [
  { id: 'ko', icon: '💥', goal: 5, text: n => `상대를 ${n}번 떨어뜨리기`, gain: m => m.kills },
  { id: 'rounds', icon: '🏁', goal: 4, text: n => `라운드 ${n}번 이기기`, gain: m => m.score },
  { id: 'games', icon: '🎮', goal: 2, text: n => `게임 ${n}판 끝까지 하기`, gain: () => 1 },
  { id: 'hits', icon: '👊', goal: 30, text: n => `밀치기·스킬 ${n}번 맞히기`, gain: m => m.st.hits },
  { id: 'win', icon: '🏆', goal: 1, text: () => '게임에서 우승하기', gain: m => (m.rank === 1 ? 1 : 0) },
  { id: 'top2', icon: '🥈', goal: 2, text: n => `2등 안에 ${n}번 들기`, gain: m => (m.rank <= 2 ? 1 : 0) },
  { id: 'rare', icon: '💎', goal: 3, text: n => `희귀 이상 카드 ${n}장 고르기`, gain: (m, c) => m.st.picks.filter(id => RARE_UP.has(c.cards.get(id)?.rarity)).length },
  { id: 'skill', icon: '🔮', goal: 3, text: n => `스킬 카드 ${n}장 고르기`, gain: (m, c) => m.st.picks.filter(id => c.cards.get(id)?.kind === 'skill').length },
  { id: 'double', icon: '⚡', goal: 1, text: () => '더블 KO 하기 (4초 안에 2명)', gain: m => (m.st.multi >= 2 ? 1 : 0) },
  { id: 'alive', icon: '🛡️', goal: 90, text: n => `판 위에서 ${n}초 버티기`, gain: m => m.st.alive },
];
const MISSION_BY_ID = new Map(MISSIONS.map(m => [m.id, m]));
export const MISSION_XP = 50, MISSION_BONUS_XP = 100, DAILY_COUNT = 3;
export const missionText = d => { const m = MISSION_BY_ID.get(d.id); return m ? m.text(d.goal) : d.id; };
export const missionIcon = d => MISSION_BY_ID.get(d.id)?.icon ?? '🎯';

// ---------- 한 판 경험치 ----------
export const XP = { finish: 30, round: 12, ko: 6, rank: [60, 30, 15, 0], firstOfDay: 40 };
// 봇 연습은 덜 받는다 (난이도가 높을수록 더). 사람과 붙으면 그대로
const PRACTICE_MULT = [0.5, 0.7, 0.9];

export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// 그날의 미션 3개: 날짜로 정해져서 누구나 같은 날 같은 미션
export function rollDaily(date) {
  let seed = hash(`push-arena-${date}`);
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pool = [...MISSIONS];
  const list = [];
  while (list.length < DAILY_COUNT && pool.length) {
    const m = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    list.push({ id: m.id, goal: m.goal, prog: 0, done: false });
  }
  return { date, list, bonus: false };
}

// ---------- 저장 ----------
const newStats = () => ({ games: 0, wins: 0, rounds: 0, kos: 0, hits: 0, falls: 0, double: 0, triple: 0, bestMulti: 0,
  mythic: 0, legend: 0, perfect: 0, comeback: 0, hardWins: 0, onlineWins: 0, streak: 0, bestStreak: 0, dailyClears: 0, alive: 0 });

export function newSave() {
  return { v: 1, xp: 0, stats: newStats(), cards: {}, ach: {}, daily: null, title: 0, lastPlay: '', matches: [], fresh: { hats: [], titles: [] } };
}

// 저장을 읽는다. 깨졌거나 없으면 새 저장. 빠진 칸은 기본값으로 채움 (나중에 칸이 늘어도 옛 저장을 그대로 씀)
export function load(storage) {
  let s = null;
  try { s = JSON.parse(storage.getItem(KEY)); } catch {}
  const base = newSave();
  if (!s || typeof s !== 'object') return base;
  return { ...base, ...s, stats: { ...base.stats, ...(s.stats ?? {}) }, cards: s.cards ?? {}, ach: s.ach ?? {},
    matches: Array.isArray(s.matches) ? s.matches : [], fresh: { hats: s.fresh?.hats ?? [], titles: s.fresh?.titles ?? [] } };
}
export function store(save, storage) { try { storage.setItem(KEY, JSON.stringify(save)); } catch {} }

// 오늘 미션이 아니면 새로 뽑는다. 바뀌었으면 true
export function ensureDaily(save, today = todayKey()) {
  if (save.daily?.date === today) return false;
  save.daily = rollDaily(today);
  return true;
}

// ---------- 해금 ----------
const isOpen = (rule, save) => (rule.ach ? !!save.ach[rule.ach] : levelInfo(save.xp).level >= (rule.lv ?? 1));
export const hatUnlocked = (save, n) => !!HAT_UNLOCK[n] && isOpen(HAT_UNLOCK[n], save);
export const titleUnlocked = (save, n) => !!TITLES[n] && isOpen(TITLES[n], save);
// 잠긴 것의 조건 설명
// full: 도전 과제의 내용까지
export function unlockHint(rule, full = false) {
  const a = ACH_BY_ID.get(rule.ach);
  if (rule.ach) return `도전 과제 「${a?.name ?? rule.ach}」${full && a ? `(${a.desc})` : ''}`;
  return `레벨 ${rule.lv}`;
}
export const dexCount = save => Object.keys(save.cards).length;
export const achProgress = (a, save, total) => {
  const ctx = { dex: dexCount(save), total };
  const goal = achGoal(a, ctx);
  return { value: Math.min(goal, a.value(save.stats, ctx)), goal, done: !!save.ach[a.id] };
};

// ---------- 한 판 끝: 보상 계산 ----------
// match: { id, kind('practice'|'quick'|'private'), bl(봇 난이도), rounds, humans }
// me: 서버 순위의 내 줄 { rank, score, kills, st: { hits, falls, multi, alive, picks, behind } }
// ctx: { cards: Map(카드 id → { rarity, kind }), today }
// 돌려주는 값(보상 화면용): { dup, lines, mult, gained, before, after, levelUps, hats, titles, achievements, missions, bonus, newCards }
export function applyMatch(save, match, me, ctx) {
  const today = ctx.today ?? todayKey();
  const report = { dup: false, lines: [], mult: 1, gained: 0, before: levelInfo(save.xp), after: null, levelUps: 0,
    hats: [], titles: [], achievements: [], missions: [], bonus: 0, newCards: [] };
  if (save.matches.includes(match.id)) { report.dup = true; report.after = report.before; return report; }
  save.matches = [...save.matches, match.id].slice(-8);
  ensureDaily(save, today);
  const total = ctx.cards.size || 1;
  const hatsBefore = HAT_UNLOCK.map((_, n) => hatUnlocked(save, n));
  const titlesBefore = TITLES.map((_, n) => titleUnlocked(save, n));

  // 기록
  const s = save.stats, won = me.rank === 1, practice = match.kind === 'practice' || match.humans <= 1;
  s.games++; s.rounds += me.score; s.kos += me.kills; s.hits += me.st.hits; s.falls += me.st.falls; s.alive += me.st.alive;
  s.bestMulti = Math.max(s.bestMulti, me.st.multi);
  if (me.st.multi >= 2) s.double++;
  if (me.st.multi >= 3) s.triple++;
  if (won) {
    s.wins++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak);
    if (me.score === match.rounds) s.perfect++;
    if (me.st.behind >= 2) s.comeback++;
    if (!practice) s.onlineWins++;
    else if (match.bl >= 2) s.hardWins++;
  } else s.streak = 0;
  for (const id of me.st.picks) {
    const card = ctx.cards.get(id);
    if (!card) continue;
    if (!save.cards[id]) report.newCards.push(id);
    save.cards[id] = (save.cards[id] ?? 0) + 1;
    if (card.rarity === 'mythic') s.mythic++;
    if (card.rarity === 'legend') s.legend++;
  }

  // 한 판 경험치
  const lines = report.lines;
  lines.push({ label: '끝까지 완주', xp: XP.finish });
  if (me.score) lines.push({ label: `라운드 승리 ×${me.score}`, xp: me.score * XP.round });
  if (me.kills) lines.push({ label: `KO ×${me.kills}`, xp: me.kills * XP.ko });
  if (XP.rank[me.rank - 1]) lines.push({ label: `${me.rank}등`, xp: XP.rank[me.rank - 1] });
  report.mult = practice ? (PRACTICE_MULT[match.bl] ?? PRACTICE_MULT[1]) : 1;
  let gained = Math.round(lines.reduce((sum, l) => sum + l.xp, 0) * report.mult);
  if (save.lastPlay !== today) { lines.push({ label: '오늘의 첫 판', xp: XP.firstOfDay, flat: true }); gained += XP.firstOfDay; }
  save.lastPlay = today;

  // 일일 미션
  for (const d of save.daily.list) {
    const def = MISSION_BY_ID.get(d.id);
    const was = d.done;
    if (def && !d.done) {
      d.prog = Math.min(d.goal, d.prog + Math.max(0, Math.round(def.gain(me, ctx))));
      if (d.prog >= d.goal) { d.done = true; gained += MISSION_XP; }
    }
    report.missions.push({ ...d, justDone: d.done && !was });
  }
  if (!save.daily.bonus && save.daily.list.every(d => d.done)) {
    save.daily.bonus = true; s.dailyClears++; gained += MISSION_BONUS_XP; report.bonus = MISSION_BONUS_XP;
  }

  // 도전 과제 (끝낸 과제의 경험치로 또 다른 과제가 끝나지는 않으므로 한 번만 훑음)
  const actx = { dex: dexCount(save), total };
  for (const a of ACHIEVEMENTS) {
    if (save.ach[a.id] || a.value(s, actx) < achGoal(a, actx)) continue;
    save.ach[a.id] = today;
    gained += a.xp;
    report.achievements.push(a.id);
  }

  save.xp += gained;
  report.gained = gained;
  report.after = levelInfo(save.xp);
  report.levelUps = report.after.level - report.before.level;
  HAT_UNLOCK.forEach((_, n) => { if (!hatsBefore[n] && hatUnlocked(save, n)) { report.hats.push(n); save.fresh.hats.push(n); } });
  TITLES.forEach((_, n) => { if (!titlesBefore[n] && titleUnlocked(save, n)) { report.titles.push(n); save.fresh.titles.push(n); } });
  return report;
}
