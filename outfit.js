// Pakaian harian karakter: berganti tiap hari (tanggal lokal di kotanya) dan menyesuaikan aktivitas
// (seragam kerja, baju olahraga, baju renang). Deterministik: semua pengguna melihat baju yang sama hari itu.

const SPORT = new Set(["gym", "running", "yoga", "football", "hiking", "cycling", "taichi", "dancing"]);
const SWIM = new Set(["swimming", "surfing"]);
const PROPS = { music: ["guitar"], photography: ["camera"], hiking: ["backpack"], cycling: ["backpack"], fishing: ["cap"] };
const HATS = new Set(["cap", "beanie", "beret", "pilotcap", "chefhat", "headband", "headphones", "hairflower", "hairclip"]);

export const STYLE_ID = {
  tee: "kaos", sweater: "sweater", shirt: "kemeja", blouse: "blus", jacket: "jaket", hoodie: "hoodie", dress: "gaun",
  blazer: "blazer", scrubs: "scrubs", chef: "jaket koki", kimono: "kimono", wetsuit: "baju selam", overalls: "overall",
};
export const ACC_ID = {
  hairflower: "bunga di rambut", necklace: "kalung", bracelet: "gelang", bag: "tas selempang", earrings: "anting", headphones: "headphone",
  scarf: "syal", watch: "jam tangan", cap: "topi", sunglasses: "kacamata hitam", beret: "baret", hairclip: "jepit rambut",
  headband: "ikat kepala", camera: "kamera", beanie: "kupluk", backpack: "ransel", apron: "celemek", stethoscope: "stetoskop",
  lanyard: "tali kartu identitas", tie: "dasi", pilotcap: "topi pilot", chefhat: "topi koki", guitar: "tas gitar",
};
const HIJAB_COLORS = [["#6E4F7A", "lilac"], ["#C99A5B", "cokelat susu"], ["#2F4A7A", "biru tua"], ["#E8D8C0", "krem"], ["#7A1F2A", "marun"], ["#4E7A5A", "hijau zaitun"]];

function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
function pickSome(r, arr, n) {
  const a = [...arr];
  const out = [];
  while (a.length && out.length < n) out.push(a.splice(Math.floor(r() * a.length), 1)[0]);
  return out;
}

export function localDate(tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Pakaian karakter untuk tanggal & aktivitas tertentu → { look, desc_id, key } */
export function outfitFor(c, dateStr, activity) {
  const w = c.wardrobe;
  const r = rng(`${c.name}|${dateStr}`); // sama sepanjang hari
  const base = { ...c.look };
  const hijab = base.hair === "hijab";
  const features = w.features ?? [];
  let look, desc;

  // pakaian kasual hari ini (dipakai juga sebagai dasar aktivitas lain)
  const style = pick(r, w.styles);
  const [top, topName] = pick(r, w.tops);
  const [bottom, bottomName] = pick(r, w.bottoms);
  const dress = style === "dress";
  const skirt = dress || (w.skirtOk && c.gender === "F" && r() < 0.45);
  let acc = pickSome(r, w.acc, r() < 0.5 ? 1 : 2);
  if (hijab) acc = acc.filter((a) => !HATS.has(a) && a !== "earrings");
  const hijabColor = hijab ? pick(r, HIJAB_COLORS) : null;

  if (activity === "work") {
    const u = w.uniform;
    look = { ...base, style: u.style, top: u.top, bottom: u.bottom ?? (u.style === "kimono" ? u.top : base.bottom), skirt: u.style === "kimono", shorts: !!u.shorts, accent: base.accent, acc: [...features, ...u.acc] };
    desc = `pakaian kerja: ${u.topName}${u.acc.length ? `, ${u.acc.map((a) => ACC_ID[a]).join(", ")}` : ""}`;
  } else if (SPORT.has(activity)) {
    const [st, stName] = pick(r, w.tops.filter(([h]) => h !== "#F2E3C9" && h !== "#F2E6D0") .length ? w.tops : w.tops);
    const extra = hijab ? ["watch"] : [pick(r, ["cap", "watch", "headband"])];
    look = { ...base, style: activity === "yoga" || activity === "dancing" ? "tee" : pick(r, ["tee", "hoodie"]), top: st, bottom: "#2B2B2B", skirt: false, shorts: !hijab && activity !== "hiking" && r() < 0.5, shoes: "#F2F2F2", acc: [...features, ...extra, ...(PROPS[activity] ?? [])] };
    desc = `baju olahraga: ${STYLE_ID[look.style]} ${stName}, celana ${look.shorts ? "pendek" : "training"} hitam, sepatu sport putih, ${extra.map((a) => ACC_ID[a]).join(", ")}`;
  } else if (SWIM.has(activity)) {
    const light = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11) > 170; };
    look = { ...base, style: "wetsuit", top: light(top) ? "#2F6FB2" : top, bottom: "#1F2A44", skirt: false, shorts: false, shoes: base.skin, acc: [...features, "sunglasses"] };
    desc = `baju renang lengan panjang (rash guard) ${light(top) ? "biru" : topName}, kacamata hitam`;
  } else {
    const props = PROPS[activity] ?? [];
    look = { ...base, style, top, bottom: dress ? top : bottom, skirt, shorts: false, acc: [...new Set([...features, ...acc, ...props])] };
    desc = `${STYLE_ID[style]} ${topName}${dress ? "" : `, ${skirt ? "rok" : "celana"} ${bottomName}`}${acc.length ? `, ${acc.map((a) => ACC_ID[a]).join(", ")}` : ""}`;
  }
  if (hijab) {
    look.hairColor = hijabColor[0];
    desc = `hijab ${hijabColor[1]}, ${desc}`;
  }
  const key = JSON.stringify([look.style, look.top, look.bottom, look.skirt, look.shorts, look.hairColor, [...look.acc].sort()]);
  return { look, desc_id: desc, key };
}
