// 계정 · 경쟁전 서버 테스트: node tools/accounttest.mjs → ALL OK
// 임시 폴더에 계정을 만들고, 사람 4명 경쟁전에서 한 명이 도중에 나가면 꼴찌가 되는지 본다
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-acc-'));
const { CONFIG: C } = await import('../server/config.js');
const A = await import('../server/accounts.js');
const { Room } = await import('../server/room.js');
const P = await import('../public/js/progress.js');

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log('  ✗', msg); } };

// 가입 · 로그인
check(A.register('a', '1234').error, '아이디가 너무 짧으면 거절');
check(A.register('철수', '12').error, '비밀번호가 너무 짧으면 거절');
const keys = [];
for (const n of ['철수', '영희', 'Mina', 'bob_1']) { const r = A.register(n, 'pass1234'); check(r.token, `${n} 가입`); keys.push(A.keyOf(r.token)); }
check(A.register('MINA', 'x1234').error, '대소문자만 다른 아이디는 같은 아이디');
check(A.login('철수', 'wrong').error && A.login('철수', 'pass1234').token, '로그인: 틀린 비밀번호 거절, 맞으면 토큰');
const t = A.login('영희', 'pass1234').token; A.logout(t); check(!A.keyOf(t), '로그아웃하면 토큰 무효');
A.putSave(keys[0], { xp: 999, rp: 99999 }); check(A.getRank(keys[0]).rp === 0, '올린 저장으로 경쟁전 점수를 못 바꿈');

// 경쟁전 한 판: 4명 중 bob_1이 첫 라운드 도중 나감
C.MAP_RULES = ['collapse']; C.MAP_SHAPES = { full: 1 }; C.TEST_CARDS = [];
const room = new Room('0009', { kind: 'ranked' });
const sock = { readyState: 1, send() {} };
keys.forEach((k, i) => { room.addPlayer(i + 1, sock); room.setAccount(i + 1, k); });
room.startRequested = true; room.hostId = 1;
const DT = 1 / C.TICK_RATE;
let quit = false;
for (let tk = 0; tk < 60 * 60 * C.TICK_RATE && room.phase !== 'gameOver'; tk++) {
  for (const p of room.players.values()) {
    if (p.offers && !p.picked) room.pick(p.id, p.offers[0].id);
    if (tk % 8 === 0) room.setInput(p.id, { x: -p.x / 9 + Math.random() - 0.5, z: -p.z / 9 + Math.random() - 0.5, attack: true });
  }
  if (!quit && room.phase === 'playing') { room.removePlayer(4); quit = true; }
  room.tick(DT);
}
check(room.phase === 'gameOver', '경쟁전 한 판이 끝남');
const quitter = A.getRank(keys[3]);
check(quitter.games === 1 && quitter.rp === 0, `나간 사람은 꼴찌(4등) 처리 (${JSON.stringify(quitter)})`);
const res = room.results;
check(res.length === 3 && res.every(r => r.rk), '남은 3명 모두 점수 결과가 순위에 실림');
for (const r of res) {
  const k = A.getRank(keys[r.id - 1]);
  check(k.rp === r.rk.after && k.games === 1, `${r.name} ${r.rank}등 → 계정 점수 ${k.rp}`);
  check(r.rk.delta === Math.max(0, P.rpDelta(0, r.rank, 4)) || r.rk.delta === P.rpDelta(0, r.rank, 4) || r.rk.after === 0, `${r.rank}등 점수 변화가 4명 기준`);
}
check(res[0].rk.delta === P.rpDelta(0, 1, 4), '1등은 4명 기준 1등 점수');

// 둘만 남았는데 한 명이 나가면 남은 사람은 1등
const room2 = new Room('0010', { kind: 'ranked' });
room2.addPlayer(1, sock); room2.setAccount(1, keys[0]);
room2.addPlayer(2, sock); room2.setAccount(2, keys[1]);
room2.startRequested = true; room2.hostId = 1;
const before = A.getRank(keys[0]).rp, before2 = A.getRank(keys[1]).rp;
for (let tk = 0; tk < 40; tk++) room2.tick(DT);
room2.removePlayer(2);
check(A.getRank(keys[0]).rp === before + P.rpDelta(before, 1, 2), '혼자 남은 사람은 1등 점수');
check(A.getRank(keys[1]).rp === Math.max(0, before2 + P.rpDelta(before2, 2, 2)), '나간 사람은 꼴찌 점수');

// 파일에 남는지
A.flush();
const disk = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'accounts.json'), 'utf8'));
check(Object.keys(disk.users).length === 4 && !JSON.stringify(disk).includes('pass1234'), '파일에 저장 · 비밀번호는 원문으로 안 남음');
fs.rmSync(process.env.DATA_DIR, { recursive: true });
console.log(failed ? `실패 ${failed}건` : 'ALL OK');
process.exit(failed ? 1 : 0);
