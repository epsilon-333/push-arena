import * as THREE from 'three';

// 캐릭터 모델: 큰 흰 머리 + 후드티 + 검은 바지 + 흰 신발/장갑, 검은 외곽선.
// 앞쪽 = 로컬 +x 방향.

// 3단 툰 셰이딩
const gradient = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 3, 1);
gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
gradient.needsUpdate = true;
export const toon = color => new THREE.MeshToonMaterial({ color, gradientMap: gradient });

const OUTLINE = new THREE.MeshBasicMaterial({ color: '#16171d', side: THREE.BackSide });
const INK = new THREE.MeshBasicMaterial({ color: '#16171d' });
const WHITE = toon('#f6f4f0');
const PANTS = toon('#2c2e38');
const STAR = new THREE.MeshBasicMaterial({ color: '#ffd84a' });

// 메쉬 + 외곽선 (뒷면만 그리는 살짝 큰 복제본)
function part(geo, mat, outline = 1.07) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  if (outline) {
    const o = new THREE.Mesh(geo, OUTLINE);
    o.scale.setScalar(outline);
    m.add(o);
  }
  return m;
}

const G = {
  head: new THREE.SphereGeometry(0.52, 32, 24),
  eye: new THREE.SphereGeometry(0.075, 16, 12),
  arc: new THREE.TorusGeometry(0.07, 0.022, 6, 16, Math.PI),
  brow: new THREE.BoxGeometry(0.03, 0.035, 0.16),
  torso: new THREE.CapsuleGeometry(0.34, 0.26, 6, 16),
  hood: new THREE.TorusGeometry(0.28, 0.12, 10, 24),
  hoodBack: new THREE.SphereGeometry(0.3, 16, 12),
  string: new THREE.CapsuleGeometry(0.024, 0.14, 4, 6),
  sleeve: new THREE.CapsuleGeometry(0.12, 0.26, 4, 10),
  hand: new THREE.SphereGeometry(0.19, 16, 12),
  leg: new THREE.CapsuleGeometry(0.13, 0.22, 4, 10),
  shoe: new THREE.SphereGeometry(0.17, 16, 10),
  star: new THREE.OctahedronGeometry(0.08),
};

// ---------- 모자 (서버는 번호만 안다. 순서를 바꾸면 안 됨 — 서버 HAT_COUNT와 개수 맞춤) ----------
// 머리 그룹 기준: 머리 반지름 0.52, 정수리 y≈0.52, 앞 = +x
const HAT_MAT = {
  gold: toon('#ffcf3a'), red: toon('#e74c3c'), pink: toon('#ff8fc7'), white: WHITE, green: toon('#5cc96b'),
  blue: toon('#3f6fd8'), ink: toon('#2c2e38'), purple: toon('#9b59b6'), orange: toon('#ff9f43'),
};
const HALO = new THREE.MeshBasicMaterial({ color: '#fff3a0' });
const Hg = {
  ring: new THREE.CylinderGeometry(0.3, 0.33, 0.2, 20, 1, true),
  spike: new THREE.ConeGeometry(0.07, 0.2, 8),
  gem: new THREE.OctahedronGeometry(0.06),
  cone: new THREE.ConeGeometry(0.26, 0.62, 20),
  ball: new THREE.SphereGeometry(0.09, 12, 8),
  ear: new THREE.CapsuleGeometry(0.09, 0.42, 4, 10),
  catEar: new THREE.ConeGeometry(0.15, 0.3, 4),
  stem: new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6),
  leaf: new THREE.SphereGeometry(0.13, 12, 8),
  cap: new THREE.SphereGeometry(0.55, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  brim: new THREE.CylinderGeometry(0.34, 0.34, 0.04, 20, 1, false, 0, Math.PI), // 앞(+x)쪽 반원
  bow: new THREE.ConeGeometry(0.13, 0.24, 12),
  knot: new THREE.SphereGeometry(0.07, 10, 8),
  halo: new THREE.TorusGeometry(0.3, 0.045, 8, 32),
  horn: new THREE.ConeGeometry(0.08, 0.3, 10),
  band: new THREE.TorusGeometry(0.56, 0.045, 8, 32, Math.PI),
  cup: new THREE.CylinderGeometry(0.15, 0.15, 0.12, 16),
  top: new THREE.CylinderGeometry(0.27, 0.27, 0.42, 20),
  topBrim: new THREE.CylinderGeometry(0.44, 0.44, 0.04, 24),
  frog: new THREE.SphereGeometry(0.12, 12, 10),
};
const at = (m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m; };

