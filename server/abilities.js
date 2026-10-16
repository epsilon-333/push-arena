// 능력 카드 목록. 새 카드는 여기에 항목 하나만 추가하면 된다.
// kind: stat(수치) | skill(Q·E 버튼) | rule(규칙 비틀기) | trade(트레이드오프)
// rarity: common(일반) | rare(희귀) | legend(전설)
// unique: 한 번만 가질 수 있음 (스킬·규칙 카드)
// mods 기본값은 defaultMods() 참고.
export const ABILITIES = [
  // ----- 스탯형 -----
  { id: 'strong_arm', name: '강한 팔', rarity: 'common', kind: 'stat', tags: ['힘'], desc: '밀치기 힘 +15%', apply: m => { m.power *= 1.15; } },
  { id: 'iron_sole', name: '무쇠 발바닥', rarity: 'common', kind: 'stat', tags: ['무게'], desc: '무게 +15%', apply: m => { m.weight *= 1.15; } },
  { id: 'swift_feet', name: '날쌘 발', rarity: 'common', kind: 'stat', tags: ['속도'], desc: '이동속도 +12%', apply: m => { m.speed *= 1.12; } },
  { id: 'rapid', name: '연타', rarity: 'common', kind: 'stat', tags: ['힘'], desc: '밀치기 쿨다운 -15%', apply: m => { m.cooldown *= 0.85; } },
  { id: 'long_arm', name: '긴 팔', rarity: 'common', kind: 'stat', tags: ['힘'], desc: '밀치기 범위 +20%', apply: m => { m.range *= 1.2; } },
  { id: 'resilience', name: '회복력', rarity: 'common', kind: 'stat', tags: ['생존'], desc: '체력 회복 +30%\n기절 시간 -20%', apply: m => { m.regen *= 1.3; m.stunRecover *= 1.25; } },
  { id: 'elephant', name: '코끼리', rarity: 'common', kind: 'trade', tags: ['무게'], desc: '크기 +35%, 무게 +45%\n이동속도 -15%', apply: m => { m.size *= 1.35; m.weight *= 1.45; m.speed *= 0.85; } },
  { id: 'giant_heart', name: '거인의 심장', rarity: 'legend', kind: 'stat', tags: ['힘', '무게'], desc: '힘·무게 +30%\n크기 +20%', apply: m => { m.power *= 1.3; m.weight *= 1.3; m.size *= 1.2; } },

  // ----- 스킬형 (Q·E) -----
  { id: 'dash', name: '돌진', rarity: 'common', kind: 'skill', skill: 'dash', unique: true, tags: ['속도'], desc: '직선 대시\n부딪히면 강하게 밀침' },
  { id: 'shield', name: '방어막', rarity: 'common', kind: 'skill', skill: 'shield', unique: true, tags: ['무게'], desc: '2초간 밀리지 않음' },
  { id: 'shockwave', name: '충격파', rarity: 'rare', kind: 'skill', skill: 'shockwave', unique: true, tags: ['힘'], desc: '주변을 원형으로 밀어냄' },
  { id: 'swap', name: '순간교체', rarity: 'rare', kind: 'skill', skill: 'swap', unique: true, tags: ['속임수'], desc: '가장 멀리 있는 상대와\n위치 교환' },
  { id: 'slam', name: '내려찍기', rarity: 'rare', kind: 'skill', skill: 'slam', unique: true, tags: ['힘'], desc: '점프 후 착지 충격파\n착지한 타일에 금이 감' },
  { id: 'banana', name: '바나나 껍질', rarity: 'common', kind: 'skill', skill: 'banana', unique: true, tags: ['속임수'], desc: '발밑에 바나나를 놓음\n밟은 상대는 쭉 미끄러짐' },
  { id: 'mirror', name: '거울 세계', rarity: 'rare', kind: 'skill', skill: 'mirror', unique: true, tags: ['속임수'], desc: '랜덤 상대 한 명의\n방향키가 3초간 반대로' },
  { id: 'magnet', name: '자석 손', rarity: 'rare', kind: 'skill', skill: 'magnet', unique: true, tags: ['중력'], desc: '앞쪽 상대를\n내 쪽으로 확 끌어당김' },
  { id: 'ghost', name: '유령', rarity: 'rare', kind: 'skill', skill: 'ghost', unique: true, tags: ['생존'], desc: '1.5초간 통과 상태\n부딪히지도 밀리지도 않음' },
  { id: 'quake', name: '지진', rarity: 'legend', kind: 'skill', skill: 'quake', unique: true, tags: ['바닥'], desc: '내 주변 말고 랜덤 타일\n7개가 3초간 뚫림' },
  { id: 'blackhole', name: '블랙홀 구슬', rarity: 'legend', kind: 'skill', skill: 'blackhole', unique: true, tags: ['중력'], desc: '3초간 끌어당기는\n구체를 던짐' },

  // ----- 룰 변형형 -----
  { id: 'gambler', name: '도박사', rarity: 'rare', kind: 'rule', unique: true, tags: ['속임수'], desc: '밀치기 힘이 매번\n×0.7~×2 랜덤', apply: m => { m.gambler = true; } },
  { id: 'edge_king', name: '가장자리의 왕', rarity: 'rare', kind: 'rule', unique: true, tags: ['힘'], desc: '가장자리에 가까울수록\n힘 최대 +40%', apply: m => { m.edgeKing = true; } },
  { id: 'ice_trail', name: '얼음 발자국', rarity: 'rare', kind: 'rule', unique: true, tags: ['얼음'], desc: '지나간 자리가 2초간 얼음\n상대만 미끄러짐', apply: m => { m.iceTrail = true; } },
  { id: 'reflect', name: '반사', rarity: 'rare', kind: 'rule', unique: true, tags: ['생존'], desc: '내가 밀리면\n밀친 상대도 20% 밀림', apply: m => { m.reflect = 0.2; } },
  { id: 'sneeze', name: '재채기', rarity: 'rare', kind: 'rule', unique: true, tags: ['속임수'], desc: '가끔 저절로 재채기!\n주변을 밀치고 나도 휘청', apply: m => { m.sneeze = true; } },
  { id: 'revenge', name: '복수', rarity: 'rare', kind: 'rule', unique: true, tags: ['힘'], desc: '마지막으로 나를 민\n상대에게 힘 +50%', apply: m => { m.revenge = true; } },
  { id: 'territory', name: '영역 표시', rarity: 'rare', kind: 'rule', unique: true, tags: ['바닥'], desc: '1.5초 서 있던 타일은\n그 라운드 동안 안 무너짐', apply: m => { m.territory = true; } },
  { id: 'king', name: '왕의 귀환', rarity: 'legend', kind: 'rule', unique: true, tags: ['힘'], desc: '점수 1등을 밀 때\n힘 ×2', apply: m => { m.king = true; } },
  { id: 'sticky', name: '쫀득한 바닥', rarity: 'rare', kind: 'rule', unique: true, tags: ['무게'], desc: '빙판·기울기에서\n미끄러짐 -50%', apply: m => { m.slideResist = 0.5; } },

  // ----- 트레이드오프형 -----
  { id: 'glass_cannon', name: '유리 대포', rarity: 'rare', kind: 'trade', tags: ['힘'], desc: '힘 +50%\n무게 -25%', apply: m => { m.power *= 1.5; m.weight *= 0.75; } },
  { id: 'slow_tank', name: '느림보 탱커', rarity: 'common', kind: 'trade', tags: ['무게'], desc: '무게 +30%\n이동속도 -20%', apply: m => { m.weight *= 1.3; m.speed *= 0.8; } },
  { id: 'rampage', name: '폭주', rarity: 'rare', kind: 'trade', tags: ['속도'], desc: '이동속도 +30%\n바닥 마찰 -50%', apply: m => { m.speed *= 1.3; m.friction *= 0.5; } },
  { id: 'one_punch', name: '한 방', rarity: 'legend', kind: 'trade', tags: ['힘'], desc: '밀치기 힘 ×2\n쿨다운 ×2', apply: m => { m.power *= 2; m.cooldown *= 2; } },
  { id: 'feather', name: '깃털 몸', rarity: 'rare', kind: 'trade', tags: ['속도'], desc: '이동속도 +25%\n크기 -15%, 무게 -20%', apply: m => { m.speed *= 1.25; m.size *= 0.85; m.weight *= 0.8; } },
];

