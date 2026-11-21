// 📚 Perpustakaan Bebas: buku-buku PUBLIC DOMAIN (milik umum, hak cipta sudah habis) dari Project Gutenberg.
// Server mengunduh teks aslinya, lalu AI mengambil ide dari teks itu — lengkap dengan penulis, judul, bab, dan kutipan asli.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(here, "data", "library");
const GUTENDEX = process.env.GUTENDEX_URL || "https://gutendex.com/books/";

// q = kata kunci pencarian di katalog Gutenberg; match = potongan nama penulis untuk memastikan buku yang benar
export const LIBRARY = {
  // ⏱️ Produktivitas & 🔁 Kebiasaan
  bennett24: { title: "How to Live on 24 Hours a Day", author: "Arnold Bennett", year: 1908, topic: "productivity", q: "How to Live on 24 Hours a Day", match: "Bennett",
    bio: "Novelis & jurnalis Inggris (1867–1931). Buku kecilnya tentang memanfaatkan waktu luang di luar jam kerja jadi salah satu buku produktivitas paling awal." },
  franklin: { title: "The Autobiography of Benjamin Franklin", author: "Benjamin Franklin", year: 1791, topic: "habits", q: "Autobiography of Benjamin Franklin", match: "Franklin",
    bio: "Penemu, penulis, & salah satu pendiri Amerika Serikat (1706–1790). Terkenal dengan daftar 13 kebajikan yang ia latih setiap minggu — cikal bakal 'habit tracker'." },
  jamesHabit: { title: "Habit", author: "William James", year: 1890, topic: "habits", q: "Habit William James", match: "James, William",
    bio: "Psikolog & filsuf Amerika (1842–1910), 'bapak psikologi Amerika'. Esainya tentang kebiasaan masih dikutip buku-buku kebiasaan modern." },
  smiles: { title: "Self-Help", author: "Samuel Smiles", year: 1859, topic: "habits", q: "Self-Help Smiles", match: "Smiles",
    bio: "Penulis & reformis Skotlandia (1812–1904). 'Self-Help' adalah buku pengembangan diri pertama yang benar-benar laris di dunia." },
  // 🧠 Psikologi & 🧘 Mindfulness
  allen: { title: "As a Man Thinketh", author: "James Allen", year: 1903, topic: "psychology", q: "As a Man Thinketh", match: "Allen",
    bio: "Penulis filsafat Inggris (1864–1912). Esai pendeknya tentang kekuatan pikiran membentuk hidup banyak memengaruhi buku motivasi abad ke-20." },
  jamesTeachers: { title: "Talks to Teachers on Psychology", author: "William James", year: 1899, topic: "learning", q: "Talks to Teachers on Psychology", match: "James, William",
    bio: "Psikolog & filsuf Amerika (1842–1910). Di buku ini ia menjelaskan perhatian, ingatan, dan kebiasaan untuk para guru — praktis untuk siapa saja yang belajar." },
  walden: { title: "Walden", author: "Henry David Thoreau", year: 1854, topic: "mindfulness", q: "Walden Thoreau", match: "Thoreau",
    bio: "Penulis & naturalis Amerika (1817–1862). Hidup dua tahun di kabin kecil di tepi danau Walden untuk belajar hidup sederhana dan sadar." },
  dhammapada: { title: "The Dhammapada", author: "Tradisi Buddha (terj. F. Max Müller)", year: 1881, topic: "mindfulness", q: "Dhammapada", match: "",
    bio: "Kumpulan ajaran Buddha dalam bentuk syair, salah satu teks Buddhis paling banyak dibaca. Terjemahan Inggris oleh ahli bahasa F. Max Müller (1823–1900)." },
  // 🏛️ Filsafat
  meditations: { title: "Meditations", author: "Marcus Aurelius", year: 180, topic: "philosophy", q: "Meditations Marcus Aurelius", match: "Marcus Aurelius",
    bio: "Kaisar Romawi & filsuf Stoa (121–180 M). 'Meditations' adalah jurnal pribadinya — catatan untuk dirinya sendiri tentang tenang, adil, dan tabah." },
  enchiridion: { title: "The Enchiridion", author: "Epictetus", year: 125, topic: "philosophy", q: "Enchiridion Epictetus", match: "Epictetus",
    bio: "Filsuf Stoa Yunani (±50–135 M), mantan budak. Ajaran intinya: bedakan apa yang bisa kamu kendalikan dan apa yang tidak." },
  seneca: { title: "Moral Letters to Lucilius", author: "Seneca", year: 65, topic: "philosophy", q: "Seneca Moral letters to Lucilius", match: "Seneca",
    bio: "Filsuf Stoa, penulis drama, & penasihat kaisar Romawi (±4 SM–65 M). Surat-suratnya membahas waktu, persahabatan, dan hidup bermakna." },
  ethics: { title: "The Nicomachean Ethics", author: "Aristotle", year: -340, topic: "philosophy", q: "Nicomachean Ethics", match: "Aristotle",
    bio: "Filsuf Yunani (384–322 SM), murid Plato & guru Aleksander Agung. Buku ini membahas kebahagiaan (eudaimonia) dan kebajikan sebagai kebiasaan." },
  emerson: { title: "Essays: First Series (Self-Reliance)", author: "Ralph Waldo Emerson", year: 1841, topic: "philosophy", q: "Essays First Series Emerson", match: "Emerson",
    bio: "Esais & penyair Amerika (1803–1882), tokoh transendentalisme. Esainya 'Self-Reliance' mengajak percaya pada pikiran sendiri." },
  taoteching: { title: "Tao Te Ching", author: "Lao Tzu (terj. James Legge)", year: -400, topic: "philosophy", q: "Tao Te Ching", match: "Laozi",
    bio: "Teks klasik Tiongkok yang dikaitkan dengan Lao Tzu (sekitar abad ke-6–4 SM), dasar Taoisme: kesederhanaan, kelenturan, dan 'wu wei'." },
  analects: { title: "The Analects", author: "Confucius (terj. James Legge)", year: -479, topic: "culture", q: "Analects Confucius", match: "Confucius",
    bio: "Kumpulan ucapan Konfusius (551–479 SM), guru & filsuf Tiongkok, dicatat para muridnya. Sangat memengaruhi budaya Asia Timur hingga kini." },
  apology: { title: "Apology", author: "Plato", year: -399, topic: "philosophy", q: "Apology Plato", match: "Plato",
    bio: "Filsuf Yunani (±428–348 SM). 'Apology' merekam pembelaan Sokrates di pengadilan: 'hidup yang tidak direnungkan tidak layak dijalani'." },
  // 🧭 Kepemimpinan & strategi
  artofwar: { title: "The Art of War", author: "Sun Tzu (terj. Lionel Giles)", year: -500, topic: "leadership", q: "Art of War Sun Tzu", match: "Sunzi",
    bio: "Ahli strategi militer Tiongkok (sekitar abad ke-5 SM). Prinsipnya — kenali diri & lawan, menang tanpa bertempur — dipakai di bisnis sampai olahraga." },
  prince: { title: "The Prince", author: "Niccolò Machiavelli", year: 1532, topic: "leadership", q: "The Prince Machiavelli", match: "Machiavelli",
    bio: "Diplomat & pemikir politik Italia (1469–1527). Bukunya tentang kekuasaan yang realistis (kadang kejam) jadi bahan diskusi kepemimpinan sampai sekarang." },
  plutarch: { title: "Plutarch's Lives", author: "Plutarch", year: 100, topic: "history", q: "Plutarch's Lives", match: "Plutarch",
    bio: "Sejarawan & penulis biografi Yunani (±46–119 M). Membandingkan tokoh-tokoh besar Yunani dan Romawi untuk belajar karakter dan kepemimpinan." },
  // 🗣️ Komunikasi
  publicspeaking: { title: "The Art of Public Speaking", author: "Dale Carnegie & J. Berg Esenwein", year: 1915, topic: "communication", q: "Art of Public Speaking Esenwein", match: "Esenwein",
    bio: "Dale Carnegie (1888–1955) guru public speaking Amerika yang kemudian terkenal di seluruh dunia; buku awal ini (1915) ditulis bersama editor J. Berg Esenwein." },
  rhetoric: { title: "Rhetoric", author: "Aristotle", year: -350, topic: "communication", q: "Rhetoric Aristotle", match: "Aristotle",
    bio: "Filsuf Yunani (384–322 SM). Di sini lahir konsep ethos, pathos, logos — tiga cara meyakinkan orang yang masih dipakai di marketing modern." },
  // 💰 Keuangan & 📈 Bisnis & 💼 Karier
  wealth: { title: "The Wealth of Nations", author: "Adam Smith", year: 1776, topic: "money", q: "Wealth of Nations", match: "Smith, Adam",
    bio: "Ekonom & filsuf Skotlandia (1723–1790), 'bapak ekonomi modern'. Menjelaskan pembagian kerja, pasar, dan 'tangan tak terlihat'." },
  barnum: { title: "The Art of Money Getting", author: "P. T. Barnum", year: 1880, topic: "money", q: "Art of Money Getting Barnum", match: "Barnum",
    bio: "Pengusaha hiburan & pemasar legendaris Amerika (1810–1891). Nasihat uang & usahanya ternyata sangat praktis untuk pebisnis kecil." },
  wattles: { title: "The Science of Getting Rich", author: "Wallace D. Wattles", year: 1910, topic: "money", q: "Science of Getting Rich", match: "Wattles",
    bio: "Penulis 'New Thought' Amerika (1860–1911). Bukunya populer di dunia motivasi; baca dengan kritis — sebagian klaimnya bukan sains." },
  taylor: { title: "The Principles of Scientific Management", author: "Frederick Winslow Taylor", year: 1911, topic: "business", q: "Principles of Scientific Management", match: "Taylor",
    bio: "Insinyur Amerika (1856–1915), pelopor manajemen ilmiah: mengukur & memperbaiki cara kerja. Dasar efisiensi operasional (termasuk dapur & booth!)." },
  conwell: { title: "Acres of Diamonds", author: "Russell H. Conwell", year: 1890, topic: "business", q: "Acres of Diamonds", match: "Conwell",
    bio: "Pendeta & pendiri Temple University (1843–1925). Ceramahnya: peluang sering ada di sekitar kita, bukan di tempat jauh." },
  marden: { title: "Pushing to the Front", author: "Orison Swett Marden", year: 1894, topic: "career", q: "Pushing to the Front", match: "Marden",
    bio: "Penulis & pendiri majalah 'Success' (1848–1924). Kumpulan kisah dan prinsip tentang kerja keras, ketekunan, dan meraih peluang." },
  washington: { title: "Up from Slavery", author: "Booker T. Washington", year: 1901, topic: "career", q: "Up from Slavery", match: "Washington, Booker",
    bio: "Pendidik & pemimpin Afrika-Amerika (1856–1915), lahir sebagai budak lalu mendirikan Tuskegee Institute. Kisah nyata tentang belajar & membangun dari nol." },
  // 🔬 Sains & 📚 Belajar & 💞 Hubungan & 🦪 Ilmu Langka
  darwin: { title: "On the Origin of Species", author: "Charles Darwin", year: 1859, topic: "science", q: "On the Origin of Species", match: "Darwin",
    bio: "Naturalis Inggris (1809–1882). Teori seleksi alamnya mengubah cara manusia memahami kehidupan." },
  einstein: { title: "Relativity: The Special and General Theory", author: "Albert Einstein", year: 1916, topic: "science", q: "Relativity Special General Theory Einstein", match: "Einstein",
    bio: "Fisikawan Jerman-Amerika (1879–1955). Di buku ini ia sendiri menjelaskan relativitas untuk pembaca awam." },
  keller: { title: "The Story of My Life", author: "Helen Keller", year: 1903, topic: "learning", q: "Story of My Life Helen Keller", match: "Keller",
    bio: "Penulis & aktivis Amerika (1880–1968) yang tuli & buta sejak kecil, lalu belajar bahasa lewat sentuhan — kisah belajar yang luar biasa." },
  prophet: { title: "The Prophet", author: "Kahlil Gibran", year: 1923, topic: "relationships", q: "The Prophet Gibran", match: "Gibran",
    bio: "Penyair & pelukis Lebanon-Amerika (1883–1931). Esai puitisnya tentang cinta, pernikahan, kerja, dan persahabatan dibaca di seluruh dunia." },
  oyster: { title: "The Oyster", author: "William Keith Brooks", year: 1891, topic: "rare", q: "The Oyster Brooks", match: "Brooks",
    bio: "Ahli biologi laut Amerika (1848–1908) di Johns Hopkins. Buku populernya tentang biologi & budidaya tiram — 'ilmu langka' yang pas untuk Cheesy Pen Shells 🦪." },
};

