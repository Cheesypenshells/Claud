// Kehidupan karakter yang terus berjalan: sekali per hari (tanggal lokal di kotanya) AI menulis
// "kabar hari ini" yang melanjutkan cerita hari-hari sebelumnya. Dunia ini sama untuk semua pengguna.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL } from "./model.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(here, "data", "world.json");
const KEEP_DAYS = 14;
const client = new Anthropic();

const DaySchema = z.object({
  today_id: z.string().describe("2-3 sentences in casual Indonesian: what is concretely going on in their life today (work, people, small events, plans for tonight)"),
  mood: z.string().describe("Their mood today in a few Indonesian words, e.g. 'semangat tapi ngantuk'"),
  busy: z.enum(["santai", "normal", "sibuk", "sibuk banget"]),
  news: z.array(z.string()).describe("1-3 small concrete things that happened today or this week (Indonesian)"),
  dream_progress: z.string().describe("One Indonesian sentence: progress, setback or new step toward their dream/goal"),
  wants_to_talk_about: z.string().describe("Something they're eager to share or ask about today (Indonesian)"),
});

let world = null;
let writing = Promise.resolve();
const running = new Map();

async function load() {
  if (world) return world;
  try { world = JSON.parse(await fs.readFile(FILE, "utf8")); } catch (e) {
    if (e.code !== "ENOENT") throw e;
    world = { chars: {} };
  }
  return world;
}
function save() {
  writing = writing.then(async () => {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE + ".tmp", JSON.stringify(world, null, 1));
    await fs.rename(FILE + ".tmp", FILE);
  }).catch((e) => console.error("Gagal menyimpan world.json:", e));
  return writing;
}

/** Kabar hari ini kalau sudah ada (tanpa memanggil AI). */
export async function lifeToday(id, dateStr) {
  return (await load()).chars[id]?.days?.[dateStr] ?? null;
}

/** Pastikan kabar hari ini ada; buat dengan AI kalau belum. */
export function ensureLife(id, c, dateStr, { localText, weather, outfitDesc }) {
  const lockKey = `${id}|${dateStr}`;
  if (running.has(lockKey)) return running.get(lockKey);
  const job = (async () => {
    const w = await load();
    const ch = (w.chars[id] ??= { days: {} });
    if (ch.days[dateStr]) return ch.days[dateStr];
    const past = Object.entries(ch.days).sort(([a], [b]) => a.localeCompare(b)).slice(-7)
      .map(([d, x]) => `${d}: ${x.today_id} | mood: ${x.mood} | progress: ${x.dream_progress}`).join("\n") || "(no previous days yet — this is day one of the story)";
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(DaySchema) },
      system: `You simulate the ongoing everyday life of a FICTIONAL adult character so they feel like a real person living in the real world. Write today's entry of their life.
Rules: grounded and specific (names of friends/places, small events), consistent with previous days (continue storylines gradually — not every day is dramatic; mix good and bad days), aware of the real date (weekday vs weekend, season, public holidays and festivals in their country), the local weather and their work schedule. Their dream progresses slowly and realistically. No sexual content, no tragedies that would be distressing; mild ups and downs only.`,
      messages: [{
        role: "user",
        content: `CHARACTER: ${c.name}, ${c.age}, ${c.job} in ${c.city}. Personality: ${c.personality}. ${c.persona}
Life: dream: ${c.life.dream}; current goal: ${c.life.goal}; family: ${c.life.family}; home: ${c.life.home}; pet: ${c.life.pet}; struggle: ${c.life.struggle}.
Work schedule & routine (local hours): ${c.activities.map((a) => `${a.id} ${a.hours[0]}-${a.hours[1]}`).join(", ")}.
TODAY: ${localText} in ${c.city}. Weather: ${weather ?? "unknown"}. Outfit today: ${outfitDesc}.
PREVIOUS DAYS:
${past}`,
      }],
    });
    if (!res.parsed_output) throw new Error("Kabar harian tidak terbaca");
    ch.days[dateStr] = { ...res.parsed_output, at: new Date().toISOString() };
    for (const d of Object.keys(ch.days).sort().slice(0, -KEEP_DAYS)) delete ch.days[d];
    await save();
    console.log(`📰 Kabar ${c.name} (${dateStr}) dibuat.`);
    return ch.days[dateStr];
  })().finally(() => running.delete(lockKey));
  running.set(lockKey, job);
  return job;
}

/** Tunggu kabar harian maksimal `ms` milidetik; kalau lebih lama/gagal → null (percakapan tetap jalan). */
export async function lifeWithin(promise, ms) {
  return Promise.race([promise.catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);
}
