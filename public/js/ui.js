// 화면 UI: 표지, 능력 카드, HUD, 이름표

// 카드 아이콘 (서버 카드 id 기준, 화면 표현만 담당)
export const ICONS = {
  strong_arm: '💪', iron_sole: '🦶', swift_feet: '👟', rapid: '⚡', long_arm: '🧤', resilience: '💚', giant_heart: '❤️‍🔥',
  elephant: '🐘', banana: '🍌', mirror: '🙃', magnet: '🧲', ghost: '👻', quake: '🌋',
  sneeze: '🤧', revenge: '🎯', territory: '🚩', king: '🤴',
  dash: '💨', shield: '🛡️', shockwave: '💥', swap: '🔄', slam: '⬇️', blackhole: '🌀',
  gambler: '🎲', edge_king: '👑', ice_trail: '❄️', reflect: '🪞', sticky: '🍯',
  mine: '🧨', jump: '🦘', restore: '🛠️', teleport: '🌠', icezone: '🥶', bowling: '🎳', clone: '👥',
  grit: '😤', combo: '🔗', quickfire: '🔫',
  giant: '🦖', timestop: '⏳', meteor: '☄️', phoenix: '🦅',
  glass_cannon: '💣', slow_tank: '🐢', rampage: '🔥', one_punch: '👊', feather: '🪶',
};
const SKILL_CARD = { dash: 'dash', shield: 'shield', shockwave: 'shockwave', swap: 'swap', slam: 'slam', blackhole: 'blackhole',
  banana: 'banana', mirror: 'mirror', magnet: 'magnet', ghost: 'ghost', quake: 'quake',
  mine: 'mine', jump: 'jump', restore: 'restore', teleport: 'teleport', icezone: 'icezone', bowling: 'bowling', clone: 'clone',
  giant: 'giant', timestop: 'timestop', meteor: 'meteor', phoenix: 'phoenix' };
const KIND_NAME = { stat: '스탯', skill: '스킬', rule: '규칙', trade: '트레이드오프' };
const RARITY_NAME = { common: '일반', rare: '희귀', legend: '전설', mythic: '신화' };
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
  // 여기부터는 고를 수 없는 칸 (서버가 직접 띄움). 서버 EMOTE_COUNT 다음 번호
  { icon: '🤧', text: '에취!', face: 'surprised', name: '재채기', hidden: true },
];
const PICKABLE = EMOTES.filter(e => !e.hidden).length;
const DEFAULT_SLOTS = [0, 6, 4, 5]; // 신남, 덤벼, 메롱, 잘 가

