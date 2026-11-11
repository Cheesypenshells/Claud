"""Caption generation: chunk words into short punchy lines, write .srt and styled .ass."""
from pathlib import Path

PRESETS = {
    # name: (font size, margin from bottom, max words per chunk, uppercase)
    "word-pop": (96, 620, 3, True),      # TikTok/Reels style, 1-3 words, center
    "bold-center": (80, 560, 5, False),
    "minimal-bottom": (58, 260, 7, False),
}


def chunk_words(words: list[dict], max_words=3, max_gap=0.45) -> list[dict]:
    """words: [{'w','s','e'}] on the *output* timeline -> [{'start','end','text'}]."""
    chunks, cur = [], []
    for w in words:
        if cur and (len(cur) >= max_words or w["s"] - cur[-1]["e"] > max_gap
                    or cur[-1]["w"].endswith((".", "?", "!", ","))):
            chunks.append(cur)
            cur = []
        cur.append(w)
    if cur:
        chunks.append(cur)
    out = []
    for c in chunks:
        out.append({"start": c[0]["s"], "end": max(c[-1]["e"], c[0]["s"] + 0.25),
                    "text": " ".join(x["w"] for x in c).strip()})
    # close tiny gaps so captions don't flicker
    for a, b in zip(out, out[1:]):
        if 0 < b["start"] - a["end"] < 0.2:
            a["end"] = b["start"]
    return out


def text_to_timed(lines: list[str], spans: list[tuple[float, float]], max_words=3) -> list[dict]:
    """No transcript available: spread script words evenly across speech spans (output timeline)."""
    words = " ".join(lines).split()
    total = sum(e - s for s, e in spans) or 1
    if not words:
        return []
    per = total / len(words)
    timed, i = [], 0
    for s, e in spans:
        t = s
        n = max(1, round((e - s) / per))
        for _ in range(n):
            if i >= len(words):
                break
            timed.append({"w": words[i], "s": round(t, 3), "e": round(min(e, t + per), 3)})
            t += per
            i += 1
    while i < len(words) and timed:  # leftovers onto the last span
        last = timed[-1]
        timed.append({"w": words[i], "s": last["e"], "e": last["e"] + per})
        i += 1
    return chunk_words(timed, max_words)


def _ts_srt(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600000)
    m, ms = divmod(ms, 60000)
    s, ms = divmod(ms, 1000)
    return f"{h:02}:{m:02}:{s:02},{ms:03}"


def _ts_ass(t: float) -> str:
    cs = int(round(t * 100))
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02}:{s:02}.{cs:02}"


def write_srt(caps: list[dict], path: Path):
    path.write_text("\n".join(
        f"{i}\n{_ts_srt(c['start'])} --> {_ts_srt(c['end'])}\n{c['text']}\n" for i, c in enumerate(caps, 1)),
        encoding="utf-8")


def write_ass(caps: list[dict], path: Path, w=1080, h=1920, preset="word-pop", emphasis: list[str] | None = None,
              titles: list[dict] | None = None, accent="&H0000E5FF"):
    size, margin, _, upper = PRESETS.get(preset, PRESETS["word-pop"])
    emph = {e.lower().strip(".,!?") for e in (emphasis or [])}
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {w}
PlayResY: {h}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter,{size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,6,2,2,60,60,{margin},1
Style: Title,Inter,{int(size*1.15)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,1,0,0,0,100,100,0,0,3,18,0,8,70,70,260,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    for c in caps:
        words = []
        for word in c["text"].split():
            disp = word.upper() if upper else word
            if word.lower().strip(".,!?") in emph:
                disp = "{\\c" + accent + "}" + disp + "{\\c&H00FFFFFF&}"
            words.append(disp)
        pop = "{\\fscx85\\fscy85\\t(0,90,\\fscx100\\fscy100)}"  # small scale-pop on each chunk
        lines.append(f"Dialogue: 0,{_ts_ass(c['start'])},{_ts_ass(c['end'])},Cap,,0,0,0,,{pop}{' '.join(words)}")
    for t in titles or []:
        lines.append(f"Dialogue: 1,{_ts_ass(t['start'])},{_ts_ass(t['end'])},Title,,0,0,0,,"
                     "{\\fad(80,120)}" + t["text"].upper())
    path.write_text(head + "\n".join(lines) + "\n", encoding="utf-8")
