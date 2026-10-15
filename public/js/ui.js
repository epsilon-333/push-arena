// 화면 UI: 표지, 능력 카드, HUD, 이름표

// 카드 아이콘 (서버 카드 id 기준, 화면 표현만 담당)
export const ICONS = {
  strong_arm: '💪', iron_sole: '🦶', swift_feet: '👟', rapid: '⚡', long_arm: '🧤', resilience: '💚', giant_heart: '❤️‍🔥',
  dash: '💨', shield: '🛡️', shockwave: '💥', swap: '🔄', slam: '⬇️', blackhole: '🌀',
  gambler: '🎲', edge_king: '👑', ice_trail: '❄️', reflect: '🪞', sticky: '🍯',
  glass_cannon: '💣', slow_tank: '🐢', rampage: '🔥', one_punch: '👊', feather: '🪶',
};
const SKILL_CARD = { dash: 'dash', shield: 'shield', shockwave: 'shockwave', swap: 'swap', slam: 'slam', blackhole: 'blackhole' };
const KIND_NAME = { stat: '스탯', skill: '스킬', rule: '규칙', trade: '트레이드오프' };
const RARITY_NAME = { common: '일반', rare: '희귀', legend: '전설' };
const icon = id => ICONS[id] ?? '✨';

// 감정 이모티콘 / 도발 (서버는 번호만 안다. 순서를 바꾸면 안 됨 — 서버 EMOTE_COUNT와 개수 맞춤)
// face = 캐릭터 표정, gesture = 몸동작 (character.js)
export const EMOTES = [
  { icon: '😆', text: 'ㅋㅋㅋ', face: 'happy', gesture: 'dance', name: '신남' },
  { icon: '😡', text: '으으!', face: 'angry', gesture: 'flex', name: '화남' },
  { icon: '😱', text: '헉!', face: 'surprised', name: '놀람' },
  { icon: '👍', text: '굿!', face: 'happy', name: '좋아' },
  { icon: '😜', text: '메롱~', face: 'happy', gesture: 'taunt', name: '메롱' },
  { icon: '👋', text: '잘 가~', face: 'happy', gesture: 'wave', name: '잘 가' },
  { icon: '🫵', text: '덤벼!', face: 'angry', gesture: 'point', name: '덤벼' },
  { icon: '💪', text: '약하다!', face: 'angry', gesture: 'flex', name: '힘자랑' },
  { icon: '🐔', text: '겁쟁이~', face: 'happy', gesture: 'taunt', name: '겁쟁이' },
  { icon: '😴', text: 'zzZ', face: 'normal', name: '졸려' },
  { icon: '🤡', text: '삐에로~', face: 'happy', gesture: 'dance', name: '놀리기' },
  { icon: '😭', text: '엉엉', face: 'surprised', name: '엉엉' },
  { icon: '🙏', text: '살려줘!', face: 'surprised', gesture: 'wave', name: '살려줘' },
  { icon: '🎉', text: '나이스!', face: 'happy', gesture: 'dance', name: '축하' },
  { icon: '❤️', text: '좋아해', face: 'happy', name: '하트' },
  { icon: '😏', text: '훗', face: 'normal', gesture: 'point', name: '훗' },
];
const DEFAULT_SLOTS = [0, 6, 4, 5]; // 신남, 덤벼, 메롱, 잘 가

// 내가 들고 갈 이모티콘 4개 (처음 화면에서 고름, 브라우저에 저장)
let slots = DEFAULT_SLOTS;
try {
  const saved = JSON.parse(localStorage.getItem('emoteSlots'));
  if (Array.isArray(saved) && saved.length === 4 && saved.every(n => EMOTES[n])) slots = saved;
} catch {}
export const emoteSlot = i => slots[i];