export const HATS = [
  { icon: '🚫', name: '없음', build: () => [] },
  { icon: '👑', name: '왕관', build: () => [
    at(part(Hg.ring, HAT_MAT.gold, 1.04), 0, 0.5, 0, 0, 0, 0.12),
    ...[0, 1, 2, 3, 4, 5].map(i => { const a = (i / 6) * Math.PI * 2; return at(part(Hg.spike, HAT_MAT.gold, 1.08), Math.cos(a) * 0.3 - 0.02, 0.66, Math.sin(a) * 0.3, 0, 0, 0.12); }),
    at(new THREE.Mesh(Hg.gem, HAT_MAT.red), 0.33, 0.48, 0, 0, 0, 0.12),
  ] },
  { icon: '🎉', name: '고깔모자', build: () => [
    at(part(Hg.cone, HAT_MAT.pink, 1.05), -0.05, 0.75, 0.05, 0.15, 0, 0.15),
    at(part(Hg.ball, HAT_MAT.gold, 1.1), -0.1, 1.06, 0.1),
  ] },
  { icon: '🐰', name: '토끼 귀', build: () => [-1, 1].map(s => at(part(Hg.ear, HAT_MAT.white, 1.08), -0.05, 0.72, s * 0.17, s * 0.2, 0, 0.1)) },
  { icon: '🐱', name: '고양이 귀', build: () => [-1, 1].map(s => at(part(Hg.catEar, HAT_MAT.ink, 1.08), 0, 0.55, s * 0.27, s * 0.45, Math.PI / 4, 0)) },
  { icon: '🌱', name: '새싹', build: () => {
    const l = s => { const m = part(Hg.leaf, HAT_MAT.green, 1.08); m.scale.set(1, 0.35, 0.6); return at(m, 0, 0.75, s * 0.12, s * 0.5, 0, 0); };
    return [at(part(Hg.stem, HAT_MAT.green, 0), 0, 0.6, 0), l(-1), l(1)];
  } },
  { icon: '🧢', name: '야구모자', build: () => [
    at(part(Hg.cap, HAT_MAT.red, 1.03), 0, 0.08, 0),
    at(part(Hg.brim, HAT_MAT.red, 1.06), 0.3, 0.2, 0, 0, 0, -0.12),
  ] },
  { icon: '🎀', name: '리본', build: () => [
    ...[-1, 1].map(s => at(part(Hg.bow, HAT_MAT.pink, 1.08), 0, 0.5, 0.22 + s * 0.15, s * Math.PI / 2, 0, 0)),
    at(part(Hg.knot, HAT_MAT.pink, 1.1), 0, 0.5, 0.22),
  ] },
  { icon: '😇', name: '천사 링', float: true, build: () => [at(new THREE.Mesh(Hg.halo, HALO), 0, 0.82, 0, Math.PI / 2, 0, 0)] },
  { icon: '😈', name: '악마 뿔', build: () => [-1, 1].map(s => at(part(Hg.horn, HAT_MAT.red, 1.08), 0.12, 0.5, s * 0.25, s * 0.5, 0, -0.25)) },
  { icon: '🎧', name: '헤드폰', build: () => [
    at(part(Hg.band, HAT_MAT.ink, 1.05), 0, 0.02, 0, 0, Math.PI / 2, 0),
    ...[-1, 1].map(s => at(part(Hg.cup, HAT_MAT.blue, 1.08), 0, 0, s * 0.55, Math.PI / 2, 0, 0)),
  ] },
  { icon: '🎩', name: '신사 모자', build: () => [
    at(part(Hg.topBrim, HAT_MAT.ink, 1.06), 0, 0.46, 0, 0, 0, 0.1),
    at(part(Hg.top, HAT_MAT.ink, 1.05), -0.02, 0.68, 0, 0, 0, 0.1),
  ] },
  { icon: '🐸', name: '개구리 눈', build: () => [-1, 1].flatMap(s => {
    const eye = at(part(Hg.frog, HAT_MAT.green, 1.08), 0.12, 0.5, s * 0.2);
    const pupil = at(new THREE.Mesh(Hg.knot, INK), 0.22, 0.52, s * 0.2);
    pupil.scale.setScalar(0.6);
    return [eye, pupil];
  }) },
];

