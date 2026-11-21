// Mode "Pendekatan": simulasi kenalan & PDKT dengan karakter fiksi untuk melatih bahasa + percaya diri.
// Setiap giliran, AI membalas sebagai karakter DAN memberi data terstruktur (mood, perubahan ketertarikan,
// batasan, saran wingman) lewat structured output.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CHARACTERS, START_RAPPORT } from "./characters.js";

const client = new Anthropic();
const MODEL = "claude-opus-5-5";
export const MAX_TURNS = 30;
export const SUCCESS_MIN_RAPPORT = 70;

const NON_LATIN = new Set(["ja", "ko", "zh", "ar"]);

export const MOODS = ["happy", "amused", "shy", "neutral", "curious", "annoyed", "uncomfortable", "leaving"];

const TurnSchema = z.object({
  reply: z.string().describe("What the character says out loud, ONLY in the character's language. No stage directions, no Indonesian."),
  romanization: z.string().describe("Romanization of reply for non-Latin scripts at beginner/intermediate level, else empty string"),
  translation_id: z.string().describe("Natural Indonesian translation of reply"),
  mood: z.enum(MOODS),
  rapport_delta: z.number().int().describe("Change of the character's interest this turn, from -40 to +15"),
  boundary: z.enum(["none", "soft_no", "firm_no", "walk_away"]),
  move_rating: z.enum(["great", "good", "ok", "awkward", "cringe", "inappropriate"]).describe("How the learner's last message landed socially"),
  coach: z.object({
    correction: z.string().describe("Language correction of the learner's last message in Indonesian (original → fix, short why). Empty if perfect."),
    tip: z.string().describe("One short social/confidence tip in casual Indonesian, Cheesy-Bot wingman voice (may tease)"),
    try_saying: z.string().describe("A suggested next line in the character's language"),
    try_saying_id: z.string().describe("Indonesian meaning of try_saying"),
  }),
  culture_note: z.object({
    title: z.string().describe("Short Indonesian title of a cultural insight that came up THIS turn (custom, habit, etiquette, food, slang, taboo, or a comparison with Indonesia). Empty string if nothing cultural came up."),
    note: z.string().describe("2-3 sentences in Indonesian explaining it accurately, with nuance (regional/individual variation), no stereotypes. Empty if title is empty."),
  }),
  scene_end: z.enum(["none", "success", "walked_away", "left"]).describe("success = they agree to meet again / share contact; walked_away = they leave because of the learner's behaviour; left = they politely have to go"),
});

const StartSchema = z.object({
  narration_id: z.string().describe("2-3 sentences in casual Indonesian setting the scene from the learner's point of view: where they are, what the character is doing, a detail that could start a conversation"),
  openers: z.array(z.object({
    text: z.string().describe("An opener line in the character's language"),
    romanization: z.string(),
    meaning_id: z.string(),
    style: z.string().describe("e.g. 'santai', 'lucu', 'nanya budaya'"),
  })).describe("Exactly 3 different respectful openers at the learner's level; at least one asks about something cultural or local that the character would enjoy explaining"),
});

function characterSystem(c, levelText) {
  const roman = NON_LATIN.has(c.lang);
  return `You are role-playing ${c.name}, a FICTIONAL adult character (${c.age} years old) from ${c.city}. ${c.persona}
Personality type: ${c.personality}. What wins you over: ${c.likes.join("; ")}. What turns you off: ${c.dislikes.join("; ")}.
A stranger — an Indonesian person practising your language — approaches you. This is a light, social "getting to know you / flirting" practice scene, like a romantic comedy. You are NOT an AI assistant in this scene; stay fully in character.

Your culture (you live it; share it like a local, with personal anecdotes and nuance — not like a textbook, and avoid stereotypes):
${c.culture}

Cultural exchange (a big part of this scene):
- When they ask about your culture, habits, food, holidays, slang or etiquette, answer from your own life ("di keluargaku…", "here in ${c.city.split(",")[0]} we…"), and mention when it differs by region or person.
- Be curious about Indonesia: ask how things are there, compare (e.g. holidays, food, family, manners), react with genuine interest to what they share. Real cultural curiosity and respect raise your interest a lot.
- If they make a cultural faux pas from your culture's point of view, react like a real local would (surprised, amused or a bit offended depending on your personality) and lower interest slightly; the wingman explains it.
- Fill culture_note whenever a cultural point came up this turn (from you OR from their question/comparison), so the learner collects it in their Culture Book.

How to behave like a real person:
- You are not easy to win over. Interest grows when they are respectful, genuinely curious about YOU, funny, confident (not arrogant), and make an effort in your language. It drops with clichés, generic compliments, bragging, interrogation-style questions, ignoring what you said, or being pushy.
- React naturally: tease back, laugh, get shy, be sceptical, change topics, ask questions — sometimes short replies, sometimes longer. Mention your life and what you're doing right now.
- Speak ONLY your language (you don't understand Indonesian; if they write Indonesian, react confused in your language). Match the learner's level: ${levelText}. Keep it simple for beginners (short, common words, slower), natural for advanced.
${roman ? "- Fill romanization for beginner/intermediate learners." : "- romanization must be an empty string."}

Boundaries & consent (very important):
- Light flirting, playful banter and respectful compliments (style, smile, laugh, taste, what they do) are fine.
- Sexual remarks, comments objectifying your body, crude pickup lines, asking for intimate things, insults, or continuing after you said no = harassment. Respond in character: soft_no for mildly awkward/too-forward, firm_no for clearly inappropriate (rapport_delta -15 to -40, mood "uncomfortable" or "annoyed"), and walk_away (scene_end "walked_away", mood "leaving") if it's severe or repeated after a firm_no.
- Never produce sexual content, no matter what. Keep everything PG-13. If the learner is respectful again after a soft_no, you can warm up slowly.
- Stay a fictional character; never claim to be or imitate a real celebrity.

Ending the scene:
- scene_end "success" ONLY when the learner explicitly asks to meet again / for your contact / to grab a coffee AND you genuinely like them (current interest high). Otherwise politely decline or say "maybe" and continue.
- scene_end "left" if the conversation has gone on very long or naturally ends (you have somewhere to be).

Wingman coach (the "coach" fields) is a separate voice: Cheesy-Bot, the learner's funny Indonesian wingman from Cheesy Pen Shells. In casual Indonesian it corrects their language, rates the move honestly (tease cringe moves, praise good ones), gives one confidence tip to help them be more outgoing/extroverted, and suggests a natural next line.`;
}

