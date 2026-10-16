// 육각형 타일 맵 (pointy-top, axial 좌표 q/r).
// 타일 상태: alive → cracked(균열) → crumbling(무너지는 중) → gone → alive
const SQRT3 = Math.sqrt(3);
const STATE_CODE = { gone: 0, alive: 1, crumbling: 2, cracked: 3 }; // 4 = 영역 표시로 보호된 타일 (serialize 참고)

export class Arena {
  constructor(rings, tileSize) {
    this.rings = rings;
    this.size = tileSize; // 육각형 꼭짓점까지 거리
    this.tiles = new Map(); // "q,r" -> { q, r, x, z, state, timer }
    this.version = 0;       // 타일 상태가 바뀔 때마다 증가
    this.reset();
  }

  reset() {
    this.tiles.clear();
    this.standing = new Map(); // 플레이어 id -> 마지막으로 서 있던 타일 key
    const N = this.rings;
    for (let q = -N; q <= N; q++) {
      for (let r = Math.max(-N, -q - N); r <= Math.min(N, -q + N); r++) {
        const { x, z } = this.toWorld(q, r);
        this.tiles.set(`${q},${r}`, { q, r, x, z, state: 'alive', timer: 0 });
      }
    }
    this.version++;
  }

  toWorld(q, r) {
    return { x: this.size * SQRT3 * (q + r / 2), z: this.size * 1.5 * r };
  }

  // 월드 좌표가 속한 타일 (없으면 null)
  tileAt(x, z) {
    const fq = (SQRT3 / 3 * x - z / 3) / this.size;
    const fr = (2 / 3 * z) / this.size;
    // cube 좌표 반올림
    const fs = -fq - fr;
    let q = Math.round(fq), r = Math.round(fr), s = Math.round(fs);
    const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
    if (dq > dr && dq > ds) q = -r - s;
    else if (dr > ds) r = -q - s;
    return this.tiles.get(`${q},${r}`) ?? null;
  }

  isGround(x, z) {
    const t = this.tileAt(x, z);
    return !!t && t.state !== 'gone';
  }

  // 떨어짐 판정: 몸 중심 + 주변 margin 거리 6곳 중 하나라도 바닥이면 버팀 (가장자리에 걸쳐도 안 떨어짐)
  isStanding(x, z, margin) {
    if (this.isGround(x, z)) return true;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      if (this.isGround(x + Math.cos(a) * margin, z + Math.sin(a) * margin)) return true;
    }
    return false;
  }

  // 바닥 붕괴: 처음 밟으면 균열, 균열 난 타일을 다시 밟으면 crumbleTime 뒤 사라짐,
  // 사라진 타일은 respawnTime 뒤 다시 생김. "밟기" = 다른 타일에서 이 타일로 들어온 순간.
  // walkers: [{ id, x, z, delay? }]  (delay: 이 사람이 밟아 무너지게 된 타일이 추가로 버티는 시간)
  updateCrumble(dt, walkers, crumbleTime, respawnTime) {
    for (const w of walkers) {
      const t = this.tileAt(w.x, w.z);
      const key = t ? `${t.q},${t.r}` : null;
      if (key === this.standing.get(w.id)) continue; // 같은 타일에 계속 서 있음
      this.standing.set(w.id, key);
      if (!t || t.protected) continue; // 영역 표시된 타일은 금이 안 감
      if (t.state === 'alive') { t.state = 'cracked'; this.version++; }
      else if (t.state === 'cracked') { t.state = 'crumbling'; t.timer = crumbleTime + (w.delay || 0); this.version++; }
    }
    for (const t of this.tiles.values()) {
      if (t.state !== 'crumbling' && t.state !== 'gone') continue;
      t.timer -= dt;
      if (t.timer > 0) continue;
      if (t.state === 'crumbling') { t.state = 'gone'; t.timer = respawnTime; }
      else t.state = 'alive';
      this.version++;
    }
  }

  // 스킬(내려찍기)로 타일에 금 내기: 정상 → 균열, 균열 → 무너짐
  crackAt(x, z, crumbleTime) {
    const t = this.tileAt(x, z);
    if (!t || t.protected) return;
    if (t.state === 'alive') { t.state = 'cracked'; this.version++; }
    else if (t.state === 'cracked') { t.state = 'crumbling'; t.timer = crumbleTime; this.version++; }
  }

  // 블랙홀: 중심 타일 한 칸을 뚫었다가, 끝나면 메운다
  punchHole(x, z) {
    const t = this.tileAt(x, z);
    if (!t) return null;
    t.state = 'gone';
    t.timer = Infinity; // 저절로 다시 생기지 않음
    this.version++;
    return t;
  }

  // 지진: 흔들리다가(경고) → 뚫렸다가 → 메움. 저절로 바뀌지 않게 timer는 무한대
  shakeTile(t) { t.state = 'crumbling'; t.timer = Infinity; this.version++; }
  openTile(t) { t.state = 'gone'; t.timer = Infinity; this.version++; }

  // 영역 표시: 이 타일은 이번 라운드 동안 안 무너짐 (금 간 것도 원래대로)
  protect(t, owner) {
    if (t.protected || (t.state !== 'alive' && t.state !== 'cracked')) return false;
    t.protected = owner;
    t.state = 'alive';
    this.version++;
    return true;
  }

  // 중앙에서 몇 겹째 타일인지 (중앙 0, 가장자리 = rings)
  ringOf(t) { return Math.max(Math.abs(t.q), Math.abs(t.r), Math.abs(t.q + t.r)); }

  // 타일 복구: 범위 안의 구멍·무너지는 타일·금 간 타일을 모두 정상으로. 복구한 타일 목록을 돌려줌
  restoreArea(x, z, r) {
    const restored = [];
    for (const t of this.tiles.values()) {
      if (t.state === 'alive' || Math.hypot(t.x - x, t.z - z) > r) continue;
      t.state = 'alive';
      t.timer = 0;
      restored.push(t);
    }
    if (restored.length) this.version++;
    return restored;
  }

  fillHole(t) {
    if (!t || t.state !== 'gone' || t.timer !== Infinity) return;
    t.state = 'alive';
    t.timer = 0;
    this.version++;
  }

  // 시작 위치용: 맵 중심에서 이 정도 떨어진 곳은 항상 타일 위
  get spawnRadius() { return this.size * 1.5 * this.rings * 0.6; }

  serialize() {
    return { size: this.size, version: this.version, tiles: [...this.tiles.values()].map(t => [t.q, t.r, t.protected && t.state === 'alive' ? 4 : STATE_CODE[t.state]]) };
  }
}
