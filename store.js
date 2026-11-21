// Penyimpanan per pengguna: data/users/<userId>.json berisi riwayat chat, ingatan, dan antrean ingatan.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const USERS_DIR = path.join(here, "data", "users");
const MAX_THREAD_MESSAGES = 2000; // riwayat lengkap per tutor+bahasa
const MAX_PENDING = 60;
const ID_RE = /^[0-9a-f-]{36}$/;

const empty = () => ({ threads: {}, profile: null, pending: [], skills: {}, dates: {}, cultureBook: [] });
const LEVEL_ORDER = ["Pre-A1", "A1", "A2", "B1", "B2", "C1", "C2"];
const cache = new Map();   // userId -> data
const writes = new Map();  // userId -> antrean tulis

function fileFor(userId) {
  if (!ID_RE.test(userId)) throw new Error("userId tidak valid");
  return path.join(USERS_DIR, `${userId}.json`);
}

async function load(userId) {
  if (cache.has(userId)) return cache.get(userId);
  let data;
  try {
    data = { ...empty(), ...JSON.parse(await fs.readFile(fileFor(userId), "utf8")) };
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    data = empty();
  }
  cache.set(userId, data);
  return data;
}

function save(userId) {
  // Tulis berurutan & atomik (file sementara lalu rename) agar file tidak rusak.
  const next = (writes.get(userId) ?? Promise.resolve()).then(async () => {
    await fs.mkdir(USERS_DIR, { recursive: true });
    const file = fileFor(userId);
    await fs.writeFile(file + ".tmp", JSON.stringify(cache.get(userId), null, 1));
    await fs.rename(file + ".tmp", file);
  }).catch((e) => console.error("Gagal menyimpan data pengguna:", e));
  writes.set(userId, next);
  return next;
}

export const threadKey = (tutor, language) => `${tutor}:${language}`;

export async function getThread(userId, key) {
  return (await load(userId)).threads[key] ?? [];
}

/** Simpan satu pertukaran (pesan user + balasan AI) ke riwayat, XP, & antrean pembaruan ingatan. */
export async function appendExchange(userId, key, meta, userText, assistantText, assistantMeta = null) {
  const d = await load(userId);
  const t = (d.threads[key] ??= []);
  const ts = new Date().toISOString();
  t.push({ role: "user", content: userText, ts, ...(meta.voice ? { voice: true } : {}), ...(meta.hidden ? { hidden: true } : {}) },
    { role: "assistant", content: assistantText, ts, ...(assistantMeta ? { meta: assistantMeta } : {}) });
  // XP: 10 per obrolan, +5 kalau pesannya cukup panjang (usaha lebih)
  const sk = (d.skills[meta.langId] ??= { current: null, history: [], xp: 0, since: 0 });
  if (!meta.hidden) {
    sk.xp += 10 + (userText.trim().split(/\s+/).length >= 8 ? 5 : 0);
    sk.since += 1;
  }
  if (t.length > MAX_THREAD_MESSAGES) t.splice(0, t.length - MAX_THREAD_MESSAGES);
  const { tutor, language, level } = meta;
  d.pending.push({ tutor, language, level, user: userText, assistant: assistantText, ts });
  if (d.pending.length > MAX_PENDING) d.pending.splice(0, d.pending.length - MAX_PENDING);
  await save(userId);
}

export async function clearThread(userId, key) {
  const d = await load(userId);
  delete d.threads[key];
  await save(userId);
}

export async function getProfile(userId) {
  return (await load(userId)).profile;
}

export async function getPending(userId) {
  return [...(await load(userId)).pending];
}

/** Ganti profil, lalu buang item antrean yang sudah diproses. */
export async function setProfile(userId, profile, processedCount) {
  const d = await load(userId);
  d.profile = { ...profile, updated_at: new Date().toISOString() };
  d.pending.splice(0, processedCount);
  await save(userId);
}

export async function wipeUser(userId) {
  cache.set(userId, empty());
  await save(userId);
}

export async function getSkills(userId) {
  return (await load(userId)).skills;
}

/** Pesan-pesan murid dalam satu bahasa (dari semua tutor), beserta konteks balasan tutor sebelumnya. */
export async function getLearnerSamples(userId, langId, limit) {
  const d = await load(userId);
  const out = [];
  for (const [key, msgs] of Object.entries(d.threads)) {
    const [tutor, lang] = key.split(":");
    if (lang !== langId) continue;
    msgs.forEach((m, i) => {
      if (m.role === "user" && !m.hidden) out.push({ tutor, ts: m.ts, text: m.content, voice: !!m.voice, context: msgs[i - 1]?.content ?? "" });
    });
  }
  return out.sort((a, b) => a.ts.localeCompare(b.ts)).slice(-limit);
}

