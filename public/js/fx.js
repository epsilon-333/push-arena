import * as THREE from 'three';
import { toon } from './character.js';

// 입자 효과: 파편(작은 상자)과 먼지(동글동글한 덩어리) 두 종류를 InstancedMesh 하나씩으로 그린다.
// 캐릭터와 같은 만화풍 — 흐릿한 빛 번짐 대신 또렷한 조각이 튀고, 사라질 때는 작아진다.
// parent(판 그룹)에 붙으므로 판이 기울면 같이 기운다.
const CONFETTI = ['#ff6b6b', '#ffd84a', '#5d95ff', '#5cc96b', '#ff8fc7', '#b07bff'];
const rand = (a, b) => a + Math.random() * (b - a);

class Pool {
  constructor(parent, geo, mat, max) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false; // 입자가 판 여기저기 흩어져서 경계 계산이 맞지 않음
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.max = max;
    this.items = Array.from({ length: max }, () => ({ on: false }));
    this.next = 0;
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) { this.mesh.setMatrixAt(i, zero); this.mesh.setColorAt(i, this.color.set('#ffffff')); }
    this.zero = zero;
    parent.add(this.mesh);
  }

  // 빈 칸이 없으면 가장 오래된 칸을 덮어씀
  spawn(o) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const p = this.items[i];
    Object.assign(p, { on: true, life: 0, max: 0.5, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, drag: 0, size: 0.15,
      sx: 1, sy: 1, sz: 1, rx: 0, ry: 0, rz: 0, spin: 0, grow: 0, floor: -Infinity }, o);
    this.mesh.setColorAt(i, this.color.set(o.color ?? '#ffffff'));
    this.mesh.instanceColor.needsUpdate = true;
    return p;
  }

  update(dt) {
    const d = this.dummy;
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const p = this.items[i];
      if (!p.on) continue;
      any = true;
      p.life += dt;
      const k = p.life / p.max;
      if (k >= 1) { p.on = false; this.mesh.setMatrixAt(i, this.zero); continue; }
      p.vy -= p.g * dt;
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vx *= dr; p.vz *= dr; if (p.g === 0) p.vy *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.floor) { p.y = p.floor; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; } // 바닥에 한 번 통
      p.rx += p.spin * dt; p.rz += p.spin * 0.7 * dt;
      // 크기: grow > 0 이면 처음에 부풀었다가(먼지) 줄어듦, 아니면 끝에서만 줄어듦
      const s = p.grow > 0
        ? p.size * (k < p.grow ? 0.35 + 0.65 * (k / p.grow) : 1 - ((k - p.grow) / (1 - p.grow)) ** 2)
        : p.size * (1 - k * k * k);
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(p.rx, p.ry, p.rz);
      d.scale.set(s * p.sx, s * p.sy, s * p.sz);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    if (any || this.dirty) this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = any; // 마지막 입자가 꺼진 프레임에도 한 번 더 올림
  }
}

