"""Render an edit decision list (EDL) to a finished vertical video with ffmpeg.

EDL shape (produced by the Editor agent):
{
  "source": "/path/raw.mp4",
  "canvas": {"w": 1080, "h": 1920, "fps": 30},
  "segments": [{"src_in": 1.2, "src_out": 3.4, "zoom": 1.0, "beat": "hook"}, ...],
  "broll":    [{"path": "...", "start": 4.0, "end": 6.0}],         # output-timeline seconds
  "music":    {"path": "...", "gain_db": -20} | null,
  "ass": "/path/captions.ass"
}
"""
import subprocess
from pathlib import Path


def _esc(p: str) -> str:
    # escape for ffmpeg filter args (subtitles=...)
    return p.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")


def render(edl: dict, out: Path, preview: bool = False) -> Path:
    w, h, fps = edl["canvas"]["w"], edl["canvas"]["h"], edl["canvas"].get("fps", 30)
    if preview:
        w, h = w // 2, h // 2
    segs = edl["segments"]
    if not segs:
        raise ValueError("EDL has no segments")
    inputs = ["-i", edl["source"]]
    fc = []
    for i, s in enumerate(segs):
        z = float(s.get("zoom", 1.0))
        zw, zh = int(w * z) // 2 * 2, int(h * z) // 2 * 2
        fc.append(
            f"[0:v]trim={s['src_in']}:{s['src_out']},setpts=PTS-STARTPTS,"
            f"scale={zw}:{zh}:force_original_aspect_ratio=increase,crop={w}:{h},fps={fps},setsar=1[v{i}];"
            f"[0:a]atrim={s['src_in']}:{s['src_out']},asetpts=PTS-STARTPTS,"
            f"afade=t=in:d=0.01,afade=t=out:st={max(0, s['src_out'] - s['src_in'] - 0.012):.3f}:d=0.012[a{i}]"
        )
    fc.append("".join(f"[v{i}][a{i}]" for i in range(len(segs))) + f"concat=n={len(segs)}:v=1:a=1[vc][ac]")
    vlabel = "vc"
    n_in = 1
    for j, b in enumerate(edl.get("broll") or []):
        inputs += ["-i", b["path"]]
        dur = b["end"] - b["start"]
        fc.append(f"[{n_in}:v]trim=0:{dur},setpts=PTS-STARTPTS+{b['start']}/TB,"
                  f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1[b{j}]")
        fc.append(f"[{vlabel}][b{j}]overlay=enable='between(t,{b['start']},{b['end']})':eof_action=pass[vb{j}]")
        vlabel = f"vb{j}"
        n_in += 1
    if edl.get("ass") and Path(edl["ass"]).exists():
        fc.append(f"[{vlabel}]subtitles='{_esc(edl['ass'])}'[vs]")
        vlabel = "vs"
    alabel = "ac"
    fc.append("[ac]loudnorm=I=-14:TP=-1.5:LRA=11[an]")
    alabel = "an"
    music = edl.get("music")
    if music and Path(music["path"]).exists():
        inputs += ["-stream_loop", "-1", "-i", music["path"]]
        g = music.get("gain_db", -20)
        fc.append(f"[{n_in}:a]volume={g}dB[m];[an]asplit=2[an1][an2];"
                  f"[m][an1]sidechaincompress=threshold=0.05:ratio=6:release=250[mduck];"
                  f"[an2][mduck]amix=inputs=2:duration=first:normalize=0[am]")
        alabel = "am"
        n_in += 1
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *inputs,
           "-filter_complex", ";".join(fc), "-map", f"[{vlabel}]", "-map", f"[{alabel}]",
           "-c:v", "libx264", "-preset", "veryfast" if preview else "medium", "-crf", "28" if preview else "19",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", str(out)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {r.stderr[-2000:]}")
    return out
