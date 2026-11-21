// Sistem akun sederhana: username + password (hash scrypt), sesi lewat cookie HttpOnly.
// Data akun & sesi disimpan di data/auth.json.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const scrypt = promisify(crypto.scrypt);
const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(here, "data", "auth.json");
const COOKIE = "cps_session";
const SESSION_DAYS = 30;
const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;

let db = null;
let writing = Promise.resolve();

async function load() {
  if (db) return db;
  try {
    db = JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e; // jangan timpa file akun yang rusak secara diam-diam
    db = { users: {}, sessions: {} };
  }
  // buang sesi kedaluwarsa
  const now = Date.now();
  for (const [t, s] of Object.entries(db.sessions)) if (s.expires < now) delete db.sessions[t];
  return db;
}

function save() {
  writing = writing.then(async () => {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE + ".tmp", JSON.stringify(db, null, 1), { mode: 0o600 });
    await fs.rename(FILE + ".tmp", FILE);
  }).catch((e) => console.error("Gagal menyimpan data akun:", e));
  return writing;
}

async function hashPassword(password, salt) {
  return (await scrypt(password.normalize("NFKC"), salt, 64)).toString("hex");
}

export class AuthError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

function validateCredentials(username, password) {
  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    throw new AuthError("Username 3–30 karakter: huruf kecil, angka, titik, atau garis bawah.");
  }
  if (typeof password !== "string" || password.length < 8 || password.length > 200) {
    throw new AuthError("Password minimal 8 karakter.");
  }
}

async function createSession(user) {
  const token = crypto.randomBytes(32).toString("base64url");
  db.sessions[token] = { userId: user.id, expires: Date.now() + SESSION_DAYS * 864e5 };
  await save();
  return token;
}

const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name });

export async function register({ username, password, name }) {
  username = String(username ?? "").trim().toLowerCase();
  validateCredentials(username, password);
  name = String(name ?? "").trim().slice(0, 40) || username;
  await load();
  if (db.users[username]) throw new AuthError("Username sudah dipakai. Coba yang lain.", 409);
  const salt = crypto.randomBytes(16).toString("hex");
  const user = { id: crypto.randomUUID(), username, name, salt, hash: await hashPassword(password, salt), createdAt: new Date().toISOString() };
  db.users[username] = user;
  return { user: publicUser(user), token: await createSession(user) };
}

export async function login({ username, password }) {
  username = String(username ?? "").trim().toLowerCase();
  if (typeof password !== "string") throw new AuthError("Username atau password salah.", 401);
  await load();
  const user = db.users[username];
  // Tetap hitung hash meski user tidak ada, supaya waktu respons tidak membocorkan username yang terdaftar.
  const salt = user?.salt ?? "0".repeat(32);
  const hash = Buffer.from(await hashPassword(password, salt), "hex");
  const expected = Buffer.from(user?.hash ?? "0".repeat(128), "hex");
  if (!user || !crypto.timingSafeEqual(hash, expected)) throw new AuthError("Username atau password salah.", 401);
  return { user: publicUser(user), token: await createSession(user) };
}

function readCookie(req) {
  const m = (req.headers.cookie ?? "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

/** Kembalikan user yang sedang login, atau null. */
export async function currentUser(req) {
  const token = readCookie(req);
  if (!token) return null;
  await load();
  const s = db.sessions[token];
  if (!s || s.expires < Date.now()) return null;
  const user = Object.values(db.users).find((u) => u.id === s.userId);
  return user ? publicUser(user) : null;
}

export async function logout(req) {
  const token = readCookie(req);
  await load();
  if (token && db.sessions[token]) {
    delete db.sessions[token];
    await save();
  }
}

export async function allUserIds() {
  await load();
  return Object.values(db.users).map((u) => u.id);
}

export function sessionCookie(req, token) {
  const secure = req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted ? "; Secure" : "";
  return token
    ? `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`
    : `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

// Batasi percobaan login/daftar per alamat IP: 10 gagal per 15 menit.
const attempts = new Map();
export function checkRateLimit(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (a && a.until > now && a.count >= 10) throw new AuthError("Terlalu banyak percobaan. Coba lagi 15 menit lagi.", 429);
}
export function recordFailure(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.until < now) attempts.set(ip, { count: 1, until: now + 15 * 60e3 });
  else a.count++;
}
