// 게임패드 (표준 배치: Xbox · PlayStation · Switch Pro 등)
//   왼쪽 스틱 이동 · 오른쪽 스틱 시점 · A/RT 밀치기 · LB/X 스킬 Q · RB/B 스킬 E · 십자키 감정 1~4
//   카드 고르기 · 대기실 · 순위 화면: 왼쪽 스틱/십자키 좌우로 고르고 A로 누름 (js/ui.js padNav)
// 매 프레임 read()를 부른다. 버튼은 "이번에 막 눌린 것"만 true.
const DEAD = 0.22;
const dead = v => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));
let prev = [], navHeld = 0, seen = false;

export function read() {
  const out = { on: false, x: 0, y: 0, look: 0, attack: false, skill: -1, emote: -1, nav: 0, ok: false, back: false };
  let pads = [];
  try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch {} // 막아 둔 브라우저에서는 그냥 없는 것으로
  const pad = [...pads].find(p => p && p.connected && p.buttons.length >= 8);
  if (!pad) { prev = []; return out; }
  const down = i => !!pad.buttons[i]?.pressed, hit = i => down(i) && !prev[i];
  out.x = dead(pad.axes[0] ?? 0); out.y = dead(pad.axes[1] ?? 0); out.look = dead(pad.axes[2] ?? 0);
  out.attack = hit(0) || hit(7);
  out.skill = hit(4) || hit(2) ? 0 : hit(5) || hit(1) ? 1 : -1;
  out.emote = [12, 15, 13, 14].findIndex(hit); // 위 · 오른쪽 · 아래 · 왼쪽 = 감정 1 · 2 · 3 · 4
  out.ok = hit(0); out.back = hit(1);
  // 메뉴 좌우: 십자키는 누를 때마다, 스틱은 기울인 순간 한 번
  const dir = hit(14) ? -1 : hit(15) ? 1 : 0, stick = Math.abs(pad.axes[0] ?? 0) > 0.6 ? Math.sign(pad.axes[0]) : 0;
  out.nav = dir || (stick !== navHeld ? stick : 0);
  navHeld = stick;
  prev = pad.buttons.map(b => b.pressed);
  out.on = seen || out.x !== 0 || out.y !== 0 || prev.some(Boolean);
  seen = out.on; // 한 번이라도 만졌으면 그 뒤로는 패드를 쓰는 사람으로 봄
  return out;
}
