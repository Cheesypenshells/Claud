"""Creative Director Agent — turns a brief + Style DNA into a concept, hook options and a
beat-by-beat script (teleprompter + shot list + edit notes). Also reviews the final cut."""
import json

from .. import llm

BEAT = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "purpose": {"type": "string"},
        "line": {"type": "string"},
        "on_screen_text": {"type": "string"},
        "shot": {"type": "string"},
        "broll_hint": {"type": "string"},
        "zoom": {"type": "number"},
        "est_seconds": {"type": "number"},
    },
    "required": ["name", "purpose", "line", "on_screen_text", "shot", "broll_hint", "zoom", "est_seconds"],
    "additionalProperties": False,
}

CONCEPT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "angle": {"type": "string"},
        "why_it_works": {"type": "string"},
        "hook_options": {"type": "array", "items": {
            "type": "object",
            "properties": {"type": {"type": "string"}, "line": {"type": "string"}, "on_screen": {"type": "string"}},
            "required": ["type", "line", "on_screen"], "additionalProperties": False}},
        "beats": {"type": "array", "items": BEAT},
        "edit_mood": {
            "type": "object",
            "properties": {
                "pace": {"type": "string"},
                "silence_cut_threshold": {"type": "number"},
                "caption_preset": {"type": "string", "enum": ["word-pop", "bold-center", "minimal-bottom"]},
                "emphasis_words": {"type": "array", "items": {"type": "string"}},
                "music_mood": {"type": "string"},
                "color_grade": {"type": "string"},
                "sfx": {"type": "string"},
            },
            "required": ["pace", "silence_cut_threshold", "caption_preset", "emphasis_words", "music_mood",
                         "color_grade", "sfx"],
            "additionalProperties": False,
        },
        "recording_tips": {"type": "array", "items": {"type": "string"}},
        "post_caption": {"type": "string"},
        "hashtags": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["title", "angle", "why_it_works", "hook_options", "beats", "edit_mood", "recording_tips",
                 "post_caption", "hashtags"],
    "additionalProperties": False,
}

REVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "score": {"type": "integer"},
        "verdict": {"type": "string", "enum": ["ship", "revise"]},
        "strengths": {"type": "array", "items": {"type": "string"}},
        "fixes": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["score", "verdict", "strengths", "fixes"],
    "additionalProperties": False,
}

SYSTEM = """You are the Creative Director of a top Indonesian short-form content company.
You get a brief from the talent (the person on camera), the Style DNA of a reference creator,
and research notes. You create an ORIGINAL video: different message and wording than the
reference, but matching its editing mood, pacing, hook mechanics and narrative rhythm.
Script lines are what the talent will literally say to camera: natural spoken Bahasa Indonesia
(casual, gw/lu if the tone fits), short sentences, no filler, first line IS the hook.
Keep total spoken length to the requested duration (~2.6 words per second for fast pace)."""


def make_concept(brief: dict, style: dict, research_notes: str, project: str) -> dict:
    prompt = (f"BRIEF:\n{json.dumps(brief, ensure_ascii=False)}\n\nSTYLE DNA of {style.get('handle')}:\n"
              f"{json.dumps({k: v for k, v in style.items() if k != 'metrics'}, ensure_ascii=False)}\n\n"
              f"MEASURED METRICS:\n{json.dumps(style.get('metrics', {}), ensure_ascii=False)}\n\n"
              f"RESEARCH NOTES:\n{research_notes[:6000]}\n\n"
              "Give 3 hook options (different hook types) and put the strongest one as beat 1. "
              "zoom per beat: 1.0 normal, 1.1-1.25 punch-in. broll_hint: short English keywords or empty.")
    return llm.ask_json("Creative Director", project, SYSTEM, prompt, CONCEPT_SCHEMA,
                        lambda: offline_concept(brief, style))


