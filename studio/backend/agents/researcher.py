"""Research Agent — studies reference creators and builds a measurable "Style DNA".

Two sources:
 1. The reference clips in the content bank (measured with ffmpeg + whisper: cut rate,
    shot length, speaking pace, hook wording, structure).
 2. Web research (Claude web search): the creator's public footprint plus similar
    international formats worth borrowing from.
"""
import json
import statistics

from .. import db, llm

STYLE_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "pace": {"type": "string", "enum": ["slow", "medium", "fast", "hyper"]},
        "target_avg_shot_len": {"type": "number"},
        "target_wpm": {"type": "number"},
        "silence_cut_threshold": {"type": "number"},
        "hook_patterns": {"type": "array", "items": {"type": "string"}},
        "narrative_structure": {"type": "array", "items": {"type": "string"}},
        "caption_preset": {"type": "string", "enum": ["word-pop", "bold-center", "minimal-bottom"]},
        "zoom_style": {"type": "string"},
        "broll_usage": {"type": "string"},
        "music_mood": {"type": "string"},
        "tone_of_voice": {"type": "string"},
        "signature_moves": {"type": "array", "items": {"type": "string"}},
        "do": {"type": "array", "items": {"type": "string"}},
        "dont": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "pace", "target_avg_shot_len", "target_wpm", "silence_cut_threshold",
                 "hook_patterns", "narrative_structure", "caption_preset", "zoom_style", "broll_usage",
                 "music_mood", "tone_of_voice", "signature_moves", "do", "dont"],
    "additionalProperties": False,
}

SYSTEM = """You are the Head of Research at a short-form video studio (Reels/TikTok/Shorts).
You reverse-engineer WHY a creator's videos work: hook mechanics in the first 1-3 seconds,
narrative beats, pacing, jump-cut density, punch-in zooms, caption styling, b-roll, music, tone.
You describe reusable TECHNIQUES, never copy someone's actual lines or ideas verbatim.
Be concrete and measurable (seconds, words per minute, cuts per minute). Write in Bahasa Indonesia."""


def aggregate_metrics(assets: list[dict]) -> dict:
    ms = [a.get("analysis") or {} for a in assets]
    ms = [m for m in ms if m]

    def med(key):
        vals = [m[key] for m in ms if isinstance(m.get(key), (int, float))]
        return round(statistics.median(vals), 2) if vals else None

    return {
        "clips": len(ms),
        "median_duration": med("duration"),
        "median_avg_shot_len": med("avg_shot_len"),
        "median_cuts_per_min": med("cuts_per_min"),
        "median_speech_ratio": med("speech_ratio"),
        "median_wpm": med("wpm"),
        "median_first_cut_at": med("first_cut_at"),
        "orientations": sorted({m.get("orientation") for m in ms if m.get("orientation")}),
        "hooks": [m.get("hook_text") for m in ms if m.get("hook_text")][:12],
    }


def _offline_style(metrics: dict) -> dict:
    shot = metrics.get("median_avg_shot_len") or 1.8
    pace = "hyper" if shot < 1.2 else "fast" if shot < 2.2 else "medium" if shot < 4 else "slow"
    return {
        "summary": (f"Profil dari {metrics.get('clips', 0)} klip referensi: rata-rata shot {shot}s, "
                    f"{metrics.get('median_cuts_per_min') or '?'} cut/menit. Talking-head jump-cut, hook langsung "
                    "di detik pertama, caption besar per 1-3 kata."),
        "pace": pace,
        "target_avg_shot_len": shot,
        "target_wpm": metrics.get("median_wpm") or 175,
        "silence_cut_threshold": 0.25 if pace in ("fast", "hyper") else 0.4,
        "hook_patterns": [
            "Pernyataan kontroversial/berlawanan dengan asumsi umum di kalimat pertama",
            "Open loop: janji hasil/rahasia yang baru dibayar di akhir",
            "Pertanyaan langsung ke penonton yang relate ('Lu pernah ngerasa...?')",
        ],
        "narrative_structure": ["Hook (0-3s)", "Setup masalah/konteks", "Twist / insight utama",
                                "Bukti / contoh konkret", "Payoff + CTA singkat"],
        "caption_preset": "word-pop",
        "zoom_style": "Punch-in 110-120% bergantian tiap 1-2 kalimat, zoom lebih besar di kata kunci",
        "broll_usage": "B-roll pendek 1-2 detik untuk ilustrasi kata benda/angka, tidak lebih dari 25% durasi",
        "music_mood": "lo-fi / cinematic tipis di bawah voice, ducking saat ngomong",
        "tone_of_voice": "Santai, percaya diri, bahasa gaul Jakarta, ngomong langsung ke kamera",
        "signature_moves": ["Jump cut tanpa jeda napas", "Teks hook besar di layar 2 detik pertama",
                            "Kata penting diwarnai di caption"],
        "do": ["Masuk ke poin di <1 detik", "Satu ide per video", "Akhiri dengan kalimat yang bisa di-loop"],
        "dont": ["Intro 'halo guys'", "Jeda diam > 0.3s", "Copy kalimat creator referensi"],
    }