let onEmoteCb = null;
function renderEmoteBar() {
  $('emotes').innerHTML = slots.map((n, i) => `<button data-n="${n}" title="${EMOTES[n].name}">${EMOTES[n].icon}<kbd>${i + 1}</kbd></button>`).join('');
}
export function initEmoteBar(onEmote) {
  onEmoteCb = onEmote;
  renderEmoteBar();
  $('emotes').onclick = e => {
    const b = e.target.closest('button');
    if (b) { onEmoteCb(Number(b.dataset.n)); b.blur(); } // 포커스가 남으면 Space가 버튼을 다시 누름
  };
}

// 처음 화면: 이모티콘 고르기 (16개 중 4개, 누른 순서대로 1~4번)
export function initEmotePicker() {
  const box = $('emote-picker'), grid = box.querySelector('.ep-grid');
  let picking = [...slots];
  const draw = () => {
    grid.innerHTML = EMOTES.map((e, n) => {
      const order = picking.indexOf(n);
      return `<button data-n="${n}" class="${order >= 0 ? 'on' : ''}">
        <span class="ep-icon">${e.icon}</span><span class="ep-text">${e.text}</span>
        ${order >= 0 ? `<b class="ep-order">${order + 1}</b>` : ''}</button>`;
    }).join('');
    box.querySelector('.ep-count').textContent = `${picking.length}/4`;
    box.querySelector('.ep-done').disabled = picking.length !== 4;
  };
  grid.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    const n = Number(b.dataset.n), i = picking.indexOf(n);
    if (i >= 0) picking.splice(i, 1);
    else if (picking.length < 4) picking.push(n);
    draw();
  };
  $('btn-emotes').onclick = () => { picking = [...slots]; draw(); box.hidden = false; };
  box.querySelector('.ep-done').onclick = () => {
    slots = [...picking];
    try { localStorage.setItem('emoteSlots', JSON.stringify(slots)); } catch {}
    renderEmoteBar();
    box.hidden = true;
  };
  box.querySelector('.ep-cancel').onclick = () => { box.hidden = true; };
}

const $ = id => document.getElementById(id);
// 내용이 같으면 다시 그리지 않음 (폰에서 렉 줄이기)
function setHtml(el, html) { if (el._html !== html) { el._html = html; el.innerHTML = html; } }

let catalog = new Map(), winScore = 5, skillCdMax = {};
export function setCatalog(list, win, cds) {
  catalog = new Map(list.map(a => [a.id, a]));
  winScore = win;
  skillCdMax = cds ?? {};
}
const skillName = skill => [...catalog.values()].find(a => a.skill === skill)?.name ?? skill;

// ---------- 표지 ----------
export function initTitle(onStart) {
  const input = $('nickname');
  try { input.value = localStorage.getItem('nickname') ?? ''; } catch {}
  let started = false;
  const start = mode => {
    if (started) return; // 여러 번 눌러도 한 번만 접속
    started = true;
    const name = input.value.trim() || `플레이어${Math.floor(Math.random() * 900 + 100)}`;
    try { localStorage.setItem('nickname', name); } catch {}
    $('title').classList.add('leaving');
    document.body.classList.add('in-game');
    setTimeout(() => { $('title').hidden = true; $('hud').hidden = false; }, 500);
    onStart(name, mode);
  };
  $('start').onclick = () => start('match');
  $('practice').onclick = () => start('practice');
  input.onkeydown = e => { if (e.key === 'Enter') start('match'); };
  input.focus();
}

// ---------- 능력 카드 ----------
function cardHtml(o) {
  const nl = t => t.replace(/\n/g, '<br>'); // 설명의 줄바꿈
  return `
    <div class="card-inner">
      <div class="face back"><div class="back-mark">P</div></div>
      <div class="face front kind-${o.kind} rarity-${o.rarity}">
        <div class="card-top">
          <span class="card-name">${o.name}</span>
          <span class="card-rarity">${RARITY_NAME[o.rarity]}</span>
        </div>
        <div class="card-art"><span>${icon(o.id)}</span>${o.skill ? `<b class="card-key">스킬</b>` : ''}</div>
        <div class="card-desc">${nl(o.desc)}</div>
        <div class="card-foot">
          <span class="card-kind">${KIND_NAME[o.kind]}</span>
          ${o.tags.map(t => `<span class="card-tag">${t}</span>`).join('')}
        </div>
      </div>
    </div>`;
}