def offline_concept(brief: dict, style: dict) -> dict:
    topic = brief.get("topic", "topik lu")
    msg = brief.get("message") or f"hal yang jarang orang sadar soal {topic}"
    beats = [
        ("Hook", "Stop scroll", f"Berhenti dulu. Semua yang lu tau soal {topic} itu setengahnya salah.",
         f"{topic.upper()} = SALAH?", 1.2, "", 2.5),
        ("Setup", "Bangun relate", f"Gw dulu juga mikir gitu. Sampai gw sadar satu hal.", "", 1.0, "", 3.0),
        ("Insight", "Ide utama", f"{msg[0].upper() + msg[1:]}.", "INTINYA", 1.12, "", 5.0),
        ("Bukti", "Kredibilitas", "Coba lu perhatiin sendiri. Polanya selalu sama.", "", 1.0, "", 4.0),
        ("Payoff", "Bayar open loop", "Jadi mulai sekarang, ubah satu hal itu aja. Bedanya kerasa.", "", 1.15, "", 3.5),
        ("CTA", "Loop/Follow", "Simpen video ini, nanti lu butuh.", "SAVE", 1.0, "", 1.5),
    ]
    return {
        "title": f"{topic} — yang orang salah paham",
        "angle": f"Membalik asumsi umum soal {topic} dari sudut pandang personal talent",
        "why_it_works": "Hook kontra-intuitif + open loop yang dibayar di akhir, ritme jump-cut cepat sesuai Style DNA.",
        "hook_options": [
            {"type": "contrarian", "line": beats[0][2], "on_screen": beats[0][3]},
            {"type": "question", "line": f"Kenapa {topic} lu gak jalan-jalan?", "on_screen": "KENAPA?"},
            {"type": "result-first", "line": f"Satu perubahan kecil ini ngubah cara gw liat {topic}.",
             "on_screen": "1 PERUBAHAN"},
        ],
        "beats": [{"name": n, "purpose": p, "line": l, "on_screen_text": o, "shot": "Medium close-up, eye-level",
                   "broll_hint": b, "zoom": z, "est_seconds": s} for n, p, l, o, z, b, s in beats],
        "edit_mood": {
            "pace": style.get("pace", "fast"),
            "silence_cut_threshold": style.get("silence_cut_threshold", 0.3),
            "caption_preset": style.get("caption_preset", "word-pop"),
            "emphasis_words": [topic.split()[0] if topic else "", "salah", "satu", "intinya"],
            "music_mood": style.get("music_mood", "lo-fi"),
            "color_grade": "kontras sedikit naik, skin tone hangat",
            "sfx": "whoosh di punch-in hook, pop kecil di teks layar",
        },
        "recording_tips": ["Rekam vertikal 9:16 4K/1080p 30fps", "Mata ke lensa, bukan ke layar",
                           "Kalau salah, diam 1 detik lalu ulang kalimatnya — editor otomatis buang take yang jelek",
                           "Cahaya dari depan/samping (jendela), mic dekat mulut"],
        "post_caption": f"Ternyata selama ini kebalik soal {topic} 👀",
        "hashtags": ["#fyp", "#kontenkreator", "#edukasi"],
    }


def review(concept: dict, report: dict, style: dict, project: str) -> dict:
    prompt = (f"CONCEPT:\n{json.dumps(concept, ensure_ascii=False)[:5000]}\n\nRENDER REPORT (measured):\n"
              f"{json.dumps(report, ensure_ascii=False)}\n\nTARGET STYLE METRICS:\n"
              f"{json.dumps(style.get('metrics', {}), ensure_ascii=False)}\n"
              f"target_avg_shot_len={style.get('target_avg_shot_len')}\n"
              "Review the cut like a strict creative director. Score 0-100.")

    def offline():
        tgt = style.get("target_avg_shot_len") or 2.0
        got = report.get("avg_shot_len") or 0
        fixes = []
        if got > tgt * 1.4:
            fixes.append(f"Ritme lebih lambat dari referensi ({got}s vs {tgt}s per shot) — turunkan silence threshold")
        if report.get("duration", 0) > (report.get("target_duration") or 60) * 1.25:
            fixes.append("Durasi kepanjangan dari brief — potong beat Bukti")
        if not report.get("has_transcript"):
            fixes.append("Caption disebar rata dari script (whisper belum aktif) — cek sinkronisasi di Premiere")
        score = max(50, 92 - 12 * len(fixes))
        return {"score": score, "verdict": "ship" if score >= 80 else "revise",
                "strengths": ["Hook muncul di detik pertama", "Jump-cut + punch-in sesuai Style DNA"], "fixes": fixes}

    return llm.ask_json("Creative Director", project, SYSTEM, prompt, REVIEW_SCHEMA, offline, effort="medium")
