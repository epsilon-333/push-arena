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

// 감정 이모티콘 (서버는 번호만 안다). face = 캐릭터 표정
export const EMOTES = [
  { icon: '😆', face: 'happy', name: '신남' },
  { icon: '😡', face: 'angry', name: '화남' },
  { icon: '😱', face: 'surprised', name: '놀람' },
  { icon: '👍', face: 'normal', name: '좋아' },
];

export function initEmoteBar(onEmote) {
  const bar = $('emotes');
  bar.innerHTML = EMOTES.map((e, i) => `<button data-n="${i}" title="${e.name}">${e.icon}<kbd>${i + 1}</kbd></button>`).join('');
  bar.onclick = e => {
    const b = e.target.closest('button');
    if (b) { onEmote(Number(b.dataset.n)); b.blur(); } // 포커스가 남으면 Space가 버튼을 다시 누름
  };
}

const $ = id => document.getElementById(id);

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
  const start = mode => {
    const name = input.value.trim() || `플레이어${Math.floor(Math.random() * 900 + 100)}`;
    try { localStorage.setItem('nickname', name); } catch {}
    $('title').classList.add('leaving');
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
  el.innerHTML = [0, 1].map(i => {
    const sk = me.sk?.[i];
    if (!sk) return `<div class="slot empty"><kbd>${'QE'[i]}</kbd></div>`;
    const max = skillCdMax[sk] || 1, cd = me.cd[i];
    const pct = Math.min(100, (cd / max) * 100);
    return `<div class="slot ${cd > 0 ? 'cooling' : 'ready'}" title="${skillName(sk)}">
      <span class="slot-icon">${icon(SKILL_CARD[sk])}</span>
      <div class="slot-cd" style="--p:${pct}%"></div>
      ${cd > 0 ? `<span class="slot-num">${Math.ceil(cd)}</span>` : ''}
      <kbd>${'QE'[i]}</kbd>
    </div>`;
  }).join('');
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
  if (showRule) $('rule').innerHTML = `<span class="rule-icon">${rule.icon}</span><b>${rule.text}</b><span>${rule.sub}</span>`;

  $('scoreboard').innerHTML = [...s.players].sort((a, b) => b.sc - a.sc).map(p => {
    const pips = Array.from({ length: winScore }, (_, i) => `<i class="${i < p.sc ? 'on' : ''}"></i>`).join('');
    const abil = p.ab.map(id => `<span title="${catalog.get(id)?.name ?? id}">${icon(id)}</span>`).join('');
    return `<div class="row ${p.id === myId ? 'me' : ''} ${p.al ? '' : 'out'}">
      <span class="dot" style="background:${p.color}"></span>
      <span class="pname">${p.name}</span>
      <span class="pips">${pips}</span>
      <span class="abil">${abil}</span>
    </div>`;
  }).join('');
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
    bubble.textContent = EMOTES[p.em]?.icon ?? '';
    bubble.hidden = false;
    bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
  } else if (p.em < 0) bubble.hidden = true;
  el.dataset.em = p.em;
  const name = el.querySelector('.name');
  if (name.textContent !== p.name) name.textContent = p.name;
  name.style.background = p.color;
  el.classList.toggle('me', isMe);
  el.classList.toggle('stunned', p.st);
  el.querySelector('.hpbar > div').style.width = `${p.hp}%`;
}
