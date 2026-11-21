// Pilihan model Claude. Default: Claude Haiku 5.5 (paling hemat).
// Ganti lewat .env, misalnya CLAUDE_MODEL=claude-opus-5-5 untuk obrolan yang lebih pintar (lebih mahal).
export const MODEL = process.env.CLAUDE_MODEL?.trim() || "claude-haiku-5-5";

// Fast mode hanya tersedia di model tertentu.
export const SUPPORTS_FAST = ["claude-opus-5-5", "claude-fable-5-2", "claude-mythos-5-2"].includes(MODEL);

// Fallback otomatis saat model menolak (server-side) hanya untuk keluarga Opus 5 / Fable / Mythos / Sonnet 5.5.
const SUPPORTS_FALLBACK = /^claude-(opus-5|fable-5|mythos-5|sonnet-5-5)/.test(MODEL);
export const fallbackParams = () => (SUPPORTS_FALLBACK ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {});

// Versi web search terbaru hanya untuk model besar; Haiku memakai versi dasar.
export const WEB_SEARCH_TYPE = /^claude-(opus|fable|mythos|sonnet)/.test(MODEL) ? "web_search_20260209" : "web_search_20250305";
