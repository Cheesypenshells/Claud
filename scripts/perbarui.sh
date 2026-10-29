#!/usr/bin/env bash
# Memperbarui bot ke versi terbaru dari GitHub lalu menyalakan ulang.
set -euo pipefail
cd "$HOME/cps-bot"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git fetch -q origin "$BRANCH"
git reset -q --hard "origin/$BRANCH"
npm ci --omit=dev --no-audit --no-fund --loglevel=error
sudo systemctl restart cps-bot
echo "Bot diperbarui ke versi $(git log -1 --format='%h %s')."
