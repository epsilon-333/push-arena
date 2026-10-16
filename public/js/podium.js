import * as THREE from 'three';
import { Character, toon } from './character.js';

// 최종 순위 시상대: 맵에서 멀리 떨어진 곳에 따로 세우고, 결과 화면 동안 카메라가 이쪽을 비춘다.
// 1등은 가운데 제일 높은 단에서 점프, 2·3등은 춤·손 흔들기, 4등은 바닥에서 어지러움(별).
const ORIGIN = new THREE.Vector3(300, 0, 0);
const STEPS = [ // 순위별 단: x 위치, 높이, 색
  { x: 0, h: 1.6, color: '#ffcf3a' },
  { x: -2.3, h: 1.1, color: '#cfd6e6' },
  { x: 2.3, h: 0.7, color: '#e09a5b' },
];
const POSE = [
  { winner: true },
  { gesture: 'dance', emoteFace: 'happy' },
  { gesture: 'wave', emoteFace: 'happy' },
  { stunned: true },
];
const CONFETTI = ['#ff6b6b', '#ffd84a', '#5d95ff', '#5cc96b', '#ff8fc7', '#b07bff'];

// 단 앞면 숫자
function numberTexture(n) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 96px "Black Han Sans", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 12; g.strokeStyle = '#16171d'; g.strokeText(n, 64, 70);
  g.fillStyle = '#fff'; g.fillText(n, 64, 70);
  return new THREE.CanvasTexture(c);
}

// 머리 위 이름표 (색 알약 + 흰 글씨)
function nameSprite(name, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 60px "Jua", sans-serif';
  const w = Math.min(500, g.measureText(name).width + 70);
  g.fillStyle = '#16171d';
  g.beginPath(); g.roundRect((512 - w) / 2 - 6, 14, w + 12, 100, 50); g.fill();
  g.fillStyle = color;
  g.beginPath(); g.roundRect((512 - w) / 2, 20, w, 88, 44); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = '#16171d'; g.strokeText(name, 256, 66);
  g.fillText(name, 256, 66);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.set(2.4, 0.6, 1);
  return s;
}

export class Podium {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.copy(ORIGIN);
    this.group.visible = false;
    scene.add(this.group);
    this.chars = [];
    this.key = '';

    // 바닥 원판
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.3, 0.5, 6), toon('#4a4f73'));
    floor.position.y = -0.25;
    const floorTop = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 5.8, 0.02, 6), toon('#c9d3f0'));
    floorTop.position.y = 0.01;
    this.group.add(floor, floorTop);

    // 단 3개
    STEPS.forEach((st, i) => {
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.1, st.h, 1.9), toon(st.color));
      box.position.set(st.x, st.h / 2, 0);
      box.castShadow = box.receiveShadow = true;
      const edge = new THREE.Mesh(box.geometry, new THREE.MeshBasicMaterial({ color: '#16171d', side: THREE.BackSide }));
      edge.scale.setScalar(1.03);
      box.add(edge);
      const num = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: numberTexture(i + 1), transparent: true }));
      num.position.set(0, Math.min(0, st.h / 2 - 0.55), 0.96);
      box.add(num);
      this.group.add(box);
    });

    // 꽃가루: 작은 사각형 여러 개를 위에서 계속 흩뿌림
    const n = 160;
    this.confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.14, 0.09), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n);
    this.bits = Array.from({ length: n }, (_, i) => {
      this.confetti.setColorAt(i, new THREE.Color(CONFETTI[i % CONFETTI.length]));
      return this.resetBit({}, true);
    });
    this.group.add(this.confetti);
    this.dummy = new THREE.Object3D();

    // 시상대만 비추는 조명 (맵 조명과 별개로 밝게)
    const spot = new THREE.DirectionalLight('#fff4e0', 1.6);
    spot.position.set(2, 8, 6);
    spot.target = this.group;
    this.group.add(spot);
  }

  resetBit(b, anywhere = false) {
    b.x = (Math.random() - 0.5) * 9;
    b.y = anywhere ? Math.random() * 7 : 7 + Math.random() * 2;
    b.z = (Math.random() - 0.5) * 4 - 0.5;
    b.vy = 1.2 + Math.random() * 1.2;
    b.sway = Math.random() * Math.PI * 2;
    b.spin = (Math.random() - 0.5) * 10;
    return b;
  }

  // results: 서버 순위 목록 [{ rank, name, color, hat }]
  show(results) {
    const key = JSON.stringify(results.map(r => [r.id, r.rank, r.hat]));
    this.group.visible = true;
    if (key === this.key) return;
    this.key = key;
    for (const c of this.chars) this.group.remove(c.root, c.tag);
    this.chars = results.slice(0, 4).map((r, i) => {
      const ch = new Character(r.color);
      ch.setHat(r.hat ?? 0);
      const st = STEPS[i];
      // 4등은 단 옆 바닥에
      const x = st ? st.x : 3.9, y = st ? st.h : 0;
      ch.root.position.set(x, y, st ? 0 : 0.6);
      ch.root.rotation.y = -Math.PI / 2; // 카메라(+z) 쪽을 봄
      ch.pose = POSE[i];
      ch.baseY = y;
      ch.tag = nameSprite(r.name, r.color);
      ch.tag.position.set(x, y + 2.7, st ? 0 : 0.6);
      this.group.add(ch.root, ch.tag);
      return ch;
    });
  }

  hide() {
    this.group.visible = false;
  }

  get visible() { return this.group.visible; }

  // 카메라 위치/시선 (화면 아래쪽은 순위표가 가리므로 시상대를 위쪽에 둠)
  // side: 순위표가 오른쪽에 있는 화면(폰 가로)이면 시상대를 왼쪽으로
  cameraGoal(pos, look, portrait, side) {
    const dx = side ? 5.6 : 0;
    pos.set(ORIGIN.x + dx, ORIGIN.y + 3.4, ORIGIN.z + (portrait ? 15 : 12));
    look.set(ORIGIN.x + dx, ORIGIN.y + (side ? 1.2 : portrait ? -1.2 : -1.4), ORIGIN.z);
  }

  update(dt, t) {
    if (!this.group.visible) return;
    for (const ch of this.chars) ch.update(dt, t, { speed: 0, ...ch.pose });
    this.bits.forEach((b, i) => {
      b.y -= b.vy * dt;
      b.sway += dt * 3;
      if (b.y < 0) this.resetBit(b);
      this.dummy.position.set(b.x + Math.sin(b.sway) * 0.3, b.y, b.z);
      this.dummy.rotation.set(b.sway * 2, b.spin * t * 0.1, b.sway);
      this.dummy.updateMatrix();
      this.confetti.setMatrixAt(i, this.dummy.matrix);
    });
    this.confetti.instanceMatrix.needsUpdate = true;
  }
}
