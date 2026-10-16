// 효과음. 소리 파일 없이 Web Audio로 직접 만든다.
// 브라우저는 사용자가 한 번 누른 뒤에만 소리를 낼 수 있어서, 시작 버튼에서 unlock()을 부른다.
let ctx = null, master = null, sfxGain = null;
let volume = 0.7; // 0~1, 화면의 음량 슬라이더
try { const v = localStorage.getItem('volume'); if (v !== null) volume = Number(v); } catch {}

export function unlock() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.55; sfxGain.connect(master);
  master.gain.value = volume;
}

export function getVolume() { return volume; }
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  try { localStorage.setItem('volume', String(volume)); } catch {}
  if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.03);
}

// ---------- 기본 재료 ----------
function tone(freq, dur, { type = 'sine', vol = 0.5, slide = 0, delay = 0 } = {}) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(sfxGain);
  o.start(t); o.stop(t + dur + 0.05);
}

let noiseBuf = null;
function noise(dur, { vol = 0.4, from = 800, to = 3000, q = 1.2, delay = 0 } = {}) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf;
  f.type = 'bandpass'; f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(sfxGain);
  src.start(t); src.stop(t + dur + 0.05);
}

// ---------- 효과음 ----------
const SFX = {
  push: v => noise(0.16, { vol: 0.5 * v, from: 600, to: 2600 }),
  hit: v => { tone(140, 0.18, { type: 'triangle', vol: 0.7 * v, slide: 0.5 }); noise(0.08, { vol: 0.35 * v, from: 2000, to: 500 }); },
  stun: () => { tone(880, 0.12, { type: 'square', vol: 0.12 }); tone(660, 0.12, { type: 'square', vol: 0.12, delay: 0.1 }); },
  fall: v => tone(520, 0.7, { type: 'sine', vol: 0.4 * v, slide: 0.25 }),
  card: () => noise(0.06, { vol: 0.3, from: 3000, to: 5000, q: 3 }),
  pick: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.35, delay: i * 0.06 })),
  beep: () => tone(660, 0.12, { type: 'square', vol: 0.15 }),
  go: () => tone(990, 0.3, { type: 'square', vol: 0.18 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.35, delay: i * 0.1 })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.3, delay: i * 0.14 })),
  boom: v => { tone(90, 0.4, { type: 'sine', vol: 0.8 * v, slide: 0.5 }); noise(0.3, { vol: 0.4 * v, from: 400, to: 120 }); },
  whoosh: v => noise(0.3, { vol: 0.45 * v, from: 300, to: 3500, q: 0.8 }),
  warp: v => tone(300, 0.35, { type: 'sawtooth', vol: 0.15 * v, slide: 4 }),
  crack: v => noise(0.05, { vol: 0.3 * v, from: 4000, to: 1500, q: 4 }),
  emote: () => tone(1200, 0.08, { type: 'sine', vol: 0.2, slide: 1.5 }),
  click: () => tone(800, 0.05, { type: 'square', vol: 0.1 }),
  // 희귀 카드: 짧게 반짝
  rare: () => { noise(0.06, { vol: 0.3, from: 3000, to: 5000, q: 3 }); [1319, 1760].forEach((f, i) => tone(f, 0.14, { type: 'sine', vol: 0.18, delay: 0.04 + i * 0.06 })); },
  // 전설 카드: 반짝이는 상승음 + 화음
  legend: () => {
    [784, 988, 1175, 1568, 1976, 2349].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.22, delay: i * 0.05 }));
    [523, 659, 784, 1047].forEach(f => tone(f, 0.9, { type: 'sine', vol: 0.16, delay: 0.32 }));
    noise(0.5, { vol: 0.15, from: 6000, to: 9000, q: 2, delay: 0.3 });
  },
  // 신화 카드: 낮은 울림 + 올라가는 화음 + 반짝임
  mythic: () => {
    tone(70, 1.3, { type: 'sawtooth', vol: 0.35, slide: 0.6 });
    [392, 523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.45, { type: 'triangle', vol: 0.2, delay: 0.1 + i * 0.07 }));
    [262, 330, 392, 523].forEach(f => tone(f, 1.5, { type: 'sine', vol: 0.18, delay: 0.75 }));
    noise(0.9, { vol: 0.2, from: 5000, to: 10000, q: 2, delay: 0.5 });
  },
  timestop: () => {
    [880, 660, 440, 330].forEach((f, i) => tone(f, 0.3, { type: 'sine', vol: 0.3, delay: i * 0.08 }));
    noise(0.5, { vol: 0.2, from: 2000, to: 200 });
  },
  // 새 카드
  slip: v => { tone(900, 0.4, { type: 'sine', vol: 0.3 * v, slide: 0.3 }); noise(0.25, { vol: 0.25 * v, from: 2500, to: 600 }); },
  mirror: v => [880, 740, 622, 523].forEach((f, i) => tone(f, 0.12, { type: 'sine', vol: 0.2 * v, delay: i * 0.05 })),
  magnet: v => tone(180, 0.35, { type: 'sawtooth', vol: 0.15 * v, slide: 2.5 }),
  ghost: v => tone(500, 0.6, { type: 'sine', vol: 0.18 * v, slide: 1.6 }),
  quake: v => { tone(60, 0.9, { type: 'sawtooth', vol: 0.35 * v, slide: 0.7 }); noise(0.6, { vol: 0.45 * v, from: 300, to: 80, q: 0.7 }); },
  sneeze: v => { noise(0.12, { vol: 0.25 * v, from: 2000, to: 4000, q: 2 }); noise(0.25, { vol: 0.5 * v, from: 3000, to: 900, delay: 0.14 }); },
  flag: v => tone(1320, 0.12, { type: 'triangle', vol: 0.2 * v, slide: 1.3 }),
  // 시상대 팡파르
  fanfare: () => {
    [[523, 0], [523, 0.12], [523, 0.24], [659, 0.36], [784, 0.6], [659, 0.78], [784, 0.9]].forEach(([f, d]) => tone(f, 0.2, { type: 'square', vol: 0.12, delay: d }));
    [523, 659, 784, 1047].forEach(f => tone(f, 1.1, { type: 'triangle', vol: 0.18, delay: 1.05 }));
  },
};

// 겹침 줄이기: 같은 소리는 0.07초 안에 다시 안 냄, 동시에 최대 6개
const MIN_GAP = 0.07, MAX_VOICES = 6;
const lastAt = {};
let voices = [];

// v: 볼륨 배율 (멀리 있는 소리는 작게)
export function play(name, v = 1) {
  if (!ctx || volume <= 0 || !SFX[name] || v <= 0.05) return;
  const now = ctx.currentTime;
  if (now - (lastAt[name] ?? -1) < MIN_GAP) return;
  voices = voices.filter(t => t > now);
  if (voices.length >= MAX_VOICES) return;
  lastAt[name] = now;
  voices.push(now + 0.3);
  SFX[name](Math.min(1, v));
}
