# Windows: start the studio dashboard on http://127.0.0.1:8787
Set-Location (Join-Path $PSScriptRoot "..")
if (-not (Test-Path .venv)) { python -m venv .venv }
.\.venv\Scripts\Activate.ps1
pip install -q -r requirements.txt
uvicorn backend.app:app --host 127.0.0.1 --port 8787
