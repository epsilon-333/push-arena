// 성장 화면: 처음 화면의 레벨 막대 · 일일 미션 · 도전 과제 · 카드 도감 · 내 기록(칭호 고르기),
// 게임이 끝났을 때의 보상 (경험치, 레벨업, 새로 열린 것). 계산은 js/progress.js.
import * as P from './progress.js';
import { cardIcon, RARITY_NAME, KIND_NAME } from './ui.js';

const $ = id => document.getElementById(id);
let save = P.newSave(), hats = [], sound = null;
let cards = new Map(); // 카드 id → { name, rarity, kind, desc, ... } (서버 목록)
let tab = 'daily', dexPick = null, rewardedMatch = null;

const persist = () => P.store(save, localStorage);
const level = () => P.levelInfo(save.xp);
const titleOf = n => P.TITLES[n]?.name ?? '';

export function init(o) {
  hats = o.hats; sound = o.sound;
  try { save = P.load(localStorage); } catch { save = P.newSave(); }
  if (P.ensureDaily(save)) persist();
  if (!P.titleUnlocked(save, save.title)) save.title = 0;
  // 처음 화면에서도 도감을 볼 수 있게 카드 목록을 미리 받음
  fetch('/api/catalog').then(r => r.json()).then(d => { if (!cards.size) setCatalog(d.abilities); }).catch(() => {});

  $('btn-profile').onclick = () => open('stats');
  document.querySelector('.meta-row').onclick = e => { const b = e.target.closest('button'); if (b) open(b.dataset.tab); };
  const box = $('meta');
  box.querySelector('.meta-tabs').onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('meta-close')) { box.hidden = true; return; }
    open(b.dataset.tab);
  };
  box.onclick = e => { if (e.target === box) box.hidden = true; };
  addEventListener('keydown', e => { if (e.key === 'Escape') box.hidden = true; });
  box.querySelector('.meta-body').onclick = onBodyClick;
  renderProfile();
}

export function setCatalog(list) {
  cards = new Map(list.map(a => [a.id, a]));
  renderProfile();
}

// 서버에 알려 줄 내 칭호 · 레벨 (보여 주기만 함)
export const helloInfo = () => ({ title: P.titleUnlocked(save, save.title) ? save.title : 0, level: level().level, tier: P.tierOf(save.rp) });

// 모자 고르기 창이 쓰는 잠금 정보
export const hatLocks = {
  unlocked: n => P.hatUnlocked(save, n),
  hint: n => P.unlockHint(P.HAT_UNLOCK[n] ?? { lv: 99 }, true),
  short: n => (P.HAT_UNLOCK[n]?.ach ? '도전 과제' : `레벨 ${P.HAT_UNLOCK[n]?.lv ?? 99}`),
  isNew: n => save.fresh.hats.includes(n),
  seen: () => { if (save.fresh.hats.length) { save.fresh.hats = []; persist(); renderProfile(); } },
};

// 다음에 열리는 레벨 보상 (없으면 null)
function nextUnlock() {
  const lv = level().level;
  const all = [
    ...P.HAT_UNLOCK.map((r, n) => ({ lv: r.lv, text: `${hats[n]?.icon ?? '🎩'} ${hats[n]?.name ?? '모자'}` })),
    ...P.TITLES.map(r => ({ lv: r.lv, text: `칭호 「${r.name}」` })),
  ].filter(u => u.lv > lv);
  if (!all.length) return null;
  const at = Math.min(...all.map(u => u.lv));
  return { lv: at, text: all.filter(u => u.lv === at).map(u => u.text).join(' · ') };
}

