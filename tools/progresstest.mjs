// 성장(경험치 · 해금 · 도전 과제 · 일일 미션) 계산 테스트: node tools/progresstest.mjs → ALL OK
import * as P from '../public/js/progress.js';
import { ABILITIES } from '../server/abilities.js';
import { CONFIG as C } from '../server/config.js';

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  ✗', msg); } };
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const cards = new Map(ABILITIES.map(a => [a.id, a]));
const me = (o = {}) => ({ rank: 1, score: 5, kills: 6, ...o, st: { hits: 20, falls: 2, multi: 1, alive: 80, picks: ['dash', 'strong_arm'], behind: 0, ...(o.st ?? {}) } });
const match = (o = {}) => ({ id: `m${Math.random()}`, kind: 'quick', bl: 1, rounds: 8, humans: 4, ...o });

// 서버와 개수 맞춤
check(P.TITLES.length === C.TITLE_COUNT, `칭호 수 ${P.TITLES.length} = 서버 TITLE_COUNT ${C.TITLE_COUNT}`);
check(P.HAT_UNLOCK.length === C.HAT_COUNT, `모자 해금 표 ${P.HAT_UNLOCK.length} = 서버 HAT_COUNT ${C.HAT_COUNT}`);
const achIds = new Set(P.ACHIEVEMENTS.map(a => a.id));
check(achIds.size === P.ACHIEVEMENTS.length, '도전 과제 id가 겹치면 안 됨');
for (const r of [...P.TITLES, ...P.HAT_UNLOCK]) if (r.ach) check(achIds.has(r.ach), `해금 조건의 도전 과제가 없음: ${r.ach}`);

// 레벨
check(P.levelInfo(0).level === 1 && P.levelInfo(99).level === 1 && P.levelInfo(100).level === 2, '100 경험치면 2레벨');
check(P.levelInfo(1e9).level === P.MAX_LEVEL && P.levelInfo(1e9).pct === 1, '최고 레벨에서 멈춤');
let sum = 0; for (let l = 1; l < P.MAX_LEVEL; l++) sum += P.xpForLevel(l);
check(P.levelInfo(sum).level === P.MAX_LEVEL && P.levelInfo(sum - 1).level === P.MAX_LEVEL - 1, `최고 레벨까지 ${sum} 경험치`);

// 한 판: 사람과 붙어 우승
{
  const s = P.newSave();
  const r = P.applyMatch(s, match(), me(), { cards, today: '2026-01-01' });
  // 30 + 5*12 + 6*6 + 60 = 186, 오늘의 첫 판 +40, 첫 우승 100 · 진짜 승부 150 + (미션은 날짜에 따라)
  const base = 186 + 40, ach = r.achievements.reduce((t, id) => t + P.ACHIEVEMENTS.find(a => a.id === id).xp, 0);
  const mission = r.missions.filter(m => m.justDone).length * P.MISSION_XP + r.bonus;
  check(r.gained === base + ach + mission, `경험치 합 ${r.gained} = ${base} + 과제 ${ach} + 미션 ${mission}`);
  check(r.achievements.includes('first_win') && r.achievements.includes('online_win'), '첫 우승 · 진짜 승부 달성');
  check(s.stats.wins === 1 && s.stats.kos === 6 && s.stats.games === 1 && s.stats.streak === 1, '기록이 쌓임');
  check(r.newCards.length === 2 && P.dexCount(s) === 2, '도감에 카드 2장');
  check(r.titles.includes(8) && P.titleUnlocked(s, 8), '칭호 「승리의 맛」 해금');
  check(r.after.level > r.before.level && r.levelUps === r.after.level - 1, '레벨이 오름');
  // 같은 판을 두 번 받지 않음
  const again = P.applyMatch(s, { ...match(), id: s.matches.at(-1) }, me(), { cards, today: '2026-01-01' });
  check(again.dup && again.gained === 0 && s.stats.games === 1, '같은 판은 한 번만');
  // 같은 날 두 번째 판: 첫 판 보너스 없음
  const r2 = P.applyMatch(s, match(), me({ rank: 3, score: 1, kills: 0 }), { cards, today: '2026-01-01' });
  check(!r2.lines.some(l => l.label === '오늘의 첫 판'), '첫 판 보너스는 하루 한 번');
  check(s.stats.streak === 0 && s.stats.bestStreak === 1, '지면 연승이 끊김');
}