const CHUNK_WORDS = 2200;

function stripGutenberg(text) {
  const start = text.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\n/i);
  const end = text.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG EBOOK/i);
  let t = text.slice(start >= 0 ? text.indexOf("\n", start) + 1 : 0, end >= 0 ? end : undefined);
  return t.replace(/\r/g, "").trim();
}

/** Pecah teks jadi potongan ±2200 kata, tiap potongan dengan judul bab terdekat. */
function chunk(text) {
  const paras = text.split(/\n\s*\n/);
  const chunks = [];
  let buf = [], words = 0, heading = "Awal", chunkHeading = "Awal";
  const isHeading = (p) => p.length < 90 && /^(CHAPTER|BOOK|LETTER|PART|SECTION|ESSAY|LECTURE|[IVXLC]+\.|THE [A-Z ]{3,})/i.test(p.trim()) && !/[.,;:]$/.test(p.trim());
  for (const p of paras) {
    if (isHeading(p)) heading = p.trim().replace(/\s+/g, " ");
    if (!buf.length) chunkHeading = heading;
    buf.push(p.trim());
    words += p.split(/\s+/).length;
    if (words >= CHUNK_WORDS) {
      chunks.push({ heading: chunkHeading, text: buf.join("\n\n") });
      buf = []; words = 0;
    }
  }
  if (buf.join(" ").split(/\s+/).length > 300) chunks.push({ heading: chunkHeading, text: buf.join("\n\n") });
  return chunks;
}

