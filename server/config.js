// 게임 수치 모음. 밸런스 조정은 여기서만 한다.
export const CONFIG = {
  TICK_RATE: 30,          // 서버 업데이트 횟수/초
  MAX_PLAYERS: 4,         // 방 하나 최대 인원
  MIN_PLAYERS: 2,         // 라운드 시작 최소 인원
  LOBBY_TIME: 30,         // 대기실에서 이 시간이 지나면 빈자리를 봇으로 채워 자동 시작
  WIN_SCORE: Number(process.env.WIN_SCORE) || 5, // 이 점수에 먼저 도달하면 게임 승리 (테스트: WIN_SCORE=1)

  HEX_RINGS: 7,           // 중앙 타일 바깥으로 몇 겹
  HEX_SIZE: 1.2,          // 타일 크기 (꼭짓점까지 거리)
  PLAYER_RADIUS: 0.6,

  // 라운드마다 이 중 하나를 랜덤 적용
  // 테스트할 때는 환경변수 MAP_RULE=tilt 처럼 하나만 고정 가능
  MAP_RULES: process.env.MAP_RULE ? [process.env.MAP_RULE] : ['collapse', 'tilt', 'ice'],
  CRUMBLE_TIME: 1,        // 균열 난 타일을 다시 밟으면 사라지기까지 (초)
  TILE_RESPAWN_TIME: 3,   // 사라진 타일이 다시 생기기까지 (초)
  MAX_TILT: 0.4,          // 최대 기울기 (라디안, 약 23도)
  TILT_SENSITIVITY: 2.5,  // 무게중심이 조금만 쏠려도 크게 기울도록
  TILT_SPEED: 1.2,        // 기울기 변화 속도 (라디안/초)
  TILT_GRAVITY: 68,       // 기울기 1라디안당 미끄러지는 가속도

  // 스킬/규칙 카드 (스킬별 쿨다운은 skills.js)
  SKILL_SLOTS: 2,
  SLAM_AIR_TIME: 0.6,     // 내려찍기 체공 시간
  ORB_RADIUS: 5.5,        // 블랙홀 끌어당기는 범위
  ORB_PULL: 75,           // 블랙홀 끌어당기는 힘 (가운데일수록 셈, 이동 가속도 45보다 크면 못 빠져나옴)
  DASH_HIT_MULT: 1.5,     // 돌진에 부딪힌 상대 넉백 배율
  ICE_TRAIL_TIME: 2,      // 얼음 발자국 유지 시간
  ICE_TRAIL_RADIUS: 0.9,
  GAMBLER_MIN: 0.7, GAMBLER_MAX: 2,
  EDGE_KING_MAX: 0.4,

  PICK_TIME: 10,        // 능력 선택 제한 시간 (넘으면 자동 선택)
  PICK_OPTIONS: 3,        // 제시되는 능력 개수

  MOVE_ACCEL: 42,
  MAX_SPEED: 8.2,
  FRICTION: 4.5,          // 클수록 빨리 멈춤 (낮으면 살짝 미끄러짐)
  ICE_FRICTION: 1.1,      // 빙판길 마찰
  ICE_ACCEL_MULT: 0.55,   // 빙판길에서는 가속도 덜 붙음

  ATTACK_RANGE: 2.6,      // 캐릭터 중심 기준 (밀치기가 닿는 거리)
  ATTACK_ANGLE: Math.PI * 0.4, // 정면 기준 좌우 허용 각도 (72도)
  ATTACK_COOLDOWN: 0.4,
  ATTACK_DAMAGE: 25,
  KNOCKBACK: 20,          // 밀려나는 거리 ≈ KNOCKBACK / FRICTION
  STUN_KNOCKBACK_MULT: 2.5, // 기절 중 넉백 배율

  MAX_HP: 100,
  HP_REGEN: 6,            // 평소 회복량/초
  STUN_HP_REGEN: 25,      // 기절 중 회복량/초
  STUN_RECOVER_HP: 50,    // 이 체력이 되면 기절 해제
  STUN_IMMUNE_TIME: 1.5,  // 기절 해제 후 재기절 면역 시간

  EMOTE_COUNT: 4,         // 이모티콘 종류 수 (화면 쪽 목록과 맞춤)
  EMOTE_TIME: 2.5,        // 말풍선 표시 시간
  EMOTE_COOLDOWN: 0.8,    // 연속 사용 제한

  COUNTDOWN_TIME: 3,
  ROUND_END_TIME: 3,
  RESULT_TIME: 30,        // 최종 순위 화면 (다 같이 '다시 하기' 누르면 바로 새 게임)
  FALL_TIME: 1,           // 판 밖으로 나간 뒤 탈락 처리까지
};
