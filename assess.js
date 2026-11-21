// Penilaian kemampuan bahasa berbasis CEFR (Common European Framework of Reference for Languages),
// standar internasional yang paling luas dipakai (acuan IELTS, DELF/DALF, Goethe, DELE, dll).
// Dinilai dari teks/transkrip obrolan memakai 5 aspek kualitatif CEFR untuk bahasa lisan/interaksi:
// Range, Accuracy, Fluency, Interaction, Coherence (CEFR Companion Volume, 2020).
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getLearnerSamples, getSkills, saveAssessment } from "./store.js";
import { MODEL } from "./model.js";

export const CEFR = ["Pre-A1", "A1", "A2", "B1", "B2", "C1", "C2"];
export const SKILLS = {
  range: "Ragam & Kosakata",
  accuracy: "Ketepatan Grammar",
  fluency: "Kelancaran",
  interaction: "Interaksi",
  coherence: "Koherensi",
};
// Gelar peringkat bertema Cheesy Pen Shells untuk tiap level CEFR
export const RANKS = {
  "Pre-A1": "🦪 Kerang Mentah",
  A1: "🧂 Kerang Dicuci",
  A2: "🧄 Kerang Berbumbu",
  B1: "🧀 Kerang Bermozzarella",
  B2: "🔥 Kerang Dibakar",
  C1: "⭐ Kerang Juara Grill",
  C2: "👑 Grand Master Oyster",
};

export const ASSESS_EVERY = 6;    // nilai ulang setiap 6 pesan baru di bahasa itu
export const MIN_MESSAGES = 4;    // minimal pesan murid sebelum penilaian pertama

const Level = z.enum(CEFR);
const Skill = z.object({
  level: Level,
  score: z.number().int().describe("0-100: progress within this level toward the next one"),
  evidence: z.string().describe("Short quote(s) from the learner + why, in Bahasa Indonesia"),
});
const AssessmentSchema = z.object({
  enough_evidence: z.boolean().describe("false if the learner wrote too little in the target language to judge"),
  overall: Level,
  overall_score: z.number().int().describe("0-100: progress within the overall level toward the next one"),
  skills: z.object({ range: Skill, accuracy: Skill, fluency: Skill, interaction: Skill, coherence: Skill }),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  next_focus: z.array(z.string()).describe("2-4 concrete things to practise next to reach the next level"),
  summary: z.string().describe("2-3 sentences to the learner in casual Indonesian, in Cheesy-Bot's voice (honest, a little teasing)"),
});

const SYSTEM = `You are a certified CEFR examiner. Assess an Indonesian learner's ability in a foreign language using the official CEFR scales (Council of Europe, Companion Volume 2020), specifically the qualitative aspects of spoken/written interaction:
- RANGE: breadth of vocabulary and structures.
- ACCURACY: grammatical control and correct word use.
- FLUENCY: ability to produce language with ease and length (in chat: length, spontaneity, how much they rely on Indonesian or on the tutor).
- INTERACTION: initiating, responding, keeping the conversation going, asking questions.
- COHERENCE: linking ideas into connected discourse (connectors, logical flow).
Rules:
- Judge ONLY what the learner actually produced in the target language. Messages in Indonesian show no target-language skill (but asking in Indonesian may show low fluency).
- Be strict and calibrated like a real exam: a learner who only writes short memorised phrases is A1, simple sentences about routine with frequent errors is A2, etc. Never inflate. Use "Pre-A1" when they can barely produce anything.
- The overall level is a holistic judgement (not simply the average), and it cannot be more than one level above accuracy.
- Text chat cannot show pronunciation; don't assess it. Speech-recognised transcripts may lack punctuation — don't penalise that.
- If there is too little target-language evidence, set enough_evidence=false and give your best cautious estimate.
- Consider the previous assessment for continuity, but follow the new evidence.`;

const client = new Anthropic();
const running = new Map();

/** Nilai kemampuan murid di satu bahasa. Kembalikan hasil atau null bila belum cukup data. */
export function runAssessment(userId, langId, langName, { force = false } = {}) {
  const lockKey = `${userId}|${langId}`;
  if (running.has(lockKey)) return running.get(lockKey);
  const job = (async () => {
    const skills = await getSkills(userId);
    const state = skills[langId];
    const samples = await getLearnerSamples(userId, langId, 60);
    if (samples.length < MIN_MESSAGES) return null;
    if (!force && (state?.since ?? 0) < ASSESS_EVERY && state?.current) return state.current;

    const transcript = samples.map((s, i) =>
      `#${i + 1} [${s.tutor}${s.voice ? ", via speech" : ""}]\nTUTOR (context): ${s.context.slice(0, 280)}\nLEARNER: ${s.text}`
    ).join("\n\n");
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(AssessmentSchema) },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: `TARGET LANGUAGE: ${langName}\nPREVIOUS ASSESSMENT: ${state?.current ? JSON.stringify({ overall: state.current.overall, skills: Object.fromEntries(Object.entries(state.current.skills).map(([k, v]) => [k, v.level])) }) : "none"}\n\nLEARNER MESSAGES (oldest → newest):\n${transcript}`,
      }],
    });
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      console.warn("Penilaian dilewati:", response.stop_reason);
      return state?.current ?? null;
    }
    const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
    const a = response.parsed_output;
    a.overall_score = clamp(a.overall_score);
    for (const s of Object.values(a.skills)) s.score = clamp(s.score);
    a.samples = samples.length;
    await saveAssessment(userId, langId, a);
    console.log(`📊 Penilaian ${langName} pengguna ${userId.slice(0, 8)}: ${a.overall}`);
    return a;
  })()
    .catch((e) => {
      console.error("Gagal menilai kemampuan:", e.message);
      throw e;
    })
    .finally(() => running.delete(lockKey));
  running.set(lockKey, job);
  return job;
}

/** Teks untuk system prompt: level hasil penilaian jadi patokan mengajar. */
export function renderSkills(assessment) {
  if (!assessment) return "OFFICIAL CEFR ASSESSMENT: not assessed yet in this language.";
  const s = assessment.skills;
  return `OFFICIAL CEFR ASSESSMENT (your own examiner's rating of this learner in this language): overall ${assessment.overall} (${RANKS[assessment.overall]}, ${assessment.overall_score}% toward next level).
Range ${s.range.level} · Accuracy ${s.accuracy.level} · Fluency ${s.fluency.level} · Interaction ${s.interaction.level} · Coherence ${s.coherence.level}.
Next focus: ${assessment.next_focus.join("; ")}.
Teach at this level + a little above (i+1): use language they can mostly understand, push their weakest skill, and celebrate when they show the next level.`;
}

/** Deskripsi level untuk opsi Level "Otomatis". */
export function autoLevelText(assessment) {
  return assessment
    ? `CEFR ${assessment.overall} (assessed by you; adjust within the conversation)`
    : "not assessed yet — start around A2 and adapt quickly to what they show";
}
