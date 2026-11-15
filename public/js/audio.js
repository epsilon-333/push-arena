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
  const want = songName; songName = 'off'; if (want !== 'off') setMusic(want); // 켜기 전에 정해 둔 곡
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
  // 내 밀치기가 맞음: 묵직하게 '퍽' (세게 맞히면 더 낮고 크게)
  smack: () => { tone(220, 0.12, { type: 'square', vol: 0.22, slide: 0.35 }); noise(0.07, { vol: 0.55, from: 1800, to: 300, q: 0.8 }); },
  smackBig: () => { tone(160, 0.22, { type: 'square', vol: 0.3, slide: 0.3 }); tone(70, 0.3, { type: 'sine', vol: 0.7, slide: 0.5 }); noise(0.14, { vol: 0.7, from: 2400, to: 200, q: 0.7 }); },
  // KO: 올라가는 두 음 + 반짝
  ko: () => { [659, 988].forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.2, delay: i * 0.08 })); tone(1319, 0.35, { type: 'triangle', vol: 0.3, delay: 0.16 }); noise(0.2, { vol: 0.2, from: 5000, to: 9000, q: 2, delay: 0.16 }); },
  multi: () => { [659, 831, 988, 1319, 1661].forEach((f, i) => tone(f, 0.16, { type: 'square', vol: 0.2, delay: i * 0.065 })); [988, 1319, 1976].forEach(f => tone(f, 0.6, { type: 'triangle', vol: 0.22, delay: 0.34 })); noise(0.4, { vol: 0.25, from: 5000, to: 10000, q: 2, delay: 0.3 }); },
  // 완전히 떨어짐: '뽁'
  pop: v => { tone(300, 0.14, { type: 'sine', vol: 0.5 * v, slide: 3 }); noise(0.1, { vol: 0.25 * v, from: 1500, to: 5000, q: 1.5, delay: 0.05 }); },
  // 결정타 슬로모션: 낮게 가라앉는 울림
  slowmo: () => { tone(110, 1.1, { type: 'sine', vol: 0.6, slide: 0.4 }); tone(440, 0.9, { type: 'triangle', vol: 0.12, slide: 0.5 }); },
  // 서든데스 경보
  alarm: () => [0, 0.22, 0.44].forEach(d => { tone(880, 0.16, { type: 'sawtooth', vol: 0.16, delay: d, slide: 0.75 }); }),
  matchpoint: () => [784, 784, 1047].forEach((f, i) => tone(f, i === 2 ? 0.4 : 0.1, { type: 'square', vol: 0.14, delay: i * 0.13 })),
  // 성장: 레벨업, 새로 열림
  levelup: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.3, delay: i * 0.07 })); noise(0.4, { vol: 0.15, from: 6000, to: 10000, q: 2, delay: 0.3 }); },
  unlock: () => { [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.25, { type: 'sine', vol: 0.22, delay: i * 0.09 })); },
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

// ---------- 배경 음악 (파일 없이 만든 짧은 반복 곡) ----------
// setMusic('menu' | 'game' | 'sudden' | 'off'). 박자마다 조금 앞서 예약해 끊김 없이 이어 붙인다
const SONGS = {
  // bpm, 화음 진행(근음 Hz), 멜로디(반음, null=쉼), 드럼 켬
  menu: { bpm: 92, chords: [220, 174.6, 261.6, 196], mel: [7, null, 4, null, 2, 4, null, null, 0, null, 2, 4, 7, null, 4, null], drums: false, vol: 0.5 },
  game: { bpm: 128, chords: [220, 220, 174.6, 196], mel: [12, null, 7, 12, null, 10, 7, null, 5, 7, null, 3, 5, null, 7, null], drums: true, vol: 0.55 },
  sudden: { bpm: 156, chords: [220, 233.1, 220, 207.7], mel: [12, 11, 12, null, 15, null, 12, null, 11, 12, 11, null, 8, null, 7, null], drums: true, vol: 0.6 },
};
let musicGain = null, song = null, songName = 'off', step = 0, nextAt = 0, musicTimer = 0;
const semi = (f, n) => f * 2 ** (n / 12);
function mtone(freq, t, dur, type, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + dur + 0.05);
}
function mnoise(t, dur, vol, freq) {
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  if (!noiseBuf) noise(0.01, { vol: 0.0001 });
  src.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(musicGain); src.start(t); src.stop(t + dur + 0.05);
}
function scheduleMusic() {
  if (!ctx || !song) return;
  const s8 = 60 / song.bpm / 2; // 8분음표
  while (nextAt < ctx.currentTime + 0.25) {
    const i = step % 16, root = song.chords[Math.floor(step / 16) % song.chords.length];
    if (i % 4 === 0) mtone(root / 2, nextAt, s8 * 3.5, 'triangle', 0.32);            // 베이스
    if (i % 2 === 1) [0, 4, 7].forEach(n => mtone(semi(root, n), nextAt, s8 * 0.8, 'square', 0.035)); // 뒷박 화음
    const m = song.mel[i];
    if (m !== null) mtone(semi(root * 2, m), nextAt, s8 * 1.6, 'triangle', 0.09);
    if (song.drums) {
      if (i % 4 === 0) mtone(110, nextAt, 0.14, 'sine', 0.55);   // 쿵
      if (i % 8 === 4) mnoise(nextAt, 0.12, 0.25, 1500);         // 짝
      mnoise(nextAt, 0.03, 0.06, 7000);                          // 칙
    }
    nextAt += s8; step++;
  }
}
export function setMusic(name) {
  if (name === songName) return;
  songName = name;
  if (!ctx) return;
  if (!musicGain) { musicGain = ctx.createGain(); musicGain.gain.value = 0; musicGain.connect(master); }
  const target = SONGS[name]?.vol ?? 0;
  musicGain.gain.setTargetAtTime(target * musicVolume * 0.5, ctx.currentTime, 0.4);
  if (!SONGS[name]) { setTimeout(() => { if (songName === name) song = null; }, 1500); return; }
  const wasPlaying = !!song;
  song = SONGS[name];
  if (!wasPlaying) { step = 0; nextAt = ctx.currentTime + 0.1; }
  if (!musicTimer) musicTimer = setInterval(scheduleMusic, 80);
}
let musicVolume = 1;
try { const v = localStorage.getItem('musicOn'); if (v === '0') musicVolume = 0; } catch {}
export const musicOn = () => musicVolume > 0;
export function toggleMusic() {
  musicVolume = musicVolume > 0 ? 0 : 1;
  try { localStorage.setItem('musicOn', musicVolume ? '1' : '0'); } catch {}
  if (musicGain) musicGain.gain.setTargetAtTime((SONGS[songName]?.vol ?? 0) * musicVolume * 0.5, ctx.currentTime, 0.2);
  return musicOn();
}