// ---------- 처음 화면: 레벨 막대와 메뉴 ----------
function renderProfile() {
  const li = level(), bar = $('btn-profile');
  if (!bar) return;
  bar.querySelector('.pf-lv').innerHTML = `<small>Lv</small>${li.level}`;
  bar.querySelector('.pf-title').textContent = titleOf(save.title) || '칭호 없음';
  bar.querySelector('.pf-bar i').style.width = `${Math.round(li.pct * 100)}%`;
  bar.querySelector('.pf-xp').textContent = li.need ? `${li.cur} / ${li.need} XP` : '최고 레벨';
  const badge = (name, text) => {
    const b = document.querySelector(`.meta-row [data-tab="${name}"] .badge`);
    b.hidden = !text; b.textContent = text;
  };
  const left = save.daily ? save.daily.list.filter(d => !d.done).length : 0;
  badge('daily', left ? String(left) : '');
  badge('dex', cards.size ? `${P.dexCount(save)}/${cards.size}` : '');
  badge('ach', '');
  const rk = $('ranked-tier'), T = P.TIERS[P.tierOf(save.rp)];
  if (rk) rk.textContent = save.stats.ranked ? `${T.icon} ${T.name} · ${save.rp}점` : '배치 전';
  const hatsBtn = $('btn-hats');
  if (hatsBtn) hatsBtn.classList.toggle('has-new', save.fresh.hats.length > 0);
  bar.classList.toggle('has-new', save.fresh.titles.length > 0);
}