const running = new Map();

/** Unduh (sekali) & simpan buku; mengembalikan { meta, chunks }. */
export async function loadBook(slug) {
  const b = LIBRARY[slug];
  if (!b) throw new Error("Buku tidak ada di katalog");
  const file = path.join(DIR, `${slug}.json`);
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
  if (running.has(slug)) return running.get(slug);
  const job = (async () => {
    const res = await fetch(`${GUTENDEX}?search=${encodeURIComponent(b.q)}`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Katalog Gutenberg tidak bisa diakses (${res.status})`);
    const results = (await res.json()).results ?? [];
    const book = results.find((r) => (r.languages ?? []).includes("en") && (!b.match || r.authors?.some((a) => a.name.includes(b.match)))) ?? null;
    if (!book) throw new Error("Buku tidak ditemukan di Project Gutenberg");
    const fmt = Object.entries(book.formats ?? {}).find(([k, v]) => k.startsWith("text/plain") && !v.endsWith(".zip"));
    if (!fmt) throw new Error("Teks polos buku tidak tersedia");
    const txt = await fetch(fmt[1], { signal: AbortSignal.timeout(60000) });
    if (!txt.ok) throw new Error(`Gagal mengunduh buku (${txt.status})`);
    const chunks = chunk(stripGutenberg(await txt.text()));
    if (!chunks.length) throw new Error("Isi buku kosong");
    const data = { meta: { gutenbergId: book.id, url: `https://www.gutenberg.org/ebooks/${book.id}`, gutenbergTitle: book.title, downloadedAt: new Date().toISOString() }, chunks };
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(file, JSON.stringify(data));
    console.log(`📚 Buku "${b.title}" diunduh dari Gutenberg #${book.id} (${chunks.length} bagian).`);
    return data;
  })().finally(() => running.delete(slug));
  running.set(slug, job);
  return job;
}

/** Cek bahwa kutipan benar-benar ada di teks (mengabaikan beda spasi/kutip). */
export function quoteInText(quote, text) {
  const norm = (s) => s.toLowerCase().replace(/[“”"‘’'`]/g, "").replace(/\s+/g, " ").trim();
  const q = norm(quote);
  return q.length >= 12 && norm(text).includes(q);
}
