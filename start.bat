@echo off
chcp 65001 >nul
rem 게스트북 키오스크 · 윈도우 실행 파일
cd /d "%~dp0"
set PORT=8765
set PROFILE=%LOCALAPPDATA%\FaceGuestbook-Chrome
set CHROME="C:\Program Files\Google\Chrome\Application\chrome.exe"
if not exist %CHROME% set CHROME="C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
start "" /min python serve.py %PORT%
timeout /t 2 >nul
set FLAGS=--user-data-dir="%PROFILE%" --no-first-run --kiosk-printing --use-fake-ui-for-media-stream --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
start "" %CHROME% %FLAGS% --app=http://localhost:%PORT%/kiosk.html?screen=both --window-position=0,0
timeout /t 2 >nul
start "" %CHROME% %FLAGS% --app=http://localhost:%PORT%/wall.html --window-position=1920,0