// 연습(봇) 배율과 어려움 봇 우승
{
  const s = P.newSave();
  const r = P.applyMatch(s, match({ kind: 'practice', bl: 0, humans: 1 }), me({ rank: 2, score: 2, kills: 1 }), { cards, today: '2026-02-02' });
  check(r.mult === 0.5, '쉬움 봇 연습은 절반');
  check(s.stats.onlineWins === 0, '연습은 사람과 붙은 게 아님');
  const r3 = P.applyMatch(s, match({ kind: 'practice', bl: 2, humans: 1, rounds: 5 }), me({ st: { behind: 3 } }), { cards, today: '2026-02-02' });
  check(r3.achievements.includes('hard_win') && P.hatUnlocked(s, 9), '어려움 봇 우승 → 악마 뿔');
  check(r3.achievements.includes('perfect') && P.hatUnlocked(s, 8), '5:0 우승 → 천사 링');
  check(r3.achievements.includes('comeback'), '역전 우승');
  check(r3.hats.includes(8) && r3.hats.includes(9) && s.fresh.hats.includes(9), '새로 열린 모자가 보상에 실림');
}

// 일일 미션: 날마다 3개, 같은 날은 같은 미션, 다 끝내면 보너스 한 번
{
  const a = P.rollDaily('2026-03-03'), b = P.rollDaily('2026-03-03');
  check(JSON.stringify(a) === JSON.stringify(b) && a.list.length === 3 && new Set(a.list.map(m => m.id)).size === 3, '같은 날 같은 미션 3개');
  const seen = new Set();
  for (let d = 1; d <= 28; d++) P.rollDaily(`2026-04-${String(d).padStart(2, '0')}`).list.forEach(m => seen.add(m.id));
  check(seen.size === P.MISSIONS.length, `한 달이면 모든 미션이 한 번은 나옴 (${seen.size}/${P.MISSIONS.length})`);
  const s = P.newSave();
  let bonus = 0, games = 0;
  const big = me({ kills: 9, st: { hits: 40, multi: 2, alive: 120, picks: ['mirror', 'swap', 'shockwave', 'dash'] } });
  while (games < 6) { const r = P.applyMatch(s, match(), big, { cards, today: '2026-05-05' }); bonus += r.bonus; games++; }
  check(s.daily.list.every(m => m.done && m.prog === m.goal), '미션을 다 끝냄');
  check(bonus === P.MISSION_BONUS_XP && s.stats.dailyClears === 1, '모두 끝낸 보너스는 한 번');
  const next = P.applyMatch(s, match(), big, { cards, today: '2026-05-06' });
  check(s.daily.date === '2026-05-06' && next.lines.some(l => l.label === '오늘의 첫 판'), '날이 바뀌면 미션도 새로');
}

// 도감 · 신화
{
  const s = P.newSave();
  const all = ABILITIES.map(a => a.id);
  const r = P.applyMatch(s, match(), me({ st: { picks: all } }), { cards, today: '2026-06-06' });
  check(P.dexCount(s) === ABILITIES.length && r.achievements.includes('dex_all') && r.achievements.includes('dex_half'), '도감 전부');
  check(r.achievements.includes('mythic') && P.hatUnlocked(s, 18), '신화 카드 → 신화의 별');
  const pr = P.achProgress(P.ACHIEVEMENTS.find(a => a.id === 'dex_all'), s, cards.size);
  check(pr.done && pr.value === pr.goal, '도전 과제 진행 표시');
}

// 저장: 다시 읽어도 같고, 깨진 저장은 새로 시작, 옛 저장의 빠진 칸은 채움
{
  const st = mem(), s = P.newSave();
  P.applyMatch(s, match(), me(), { cards, today: '2026-07-07' });
  P.store(s, st);
  check(JSON.stringify(P.load(st)) === JSON.stringify(s), '저장 → 읽기');
  st.setItem('pushArenaSave', '{깨짐');
  check(P.load(st).xp === 0, '깨진 저장은 새로 시작');
  st.setItem('pushArenaSave', JSON.stringify({ xp: 500, stats: { wins: 3 } }));
  const old = P.load(st);
  check(old.xp === 500 && old.stats.wins === 3 && old.stats.kos === 0 && Array.isArray(old.matches) && old.fresh.hats.length === 0, '옛 저장의 빠진 칸 채움');
}

// 처음에는 기본 모자만
{
  const s = P.newSave();
  const open = P.HAT_UNLOCK.map((_, n) => P.hatUnlocked(s, n));
  check(open[0] && open[2] && open[6] && open.filter(Boolean).length === 3, '처음 열린 모자는 없음 · 고깔모자 · 야구모자');
  check(P.unlockHint(P.HAT_UNLOCK[1]).includes('챔피언') && P.unlockHint(P.HAT_UNLOCK[3]) === '레벨 3', '잠긴 조건 설명');
}

console.log(failed ? `실패 ${failed}건` : 'ALL OK');
process.exit(failed ? 1 : 0);