// mySkills: [Q 스킬, E 스킬] (없으면 null). onPick(cardId, slot)
export function showOffers(offers, mySkills, onPick) {
  const root = $('cards'), list = root.querySelector('.list');
  list.innerHTML = '';
  root.classList.remove('done');
  $('swap-skill').hidden = true;
  const choose = (card, o, slot) => {
    onPick(o.id, slot);
    card.classList.add('chosen');
    root.classList.add('done');
    $('swap-skill').hidden = true;
  };
  offers.forEach((o, i) => {
    const card = document.createElement('button');
    card.className = `card rarity-${o.rarity}`;
    card.style.setProperty('--i', i);
    card.innerHTML = cardHtml(o);
    // 마우스 따라 살짝 기울기
    card.onmousemove = e => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - 0.5) * -14}deg`);
      card.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 14}deg`);
    };
    card.onmouseleave = () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); };
    card.onclick = () => {
      if (root.classList.contains('done') || !card.classList.contains('flipped')) return;
      // 스킬 칸이 다 찼으면 바꿀 칸을 고르게 한다
      if (o.skill && mySkills.every(Boolean)) showSkillSwap(o, mySkills, slot => choose(card, o, slot));
      else choose(card, o);
    };
    list.appendChild(card);
    setTimeout(() => card.classList.add('dealt'), 50 + i * 120);    // 아래에서 날아옴
    setTimeout(() => card.classList.add('flipped'), 500 + i * 160); // 뒤집기
  });
  root.hidden = false;
}

function showSkillSwap(card, mySkills, onSlot) {
  const box = $('swap-skill');
  box.innerHTML = `<div class="swap-title">${icon(card.id)} ${card.name} — 어떤 스킬과 바꿀까요?</div>
    <div class="swap-row">
      ${mySkills.map((sk, i) => `<button data-slot="${i}"><kbd>${'QE'[i]}</kbd> ${icon(SKILL_CARD[sk])} ${skillName(sk)}</button>`).join('')}
      <button data-slot="cancel" class="cancel">취소</button>
    </div>`;
  box.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.slot === 'cancel') { box.hidden = true; return; }
    onSlot(Number(b.dataset.slot));
  };
  box.hidden = false;
}

// ---------- 스킬 칸 (Q·E) ----------
export function updateSkillHud(me) {
  const el = $('skills');
  if (!me) { el.hidden = true; return; }
  el.hidden = false;
  setHtml(el, [0, 1].map(i => {
    const sk = me.sk?.[i];
    if (!sk) return `<div class="slot empty" data-i="${i}"><kbd>${'QE'[i]}</kbd></div>`;
    const max = skillCdMax[sk] || 1, cd = me.cd[i];
    const pct = Math.round(Math.min(100, (cd / max) * 100) / 2) * 2; // 2% 단위 (다시 그리는 횟수 줄임)
    return `<div class="slot ${cd > 0 ? 'cooling' : 'ready'}" data-i="${i}" title="${skillName(sk)}">
      <span class="slot-icon">${icon(SKILL_CARD[sk])}</span>
      <div class="slot-cd" style="--p:${pct}%"></div>
      ${cd > 0 ? `<span class="slot-num">${Math.ceil(cd)}</span>` : ''}
      <kbd>${'QE'[i]}</kbd>
    </div>`;
  }).join(''));
}

function updateCards(s) {
  const root = $('cards');
  if (s.phase !== 'picking') { root.hidden = true; return; }
  if (root.hidden) return;
  const waiting = s.players.filter(p => !p.pk).length;
  root.querySelector('.timer').textContent = root.classList.contains('done')
    ? `다른 플레이어 기다리는 중 · ${waiting}명 남음`
    : `${Math.ceil(s.timer)}초 안에 선택하세요`;
}

