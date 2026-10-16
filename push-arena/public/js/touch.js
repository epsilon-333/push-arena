// 폰(터치) 조작: 왼쪽 조이스틱 = 이동, 오른쪽 버튼 = 밀치기/스킬, 빈 화면 드래그 = 시점
export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// h: { canvas, onAttack(), onSkill(i), onLook(dx) }
// 돌려주는 stick.x / stick.y 는 -1~1 (y는 화면 위쪽이 -)
export function initTouch(h) {
  const stick = { x: 0, y: 0 };
  if (!isTouch) return stick;
  document.body.classList.add('touch');
  const root = document.getElementById('touch');
  root.hidden = false;

  // 조이스틱
  const pad = root.querySelector('.stick'), knob = pad.querySelector('.knob');
  const R = 48;
  let stickId = null, cx = 0, cy = 0;
  const move = e => {
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    stick.x = dx / R; stick.y = dy / R;
  };
  pad.addEventListener('pointerdown', e => {
    stickId = e.pointerId;
    try { pad.setPointerCapture(e.pointerId); } catch {} // 일부 브라우저에서 실패해도 조작은 되게
    const r = pad.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    move(e);
  });
  pad.addEventListener('pointermove', e => { if (e.pointerId === stickId) move(e); });
  const endStick = e => {
    if (e.pointerId !== stickId) return;
    stickId = null; stick.x = stick.y = 0; knob.style.transform = '';
  };
  pad.addEventListener('pointerup', endStick);
  pad.addEventListener('pointercancel', endStick);

  // 밀치기 버튼
  root.querySelector('.btn-push').addEventListener('pointerdown', e => { e.preventDefault(); h.onAttack(); });

  // 스킬 칸(Q·E)을 직접 누르기 — 칸은 계속 다시 그려지므로 부모에서 받음
  document.getElementById('skills').addEventListener('pointerdown', e => {
    const slot = e.target.closest('[data-i]');
    if (slot) { e.preventDefault(); h.onSkill(Number(slot.dataset.i)); }
  });

  // 빈 화면을 좌우로 끌면 시점 회전
  let lookId = null, lx = 0;
  h.canvas.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || lookId !== null) return;
    lookId = e.pointerId; lx = e.clientX;
  });
  h.canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== lookId) return;
    h.onLook(e.clientX - lx);
    lx = e.clientX;
  });
  const endLook = e => { if (e.pointerId === lookId) lookId = null; };
  h.canvas.addEventListener('pointerup', endLook);
  h.canvas.addEventListener('pointercancel', endLook);

  return stick;
}
