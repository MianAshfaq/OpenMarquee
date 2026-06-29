#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: ./install-kiosk.sh <OPENMARQUEE_URL> <PAIR_CODE>"
  echo "Example: ./install-kiosk.sh http://10.100.183.50:8787 ABC123"
  exit 1
fi

OPENMARQUEE_URL="$1"
PAIR_CODE="$2"
PLAYER_URL="${OPENMARQUEE_URL%/}/player?code=${PAIR_CODE}"
AUTOSTART_DIR="$HOME/.config/autostart"

sudo apt-get update
sudo apt-get install -y chromium-browser unclutter

mkdir -p "$AUTOSTART_DIR"
cat > "$AUTOSTART_DIR/openmarquee-player.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=OpenMarquee Player
Exec=chromium-browser --kiosk --autoplay-policy=no-user-gesture-required --disable-infobars --noerrdialogs --incognito "${PLAYER_URL}"
X-GNOME-Autostart-enabled=true
EOF

echo "Installed Raspberry Pi kiosk launcher for ${PLAYER_URL}"
echo "Reboot the Pi to test autostart."
