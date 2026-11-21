// Penyimpanan per pengguna: data/users/<userId>.json berisi riwayat chat, ingatan, dan antrean ingatan.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const USERS_DIR = path.join(here, "data", "users");
const MAX_THREAD_MESSAGES = 2000; // riwayat lengkap per tutor+bahasa
const MAX_PENDING = 60;
const ID_RE = /^[0-9a-f-]{36}$/;

const empty = () => ({ threads: {}, profile: null, pending: [], skills: {}, dates: {} });
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
  t.push({ role: "user", content: userText, ts, ...(meta.voice ? { voice: true } : {}) },
    { role: "assistant", content: assistantText, ts, ...(assistantMeta ? { meta: assistantMeta } : {}) });
  // XP: 10 per obrolan, +5 kalau pesannya cukup panjang (usaha lebih)
  const sk = (d.skills[meta.langId] ??= { current: null, history: [], xp: 0, since: 0 });
  sk.xp += 10 + (userText.trim().split(/\s+/).length >= 8 ? 5 : 0);
  sk.since += 1;
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
      if (m.role === "user") out.push({ tutor, ts: m.ts, text: m.content, voice: !!m.voice, context: msgs[i - 1]?.content ?? "" });
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