// ---------- HUD ----------
const RULES = {
  collapse: { icon: '🧱', text: '바닥 붕괴', sub: '밟으면 금이 가고, 다시 밟으면 무너져요' },
  tilt: { icon: '⚖️', text: '기울기', sub: '사람이 몰린 쪽으로 기울어요' },
  ice: { icon: '🧊', text: '빙판길', sub: '미끄러워서 멈추기 힘들어요' },
};
let lastMessage = '';

export function setMessage(text) {
  const el = $('message');
  if (text === lastMessage) return;
  lastMessage = text;
  el.textContent = text;
  el.classList.remove('pop');
  void el.offsetWidth; // 애니메이션 재시작
  if (text) el.classList.add('pop');
}

export function renderHud(s, myId) {
  updateCards(s);

  let msg = s.message;
  if (s.phase === 'countdown') msg = String(Math.ceil(s.timer) || '');
  else if (s.phase === 'playing' || s.phase === 'picking') msg = '';
  setMessage(msg);
  $('message').classList.toggle('big', s.phase === 'countdown');

  const rule = RULES[s.rule];
  const showRule = rule && (s.phase === 'countdown' || s.phase === 'playing');
  $('rule').hidden = !showRule;
  if (showRule) setHtml($('rule'), `<span class="rule-icon">${rule.icon}</span><b>${rule.text}</b><span>${rule.sub}</span>`);

  // 점수판: 내용이 바뀔 때만 다시 그림
  setHtml($('scoreboard'), [...s.players].sort((a, b) => b.sc - a.sc).map(p => {
    const pips = Array.from({ length: winScore }, (_, i) => `<i class="${i < p.sc ? 'on' : ''}"></i>`).join('');
    const abil = p.ab.map(id => `<span title="${catalog.get(id)?.name ?? id}">${icon(id)}</span>`).join('');
    return `<div class="row ${p.id === myId ? 'me' : ''} ${p.al ? '' : 'out'}">
      <span class="dot" style="background:${p.color}"></span>
      <span class="pname">${p.name}</span>
      <span class="pips">${pips}</span>
      <span class="abil">${abil}</span>
    </div>`;
  }).join(''));
}

// ---------- 연결 중 표시 ----------
export function setConnecting(title, sub = '') {
  const el = $('connecting');
  el.hidden = !title;
  if (title) { el.querySelector('.conn-title').textContent = title; el.querySelector('.conn-sub').textContent = sub; }
}

// ---------- 대기실 ----------
let startPressedAt = 0, botsOn = true;
export function initLobby(onStart, onBots) {
  $('btn-start').onclick = () => { onStart(); startPressedAt = performance.now(); };
  $('btn-bots').onclick = () => { onBots(!botsOn); $('btn-bots').blur(); };
}

export function updateLobby(s, myId) {
  const el = $('lobby');
  el.hidden = s.phase !== 'waiting';
  if (el.hidden) { startPressedAt = 0; return; }
  botsOn = s.bots;
  const humans = s.players.filter(p => !p.bot);
  const canStart = s.bots || humans.length >= 2;
  setHtml(el.querySelector('.lobby-list'), humans.map(p =>
    `<div class="lobby-row"><span class="dot" style="background:${p.color}"></span>${p.name}${p.id === myId ? ' (나)' : ''}</div>`).join('')
    + Array.from({ length: Math.max(0, 4 - humans.length) }, () =>
      `<div class="lobby-row empty">${s.bots ? '빈자리 · 시작하면 AI' : '빈자리'}</div>`).join(''));
  // 빈자리 AI 채우기 켬/끔 (방 안의 누구나 바꿀 수 있음)
  const bots = $('btn-bots');
  bots.textContent = s.bots ? '🤖 빈자리 AI 채우기: 켬' : '🙅 빈자리 AI 채우기: 끔';
  bots.classList.toggle('off', !s.bots);
  // 시작 버튼: 누른 직후 1.5초는 "시작하는 중…", AI를 끄면 2명 이상일 때만
  const pressing = performance.now() - startPressedAt < 1500;
  const btn = $('btn-start');
  btn.disabled = !canStart || pressing;
  btn.textContent = !canStart ? '2명 이상 모이면 시작' : pressing ? '시작하는 중…' : '시작하기';
  el.querySelector('.lobby-timer').textContent = s.bots
    ? `${s.lobby}초 뒤 자동 시작 · 친구는 같은 주소로 들어오면 돼요`
    : 'AI 끔 · 자동으로 시작하지 않아요 · 친구는 같은 주소로 들어오면 돼요';
}

