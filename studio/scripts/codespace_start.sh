#!/usr/bin/env bash
# Starts the dashboard inside a GitHub Codespace (runs automatically when the codespace opens).
cd "$(dirname "$0")/.."
if curl -s -o /dev/null 127.0.0.1:8787/api/status; then
  echo "Content Studio sudah jalan. Buka tab PORTS -> 8787 -> ikon globe."
  exit 0
fi
echo "Menyalakan Content Studio di port 8787... (biarkan terminal ini terbuka)"
exec uvicorn backend.app:app --host 127.0.0.1 --port 8787