export class Character {
  constructor(color) {
    this.root = new THREE.Group(); // 게임이 위치/방향을 정함
    this.rig = new THREE.Group();  // 기울기, 출렁임
    this.root.add(this.rig);
    this.root.scale.setScalar(1.05);
    const hoodie = toon(color);
    this.hoodieMat = hoodie;
    this.color = new THREE.Color(color);

    // 다리
    this.legs = [-1, 1].map(side => {
      const hip = new THREE.Group();
      hip.position.set(0, 0.46, side * 0.17);
      const leg = part(G.leg, PANTS);
      leg.position.y = -0.2;
      const shoe = part(G.shoe, WHITE);
      shoe.scale.set(1.45, 0.7, 1);
      shoe.position.set(0.07, -0.4, 0);
      hip.add(leg, shoe);
      this.rig.add(hip);
      return hip;
    });

    // 몸통 + 후드
    const torso = part(G.torso, hoodie);
    torso.position.y = 0.76;
    torso.scale.set(1, 0.92, 1.08);
    const hood = part(G.hood, hoodie);
    hood.rotation.x = Math.PI / 2;
    hood.position.set(-0.05, 1.08, 0);
    const hoodBack = part(G.hoodBack, hoodie);
    hoodBack.position.set(-0.3, 1.12, 0);
    this.rig.add(torso, hood, hoodBack);
    for (const side of [-1, 1]) {
      const s = part(G.string, WHITE, 0);
      s.position.set(0.33, 0.9, side * 0.08);
      this.rig.add(s);
    }

    // 팔 (어깨 기준 회전)
    this.arms = [-1, 1].map(side => {
      const shoulder = new THREE.Group();
      shoulder.position.set(0, 1.0, side * 0.42);
      const sleeve = part(G.sleeve, hoodie);
      sleeve.position.y = -0.2;
      const hand = part(G.hand, WHITE);
      hand.position.y = -0.46;
      shoulder.add(sleeve, hand);
      shoulder.userData.side = side;
      this.rig.add(shoulder);
      return shoulder;
    });

    // 머리 + 표정
    this.head = new THREE.Group();
    this.head.position.y = 1.5;
    this.head.add(part(G.head, WHITE, 1.05));
    this.faces = {};
    const eyes = (sx, sy) => [-1, 1].map(side => {
      const e = new THREE.Mesh(G.eye, INK);
      e.position.set(0.47, 0.02, side * 0.17);
      e.rotation.y = -side * 0.35;
      e.scale.set(0.6, sy, sx);
      return e;
    });
    const face = (name, meshes) => {
      const g = new THREE.Group();
      g.add(...meshes);
      this.head.add(g);
      this.faces[name] = g;
    };
    face('normal', eyes(0.9, 1.5));
    face('angry', [...eyes(0.9, 1.1), ...[-1, 1].map(side => {
      const b = new THREE.Mesh(G.brow, INK);
      b.position.set(0.47, 0.17, side * 0.17);
      b.rotation.set(-side * 0.5, -side * 0.35, 0);
      return b;
    })]);
    face('happy', [-1, 1].map(side => {
      const a = new THREE.Mesh(G.arc, INK);
      a.position.set(0.49, 0.0, side * 0.17);
      a.rotation.y = Math.PI / 2 - side * 0.35;
      return a;
    }));
    face('surprised', eyes(1.25, 1.9));
    this.rig.add(this.head);

    // 기절 별
    this.stars = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(G.star, STAR);
      s.userData.offset = (i / 3) * Math.PI * 2;
      this.stars.add(s);
    }
    this.stars.position.y = 2.15;
    this.rig.add(this.stars);

