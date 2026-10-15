# Push Arena

판 위에서 서로 밀쳐 떨어뜨리는 웹 멀티플레이 게임.

## 실행
```
npm install
npm start
```
브라우저에서 http://localhost:3000 접속 (탭 2개 이상 열면 라운드 시작).
혼자 테스트: 표지에서 "봇이랑 연습하기" (봇 3명과 나만의 방)
맵 규칙 하나만 테스트: `MAP_RULE=collapse npm start` 또는 `MAP_RULE=tilt npm start`, `MAP_RULE=ice npm start`

## 구조
- `server/config.js` — 모든 게임 수치
- `server/arena.js` — 육각형 타일 맵 (타일별 alive 상태, 발밑 판정)
- `server/abilities.js` — 능력 카드 23장 (스탯/스킬/규칙/트레이드오프, 등급 확률 일반 60·희귀 30·전설 10)
- `server/skills.js` — 스킬 6종 (돌진, 방어막, 충격파, 순간교체, 내려찍기, 블랙홀 구슬)
- `server/bot.js` — 연습용 봇 AI (상대 추적, 낙하 지점 회피, 밀치기)
- `server/room.js` — 방 1개의 게임 로직 (이동, 밀치기, 체력/기절, 라운드)
- `server/index.js` — HTTP + WebSocket, 방 배정 (4명 차면 새 방)
- `public/client.js` — Three.js 씬, 맵/효과, 네트워크, 입력
- `public/js/character.js` — 캐릭터 모델(후드티 캐릭터), 표정, 모션(대기/이동/밀치기/맞기/기절/낙하)
- `public/js/ui.js` — 표지, 능력 카드, HUD, 이름표

## 단계
- [x] 1단계: 접속, 이동, 밀치기, 체력/기절, 낙하, 라운드
- [x] 육각형 타일 맵, 라운드 사이 능력 선택 (3장 중 1장, 누적)
- [x] 맵 규칙 (라운드마다 랜덤): 바닥 붕괴 / 무게 기반 기울기 / 빙판길
- [x] 액티브 스킬 (Q·E 두 칸, 3번째부터 교체)
- [ ] 아이디어 후보: 탈락자 유령, 처치 점수, 태그 보너스, 팀전
- [ ] 마지막: 그래픽, 밸런스, 디테일
