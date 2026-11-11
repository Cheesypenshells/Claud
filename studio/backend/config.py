"""Central config. Everything is overridable via environment variables / .env."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("STUDIO_DATA", ROOT / "data"))
BANK = DATA / "bank"          # content bank: references, b-roll, music, raw footage
PROJECTS = DATA / "projects"  # per-project working dirs & renders
DB_PATH = DATA / "studio.db"

for p in (DATA, BANK, PROJECTS):
    p.mkdir(parents=True, exist_ok=True)


def _load_dotenv():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


_load_dotenv()

MODEL = os.environ.get("STUDIO_MODEL", "claude-opus-5-5")
# STUDIO_OFFLINE=1 forces the deterministic offline agents (no API calls).
OFFLINE = os.environ.get("STUDIO_OFFLINE", "0") == "1"
WHISPER_MODEL = os.environ.get("STUDIO_WHISPER_MODEL", "small")
LANGUAGE = os.environ.get("STUDIO_LANGUAGE", "id")
# Browser to borrow cookies from for yt-dlp (Instagram/TikTok need login): chrome|firefox|edge|safari
COOKIES_BROWSER = os.environ.get("STUDIO_COOKIES_BROWSER", "")
