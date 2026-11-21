// Konteks dunia nyata: waktu lokal, cuaca (Open-Meteo, gratis tanpa API key), dan aktivitas karakter.

const WEATHER_URL = process.env.OPEN_METEO_URL || "https://api.open-meteo.com/v1/forecast";
const cache = new Map(); // "lat,lon" -> { at, text }
const TTL = 30 * 60e3;

// Kode cuaca WMO → teks
const WMO = {
  0: "cerah", 1: "cerah berawan", 2: "berawan sebagian", 3: "mendung", 45: "berkabut", 48: "berkabut",
  51: "gerimis ringan", 53: "gerimis", 55: "gerimis lebat", 61: "hujan ringan", 63: "hujan", 65: "hujan lebat",
  66: "hujan es ringan", 67: "hujan es", 71: "salju ringan", 73: "salju", 75: "salju lebat", 77: "butiran salju",
  80: "hujan lokal", 81: "hujan lokal", 82: "hujan deras", 85: "hujan salju", 86: "hujan salju lebat",
  95: "badai petir", 96: "badai petir & es", 99: "badai petir & es",
};

/** Cuaca terkini; null kalau gagal (tidak pernah memperlambat percakapan lebih dari 2,5 detik). */
export async function weatherAt(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.text;
  try {
    const url = `${WEATHER_URL}?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error(String(res.status));
    const c = (await res.json()).current;
    const text = `${WMO[c.weather_code] ?? "cuaca tidak diketahui"}, ${Math.round(c.temperature_2m)}°C (terasa ${Math.round(c.apparent_temperature)}°C), angin ${Math.round(c.wind_speed_10m)} km/j`;
    cache.set(key, { at: Date.now(), text });
    return text;
  } catch {
    cache.set(key, { at: Date.now() - TTL + 5 * 60e3, text: null }); // coba lagi 5 menit lagi
    return null;
  }
}

const VALID_TZ = (tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } };

export function localParts(tz, date = new Date()) {
  const zone = tz && VALID_TZ(tz) ? tz : "Asia/Jakarta";
  const f = new Intl.DateTimeFormat("id-ID", { timeZone: zone, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hour12: false }).format(date)) % 24;
  const part = hour < 4 ? "dini hari" : hour < 11 ? "pagi" : hour < 15 ? "siang" : hour < 18 ? "sore" : "malam";
  return { zone, hour, part, text: f.format(date) };
}

// ---------- Aktivitas ----------
export const ACTIVITIES = {
  work: { emoji: "💼", label: "lagi kerja", desc: "at work" },
  walk: { emoji: "🚶", label: "jalan-jalan", desc: "taking a relaxed walk around the neighbourhood", walking: true },
  night: { emoji: "🌙", label: "jalan malam", desc: "a late-night walk to grab snacks at a convenience store / night food stall", walking: true },
  fishing: { emoji: "🎣", label: "memancing", desc: "fishing with a rod, bait and a cooler box", scene: "lake" },
  swimming: { emoji: "🏊", label: "berenang", desc: "swimming laps / relaxing at a swimming pool", scene: "pool" },
  gym: { emoji: "🏋️", label: "nge-gym", desc: "working out at the gym (weights, treadmill, stretching)", scene: "gym" },
  running: { emoji: "🏃", label: "lari", desc: "jogging / running", scene: "park", walking: true },
  cycling: { emoji: "🚴", label: "bersepeda", desc: "cycling", scene: "riverside", walking: true },
  surfing: { emoji: "🏄", label: "berselancar", desc: "surfing, or just came out of the water with a surfboard", scene: "beach" },
  hiking: { emoji: "⛰️", label: "mendaki", desc: "hiking a trail with a backpack", scene: "park", walking: true },
  yoga: { emoji: "🧘", label: "yoga", desc: "doing yoga / stretching outdoors", scene: "park" },
  taichi: { emoji: "🥋", label: "tai chi pagi", desc: "morning tai chi with older locals in the park", scene: "park" },
  coffee: { emoji: "☕", label: "ngopi", desc: "having coffee at a café", scene: "cafe" },
  tea: { emoji: "🍵", label: "minum teh", desc: "tea time at a teahouse", scene: "cafe" },
  reading: { emoji: "📚", label: "baca buku", desc: "reading a book at a café", scene: "cafe" },
  sketching: { emoji: "🎨", label: "menggambar", desc: "sketching people and buildings outdoors", scene: "park" },
  cooking: { emoji: "🍳", label: "belanja bahan masak", desc: "shopping for ingredients to cook a meal", scene: "market", walking: true },
  market: { emoji: "🛒", label: "ke pasar", desc: "browsing and shopping at a market", scene: "market", walking: true },
  music: { emoji: "🎸", label: "main musik", desc: "playing music / about to perform at an open-mic", scene: "cafe" },
  photography: { emoji: "📷", label: "hunting foto", desc: "taking photos around town", scene: "riverside", walking: true },
  dancing: { emoji: "💃", label: "latihan dance", desc: "dance practice / social dancing", scene: "city" },
  football: { emoji: "⚽", label: "main bola", desc: "playing a casual football match with friends", scene: "park" },
  baseball: { emoji: "⚾", label: "nonton baseball", desc: "heading to / watching a baseball game, cheering", scene: "city", walking: true },
};

const inWindow = (h, [a, b]) => (a <= b ? h >= a && h < b : h >= a || h < b);

/** Aktivitas karakter sekarang berdasarkan jam lokal di kotanya. */
export function currentActivity(c, hour) {
  const found = (c.activities ?? []).find((x) => inWindow(hour, x.hours));
  if (found) return found.id;
  return hour >= 23 || hour < 6 ? "night" : "walk";
}
