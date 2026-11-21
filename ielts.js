// 🎓 IELTS Speaking: simulasi penguji AI (Part 1 → 2 → 3) dengan umpan balik band per kriteria.
// Kriteria resmi IELTS Speaking: Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, Pronunciation.
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ENGLISH_VARIETIES } from "./accents.js";

const client = new Anthropic();
const MODEL = "claude-opus-5-5";

export const P1_TOPICS = ["hometown", "your home", "hobbies", "music", "food and cooking", "the weather", "technology and phones", "travel",
  "friends", "sport and exercise", "reading", "shopping", "weekends", "public transport", "social media", "sleep", "birthdays",
  "art", "nature and parks", "films", "holidays", "the sea", "clothes and fashion", "noise", "daily routine"];
const P1_PER_TOPIC = 3;

// ---------- skema ----------
const Band = z.number().describe("IELTS band 0-9 in steps of 0.5");
const FeedbackSchema = z.object({
  fc: Band.describe("Fluency & Coherence band for THIS answer"),
  lr: Band.describe("Lexical Resource band for THIS answer"),
  gra: Band.describe("Grammatical Range & Accuracy band for THIS answer"),
  comment_id: z.string().describe("1-2 sentences in casual Indonesian: honest verdict, Cheesy-Bot coach voice (can tease lightly)"),
  corrections: z.array(z.object({ wrong: z.string(), right: z.string(), why_id: z.string() })).describe("Up to 4 real mistakes; empty if none"),
  better_answer: z.string().describe("Their SAME ideas rewritten as a natural Band 8 spoken answer (same length range, natural spoken English, not essay style)"),
  useful_phrases: z.array(z.object({ phrase: z.string(), meaning_id: z.string() })).describe("2-4 natural collocations/idioms/linkers they could have used"),
  tip_id: z.string().describe("One concrete tip in Indonesian to raise the band next time"),
});
const CueSchema = z.object({
  topic: z.string().describe("Part 2 cue card task, e.g. 'Describe a place you visited that you would like to go back to.'"),
  points: z.array(z.string()).describe("Exactly 3 'You should say:' bullet points"),
  final: z.string().describe("The final line starting with 'and explain ...'"),
});
const Crit = z.object({ band: Band, comment_id: z.string().describe("2-3 sentences in Indonesian with concrete evidence quoted from the learner") });
const ReportSchema = z.object({
  fc: Crit, lr: Crit, gra: Crit,
  pronunciation_note_id: z.string().describe("Indonesian: pronunciation cannot be judged from a transcript; give 1-2 cautious hints only from what can be inferred (e.g. words often misrecognised) or say it was not assessed"),
  strengths: z.array(z.string()).describe("Indonesian"),
  weaknesses: z.array(z.string()).describe("Indonesian"),
  plan: z.array(z.string()).describe("3-5 concrete practice steps for the next week (Indonesian)"),
  upgrades: z.array(z.object({ question: z.string(), original: z.string(), better: z.string() })).describe("2-3 of their weakest answers upgraded to natural Band 8 spoken English"),
  summary_id: z.string().describe("2-3 sentence overall verdict in casual Indonesian, Cheesy-Bot voice"),
});

