"""Editor Agent — turns raw talking-head footage + the CD's concept into an edit decision
list (EDL): silence/retake removal, jump-cut punch-ins per beat, captions, title cards,
b-roll and music from the content bank. Deterministic so every cut is explainable; the
creative decisions (zoom per beat, emphasis words, caption style, pace) come from the CD."""
import re
from pathlib import Path

from .. import db
from ..media import captions as cap

PAD_IN, PAD_OUT = 0.05, 0.09


def _norm(w: str) -> str:
    return re.sub(r"[^\w]", "", w.lower())


def _phrases(words: list[dict], gap=0.55) -> list[list[dict]]:
    out, cur = [], []
    for w in words:
        if cur and (w["s"] - cur[-1]["e"] > gap or cur[-1]["w"].endswith((".", "?", "!"))):
            out.append(cur)
            cur = []
        cur.append(w)
    if cur:
        out.append(cur)
    return out


def drop_retakes(words: list[dict]) -> tuple[list[dict], int]:
    """If a phrase is restarted (same first 3 words appear again within the next 2 phrases), keep the last take."""
    ph = _phrases(words)
    keep = [True] * len(ph)
    for i, p in enumerate(ph):
        key = [_norm(w["w"]) for w in p[:3]]
        if len(key) < 2:
            continue
        for j in range(i + 1, min(i + 3, len(ph))):
            if [_norm(w["w"]) for w in ph[j][:len(key)]] == key:
                keep[i] = False
                break
    kept = [w for p, k in zip(ph, keep) if k for w in p]
    return kept, keep.count(False)


def spans_from_words(words: list[dict], threshold: float, dur: float) -> list[tuple[float, float]]:
    spans = []
    for w in words:
        s, e = max(0, w["s"] - PAD_IN), min(dur, w["e"] + PAD_OUT)
        if spans and s - spans[-1][1] <= threshold and s >= spans[-1][0]:
            spans[-1] = (spans[-1][0], max(spans[-1][1], e))
        else:
            spans.append((s, e))
    return [(round(a, 3), round(b, 3)) for a, b in spans if b - a > 0.15]


def spans_from_silence(segs: list, threshold: float, dur: float) -> list[tuple[float, float]]:
    spans = []
    for s, e in segs:
        s, e = max(0, s - PAD_IN), min(dur, e + PAD_OUT)
        if spans and s - spans[-1][1] <= threshold:
            spans[-1] = (spans[-1][0], e)
        else:
            spans.append((s, e))
    return [(round(a, 3), round(b, 3)) for a, b in spans if b - a > 0.15]


def split_long(spans, max_len, words):
    """Split long spans at word boundaries so punch-ins can alternate (classic jump-cut feel)."""
    out = []
    for s, e in spans:
        if e - s <= max_len:
            out.append((s, e))
            continue
        cuts = [s]
        inside = [w for w in words if s <= w["s"] < e] if words else []
        t = s
        while e - t > max_len:
            target = t + max_len * 0.8
            cands = [w["s"] for w in inside if t + max_len * 0.5 < w["s"] < t + max_len]
            t = min(cands, key=lambda x: abs(x - target)) if cands else t + max_len
            cuts.append(t)
        cuts.append(e)
        out += [(round(a, 3), round(b, 3)) for a, b in zip(cuts, cuts[1:]) if b - a > 0.15]
    return out


def _match_asset(bank: list[dict], kind: str, hint: str) -> dict | None:
    keys = [k for k in re.split(r"[\s,/]+", (hint or "").lower()) if len(k) > 2]
    cands = [a for a in bank if a.get("type") == kind]
    if not cands:
        return None
    if keys:
        for a in cands:
            hay = " ".join([a.get("name", ""), *a.get("tags", [])]).lower()
            if any(k in hay for k in keys):
                return a
        return None if kind == "broll" else cands[0]
    return None if kind == "broll" else cands[0]


