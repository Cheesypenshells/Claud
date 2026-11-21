// Penyimpanan sederhana berbasis file JSON (data/store.json).
// Cocok untuk satu pengguna yang menjalankan website di komputernya sendiri.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, "data");
const FILE = path.join(DATA_DIR, "store.json");
const MAX_THREAD_MESSAGES = 2000; // riwayat lengkap per tutor+bahasa
const MAX_PENDING = 60;

const empty = () => ({ threads: {}, profile: null, pending: [] });
let data = null;
let writing = Promise.resolve();

async function load() {
  if (data) return data;
  try {
    data = { ...empty(), ...JSON.parse(await fs.readFile(FILE, "utf8")) };
  } catch (e) {
    if (e.code !== "ENOENT") console.error("Gagal membaca data/store.json, mulai dari kosong:", e.message);
    data = empty();
  }
  return data;
}

function save() {
  // Tulis berurutan & atomik (tulis file sementara lalu rename) agar file tidak rusak.
  writing = writing.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(data, null, 1));
    await fs.rename(tmp, FILE);
  }).catch((e) => console.error("Gagal menyimpan data:", e));
  return writing;
}

export const threadKey = (tutor, language) => `${tutor}:${language}`;

export async function getThread(key) {
  return (await load()).threads[key] ?? [];
}

/** Simpan satu pertukaran (pesan user + balasan AI) ke riwayat & antrean pembaruan ingatan. */
export async function appendExchange(key, meta, userText, assistantText) {
  const d = await load();
  const t = (d.threads[key] ??= []);
  const ts = new Date().toISOString();
  t.push({ role: "user", content: userText, ts }, { role: "assistant", content: assistantText, ts });
  if (t.length > MAX_THREAD_MESSAGES) t.splice(0, t.length - MAX_THREAD_MESSAGES);
  d.pending.push({ ...meta, user: userText, assistant: assistantText, ts });
  if (d.pending.length > MAX_PENDING) d.pending.splice(0, d.pending.length - MAX_PENDING);
  await save();
}

export async function clearThread(key) {
  const d = await load();
  delete d.threads[key];
  await save();
}

export async function getProfile() {
  return (await load()).profile;
}

export async function getPending() {
  return [...(await load()).pending];
}

/** Ganti profil, lalu buang item antrean yang sudah diproses. */
export async function setProfile(profile, processedCount) {
  const d = await load();
  d.profile = { ...profile, updated_at: new Date().toISOString() };
  d.pending.splice(0, processedCount);
  await save();
}

export async function wipeAll() {
  data = empty();
  await save();
}