// ---------- 최종 순위 ----------
const MEDAL = ['🥇', '🥈', '🥉', '💩']; // 4위는 똥
let resultsKey = '';
export function initResults(onRestart, onExit) {
  $('btn-restart').onclick = () => { onRestart(); $('btn-restart').disabled = true; };
  $('btn-exit').onclick = onExit;
}

// 최종 승리 문구를 잠깐 보여준 뒤(2.5초) 순위 화면
export function updateResults(s, myId, showAfter) {
  const el = $('results');
  const show = s.phase === 'gameOver' && s.results && performance.now() > showAfter;
  if (!show) {
    el.hidden = true;
    if (s.phase !== 'gameOver') { $('btn-restart').disabled = false; resultsKey = ''; }
    return;
  }
  el.hidden = false;
  const key = JSON.stringify(s.results);
  if (key !== resultsKey) { // 내용이 바뀔 때만 다시 그림
    resultsKey = key;
    el.querySelector('.results-list').innerHTML = s.results.map(r => `
      <div class="result-row ${r.id === myId ? 'me' : ''} ${r.rank === 1 ? 'first' : ''}">
        <span class="r-rank">${MEDAL[r.rank - 1] ?? r.rank + '위'}</span>
        <span class="dot" style="background:${r.color}"></span>
        <span class="r-name">${r.name}${r.id === myId ? ' (나)' : ''}</span>
        <span class="r-stat" title="이긴 라운드">🏁 ${r.score}</span>
        <span class="r-stat" title="떨어뜨린 수">💥 ${r.kills}</span>
        <span class="r-abil">${r.ab.map(icon).join('')}</span>
      </div>`).join('');
  }
  const humans = s.players.filter(p => p.id >= 0);
  const ready = humans.filter(p => p.rd).length;
  $('btn-restart').textContent = $('btn-restart').disabled ? `준비 완료 (${ready}/${humans.length})` : `다시 하기 (${ready}/${humans.length})`;
  el.querySelector('.results-timer').textContent = `${Math.ceil(s.timer)}초 뒤 자동으로 새 게임`;
}

// ---------- 머리 위 이름표 ----------
export function createLabel() {
  const el = document.createElement('div');
  el.className = 'label';
  el.innerHTML = `<div class="bubble" hidden></div><div class="name"></div><div class="hpbar"><div></div></div>`;
  $('labels').appendChild(el);
  return el;
}

export function updateLabel(el, p, isMe, x, y) {
  el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  const bubble = el.querySelector('.bubble');
  if (p.em >= 0 && el.dataset.em !== String(p.em)) {
    const em = EMOTES[p.em];
    bubble.innerHTML = em ? `<span class="b-icon">${em.icon}</span><span class="b-text">${em.text}</span>` : '';
    bubble.hidden = false;
    bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
  } else if (p.em < 0) bubble.hidden = true;
  el.dataset.em = p.em;
  const name = el.querySelector('.name');
  if (name.textContent !== p.name) name.textContent = p.name;
  // 같은 값이면 건드리지 않음 (매 프레임 호출됨)
  if (el.dataset.color !== p.color) { el.dataset.color = p.color; name.style.background = p.color; }
  el.classList.toggle('me', isMe);
  el.classList.toggle('stunned', p.st);
  if (el.dataset.hp !== String(p.hp)) { el.dataset.hp = p.hp; el.querySelector('.hpbar > div').style.width = `${p.hp}%`; }
}
