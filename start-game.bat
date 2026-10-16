@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Push Arena 서버를 시작합니다. 잠시 뒤 브라우저가 열려요.
echo (이 창을 닫으면 서버가 꺼져요. 끝낼 때는 Ctrl+C)
if not exist node_modules call npm install
start "" cmd /c "timeout /t 2 >nul & start http://localhost:3000"
call npm start
pause
