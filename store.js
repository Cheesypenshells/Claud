// Penyimpanan per pengguna: data/users/<userId>.json berisi riwayat chat, ingatan, dan antrean ingatan.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const USERS_DIR = path.join(here, "data", "users");
const MAX_THREAD_MESSAGES = 2000; // riwayat lengkap per tutor+bahasa
const MAX_PENDING = 60;
const ID_RE = /^[0-9a-f-]{36}$/;

const empty = () => ({ threads: {}, profile: null, pending: [] });
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

/** Simpan satu pertukaran (pesan user + balasan AI) ke riwayat & antrean pembaruan ingatan. */
export async function appendExchange(userId, key, meta, userText, assistantText) {
  const d = await load(userId);
  const t = (d.threads[key] ??= []);
  const ts = new Date().toISOString();
  t.push({ role: "user", content: userText, ts }, { role: "assistant", content: assistantText, ts });
  if (t.length > MAX_THREAD_MESSAGES) t.splice(0, t.length - MAX_THREAD_MESSAGES);
  d.pending.push({ ...meta, user: userText, assistant: assistantText, ts });
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
