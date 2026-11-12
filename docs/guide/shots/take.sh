#!/usr/bin/env bash
# Captures guide screenshots from the real UI (mocked backend, sample data).
# Needs `npm run dev` running on port 1420. Writes PNGs to docs/guide/img/.
set -e
cd "$(dirname "$0")/.."
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
PROFILE="$(mktemp -d)"
mkdir -p img
shot() { # name view theme width height
  "$EDGE" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" \
    --force-device-scale-factor=2 --default-background-color=00000000 \
    --virtual-time-budget=4000 --window-size="$4,$5" \
    --screenshot="$PWD/img/$1.png" "http://localhost:1420/docs/guide/shots/shot.html?view=$2&theme=$3" 2>/dev/null
  echo "img/$1.png"
}
shot dashboard dashboard dark 1180 1070
shot dashboard-light dashboard light 1180 1070
shot analytics analytics dark 1180 1250
shot settings settings dark 900 1500
shot onboarding onboarding dark 1180 1000
shot widget widget dark 500 400
shot widget-open widget-open dark 500 400
shot widget-light widget light 500 400
# Crop widget shots to the real window size (2x scale).
python -c "
from PIL import Image
for n,w,h in [('widget',248,44),('widget-open',280,236),('widget-light',248,44)]:
    p='img/'+n+'.png'; Image.open(p).crop((0,0,w*2,h*2)).save(p)"
