"""Measure a video's editing DNA with ffmpeg (+ optional faster-whisper transcript).

Numbers we extract per clip:
  duration, resolution/orientation, cut timestamps (scene changes), average shot
  length, cuts per minute, speech segments (silence detection), speech ratio,
  loudness, transcript with word timings, words per minute, hook (first ~3 s text).
"""
import json
import re
import subprocess
from functools import lru_cache
from pathlib import Path

from .. import config


def _run(cmd: list[str], timeout=900) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def probe(path: str) -> dict:
    out = _run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path])
    info = json.loads(out.stdout or "{}")
    v = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), {})
    a = next((s for s in info.get("streams", []) if s.get("codec_type") == "audio"), None)
    w, h = int(v.get("width", 0) or 0), int(v.get("height", 0) or 0)
    fps = v.get("r_frame_rate", "30/1")
    try:
        n, d = fps.split("/")
        fps = round(float(n) / float(d), 3)
    except Exception:
        fps = 30.0
    return {
        "duration": float(info.get("format", {}).get("duration", 0) or 0),
        "width": w, "height": h, "fps": fps, "has_audio": a is not None,
        "orientation": "vertical" if h > w else ("square" if h == w else "horizontal"),
    }


def scene_cuts(path: str, threshold=0.3) -> list[float]:
    out = _run(["ffmpeg", "-hide_banner", "-i", path, "-an", "-filter:v",
                f"select='gt(scene,{threshold})',showinfo", "-f", "null", "-"])
    return [round(float(m), 3) for m in re.findall(r"pts_time:([\d.]+)", out.stderr)]


def speech_segments(path: str, noise_db=-32, min_silence=0.35) -> list[tuple[float, float]]:
    """Return [(start, end)] of non-silent audio."""
    dur = probe(path)["duration"]
    out = _run(["ffmpeg", "-hide_banner", "-i", path, "-vn", "-af",
                f"silencedetect=noise={noise_db}dB:d={min_silence}", "-f", "null", "-"])
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", out.stderr)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out.stderr)]
    segs, cursor = [], 0.0
    for i, s in enumerate(starts):
        if s - cursor > 0.05:
            segs.append((round(cursor, 3), round(s, 3)))
        cursor = ends[i] if i < len(ends) else dur
    if dur - cursor > 0.05:
        segs.append((round(cursor, 3), round(dur, 3)))
    return segs


def loudness(path: str) -> dict:
    out = _run(["ffmpeg", "-hide_banner", "-i", path, "-vn", "-af", "volumedetect", "-f", "null", "-"])
    mean = re.search(r"mean_volume: ([-\d.]+)", out.stderr)
    peak = re.search(r"max_volume: ([-\d.]+)", out.stderr)
    return {"mean_db": float(mean.group(1)) if mean else None, "peak_db": float(peak.group(1)) if peak else None}


@lru_cache(maxsize=1)
def _whisper():
    try:
        from faster_whisper import WhisperModel
        return WhisperModel(config.WHISPER_MODEL, device="auto", compute_type="int8")
    except Exception:
        return None


def transcribe(path: str, language: str | None = None) -> dict | None:
    """Word-level transcript via faster-whisper, or None if unavailable (model can't download etc.)."""
    model = _whisper()
    if model is None:
        return None
    try:
        segments, info = model.transcribe(path, language=language or config.LANGUAGE, word_timestamps=True,
                                          vad_filter=True)
        words, text = [], []
        for seg in segments:
            text.append(seg.text.strip())
            for w in seg.words or []:
                words.append({"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)})
        return {"language": info.language, "text": " ".join(text), "words": words}
    except Exception:
        return None


def analyze(path: str, with_transcript=True) -> dict:
    p = probe(path)
    dur = max(p["duration"], 0.001)
    cuts = scene_cuts(path) if p["width"] else []
    segs = speech_segments(path) if p["has_audio"] else []
    speech = sum(e - s for s, e in segs)
    shots = [b - a for a, b in zip([0.0, *cuts], [*cuts, dur]) if b - a > 0]
    tr = transcribe(path) if (with_transcript and p["has_audio"]) else None
    hook = None
    wpm = None
    if tr and tr["words"]:
        hook = " ".join(w["w"] for w in tr["words"] if w["s"] < 3.5)
        wpm = round(len(tr["words"]) / (speech / 60), 1) if speech > 1 else None
    return {
        **p,
        "cuts": cuts,
        "cuts_per_min": round(len(cuts) / (dur / 60), 1),
        "avg_shot_len": round(sum(shots) / len(shots), 2) if shots else round(dur, 2),
        "first_cut_at": cuts[0] if cuts else None,
        "speech_segments": segs,
        "speech_ratio": round(speech / dur, 2),
        "loudness": loudness(path) if p["has_audio"] else None,
        "transcript": tr,
        "wpm": wpm,
        "hook_text": hook,
    }


def thumbnail(path: str, out: Path, at: float = 0.5) -> Path | None:
    out.parent.mkdir(parents=True, exist_ok=True)
    r = _run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-ss", str(at), "-i", path,
              "-frames:v", "1", "-vf", "scale=360:-2", str(out)])
    return out if r.returncode == 0 and out.exists() else None
