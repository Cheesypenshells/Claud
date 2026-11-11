#!/usr/bin/env bash
# Start the studio dashboard on http://127.0.0.1:8787
set -e
cd "$(dirname "$0")/.."
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
pip install -q -r requirements.txt
exec uvicorn backend.app:app --host 127.0.0.1 --port 8787