def build_edl(raw: dict, concept: dict, style: dict, bank: list[dict], workdir: Path, project: str,
              canvas=(1080, 1920)) -> tuple[dict, dict]:
    an = raw["analysis"]
    dur = an["duration"]
    mood = concept.get("edit_mood", {})
    threshold = float(mood.get("silence_cut_threshold") or style.get("silence_cut_threshold") or 0.3)
    max_shot = max(1.0, float(style.get("target_avg_shot_len") or 2.0) * 1.6)
    words = ((an.get("transcript") or {}).get("words")) or []
    retakes = 0
    if words:
        words, retakes = drop_retakes(words)
        spans = spans_from_words(words, threshold, dur)
        db.log(project, "Editor", f"Transkrip {len(words)} kata, buang {retakes} retake, {len(spans)} potongan bicara")
    else:
        spans = spans_from_silence(an.get("speech_segments") or [(0, dur)], threshold, dur)
        db.log(project, "Editor", f"Tanpa transkrip — potong berdasar silence: {len(spans)} potongan bicara")
    spans = split_long(spans, max_shot, words)

    # assign beats proportionally to the CD's estimated seconds
    beats = concept.get("beats") or [{"name": "Main", "zoom": 1.0, "est_seconds": 1}]
    total_est = sum(b.get("est_seconds") or 1 for b in beats)
    out_total = sum(e - s for s, e in spans)
    bounds, acc = [], 0.0
    for b in beats:
        acc += (b.get("est_seconds") or 1) / total_est * out_total
        bounds.append(acc)

    segments, t, beat_starts, k_in_beat, last_beat = [], 0.0, {}, 0, -1
    for s, e in spans:
        bi = next((i for i, x in enumerate(bounds) if t < x - 1e-6), len(beats) - 1)
        if bi != last_beat:
            k_in_beat, last_beat = 0, bi
            beat_starts.setdefault(bi, t)
        bz = float(beats[bi].get("zoom") or 1.0)
        zoom = bz if k_in_beat % 2 == 0 else (1.0 if bz > 1.04 else 1.1)
        if bi == 0 and k_in_beat == 0:
            zoom = max(zoom, 1.15)
        segments.append({"src_in": s, "src_out": e, "zoom": round(zoom, 3), "beat": beats[bi].get("name", f"beat{bi}"),
                         "out_start": round(t, 3)})
        t += e - s
        k_in_beat += 1

    # captions on output timeline
    out_words = []
    for sg in segments:
        for w in words:
            if sg["src_in"] <= w["s"] < sg["src_out"]:
                off = sg["out_start"] - sg["src_in"]
                out_words.append({"w": w["w"], "s": round(w["s"] + off, 3),
                                  "e": round(min(w["e"], sg["src_out"]) + off, 3)})
    preset = mood.get("caption_preset") or style.get("caption_preset") or "word-pop"
    max_words = cap.PRESETS.get(preset, cap.PRESETS["word-pop"])[2]
    if out_words:
        caps = cap.chunk_words(out_words, max_words)
    else:
        caps = cap.text_to_timed([b.get("line", "") for b in beats],
                                 [(sg["out_start"], sg["out_start"] + sg["src_out"] - sg["src_in"]) for sg in segments],
                                 max_words)
    titles = []
    for bi, b in enumerate(beats):
        txt = (b.get("on_screen_text") or "").strip()
        if txt and bi in beat_starts:
            st = beat_starts[bi]
            titles.append({"start": st, "end": min(t, st + (2.2 if bi == 0 else 1.6)), "text": txt})

    broll = []
    for bi, b in enumerate(beats):
        a = _match_asset(bank, "broll", b.get("broll_hint", ""))
        if a and bi in beat_starts and bi != 0:
            st = beat_starts[bi] + 0.6
            en = min(st + 2.0, bounds[bi] - 0.2, st + (a.get("analysis") or {}).get("duration", 2.0))
            if en - st >= 0.8:
                broll.append({"path": a["path"], "start": round(st, 3), "end": round(en, 3), "asset": a["id"]})
    music_asset = _match_asset(bank, "music", mood.get("music_mood", ""))
    music = {"path": music_asset["path"], "gain_db": -20, "asset": music_asset["id"]} if music_asset else None

    W, H = canvas
    ass = workdir / "captions.ass"
    srt = workdir / "captions.srt"
    cap.write_ass(caps, ass, W, H, preset, mood.get("emphasis_words"), titles)
    cap.write_srt(caps, srt)
    edl = {"source": raw["path"], "canvas": {"w": W, "h": H, "fps": int(round(an.get("fps") or 30))},
           "segments": segments, "captions": caps, "titles": titles, "broll": broll, "music": music,
           "ass": str(ass), "srt": str(srt)}
    report = {
        "source_duration": round(dur, 2), "duration": round(t, 2), "removed_seconds": round(dur - t, 2),
        "segments": len(segments), "avg_shot_len": round(t / max(1, len(segments)), 2),
        "retakes_dropped": retakes, "has_transcript": bool(words), "broll_used": len(broll),
        "music": bool(music), "caption_preset": preset, "captions": len(caps),
    }
    db.log(project, "Editor", f"EDL siap: {report['segments']} shot, {report['duration']}s "
                              f"(buang {report['removed_seconds']}s), b-roll {len(broll)}, musik {'ya' if music else 'tidak'}")
    return edl, report
