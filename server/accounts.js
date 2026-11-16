// 계정: 아이디 + 비밀번호. 성장 저장(레벨 · 도감 · 칭호 ...)과 경쟁전 점수를 서버에 보관한다.
// 경쟁전 점수(rp · peakTier · 판 수)는 서버만 바꾼다 — 브라우저가 올린 저장에서는 무시한다.
// 저장 위치:
//   SUPABASE_URL · SUPABASE_SERVICE_KEY 가 있으면 Supabase의 accounts 표 (supabase/schema.sql). 바뀐 계정 한 줄씩 1초 뒤 올림
//   없으면 DATA_DIR(기본 ./data)/accounts.json 파일 (내 컴퓨터 테스트용)
// 서버가 켜질 때 init()으로 모두 읽어 와서 메모리에 두고 쓴다
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = path.resolve(process.env.DATA_DIR || 'data');
const FILE = path.join(DIR, 'accounts.json');
const NAME_RE = /^[0-9A-Za-z가-힣_]{2,12}$/;
const MAX_SAVE = 200_000; // 저장 한 개 최대 크기 (글자 수)

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, ''), SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';
export const backend = SB_URL && SB_KEY ? 'supabase' : 'file';
const sb = (pathAndQuery, opt = {}) => fetch(`${SB_URL}/rest/v1/${pathAndQuery}`, {
  ...opt, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', ...(opt.headers ?? {}) },
});

let db = { users: {} }; // key(소문자 아이디) → { name, salt, hash, tokens[], save, rank: { rp, peakTier, games, wins } }
const byToken = new Map();
const reindex = () => { byToken.clear(); for (const [key, u] of Object.entries(db.users)) for (const t of u.tokens ?? []) byToken.set(t, key); };

// 서버가 켜질 때 한 번. Supabase는 1000줄씩 나눠 읽음
export async function init() {
  if (backend === 'file') {
    try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  } else {
    for (let from = 0; ; from += 1000) {
      const r = await sb('accounts?select=key,data&order=key', { headers: { Range: `${from}-${from + 999}` } });
      if (!r.ok) throw new Error(`Supabase에서 계정을 못 읽음 (${r.status}) ${await r.text()}`);
      const rows = await r.json();
      for (const row of rows) db.users[row.key] = row.data;
      if (rows.length < 1000) break;
    }
  }
  db.users ??= {};
  reindex();
  console.log(`계정 ${Object.keys(db.users).length}개 (${backend === 'supabase' ? 'Supabase' : FILE})`);
}

// 바뀐 계정은 1초 뒤 한 번에 저장. 실패하면 다음 저장 때 다시 시도
let writeTimer = null;
const dirty = new Set();
function persist(key) {
  if (key) dirty.add(key);
  clearTimeout(writeTimer);
  writeTimer = setTimeout(() => { writeTimer = null; flush().catch(e => console.error('계정 저장 실패', e.message)); }, 1000);
}
export async function flush() {
  clearTimeout(writeTimer); writeTimer = null;
  if (backend === 'file') {
    dirty.clear();
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE + '.tmp', JSON.stringify(db));
    fs.renameSync(FILE + '.tmp', FILE);
    return;
  }
  const keys = [...dirty];
  if (!keys.length) return;
  dirty.clear();
  const rows = keys.filter(k => db.users[k]).map(k => ({ key: k, data: db.users[k], updated_at: new Date().toISOString() }));
  const r = await sb('accounts?on_conflict=key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows) });
  if (!r.ok) { keys.forEach(k => dirty.add(k)); throw new Error(`Supabase 저장 실패 (${r.status}) ${await r.text()}`); }
}

const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
const newRank = () => ({ rp: 0, peakTier: 0, games: 0, wins: 0 });

function issueToken(key) {
  const u = db.users[key], t = crypto.randomBytes(24).toString('hex');
  u.tokens = [...(u.tokens ?? []), t].slice(-5); // 기기 5개까지 로그인 유지
  reindex();
  persist(key);
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
  persist(key);
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
  persist(key);
  return true;
}

export const getRank = key => (db.users[key] ? (db.users[key].rank ??= newRank()) : null);
export function setRank(key, rank) {
  if (!db.users[key]) return;
  db.users[key].rank = rank;
  persist(key);
}
