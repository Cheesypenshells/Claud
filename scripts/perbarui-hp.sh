#!/data/data/com.termux/files/usr/bin/bash
# Memperbarui bot di HP ke versi terbaru dari GitHub.
set -euo pipefail
cd "$HOME/cps-bot"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch -q origin "$BRANCH"
git reset -q --hard "origin/$BRANCH"
npm ci --omit=dev --omit=peer --no-audit --no-fund --loglevel=error
echo "Bot diperbarui ke versi $(git log -1 --format='%h %s'). Jalankan lagi dengan: bot"