// ---------- 창 ----------
function open(name) {
  tab = name;
  if (P.ensureDaily(save)) persist();
  if (tab === 'stats' && save.fresh.titles.length) { // 새 칭호 표시는 한 번 보면 지움
    setTimeout(() => { save.fresh.titles = []; persist(); renderProfile(); }, 0);
  }
  const box = $('meta');
  box.querySelectorAll('.meta-tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  box.querySelector('.meta-body').innerHTML = { daily: dailyHtml, ach: achHtml, dex: dexHtml, stats: statsHtml }[tab]();
  box.querySelector('.meta-body').scrollTop = 0;
  box.hidden = false;
  sound?.play('click');
}

const barHtml = (v, goal, cls = '') => `<span class="m-bar ${cls}"><i style="width:${Math.min(100, Math.round((v / goal) * 100))}%"></i><em>${v} / ${goal}</em></span>`;

function dailyHtml() {
  const d = save.daily;
  const rows = d.list.map(m => `
    <div class="m-row ${m.done ? 'done' : ''}">
      <span class="m-icon">${m.done ? '✅' : P.missionIcon(m)}</span>
      <span class="m-main"><b>${P.missionText(m)}</b>${barHtml(m.prog, m.goal)}</span>
      <span class="m-reward">+${P.MISSION_XP} XP</span>
    </div>`).join('');
  const all = d.list.every(m => m.done);
  return `<div class="m-head">오늘의 미션 <small>게임을 끝까지 하면 진행돼요 · 자정에 새 미션으로 바뀌어요</small></div>
    ${rows}
    <div class="m-row bonus ${all ? 'done' : ''}">
      <span class="m-icon">${all ? '🎉' : '🎁'}</span>
      <span class="m-main"><b>오늘 미션 3개 모두 끝내기</b>${barHtml(d.list.filter(m => m.done).length, d.list.length)}</span>
      <span class="m-reward">+${P.MISSION_BONUS_XP} XP</span>
    </div>`;
}

// 도전 과제를 끝내면 같이 열리는 것
function achRewards(a) {
  const out = [`+${a.xp} XP`];
  P.TITLES.forEach(t => { if (t.ach === a.id) out.push(`칭호 「${t.name}」`); });
  P.HAT_UNLOCK.forEach((r, n) => { if (r.ach === a.id) out.push(`${hats[n]?.icon ?? '🎩'} ${hats[n]?.name ?? '모자'}`); });
  return out;
}

function achHtml() {
  const total = cards.size || 47;
  const list = P.ACHIEVEMENTS.map(a => ({ a, pr: P.achProgress(a, save, total) }));
  const done = list.filter(x => x.pr.done).length;
  // 끝낸 것은 아래로, 진행이 많이 된 것은 위로
  list.sort((x, y) => (x.pr.done - y.pr.done) || (y.pr.value / y.pr.goal - x.pr.value / x.pr.goal));
  return `<div class="m-head">도전 과제 <small>${done} / ${list.length} 달성</small></div>` + list.map(({ a, pr }) => `
    <div class="m-row ${pr.done ? 'done' : ''}">
      <span class="m-icon">${a.icon}</span>
      <span class="m-main"><b>${a.name}</b><small>${a.desc}</small>${pr.done ? '' : barHtml(pr.value, pr.goal)}</span>
      <span class="m-reward">${pr.done ? '<i class="m-check">달성!</i>' : ''}${achRewards(a).map(r => `<i>${r}</i>`).join('')}</span>
    </div>`).join('');
}

const RARITY_ORDER = ['mythic', 'legend', 'rare', 'common'];
function dexHtml() {
  if (!cards.size) return '<div class="m-head">카드 도감</div><div class="m-empty">카드 목록을 불러오는 중이에요…</div>';
  const found = P.dexCount(save);
  const sections = RARITY_ORDER.map(r => {
    const list = [...cards.values()].filter(c => c.rarity === r);
    if (!list.length) return '';
    const have = list.filter(c => save.cards[c.id]).length;
    return `<div class="dex-head rarity-${r}"><b>${RARITY_NAME[r]}</b><small>${have} / ${list.length}</small></div>
      <div class="dex-grid">${list.map(c => (save.cards[c.id]
        ? `<button class="dex-card rarity-${r} ${dexPick === c.id ? 'on' : ''}" data-card="${c.id}"><span>${cardIcon(c.id)}</span><b>${c.name}</b><i>×${save.cards[c.id]}</i></button>`
        : `<button class="dex-card unknown rarity-${r}" data-card=""><span>?</span><b>???</b></button>`)).join('')}</div>`;
  }).join('');
  const c = cards.get(dexPick);
  const detail = c && save.cards[c.id]
    ? `<div class="dex-detail rarity-${c.rarity}"><span>${cardIcon(c.id)}</span><div><b>${c.name}</b> <small>${RARITY_NAME[c.rarity]} · ${KIND_NAME[c.kind]} · ${save.cards[c.id]}번 고름</small><p>${c.desc.replace(/\n/g, ' · ')}</p></div></div>`
    : '<div class="dex-detail empty">게임에서 고른 카드가 여기에 모여요. 카드를 누르면 설명이 보여요.</div>';
  return `<div class="m-head">카드 도감 <small>${found} / ${cards.size}장 발견</small></div>${detail}${sections}`;
}

function statsHtml() {
  const li = level(), s = save.stats, nx = nextUnlock();
  const rate = s.games ? Math.round((s.wins / s.games) * 100) : 0;
  const cell = (icon, name, value) => `<div class="st-cell"><span>${icon}</span><b>${value}</b><small>${name}</small></div>`;
  const titles = P.TITLES.map((t, n) => {
    const openNow = P.titleUnlocked(save, n);
    return `<button class="title-pick ${n === save.title ? 'on' : ''} ${openNow ? '' : 'locked'}" data-title="${openNow ? n : ''}" ${openNow ? '' : `title="${P.unlockHint(t)} 달성하면 열려요"`}>
      ${n === 0 ? '없음' : t.name}${openNow ? (save.fresh.titles.includes(n) ? '<b class="new-dot">NEW</b>' : '') : `<small>🔒 ${P.unlockHint(t)}</small>`}</button>`;
  }).join('');
  return `<div class="st-level">
      <span class="pf-lv big"><small>Lv</small>${li.level}</span>
      <div class="st-level-main">
        <b>${titleOf(save.title) || '칭호 없음'}</b>
        <span class="m-bar xp"><i style="width:${Math.round(li.pct * 100)}%"></i><em>${li.need ? `${li.cur} / ${li.need} XP` : '최고 레벨'}</em></span>
        <small>${nx ? `다음 보상 — 레벨 ${nx.lv}: ${nx.text}` : '레벨 보상을 모두 받았어요'}</small>
      </div>
    </div>
    <div class="st-grid">
      ${cell('🎮', '끝까지 한 게임', s.games)}${cell('🏆', '우승', s.wins)}${cell('📈', '우승 비율', rate + '%')}${cell('🔥', '최고 연승', s.bestStreak)}
      ${cell(P.TIERS[P.tierOf(save.rp)].icon, `경쟁전 ${P.TIERS[P.tierOf(save.rp)].name}`, s.ranked ? save.rp + '점' : '배치 전')}${cell('🎖️', '최고 랭크', s.ranked ? P.TIERS[save.peakTier].name : '-')}${cell('⚔️', '경쟁전 판 수', s.ranked)}${cell('🏅', '경쟁전 우승', s.rankedWins)}
      ${cell('💥', '떨어뜨림', s.kos)}${cell('⚡', '최고 연속 KO', s.bestMulti)}${cell('👊', '맞힌 횟수', s.hits)}${cell('🪂', '떨어짐', s.falls)}
    </div>
    <div class="m-head">칭호 고르기 <small>대기실과 순위표에서 이름 옆에 보여요</small></div>
    <div class="title-grid">${titles}</div>`;
}

function onBodyClick(e) {
  const card = e.target.closest('.dex-card');
  if (card) {
    dexPick = card.dataset.card || null;
    const body = $('meta').querySelector('.meta-body'), top = body.scrollTop;
    body.innerHTML = dexHtml();
    body.scrollTop = top;
    return;
  }
  const t = e.target.closest('.title-pick');
  if (t && t.dataset.title !== '') {
    save.title = Number(t.dataset.title);
    persist();
    renderProfile();
    const body = $('meta').querySelector('.meta-body'), top = body.scrollTop;
    body.innerHTML = statsHtml();
    body.scrollTop = top;
    sound?.play('click');
  }
}

// ---------- 게임 끝: 보상 ----------
export function resetMatch() {
  pendingReport = null;
  const el = document.querySelector('#results .rewards');
  if (el) { el.hidden = true; el.innerHTML = ''; el.closest('.results-box').classList.remove('has-rewards'); }
}

// 게임이 끝난 순간 한 번: 보상을 계산해 바로 저장한다 (화면에는 순위 화면이 뜰 때 showRewards로)
// s: 서버 상태(gameOver), myId: 내 id
let pendingReport = null;
export function onGameOver(s, myId) {
  const me = s.results?.find(r => r.id === myId);
  if (!me || !s.match || rewardedMatch === s.match.id) return;
  rewardedMatch = s.match.id;
  const report = P.applyMatch(save, s.match, me, { cards });
  if (report.dup) return; // 새로고침 뒤 다시 들어온 경우: 이미 받음
  persist();
  renderProfile();
  pendingReport = report;
}

export function showRewards() {
  const r = pendingReport;
  pendingReport = null;
  if (!r) return;
  const el = document.querySelector('#results .rewards');
  const chips = [];
  if (r.ranked) { // 경쟁전 점수: 맨 위 큰 줄
    const k = r.ranked, A = P.TIERS[k.tierAfter], tp = P.tierProgress(k.after);
    const moved = k.tierAfter > k.tierBefore ? `<b class="rk-up">${A.icon} ${A.name} 승급!</b>` : k.tierAfter < k.tierBefore ? `<b class="rk-down">${A.name}(으)로 강등</b>` : '';
    chips.push(`<div class="rk-line" style="--tc:${A.color}"><span class="rk-badge">${A.icon}</span><span class="rk-main"><b>${A.name} ${k.after}점 <i class="${k.delta >= 0 ? 'plus' : 'minus'}">${k.delta >= 0 ? '+' : ''}${k.delta}</i></b>${moved}<span class="m-bar"><i style="width:${Math.round(tp.pct * 100)}%"></i><em>${tp.next ? `다음 랭크까지 ${tp.next}점` : '최고 랭크'}</em></span></span></div>`);
    if (k.tierAfter > k.tierBefore) setTimeout(() => sound?.play('levelup'), 600);
  }
  if (r.levelUps > 0) chips.push(`<i class="chip lv">🎊 레벨 ${r.after.level} 달성!</i>`);
  for (const n of r.hats) chips.push(`<i class="chip unlock">${hats[n]?.icon ?? '🎩'} 새 모자 「${hats[n]?.name ?? ''}」</i>`);
  for (const n of r.titles) chips.push(`<i class="chip unlock">🏷️ 새 칭호 「${titleOf(n)}」</i>`);
  for (const id of r.achievements) { const a = P.ACHIEVEMENTS.find(x => x.id === id); chips.push(`<i class="chip ach">${a.icon} 도전 과제 「${a.name}」 +${a.xp}</i>`); }
  for (const m of r.missions) if (m.justDone) chips.push(`<i class="chip mission">✅ 미션 「${P.missionText(m)}」 +${P.MISSION_XP}</i>`);
  if (r.bonus) chips.push(`<i class="chip mission">🎁 오늘 미션 모두 완료 +${r.bonus}</i>`);
  if (r.newCards.length) chips.push(`<i class="chip dex">🃏 도감에 새 카드 ${r.newCards.length}장</i>`);
  const todo = r.missions.filter(m => !m.done);
  const nx = nextUnlock();
  const lines = r.lines.map(l => `<span>${l.label} <b>+${l.xp}</b></span>`).join('')
    + (r.mult !== 1 ? `<span class="mult">봇 연습 ×${r.mult}</span>` : '');
  el.innerHTML = `
    <div class="rw-top">
      <span class="pf-lv"><small>Lv</small><b class="rw-lvnum">${r.before.level}</b></span>
      <span class="m-bar xp"><i style="width:${Math.round(r.before.pct * 100)}%"></i><em class="rw-xptext"></em></span>
      <span class="rw-gain">+<b>0</b> XP</span>
    </div>
    <div class="rw-lines">${lines}</div>
    ${r.ranked ? chips.shift() : ''}
    ${chips.length ? `<div class="rw-chips">${chips.join('')}</div>` : ''}
    <div class="rw-next">${todo.length ? `📋 남은 미션: ${todo.map(m => `${P.missionText(m)} (${m.prog}/${m.goal})`).join(' · ')}` : '📋 오늘 미션을 모두 끝냈어요!'}${nx ? `<br>🎁 레벨 ${nx.lv}에 ${nx.text}` : ''}</div>`;
  el.hidden = false;
  el.closest('.results-box').classList.add('has-rewards');

  // 경험치가 차오르는 연출: 숫자가 올라가고, 레벨이 오를 때마다 막대가 다시 처음부터
  const fill = el.querySelector('.m-bar i'), lvNum = el.querySelector('.rw-lvnum'), gain = el.querySelector('.rw-gain b'), text = el.querySelector('.rw-xptext');
  const t0 = performance.now(), dur = 900 + Math.min(1200, r.levelUps * 500);
  const startXp = save.xp - r.gained;
  let shownLevel = r.before.level;
  const step = now => {
    if (!el.isConnected || el.hidden) return;
    const k = Math.min(1, (now - t0 - 500) / dur);
    if (k < 0) { requestAnimationFrame(step); return; }
    const eased = 1 - (1 - k) ** 3;
    const li = P.levelInfo(startXp + r.gained * eased);
    gain.textContent = Math.round(r.gained * eased);
    fill.style.width = `${Math.round(li.pct * 100)}%`;
    text.textContent = li.need ? `${li.cur} / ${li.need}` : '최고 레벨';
    if (li.level !== shownLevel) {
      shownLevel = li.level;
      lvNum.textContent = li.level;
      lvNum.parentElement.classList.remove('bump'); void lvNum.offsetWidth; lvNum.parentElement.classList.add('bump');
      sound?.play('levelup');
    }
    if (k < 1) requestAnimationFrame(step);
    else if (r.achievements.length || r.hats.length || r.titles.length) sound?.play('unlock');
  };
  requestAnimationFrame(step);
}