def build_style_profile(handle: str, assets: list[dict], web_notes: str = "", project: str | None = None) -> dict:
    metrics = aggregate_metrics(assets)
    db.log(project, "Research", f"Mengukur {metrics['clips']} klip referensi {handle}: "
                                f"shot {metrics['median_avg_shot_len']}s, {metrics['median_cuts_per_min']} cut/menit, "
                                f"{metrics['median_wpm']} wpm")
    transcripts = []
    for a in assets[:10]:
        tr = (a.get("analysis") or {}).get("transcript") or {}
        info = a.get("info") or {}
        transcripts.append({"title": info.get("title"), "caption": (info.get("description") or "")[:400],
                            "views": info.get("view_count"), "transcript": (tr.get("text") or "")[:2500]})
    prompt = (f"Reference creator: {handle}\n\nMeasured editing metrics (ffmpeg):\n{json.dumps(metrics, ensure_ascii=False)}"
              f"\n\nTranscripts & captions of sample videos:\n{json.dumps(transcripts, ensure_ascii=False)}"
              f"\n\nWeb research notes:\n{web_notes[:6000]}\n\n"
              "Build the Style DNA. Numbers must be consistent with the measured metrics when available.")
    style = llm.ask_json("Research", project, SYSTEM, prompt, STYLE_SCHEMA, lambda: _offline_style(metrics))
    style["metrics"] = metrics
    style["handle"] = handle
    return style


def web_research(handle: str, topic: str, project: str | None = None) -> str:
    db.log(project, "Research", f"Riset web: gaya {handle} + format serupa dari luar untuk tema '{topic}'")
    prompt = (f"1) Find what's publicly known about the creator {handle} (Instagram/TikTok): niche, formats, "
              f"how their hooks and editing work.\n2) Find 5-8 international (non-Indonesian) short-form creators or "
              f"viral videos whose format fits the theme: '{topic}'. For each: link, why it works, which technique to borrow.\n"
              "3) Note any current trend in hooks/edit style for this niche (2026).\n"
              "Answer as concise markdown with links.")
    return llm.research("Research", project, SYSTEM, prompt,
                        lambda: "_Riset web offline — tambahkan ANTHROPIC_API_KEY untuk riset otomatis._")


# Curated from research for this build; shown in the dashboard "Toolkit" tab.
RELEVANT_REPOS = [
    {"name": "hetpatel-11/Adobe_Premiere_Pro_MCP", "url": "https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP",
     "why": "MCP server w/ ratusan tool Premiere (CEP bridge) — bisa dipakai Claude Desktop/Code langsung ngedit timeline"},
    {"name": "leancoderkavy/premiere-pro-mcp", "url": "https://github.com/leancoderkavy/premiere-pro-mcp",
     "why": "Plugin Claude Code untuk Premiere via CEP"},
    {"name": "akhil-datla/ChatCut", "url": "https://github.com/akhil-datla/ChatCut",
     "why": "Panel UXP (React) untuk edit natural-language di Premiere 2023+"},
    {"name": "morim3/mcp_adobe_premiere", "url": "https://github.com/morim3/mcp_adobe_premiere",
     "why": "MCP Python + plugin UXP (Premiere 25.3+)"},
    {"name": "SYSTRAN/faster-whisper", "url": "https://github.com/SYSTRAN/faster-whisper",
     "why": "Transkrip word-level lokal untuk caption & cut presisi"},
    {"name": "yt-dlp/yt-dlp", "url": "https://github.com/yt-dlp/yt-dlp", "why": "Download referensi IG/TikTok/YT"},
    {"name": "Breakthrough/PySceneDetect", "url": "https://github.com/Breakthrough/PySceneDetect",
     "why": "Deteksi cut lebih akurat untuk analisa ritme editing"},
    {"name": "WyattBlue/auto-editor", "url": "https://github.com/WyattBlue/auto-editor",
     "why": "Silence-cut otomatis + export ke Premiere XML (alternatif engine)"},
]
