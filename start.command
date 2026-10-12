#!/bin/bash
# 게스트북 키오스크 · 맥 실행 파일
# 더블클릭하면 메뉴가 떠요. (처음 한 번은 우클릭 → 열기)

cd "$(dirname "$0")"
PORT=8765
URL="http://localhost:$PORT"

# ── 모니터 배치: 화면이 여러 대면 창이 뜰 위치(왼쪽 위 좌표)를 바꿔 주세요 ──
KIOSK_POS="0,0"        # 키오스크(위+아래) 또는 위 화면
BOTTOM_POS="0,1200"    # 아래 화면 (위·아래 따로 쓸 때)
WALL_POS="1920,0"      # 게스트북 벽

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ ! -x "$CHROME" ]; then
  osascript -e 'display alert "Google Chrome이 필요해요" message "응용 프로그램 폴더에 Google Chrome을 설치해 주세요."'
  exit 1
fi
# 전시용 크롬 프로필 (평소 쓰는 크롬과 분리, 게스트북 데이터가 여기에 저장돼요)
PROFILE="$HOME/Library/Application Support/FaceGuestbook-Chrome"

# 작은 로컬 서버 (카메라·얼굴 인식은 http://localhost 에서만 동작)
if ! lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  python3 serve.py $PORT >/dev/null 2>&1 &
  sleep 1
fi

FLAGS=(
  --user-data-dir="$PROFILE"
  --no-first-run --no-default-browser-check
  --kiosk-printing                      # 인쇄 대화상자 없이 기본 프린터로 바로
  --use-fake-ui-for-media-stream        # 카메라 허용 창 안 띄움
  --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows
  --autoplay-policy=no-user-gesture-required
  --overscroll-history-navigation=0 --noerrdialogs --disable-session-crashed-bubble --disable-features=Translate
)

open_win() { # 주소, 위치
  "$CHROME" "${FLAGS[@]}" --app="$URL/$1" --window-position="$2" --window-size=1080,1920 >/dev/null 2>&1 &
  sleep 2
}

CHOICE=$(osascript -e 'choose from list {"키오스크 + 게스트북 벽", "키오스크만 (세로 모니터 한 대)", "위 · 아래 화면 따로 + 게스트북 벽", "게스트북 벽만", "관리 화면"} with title "게스트북" with prompt "무엇을 열까요?" default items {"키오스크 + 게스트북 벽"}')
case "$CHOICE" in
  "키오스크 + 게스트북 벽")             open_win "kiosk.html?screen=both" "$KIOSK_POS"; open_win "wall.html" "$WALL_POS" ;;
  "키오스크만 (세로 모니터 한 대)")    open_win "kiosk.html?screen=both" "$KIOSK_POS" ;;
  "위 · 아래 화면 따로 + 게스트북 벽")   open_win "kiosk.html?screen=top" "$KIOSK_POS"; open_win "kiosk.html?screen=bottom" "$BOTTOM_POS"; open_win "wall.html" "$WALL_POS" ;;
  "게스트북 벽만")                      open_win "wall.html" "$WALL_POS" ;;
  "관리 화면")                        "$CHROME" "${FLAGS[@]}" "$URL/index.html" >/dev/null 2>&1 & ;;
  *) exit 0 ;;
esac
echo "열었어요. 각 창을 한 번 누르면 전체 화면이 돼요. 이 창은 닫아도 돼요."