const BY_ID = new Map(ABILITIES.map(a => [a.id, a]));
const RARITY_WEIGHT = { common: 65, rare: 32, legend: 3 }; // 합 100 = 퍼센트
// 역전 보정: 1등보다 1점 뒤질 때마다 일반 → 희귀·전설로 확률을 옮김 (최대 3점분)
// 예) 2점 뒤짐: 일반 49 / 희귀 44 / 전설 7
const CATCHUP = { rare: 6, legend: 2 }, CATCHUP_MAX = 3;
function rarityWeights(behind) {
  const b = Math.min(CATCHUP_MAX, Math.max(0, behind));
  return {
    common: RARITY_WEIGHT.common - (CATCHUP.rare + CATCHUP.legend) * b,
    rare: RARITY_WEIGHT.rare + CATCHUP.rare * b,
    legend: RARITY_WEIGHT.legend + CATCHUP.legend * b,
  };
}

export function getAbility(id) { return BY_ID.get(id); }
export function isAbility(id) { return BY_ID.has(id); }

export function defaultMods() {
  return {
    power: 1, weight: 1, speed: 1, cooldown: 1, range: 1, regen: 1, stunRecover: 1, size: 1, friction: 1,
    slideResist: 0, reflect: 0, gambler: false, edgeKing: false, iceTrail: false,
    sneeze: false, revenge: false, territory: false, king: false,
  };
}

// 가진 카드 목록으로 mods 다시 계산
export function computeMods(abilityIds) {
  const m = defaultMods();
  for (const id of abilityIds) BY_ID.get(id)?.apply?.(m);
  return m;
}

// 등급 확률(일반 65 / 희귀 32 / 전설 3)로 겹치지 않게 n장 제시.
// 이미 가진 unique 카드(스킬·규칙)는 제외. behind: 1등보다 뒤진 점수 (클수록 좋은 카드가 잘 나옴)
export function rollOffers(n, owned = [], behind = 0) {
  const W = rarityWeights(behind);
  const ownedSet = new Set(owned);
  const pool = ABILITIES.filter(a => !(a.unique && ownedSet.has(a.id)));
  const out = [];
  while (out.length < n && pool.length) {
    // 먼저 등급을 뽑고, 그 등급 안에서 카드를 뽑는다
    const rarities = [...new Set(pool.map(a => a.rarity))];
    const total = rarities.reduce((s, r) => s + W[r], 0);
    let roll = Math.random() * total, rarity = rarities[0];
    for (const r of rarities) { roll -= W[r]; if (roll <= 0) { rarity = r; break; } }
    const inRarity = pool.filter(a => a.rarity === rarity);
    const pickIdx = pool.indexOf(inRarity[Math.floor(Math.random() * inRarity.length)]);
    out.push(pool.splice(pickIdx, 1)[0]);
  }
  return out.map(publicInfo);
}

// 화면에 보낼 정보 (apply 함수 제외)
export function publicInfo({ id, name, rarity, kind, tags, desc, skill }) {
  return { id, name, rarity, kind, tags, desc, skill: skill ?? null };
}