/** Simpan hasil penilaian; bonus XP kalau naik level. */
export async function saveAssessment(userId, langId, a) {
  const d = await load(userId);
  const sk = (d.skills[langId] ??= { current: null, history: [], xp: 0, since: 0 });
  const prev = sk.current?.overall;
  a.ts = new Date().toISOString();
  a.previous = prev ?? null;
  if (prev && LEVEL_ORDER.indexOf(a.overall) > LEVEL_ORDER.indexOf(prev)) sk.xp += 100;
  sk.current = a;
  sk.history.push({ ts: a.ts, overall: a.overall, overall_score: a.overall_score,
    skills: Object.fromEntries(Object.entries(a.skills).map(([k, v]) => [k, v.level])) });
  if (sk.history.length > 100) sk.history.splice(0, sk.history.length - 100);
  sk.since = 0;
  await save(userId);
}

// ----- mode Pendekatan -----
export async function getDates(userId) {
  return (await load(userId)).dates;
}

export async function setDate(userId, charId, value) {
  const d = await load(userId);
  d.dates[charId] = value;
  await save(userId);
}

export async function addXp(userId, langId, amount) {
  const d = await load(userId);
  const sk = (d.skills[langId] ??= { current: null, history: [], xp: 0, since: 0 });
  sk.xp += amount;
  await save(userId);
}

// ----- Buku Budaya -----
export async function addCultureNote(userId, entry) {
  const d = await load(userId);
  const book = (d.cultureBook ??= []);
  if (book.some((n) => n.charId === entry.charId && n.title.toLowerCase() === entry.title.toLowerCase())) return;
  book.push({ ...entry, ts: new Date().toISOString() });
  if (book.length > 500) book.splice(0, book.length - 500);
  await save(userId);
}

export async function getCultureBook(userId) {
  return (await load(userId)).cultureBook ?? [];
}

// ----- IELTS Speaking -----
export async function getIelts(userId) {
  const d = await load(userId);
  return (d.ielts ??= { current: null, history: [] });
}
export async function saveIelts(userId, current, report = null) {
  const d = await load(userId);
  const i = (d.ielts ??= { current: null, history: [] });
  i.current = current;
  if (report) {
    i.history.push({ at: report.at, mode: current.mode, overall: report.overall, fc: report.fc.band, lr: report.lr.band, gra: report.gra.band, answers: report.answers });
    if (i.history.length > 50) i.history.splice(0, i.history.length - 50);
  }
  await save(userId);
}

// ----- 🧠 Wawasan -----
const DAY = 864e5;
const prevDate = (d) => new Date(Date.parse(d + "T00:00:00Z") - DAY).toISOString().slice(0, 10);
const BADGES = [
  ["streak3", (s) => s.streak.count >= 3, "🔥 Streak 3 hari"], ["streak7", (s) => s.streak.count >= 7, "🔥 Streak 7 hari"],
  ["streak30", (s) => s.streak.count >= 30, "🏆 Streak 30 hari"], ["read10", (s) => Object.keys(s.read).length >= 10, "📖 10 ide dibaca"],
  ["read50", (s) => Object.keys(s.read).length >= 50, "📚 50 ide dibaca"], ["read200", (s) => Object.keys(s.read).length >= 200, "🧠 200 ide dibaca"],
  ["stash10", (s) => Object.values(s.stashes).flat().length >= 10, "🔖 10 ide disimpan"], ["writer", (s) => s.mine.length >= 1, "✍️ Menulis ide pertama"],
  ["journey", (s) => Object.values(s.journeys).some((j) => j.done), "🧭 Menyelesaikan jalur belajar"],
];
export const BADGE_LABELS = Object.fromEntries(BADGES.map(([k, , l]) => [k, l]));

export async function insightState(userId) {
  const d = await load(userId);
  return (d.insights ??= { follow: [], goal: 5, read: {}, likes: {}, stashes: { Favorit: [] }, daily: {}, streak: { count: 0, last: null, best: 0 }, journeys: {}, mine: [], badges: [] });
}
function checkBadges(s) {
  const fresh = [];
  for (const [k, test] of BADGES) if (!s.badges.includes(k) && test(s)) { s.badges.push(k); fresh.push(k); }
  return fresh;
}
/** Tandai ide dibaca (sekali per ide). Mengembalikan progres harian, streak, lencana baru. */
export async function markRead(userId, id, date) {
  const s = await insightState(userId);
  let fresh = [];
  if (!s.read[id]) {
    s.read[id] = date;
    s.daily[date] = (s.daily[date] ?? 0) + 1;
    if (s.streak.last !== date) {
      s.streak.count = s.streak.last === prevDate(date) ? s.streak.count + 1 : 1;
      s.streak.last = date;
      s.streak.best = Math.max(s.streak.best, s.streak.count);
    }
    fresh = checkBadges(s);
    for (const k of Object.keys(s.daily).sort().slice(0, -60)) delete s.daily[k];
    await save(userId);
  }
  return { today: s.daily[date] ?? 0, goal: s.goal, streak: s.streak, newBadges: fresh };
}
export async function updateInsights(userId, fn) {
  const s = await insightState(userId);
  const out = fn(s);
  const fresh = checkBadges(s);
  await save(userId);
  return { out, newBadges: fresh };
}
