// 계정: 아이디 + 비밀번호. 성장 저장(레벨 · 도감 · 칭호 ...)과 경쟁전 점수를 서버에 보관한다.
// 경쟁전 점수(rp · peakTier · 판 수)는 서버만 바꾼다 — 브라우저가 올린 저장에서는 무시한다.
// 저장 위치: DATA_DIR(기본 ./data)/accounts.json. 바뀌면 1초 뒤 한 번에 씀 (임시 파일 → 이름 바꾸기)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = path.resolve(process.env.DATA_DIR || 'data');
const FILE = path.join(DIR, 'accounts.json');
const NAME_RE = /^[0-9A-Za-z가-힣_]{2,12}$/;
const MAX_SAVE = 200_000; // 저장 한 개 최대 크기 (글자 수)

let db = { users: {} }; // key(소문자 아이디) → { name, salt, hash, tokens[], save, rank: { rp, peakTier, games, wins } }
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
db.users ??= {};
const byToken = new Map();
for (const [key, u] of Object.entries(db.users)) for (const t of u.tokens ?? []) byToken.set(t, key);

let writeTimer = null;
function persist() {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(FILE + '.tmp', JSON.stringify(db));
      fs.renameSync(FILE + '.tmp', FILE);
    } catch (e) { console.error('계정 저장 실패', e.message); }
  }, 1000);
}
export function flush() { if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(db)); } }

const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
const newRank = () => ({ rp: 0, peakTier: 0, games: 0, wins: 0 });

function issueToken(key) {
  const u = db.users[key], t = crypto.randomBytes(24).toString('hex');
  u.tokens = [...(u.tokens ?? []), t].slice(-5); // 기기 5개까지 로그인 유지
  byToken.clear();
  for (const [k, x] of Object.entries(db.users)) for (const tk of x.tokens ?? []) byToken.set(tk, k);
  persist();
  return t;
}

export function register(name, pw) {
  name = String(name ?? '').trim();
  if (!NAME_RE.test(name)) return { error: '아이디는 한글 · 영어 · 숫자 2~12자로 해 주세요.' };
  if (String(pw ?? '').length < 4) return { error: '비밀번호는 4자 이상이에요.' };
  const key = name.toLowerCase();
  if (db.users[key]) return { error: '이미 있는 아이디예요.' };
  const salt = crypto.randomBytes(16).toString('hex');
  db.users[key] = { name, salt, hash: hashPw(pw, salt), tokens: [], save: null, rank: newRank(), created: Date.now() };
  return { token: issueToken(key), ...publicInfo(key) };
}

export function login(name, pw) {
  const key = String(name ?? '').trim().toLowerCase(), u = db.users[key];
  if (!u || !crypto.timingSafeEqual(Buffer.from(hashPw(pw, u.salt), 'hex'), Buffer.from(u.hash, 'hex'))) return { error: '아이디나 비밀번호가 틀렸어요.' };
  return { token: issueToken(key), ...publicInfo(key) };
}

export function logout(token) {
  const key = byToken.get(token);
  if (!key) return;
  db.users[key].tokens = db.users[key].tokens.filter(t => t !== token);
  byToken.delete(token);
  persist();
}

export const keyOf = token => (token && byToken.get(String(token))) || null;
export function publicInfo(key) {
  const u = db.users[key];
  return u ? { name: u.name, save: u.save, rank: u.rank ?? newRank() } : null;
}

// 브라우저가 올린 저장: 경쟁전 칸은 서버 값으로 덮어씀
export function putSave(key, save) {
  const u = db.users[key];
  if (!u || !save || typeof save !== 'object') return false;
  const text = JSON.stringify(save);
  if (text.length > MAX_SAVE) return false;
  u.save = JSON.parse(text);
  persist();
  return true;
}

export const getRank = key => (db.users[key] ? (db.users[key].rank ??= newRank()) : null);
export function setRank(key, rank) {
  if (!db.users[key]) return;
  db.users[key].rank = rank;
  persist();
}