// ---------- util ----------
export const roundBand = (x) => Math.max(0, Math.min(9, Math.round(x * 2) / 2)); // aturan IELTS: .25→.5, .75→naik
const FILLERS = /\b(um+|uh+|erm+|er|ah+|hmm+|like|you know|i mean|basically|actually|kind of|sort of)\b/gi;
export function answerMetrics(text, seconds) {
  const words = (text.match(/[A-Za-z']+/g) ?? []).length;
  const fillers = (text.match(FILLERS) ?? []).length;
  const secs = Number.isFinite(seconds) && seconds >= 3 ? Math.round(seconds) : null; // rekaman terlalu pendek = tidak bisa diukur
  return { words, fillers, seconds: secs, wpm: secs ? Math.round((words / secs) * 60) : null };
}

function pickTopics() {
  const pool = P1_TOPICS.filter((t) => t !== "hometown" && t !== "your home");
  const a = [Math.random() < 0.5 ? "hometown" : "your home"];
  while (a.length < 3) {
    const t = pool[Math.floor(Math.random() * pool.length)];
    if (!a.includes(t)) a.push(t);
  }
  return a;
}

export function newSession(mode, startPart = 1) {
  return {
    id: crypto.randomUUID(), mode, startedAt: new Date().toISOString(),
    part: Number(startPart) || 1, p1Topics: pickTopics(), p1Done: 0, p2Stage: "none", p3Done: 0,
    cue: null, transcript: [], feedback: [], status: "active", report: null,
  };
}

const EXAMINER = `You are Sarah, a fictional IELTS Speaking examiner inside the Cheesy Pen Shells language app. You speak natural, warm British English — like a real, experienced examiner who's also a pleasant human being.
Style:
- Natural spoken English with contractions and real-person rhythm. Short reactions before the next question ("Oh, nice.", "Right.", "Mm, interesting.", "Fair enough.", "Ah, I see."), then ONE clear question. Vary them; never sound scripted.
- Ask natural follow-ups that build on what they actually said ("Why's that?", "And how did that make you feel?") when the instruction allows.
- Never correct or teach during the test, never give scores, never switch to Indonesian. Keep each turn short (1-3 sentences) except when giving Part 2 instructions.
- Real IELTS wording where appropriate ("Now, let's talk about…", "I'm going to give you a topic…", "You'll have one minute to prepare…").`;

/** Instruksi untuk giliran penguji berikutnya + perubahan state. */
export function nextStep(s, hasAnswer) {
  if (!hasAnswer && s.transcript.length === 0) {
    if (s.part === 1) return { say: `Open the test: greet them warmly, introduce yourself as Sarah, say this is the IELTS speaking test (${s.mode === "mock" ? "full mock test" : "practice session"}), ask what you should call them.`, advance: () => {} };
    if (s.part === 2) return { say: "Greet briefly, say you'll go straight to Part 2.", advance: (st) => { st.p2Stage = "card"; }, cue: true };
    return { say: "Greet briefly, say you'll practise Part 3 discussion questions, then ask the first Part 3 question on a general everyday theme (e.g. technology, education or travel).", advance: (st) => { st.part = 3; } };
  }
  if (s.part === 1) {
    const total = s.p1Topics.length * P1_PER_TOPIC;
    if (s.p1Done < total) {
      const i = s.p1Done, topic = s.p1Topics[Math.floor(i / P1_PER_TOPIC)], newTopic = i % P1_PER_TOPIC === 0;
      return {
        say: `PART 1, question ${i + 1} of ${total}. ${i === 0 ? `Start Part 1: "Now, in this first part, I'd like to ask you some questions about yourself." Then ask about ${topic}.` : newTopic ? `React very briefly, then move on: "Let's talk about ${topic}." and ask a typical Part 1 question about it.` : `React briefly to their answer and ask another Part 1 question about ${topic} (may build on what they said).`}`,
        advance: (st) => { st.p1Done++; },
      };
    }
    return { say: "React briefly to their last answer, then say Part 1 is finished and introduce Part 2: you'll give them a topic card, they have one minute to prepare and can make notes, then should talk for one to two minutes; you'll stop them when time is up. Tell them their topic is on the card and the minute starts now.", advance: (st) => { st.part = 2; st.p2Stage = "card"; }, cue: true };
  }
  if (s.part === 2) {
    if (s.p2Stage === "card") return { say: "They just finished their Part 2 long turn. Thank them naturally, then ask ONE short rounding-off question related to what they said.", advance: (st) => { st.p2Stage = "followup"; } };
    return { say: `React briefly, then say: "We've been talking about ${s.cue?.topic ?? "that topic"}, and I'd like to discuss with you one or two more general questions related to this." Ask the first Part 3 question (abstract, about society/trends/comparisons, linked to the Part 2 theme).`, advance: (st) => { st.part = 3; st.p3Done = 0; } };
  }
  if (s.part === 3) {
    if (s.p3Done < 4) return { say: `PART 3, question ${s.p3Done + 2} of 5. React like a thoughtful examiner (short), then ask a deeper Part 3 question — challenge or extend their opinion, ask for comparisons, causes, future predictions, or the other side.`, advance: (st) => { st.p3Done++; } };
    return { say: "Say naturally: \"Thank you. That's the end of the speaking test.\" plus a warm one-line goodbye.", advance: (st) => { st.status = "done"; } };
  }
  return null;
}

export async function makeCue(s) {
  const res = await client.messages.parse({
    model: MODEL, max_tokens: 1500, output_config: { effort: "low", format: zodOutputFormat(CueSchema) },
    system: "Write an authentic IELTS Speaking Part 2 cue card. Varied, everyday, answerable by anyone.",
    messages: [{ role: "user", content: `Avoid these Part 1 themes already used: ${s.p1Topics.join(", ")}. Random seed: ${Math.random().toFixed(4)}` }],
  });
  if (!res.parsed_output) throw new Error("Kartu Part 2 gagal dibuat");
  return res.parsed_output;
}

/** Streaming giliran penguji. onDelta(teks). */
export async function examinerTurn(s, instruction, onDelta, { fast = false, isRetryable = () => false } = {}) {
  const history = s.transcript.slice(-24).map((t) => ({ role: t.role === "examiner" ? "assistant" : "user", content: t.text }));
  const messages = [...history];
  if (!messages.length || messages.at(-1).role === "assistant") messages.push({ role: "user", content: "(The candidate is ready.)" });
  const params = {
    model: MODEL, max_tokens: 800, output_config: { effort: "low" },
    system: [
      { type: "text", text: EXAMINER, cache_control: { type: "ephemeral" } },
      ...(s.variety && s.variety !== "gb" ? [{ type: "text", text: `YOUR ACCENT/VARIETY: IELTS examiners come from many English-speaking countries — you are from the ${ENGLISH_VARIETIES[s.variety].label} background. Speak clear, educated English of that variety (its natural expressions and rhythm, lightly), not British. Keep slang/dialect minimal because this is a test.` }] : []),
      { type: "text", text: `INSTRUCTION FOR YOUR NEXT TURN: ${instruction}${s.cue && s.part === 2 && s.p2Stage === "card" ? `\nThe cue card topic is: ${s.cue.topic}` : ""}` },
    ],
    messages,
  };
  let text = "";
  const run = async (useFast) => {
    const stream = client.messages.stream(useFast ? { ...params, speed: "fast" } : params);
    try {
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") { text += ev.delta.text; onDelta(ev.delta.text); }
      }
      return await stream.finalMessage();
    } catch (e) {
      if (useFast && !text && isRetryable(e)) return run(false);
      throw e;
    }
  };
  await run(fast);
  return text.trim();
}

/** Umpan balik satu jawaban (mode latihan). */
export async function answerFeedback(question, answer, part, metrics) {
  const res = await client.messages.parse({
    model: MODEL, max_tokens: 3000, output_config: { effort: "low", format: zodOutputFormat(FeedbackSchema) },
    system: "You are an experienced IELTS Speaking examiner-coach. Rate ONE answer against the official public band descriptors (strict and calibrated, never inflated). The answer may be a speech-recognition transcript: ignore punctuation/capitalisation; don't judge pronunciation. Coach feedback goes in Indonesian; English examples must sound natural and spoken.",
    messages: [{ role: "user", content: `PART ${part}\nQUESTION: ${question}\nANSWER: ${answer}\nMETRICS: ${metrics.words} words${metrics.seconds ? `, ${metrics.seconds}s, ${metrics.wpm} wpm` : ""}, ${metrics.fillers} filler words.` }],
  });
  const f = res.parsed_output;
  if (!f) return null;
  f.fc = roundBand(f.fc); f.lr = roundBand(f.lr); f.gra = roundBand(f.gra);
  f.band = roundBand((f.fc + f.lr + f.gra) / 3);
  return f;
}

/** Rapor akhir sesi. */
export async function finalReport(s) {
  const qa = [];
  for (let i = 0; i < s.transcript.length; i++) {
    const t = s.transcript[i];
    if (t.role === "candidate") qa.push(`[Part ${t.part}] Q: ${s.transcript[i - 1]?.text ?? ""}\nA: ${t.text}${t.metrics ? ` (${t.metrics.words} words${t.metrics.seconds ? `, ${t.metrics.seconds}s` : ""}, ${t.metrics.fillers} fillers)` : ""}`);
  }
  if (!qa.length) return null;
  const res = await client.messages.parse({
    model: MODEL, max_tokens: 8000, output_config: { effort: "medium", format: zodOutputFormat(ReportSchema) },
    system: "You are a senior IELTS Speaking examiner. Give an honest, calibrated band report using the official public band descriptors (Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy). Never inflate. The answers may be speech-recognition transcripts (ignore punctuation). Feedback in Indonesian; English examples natural and spoken.",
    messages: [{ role: "user", content: qa.join("\n\n") }],
  });
  const r = res.parsed_output;
  if (!r) return null;
  for (const k of ["fc", "lr", "gra"]) r[k].band = roundBand(r[k].band);
  r.overall = roundBand((r.fc.band + r.lr.band + r.gra.band) / 3);
  r.answers = qa.length;
  r.at = new Date().toISOString();
  return r;
}
