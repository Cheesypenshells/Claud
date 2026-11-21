// Ingatan jangka panjang Cheesy-Bot: profil murid yang terus diperbarui dari obrolan.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getProfile, getPending, setProfile } from "./store.js";
import { MODEL } from "./model.js";

const UPDATE_EVERY = 3; // perbarui ingatan setiap 3 pertukaran baru

const ProfileSchema = z.object({
  name: z.string().describe("Learner's name or nickname, empty string if unknown"),
  about: z.array(z.string()).describe("Durable personal facts: job, hobbies, goals, plans, people, preferences, life events. Short Indonesian phrases."),
  languages: z.array(z.object({
    language: z.string(),
    level_estimate: z.string().describe("Observed real level, e.g. 'A2 - bisa kalimat sederhana'"),
    recurring_mistakes: z.array(z.string()).describe("Mistakes made more than once or not yet fixed, with a rough count, e.g. 'lupa past tense (4x)'"),
    fixed_mistakes: z.array(z.string()).describe("Mistakes the learner has clearly stopped making"),
    vocab_learned: z.array(z.string()),
    topics: z.array(z.string()).describe("Topics/scenes/quizzes already covered"),
  })),
  attitude: z.object({
    mode: z.enum(["serius", "santai", "tidak_serius", "belum_jelas"]),
    evidence: z.string().describe("Concrete recent behaviour that justifies the mode"),
  }),
  humor_notes: z.string().describe("How the learner reacts to teasing; what kind of jokes land; anything to avoid"),
  inside_jokes: z.array(z.string()).describe("Running jokes / memorable funny moments to call back to"),
  last_session_summary: z.string().describe("2-4 sentences: what happened most recently and what to follow up next time"),
});

const SYSTEM = `You maintain the long-term memory of "Cheesy-Bot", an AI language tutor for an Indonesian learner.
You receive the current memory (JSON, may be null) and new conversation turns. Return the UPDATED memory.
Rules:
- Merge, don't reset: keep every still-relevant fact, add new ones, update counts, move mistakes the learner now gets right to fixed_mistakes.
- Keep it compact: merge duplicates, at most ~40 items per list (drop the least useful).
- Judge attitude.mode from behaviour, not words: "serius" = tries hard, writes in the target language, retries after corrections, asks questions; "santai" = engaged but casual; "tidak_serius" = lazy one-word answers, "gatau"/"males", ignores corrections, repeats the same mistake on purpose, spams, trolls, keeps going off-topic. Use "belum_jelas" only when there is too little evidence.
- Write values in Bahasa Indonesia (target-language words stay in their language).
- Only record what the conversation actually shows. Never invent facts.`;

const client = new Anthropic();
const running = new Map(); // userId -> pembaruan yang sedang berjalan

/** Jalankan pembaruan ingatan seorang pengguna di latar belakang bila antrean sudah cukup (atau force). */
export function maybeUpdateMemory(userId, { force = false, accountName = "" } = {}) {
  if (running.has(userId)) return running.get(userId);
  const job = (async () => {
    const pending = await getPending(userId);
    if (!pending.length || (!force && pending.length < UPDATE_EVERY)) return;
    const current = await getProfile(userId);
    const transcript = pending.map((p) =>
      `[${p.ts} · tutor=${p.tutor} · bahasa=${p.language} · level=${p.level}]\nMURID: ${p.user}\nCHEESY-BOT: ${p.assistant}`
    ).join("\n\n");

    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "low", format: zodOutputFormat(ProfileSchema) },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `${accountName ? `The learner's account name is "${accountName}".\n\n` : ""}CURRENT MEMORY:\n${current ? JSON.stringify(current) : "null"}\n\nNEW CONVERSATION TURNS:\n${transcript}`,
      }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      console.warn("Pembaruan ingatan dilewati:", response.stop_reason);
      return;
    }
    await setProfile(userId, response.parsed_output, pending.length);
    console.log(`🧠 Ingatan pengguna ${userId.slice(0, 8)} diperbarui (${pending.length} pertukaran baru).`);
  })()
    .catch((e) => console.error("Gagal memperbarui ingatan:", e.message))
    .finally(() => running.delete(userId));
  running.set(userId, job);
  return job;
}

/** Ubah profil jadi teks untuk system prompt. */
export function renderMemory(profile, language, accountName = "") {
  if (!profile) return `MEMORY: This is a brand-new learner${accountName ? ` whose account name is "${accountName}"` : ""}. You know nothing else about them yet — get to know them naturally (what to call them, why they're learning).`;
  const lang = profile.languages?.find((l) => l.language.toLowerCase().includes(language.toLowerCase().split(" ")[0]));
  const list = (a) => (a?.length ? a.join("; ") : "-");
  return `MEMORY ABOUT THIS LEARNER (from all previous sessions — use it naturally, like a tutor who actually remembers them; call back to it, don't recite it):
- Name: ${profile.name || accountName || "(unknown — ask casually at some point)"}
- About them: ${list(profile.about)}
- Attitude so far: ${profile.attitude?.mode} — ${profile.attitude?.evidence}
- Humor notes: ${profile.humor_notes || "-"}
- Inside jokes: ${list(profile.inside_jokes)}
- Last session: ${profile.last_session_summary || "-"}
${lang ? `- For ${lang.language}: level ${lang.level_estimate}
  · Recurring mistakes: ${list(lang.recurring_mistakes)}
  · Already fixed: ${list(lang.fixed_mistakes)}
  · Vocab learned: ${list(lang.vocab_learned)}
  · Topics covered: ${list(lang.topics)}` : "- No history yet in this language."}
- Other languages they study: ${profile.languages?.filter((l) => l !== lang).map((l) => `${l.language} (${l.level_estimate})`).join(", ") || "-"}`;
}