// 내가 들고 갈 이모티콘 4개 (처음 화면에서 고름, 브라우저에 저장)
let slots = DEFAULT_SLOTS;
try {
  const saved = JSON.parse(localStorage.getItem('emoteSlots'));
  if (Array.isArray(saved) && saved.length === 4 && saved.every(n => n < PICKABLE)) slots = saved;
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
    grid.innerHTML = EMOTES.slice(0, PICKABLE).map((e, n) => {
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

// 처음 화면: 모자 고르기 (브라우저에 저장). onChange(n): 미리보기 캐릭터에 씌움
let hat = 0;
try { hat = Number(localStorage.getItem('hat')) || 0; } catch {}
export const getHat = () => hat;
export function initHatPicker(hats, onChange) {
  if (!hats[hat]) hat = 0;
  const box = $('hat-picker'), grid = box.querySelector('.hp-grid');
  const draw = () => {
    grid.innerHTML = hats.map((h, n) => `<button data-n="${n}" class="${n === hat ? 'on' : ''}">
      <span class="ep-icon">${h.icon}</span><span class="ep-text">${h.name}</span></button>`).join('');
  };
  grid.onclick = e => {
    const b = e.target.closest('button');
    if (!b) return;
    hat = Number(b.dataset.n);
    try { localStorage.setItem('hat', String(hat)); } catch {}
    onChange(hat);
    draw();
  };
  $('btn-hats').onclick = () => { draw(); box.hidden = false; $('title').classList.add('picking-hat'); };
  box.querySelector('.ep-done').onclick = () => { box.hidden = true; $('title').classList.remove('picking-hat'); };
  onChange(hat);
}
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
// mode: quick(빠른 시작) / create(방 만들기) / join(코드로 입장) / practice
// 서버가 받아주면(welcome) enterGame(), 못 들어가면 titleError()
let titleBusy = false;
export function initTitle(onStart) {
  const input = $('nickname'), code = $('room-code');
  try { input.value = localStorage.getItem('nickname') ?? ''; } catch {}
  const start = mode => {
    if (titleBusy) return; // 여러 번 눌러도 한 번만 접속
    if (mode === 'join' && !/^\d{4}$/.test(code.value)) { titleError('방 코드 숫자 4자리를 입력하세요.'); code.focus(); return; }
    titleBusy = true;
    $('title-error').hidden = true;
    const name = input.value.trim() || `플레이어${Math.floor(Math.random() * 900 + 100)}`;
    try { localStorage.setItem('nickname', name); } catch {}
    onStart(name, mode, code.value);
  };
  $('start').onclick = () => start('quick');
  $('create').onclick = () => start('create');
  $('join').onclick = () => start('join');
  $('practice').onclick = () => start('practice');
  code.oninput = () => { code.value = code.value.replace(/\D/g, '').slice(0, 4); };
  code.onkeydown = e => { if (e.key === 'Enter') start('join'); };
  input.onkeydown = e => { if (e.key === 'Enter') start('quick'); };
  // 나가기/퇴출/연결 끊김으로 돌아왔을 때 알림
  let notice = null;
  try { notice = sessionStorage.getItem('titleNotice'); sessionStorage.removeItem('titleNotice'); } catch {}
  if (notice) titleError(notice);
  input.focus();
}

export function titleError(text) {
  titleBusy = false;
  $('title-error').textContent = text;
  $('title-error').hidden = false;
}

export function enterGame() {
  $('title').classList.add('leaving');
  document.body.classList.add('in-game');
  setTimeout(() => { $('title').hidden = true; $('hud').hidden = false; }, 500);
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
// luck: 1등보다 뒤진 점수 (있으면 "역전 찬스" 표시). onFlip(card): 카드가 뒤집힐 때 (소리)
export function showOffers(offers, mySkills, onPick, { luck = 0, onFlip } = {}) {
  const root = $('cards'), list = root.querySelector('.list');
  list.innerHTML = '';
  root.classList.remove('done');
  $('swap-skill').hidden = true;
  root.querySelector('.cards-luck').hidden = !luck;
  const choose = (card, o, slot) => {
    onPick(o.id, slot);
    card.classList.add('chosen');
    root.classList.add('done');
    $('swap-skill').hidden = true;
  };
  offers.forEach((o, i) => dealCard(o, i, mySkills, choose, onFlip));
  root.hidden = false;
}

// 카드 한 장 깔기 (i번째: 날아오는 순서)
function dealCard(o, i, mySkills, choose, onFlip) {
  const root = $('cards'), list = root.querySelector('.list');
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
  // 전설 카드는 뒷면이 금빛으로 떨다가 조금 늦게 뒤집힘 (두근두근)
  const flipAt = 500 + i * 160 + (o.rarity === 'mythic' ? 1400 : o.rarity === 'legend' ? 700 : 0);
  setTimeout(() => {
    card.classList.add('flipped');
    onFlip?.(o);
    if (o.rarity === 'legend' || o.rarity === 'mythic') legendBurst(card, o.rarity);
  }, flipAt);
}

// 전설 카드가 뒤집히는 순간: 뒤에서 빛줄기가 돌고 별가루가 튀어나옴
function legendBurst(card, rarity = 'legend') {
  const fx = document.createElement('div');
  fx.className = `legend-fx ${rarity}`;
  fx.innerHTML = '<div class="legend-rays"></div>' + Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2, d = 110 + Math.random() * 70;
    return `<i style="--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--d:${Math.random() * 0.15}s">${i % 3 ? '✦' : '★'}</i>`;
  }).join('') + `<b class="legend-word">${rarity === 'mythic' ? 'MYTHIC!' : 'LEGEND!'}</b>`;
  card.appendChild(fx);
  card.classList.add('legend-pop');
  setTimeout(() => card.classList.remove('legend-pop'), 600);
  setTimeout(() => fx.querySelectorAll('i, .legend-word').forEach(e => e.remove()), 1600); // 빛줄기는 남겨둠
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
  shrink: { icon: '🔻', text: '축소', sub: '시간이 지나면 가장자리부터 사라져요' },
  rain: { icon: '🕳️', text: '구멍 비', sub: '타일이 흔들리다 뚫려요' },
  lowgrav: { icon: '🌙', text: '저중력', sub: '맞으면 훨씬 멀리 날아가요' },
  spin: { icon: '🎡', text: '회전판', sub: '판이 돌아서 바깥으로 쓸려요' },
  big: { icon: '🧸', text: '거대화', sub: '모두 크기가 2배예요' },
  bounce: { icon: '🏀', text: '튀는 바닥', sub: '흔들리는 타일은 튀어올라요' },
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
  setHtml($('scoreboard'), s.players.filter(p => !p.cl).sort((a, b) => b.sc - a.sc).map(p => {
    const pips = Array.from({ length: winScore }, (_, i) => `<i class="${i < p.sc ? 'on' : ''}"></i>`).join('');
    const abil = p.ab.map(id => `<span title="${catalog.get(id)?.name ?? id}">${icon(id)}</span>`).join('');
    return `<div class="row ${p.id === myId ? 'me' : ''} ${p.al ? '' : 'out'}">
      <span class="dot" style="background:${p.color}"></span>
      <span class="pname">${p.away ? '📶 ' : ''}${p.name}</span>
      <span class="pips">${pips}</span>
      <span class="abil">${abil}</span>
    </div>`;
  }).join(''));
}

// 내 상태 알림 (거울 세계에 걸림)
export function updateStatus(me) {
  const el = $('status');
  const frozen = !!(me && me.fz && me.al);
  const on = !!(me && me.mir > 0 && me.al);
  el.hidden = !(on || frozen);
  document.body.classList.toggle('mirrored', on);
  document.body.classList.toggle('frozen', frozen);
  if (frozen) setHtml(el, '⏳ 시간이 멈췄어요!');
  else if (on) setHtml(el, `🙃 방향키 거꾸로! <b>${Math.ceil(me.mir)}</b>`);
}

// ---------- 연결 중 표시 ----------
export function setConnecting(title, sub = '') {
  const el = $('connecting');
  el.hidden = !title;
  if (title) { el.querySelector('.conn-title').textContent = title; el.querySelector('.conn-sub').textContent = sub; }
}

// ---------- 대기실 ----------
// 방장(👑)만 시작, AI 켬/끔, 다른 사람 내보내기를 할 수 있음
let startPressedAt = 0, botsOn = false;
export function initLobby(onStart, onBots, onKick, onExit) {
  $('btn-start').onclick = () => { onStart(); startPressedAt = performance.now(); };
  $('btn-bots').onclick = () => { onBots(!botsOn); $('btn-bots').blur(); };
  $('btn-lobby-exit').onclick = onExit;
  $('lobby').querySelector('.lobby-list').onclick = e => {
    const b = e.target.closest('.kick');
    if (b && confirm(`${b.dataset.name} 님을 내보낼까요?`)) onKick(Number(b.dataset.id));
  };
}

export function updateLobby(s, myId) {
  const el = $('lobby');
  el.hidden = s.phase !== 'waiting';
  if (el.hidden) { startPressedAt = 0; return; }
  botsOn = s.bots;
  const amHost = s.host === myId;
  const humans = s.players.filter(p => !p.bot);
  const canStart = s.bots || humans.length >= 2;
  setHtml(el.querySelector('.lobby-code'), s.kind === 'quick'
    ? `⚡ 빠른 시작 방 · 코드 <b>${s.code}</b>`
    : `방 코드 <b>${s.code}</b>`);
  setHtml(el.querySelector('.lobby-list'), humans.map(p =>
    `<div class="lobby-row ${p.away ? 'away' : ''}"><span class="dot" style="background:${p.color}"></span>${p.name}${p.id === myId ? ' (나)' : ''}${p.away ? ' <small>📶 연결 끊김</small>' : ''}
      ${p.id === s.host ? '<span class="crown" title="방장">👑</span>' : ''}
      ${amHost && p.id !== myId ? `<button class="kick" data-id="${p.id}" data-name="${p.name}">내보내기</button>` : ''}</div>`).join('')
    + Array.from({ length: Math.max(0, 4 - humans.length) }, () =>
      `<div class="lobby-row empty">${s.bots ? '빈자리 · 시작하면 AI' : '빈자리'}</div>`).join(''));
  // 빈자리 AI 채우기 켬/끔 (방장만)
  const bots = $('btn-bots');
  bots.textContent = s.bots ? '🤖 빈자리 AI 채우기: 켬' : '🙅 빈자리 AI 채우기: 끔';
  bots.classList.toggle('off', !s.bots);
  bots.disabled = !amHost;
  // 시작 버튼: 방장만. 누른 직후 1.5초는 "시작하는 중…", AI를 끄면 2명 이상일 때만
  const pressing = performance.now() - startPressedAt < 1500;
  const btn = $('btn-start');
  btn.disabled = !amHost || !canStart || pressing;
  btn.textContent = !amHost ? '방장을 기다리는 중…'
    : !canStart ? '2명 이상 또는 AI 켜기' : pressing ? '시작하는 중…' : '시작하기';
  el.querySelector('.lobby-timer').textContent = s.kind !== 'quick' ? '친구에게 방 코드를 알려주면 들어올 수 있어요'
    : s.auto !== null ? `⏱ ${s.auto}초 뒤 자동 시작 · 4명이 다 차면 바로 시작`
    : '빠른 시작을 누른 사람들이 이 방으로 모여요 · 2명이 되면 자동 시작 준비';
}

// ---------- 최종 순위 ----------
const MEDAL = ['🥇', '🥈', '🥉', '💩']; // 4위는 똥
let resultsKey = '';
export function initResults(onRestart, onExit) {
  $('btn-restart').onclick = () => { $('btn-restart').disabled = true; onRestart(); };
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
  $('btn-restart').textContent = $('btn-restart').disabled ? '새 방으로 가는 중…' : '다시 하기';
  el.querySelector('.results-timer').textContent = '다시 하기를 누른 사람끼리 새 방에서 만나요';
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
  el.classList.toggle('mirrored', p.mir > 0);
  if (el.dataset.hp !== String(p.hp)) { el.dataset.hp = p.hp; el.querySelector('.hpbar > div').style.width = `${p.hp}%`; }
}
