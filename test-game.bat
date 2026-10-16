@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ===== Push Arena 테스트 실행 =====
echo.
echo 맵 규칙 (비우고 엔터 = 랜덤):
echo   collapse 바닥 붕괴 / tilt 기울기 / ice 빙판길 / shrink 축소 / rain 구멍 비
echo   lowgrav 저중력 / spin 회전판 / big 거대화 / bounce 튀는 바닥
set /p MAP_RULE=맵 규칙:
echo.
echo 시작할 때 모두에게 줄 카드 id (비우고 엔터 = 없음, 쉼표로 여러 개):
echo   스킬 예: meteor,timestop,phoenix,giant,clone,mine,jump,teleport,bowling,icezone
echo   신화 카드: timestop meteor phoenix
set /p TEST_CARDS=카드:
echo.
echo 서버를 시작합니다. 잠시 뒤 브라우저가 열려요. (끌 때는 Ctrl+C)
if not exist node_modules call npm install
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
call npm start
pause