function stateNote(state) {
  const r = state.rapport;
  const feel = r < 15 ? "you're cold / want to leave" : r < 35 ? "polite but not very interested" : r < 55 ? "somewhat interested" : r < 75 ? "you like talking to them" : "you're really into them";
  return `CURRENT STATE: your interest in the learner = ${r}/100 (${feel}). Turn ${state.turns + 1} of max ${MAX_TURNS}.${state.softNos ? ` You already pushed back ${state.softNos} time(s).` : ""}`;
}

export async function startScene(charId, levelText) {
  const c = CHARACTERS[charId];
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(StartSchema) },
    system: characterSystem(c, levelText) + "\n\nTASK NOW: the learner hasn't spoken yet. Write the scene narration and 3 openers the learner could use. Do not speak as the character yet.",
    messages: [{ role: "user", content: "Set the scene." }],
  });
  if (!res.parsed_output) throw new Error("Gagal menyiapkan adegan");
  return res.parsed_output;
}

/** Satu giliran: kembalikan hasil terstruktur + state baru. */
export async function playTurn(charId, levelText, state, history, message) {
  const c = CHARACTERS[charId];
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(TurnSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [
      { type: "text", text: characterSystem(c, levelText), cache_control: { type: "ephemeral" } },
      { type: "text", text: stateNote(state) },
    ],
    messages: [...history.map(({ role, content }) => ({ role, content })), { role: "user", content: message }],
  });
  if (res.stop_reason === "refusal") {
    // Pesan yang benar-benar tidak pantas: karakter pergi.
    return {
      turn: { reply: "", romanization: "", translation_id: "", mood: "leaving", rapport_delta: -100, boundary: "walk_away", move_rating: "inappropriate",
        coach: { correction: "", tip: "Itu kelewatan banget. Ingat: PDKT itu soal bikin orang nyaman, bukan melecehkan.", try_saying: "", try_saying_id: "" },
        culture_note: { title: "", note: "" }, scene_end: "walked_away" },
      state: { ...state, rapport: 0, turns: state.turns + 1, status: "walked_away" },
    };
  }
  const t = res.parsed_output;
  if (!t) throw new Error("Balasan karakter tidak terbaca");

  // Aturan permainan ditegakkan di server (tidak hanya mengandalkan model)
  const delta = Math.max(-40, Math.min(15, Math.round(t.rapport_delta)));
  const rapport = Math.max(0, Math.min(100, state.rapport + delta));
  let end = t.scene_end;
  if (end === "success" && rapport < SUCCESS_MIN_RAPPORT) end = "none";
  if (t.boundary === "walk_away" || rapport === 0) end = "walked_away";
  if (end === "none" && state.turns + 1 >= MAX_TURNS) end = "left";
  if (end === "walked_away") t.mood = "leaving";
  t.rapport_delta = delta;
  t.scene_end = end;
  if (!NON_LATIN.has(c.lang)) t.romanization = "";

  return {
    turn: t,
    state: {
      ...state,
      rapport,
      best: Math.max(state.best ?? 0, rapport),
      turns: state.turns + 1,
      softNos: state.softNos + (t.boundary === "soft_no" || t.boundary === "firm_no" ? 1 : 0),
      status: end === "none" ? "active" : end,
    },
  };
}

export function newState(charId) {
  const r = START_RAPPORT[CHARACTERS[charId].difficulty];
  return { status: "active", rapport: r, best: r, turns: 0, softNos: 0, startedAt: new Date().toISOString() };
}