    this.walkPhase = 0;
    this.push = 1;   // 0→1 진행 중이면 밀치기 모션
    this.hit = 1;    // 0→1 진행 중이면 맞는 모션
    this.hat = new THREE.Group();
    this.head.add(this.hat);
    this.hatId = 0;
    this.setFace('normal');
  }

  setHat(n) {
    n = HATS[n] ? n : 0;
    if (this.hatId === n) return;
    this.hatId = n;
    this.hat.clear();
    const parts = HATS[n].build();
    if (parts.length) this.hat.add(...parts);
  }

  setFace(name) {
    if (this.face === name) return;
    this.face = name;
    for (const [k, g] of Object.entries(this.faces)) g.visible = k === name;
  }

  playPush() { this.push = 0; }
  playHit() { this.hit = 0; }

  // s: { speed, stunned, falling, winner, emoteFace, gesture }
  update(dt, t, s) {
    this.push = Math.min(1, this.push + dt / 0.38);
    this.hit = Math.min(1, this.hit + dt / 0.35);
    const pushing = this.push < 1, hitting = this.hit < 1;

    // 표정
    if (s.stunned || hitting || s.falling) this.setFace('surprised');
    else if (s.emoteFace) this.setFace(s.emoteFace); // 감정 이모티콘 표정
    else if (s.winner) this.setFace('happy');
    else if (pushing) this.setFace('angry');
    else this.setFace('normal');

    this.hoodieMat.color.copy(this.color).multiplyScalar(s.stunned ? 0.55 : 1);

    // 기본: 대기 / 걷기
    const moving = s.speed > 0.6 && !s.stunned;
    this.walkPhase += dt * (moving ? 6 + s.speed * 1.2 : 0);
    const walk = moving ? Math.sin(this.walkPhase) : 0;
    const breathe = Math.sin(t * 2.5);

    let lean = moving ? -0.12 : 0;         // 음수 = 앞으로 숙임
    let bob = moving ? Math.abs(walk) * 0.06 : breathe * 0.015;
    const arm = [{ z: -walk * 0.6, x: 0.15 }, { z: walk * 0.6, x: 0.15 }]; // z: 앞뒤, x: 바깥 벌림
    const leg = [walk * 0.7, -walk * 0.7];
    let squash = 1;

    if (pushing) {
      // 0~0.3 뒤로 당겼다가, 0.3~0.55 앞으로 쭉 밀고, 이후 복귀
      const p = this.push;
      const wind = p < 0.3 ? p / 0.3 : 0;
      const thrust = p < 0.3 ? 0 : p < 0.55 ? (p - 0.3) / 0.25 : 1 - (p - 0.55) / 0.45;
      const e = Math.sin(Math.min(1, thrust) * Math.PI / 2);
      for (const a of arm) { a.z = -0.5 * wind + 1.65 * e; a.x = 0.15 - 0.25 * e; }
      lean = 0.15 * wind - 0.4 * e;
      leg[0] = 0.35 * e; leg[1] = -0.45 * e;
      squash = 1 + 0.06 * e;
    }
    if (hitting) {
      const h = Math.sin((1 - this.hit) * Math.PI / 2);
      lean += 0.5 * h;
      for (const a of arm) { a.z -= 0.8 * h; a.x += 0.5 * h; }
    }
    if (s.stunned) {
      lean = Math.sin(t * 3) * 0.12;
      for (const a of arm) { a.z = 0; a.x = 0.35; }
    }
    if (s.falling) {
      for (const [i, a] of arm.entries()) { a.z = 0.4 * Math.sin(t * 20 + i * 2); a.x = 2.6; }
    }
    if (s.winner) {
      const j = Math.abs(Math.sin(t * 6));
      bob = j * 0.25;
      for (const a of arm) { a.z = 0.3; a.x = 2.4; }
    }
    // 이모티콘 동작 (arm[0] = 왼팔, arm[1] = 오른팔 / z: 앞뒤, x: 옆으로 들기)
    let headTilt = 0;
    if (s.gesture && !s.stunned && !s.falling) {
      switch (s.gesture) {
        case 'wave': // 손 흔들기
          arm[1].x = 2.7; arm[1].z = 0.35 * Math.sin(t * 14);
          break;
        case 'point': // 손가락질 (덤벼!)
          arm[1].z = 1.6; arm[1].x = 0.05; lean -= 0.12;
          arm[0].z = -0.3;
          break;
        case 'flex': // 힘자랑
          for (const a of arm) { a.x = 1.5 + Math.sin(t * 10) * 0.12; a.z = 0.25; }
          bob = Math.abs(Math.sin(t * 5)) * 0.06;
          break;
        case 'dance': // 신나서 들썩
          lean = Math.sin(t * 9) * 0.28;
          bob = Math.abs(Math.sin(t * 9)) * 0.18;
          arm[0].x = 1.4 + Math.sin(t * 9) * 0.8; arm[1].x = 1.4 - Math.sin(t * 9) * 0.8;
          break;
        case 'taunt': // 메롱: 뒤로 젖히고 고개 까딱
          lean = 0.22; headTilt = Math.sin(t * 10) * 0.25;
          for (const a of arm) { a.z = -0.5; a.x = 0.6; }
          break;
      }
    }

    // 적용 (부드럽게)
    const k = 1 - Math.exp(-dt * 18);
    this.arms.forEach((sh, i) => {
      const side = sh.userData.side;
      sh.rotation.z += (arm[i].z - sh.rotation.z) * k;
      sh.rotation.x += (-side * arm[i].x - sh.rotation.x) * k;
    });
    this.legs.forEach((hip, i) => { hip.rotation.z += (leg[i] - hip.rotation.z) * k; });
    this.rig.rotation.z += (lean - this.rig.rotation.z) * k;
    this.rig.position.y = bob;
    this.rig.scale.set(squash, 1 / squash, 1);
    this.head.rotation.x = s.stunned ? Math.sin(t * 6) * 0.15 : headTilt;
    if (HATS[this.hatId].float) this.hat.position.y = Math.sin(t * 3) * 0.04; // 천사 링 둥실

    this.stars.visible = !!s.stunned;
    if (s.stunned) {
      for (const st of this.stars.children) {
        const a = t * 4 + st.userData.offset;
        st.position.set(Math.cos(a) * 0.45, Math.sin(t * 8 + st.userData.offset) * 0.04, Math.sin(a) * 0.45);
        st.rotation.y = t * 5;
      }
    }
  }
}
