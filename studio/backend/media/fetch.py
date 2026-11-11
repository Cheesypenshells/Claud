"""Download reference videos (Instagram / TikTok / YouTube) into the content bank with yt-dlp.

Instagram and TikTok require a logged-in session for most profiles, so on your own
machine set STUDIO_COOKIES_BROWSER=chrome (or firefox/edge/safari) and yt-dlp will reuse
your browser login. Nothing is stored except the downloaded files.
"""
import json
import subprocess
from pathlib import Path

from .. import config


def profile_url(handle: str, platform: str) -> str:
    h = handle.lstrip("@")
    return {
        "instagram": f"https://www.instagram.com/{h}/reels/",
        "tiktok": f"https://www.tiktok.com/@{h}",
        "youtube": f"https://www.youtube.com/@{h}/shorts",
    }[platform]


def download(url: str, dest: Path, limit: int = 8) -> tuple[list[Path], str]:
    """Download up to `limit` videos. Returns (files, log_tail)."""
    dest.mkdir(parents=True, exist_ok=True)
    cmd = ["yt-dlp", "--no-progress", "--playlist-end", str(limit), "-f", "mp4/bv*+ba/b",
           "--merge-output-format", "mp4", "--write-info-json", "--restrict-filenames",
           "-o", str(dest / "%(uploader_id|uploader)s_%(id)s.%(ext)s"), url]
    if config.COOKIES_BROWSER:
        cmd[1:1] = ["--cookies-from-browser", config.COOKIES_BROWSER]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
        log = (r.stdout + r.stderr)[-1500:]
    except FileNotFoundError:
        return [], "yt-dlp not installed (pip install yt-dlp)"
    except subprocess.TimeoutExpired:
        log = "yt-dlp timed out"
    return sorted(dest.glob("*.mp4")), log


def info_for(video: Path) -> dict:
    j = video.with_suffix(".info.json")
    if j.exists():
        try:
            d = json.loads(j.read_text())
            return {k: d.get(k) for k in ("title", "description", "uploader", "view_count", "like_count",
                                          "webpage_url", "upload_date", "duration")}
        except Exception:
            pass
    return {}