export class Fx {
  // lite: 폰은 입자 수를 줄임
  constructor(parent, lite = false) {
    this.k = lite ? 0.5 : 1;
    this.chunks = new Pool(parent, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), lite ? 220 : 520);
    const puffMat = toon('#f3f0ea');
    this.puffs = new Pool(parent, new THREE.IcosahedronGeometry(1, 1), puffMat, lite ? 90 : 220);
  }

  n(count) { return Math.max(1, Math.round(count * this.k)); }

  // 맞은 자리에서 밀려나는 방향으로 튀는 파편. power: 서버가 알려준 밀린 세기 (보통 밀치기 ≈ 20)
  sparks(x, y, z, dx, dz, power, color) {
    const p = Math.min(2.6, Math.max(0.5, power / 20));
    const count = this.n(5 + p * 7);
    for (let i = 0; i < count; i++) {
      const a = Math.atan2(dz, dx) + rand(-0.75, 0.75), sp = rand(5, 12) * (0.6 + p * 0.4);
      this.chunks.spawn({
        x, y: y + rand(-0.3, 0.3), z, vx: Math.cos(a) * sp, vy: rand(2, 7) * (0.7 + p * 0.3), vz: Math.sin(a) * sp,
        g: 24, max: rand(0.3, 0.6), size: rand(0.1, 0.2) * (0.8 + p * 0.25), spin: rand(-12, 12),
        color: i % 3 === 0 ? color : i % 3 === 1 ? '#ffffff' : '#ffe27a',
      });
    }
  }

  // 사방으로 퍼지는 별 조각 (KO, 폭발)
  burst(x, y, z, color, count = 14, speed = 9) {
    count = this.n(count);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.2, 0.2), sp = speed * rand(0.7, 1.2);
      this.chunks.spawn({
        x, y, z, vx: Math.cos(a) * sp, vy: rand(3, 8), vz: Math.sin(a) * sp, g: 22, max: rand(0.45, 0.8),
        size: rand(0.14, 0.26), spin: rand(-14, 14), color: i % 2 ? color : '#ffffff',
      });
    }
  }

  // 먼지 덩어리. spread: 퍼지는 속도, up: 떠오르는 속도
  puff(x, y, z, count = 4, spread = 2, size = 0.3, up = 1.2) {
    count = this.n(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = spread * rand(0.4, 1);
      this.puffs.spawn({
        x: x + Math.cos(a) * 0.15, y, z: z + Math.sin(a) * 0.15, vx: Math.cos(a) * sp, vy: up * rand(0.5, 1), vz: Math.sin(a) * sp,
        drag: 3.5, max: rand(0.35, 0.6), size: size * rand(0.7, 1.2), grow: 0.25, ry: Math.random() * 6,
      });
    }
  }

  // 원 모양으로 퍼지는 먼지 (착지, 충격파)
  puffRing(x, z, radius, count = 12) {
    count = this.n(count);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.15, 0.15);
      this.puffs.spawn({
        x: x + Math.cos(a) * 0.5, y: 0.22, z: z + Math.sin(a) * 0.5, vx: Math.cos(a) * radius * 2.6, vy: rand(0.4, 1.2), vz: Math.sin(a) * radius * 2.6,
        drag: 4, max: rand(0.4, 0.65), size: rand(0.28, 0.45), grow: 0.2, ry: Math.random() * 6,
      });
    }
  }

  // 무너지는 타일 조각
  debris(x, z, color, count = 5) {
    count = this.n(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(0.1, 0.8);
      this.chunks.spawn({
        x: x + Math.cos(a) * r, y: rand(-0.1, 0.2), z: z + Math.sin(a) * r, vx: Math.cos(a) * rand(0.5, 3), vy: rand(2, 6), vz: Math.sin(a) * rand(0.5, 3),
        g: 26, max: rand(0.6, 1), size: rand(0.16, 0.34), spin: rand(-8, 8), color,
      });
    }
  }

  // 꽃가루: 얇은 조각이 위로 솟았다가 팔랑팔랑 내려옴
  confetti(x, y, z, count = 30, speed = 8, color = null) {
    count = this.n(count);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, sp = rand(0.5, 3.5);
      this.chunks.spawn({
        x, y, z, vx: Math.cos(a) * sp, vy: speed * rand(0.6, 1.2), vz: Math.sin(a) * sp, g: 9, drag: 1.2, max: rand(1.2, 2),
        size: rand(0.16, 0.26), sx: 1, sy: 0.12, sz: 0.65, spin: rand(-10, 10), rx: Math.random() * 6,
        color: color && i % 2 ? color : CONFETTI[i % CONFETTI.length],
      });
    }
  }

  // 달릴 때 뒤로 날리는 줄기 (돌진, 세게 밀려 날아갈 때)
  streak(x, y, z, dx, dz, color = '#ffffff') {
    const a = Math.atan2(dz, dx);
    this.chunks.spawn({
      x: x + rand(-0.3, 0.3), y: y + rand(-0.4, 0.5), z: z + rand(-0.3, 0.3), vx: -dx * 2, vz: -dz * 2,
      max: 0.22, size: 0.09, sx: 9, sy: 1, sz: 1, ry: -a, color,
    });
  }

  update(dt) {
    this.chunks.update(dt);
    this.puffs.update(dt);
  }
}
