// Membaca foto bukti transfer / struk dengan Tesseract (OCR gratis, jalan di HP, tanpa internet).
// Di Termux dipasang lewat: pkg install tesseract  (scripts/pasang-hp.sh & perbarui-hp.sh).
// Dipakai untuk memastikan catatan yang nominalnya sama dengan catatan lama: nominal & tanggalnya dicek.

import { spawn } from 'node:child_process';
import { findMoney, BULAN } from './util.js';

const BATAS_WAKTU_MS = 90_000;

// Membaca foto: tanda putar kamera (EXIF) diterapkan, gambar diperkecil supaya cepat di HP, lalu dibaca.
// Kalau tidak ada nominal terbaca, foto dicoba diputar 180°, 90°, 270° (foto struk dari kamera bisa miring).
export async function bacaGambar(buffer) {
  let gambar = null;
  try {
    const { Jimp } = await import('jimp');
    gambar = await Jimp.read(buffer);
    if (gambar.bitmap.width > 1600) gambar.resize({ w: 1600 });
  } catch {
    return ocr(buffer); // bukan gambar yang bisa dibuka jimp: kirim apa adanya
  }
  let teksPertama = null;
  for (const putar of [0, 180, 90, 270]) {
    const g = putar ? gambar.clone().rotate({ deg: putar }) : gambar;
    const teks = await ocr(await g.getBuffer('image/png'));
    if (teks === null) return teksPertama;
    if (teksPertama === null) teksPertama = teks;
    if (nominalBukti(teks).length) return teks;
  }
  return teksPertama;
}

// Mengembalikan teks hasil OCR, atau null kalau Tesseract belum terpasang / gagal.
function ocr(buffer) {
  return new Promise((resolve) => {
    let selesai = false;
    const akhiri = (hasil) => { if (!selesai) { selesai = true; resolve(hasil); } };
    let proses;
    try {
      proses = spawn('tesseract', ['stdin', 'stdout', '-l', 'eng'], { stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {
      akhiri(null);
      return;
    }
    let keluar = '';
    proses.stdout.on('data', (d) => { keluar += d; });
    proses.on('error', () => akhiri(null));
    proses.on('close', (kode) => akhiri(kode === 0 ? keluar : null));
    const timer = setTimeout(() => { proses.kill('SIGKILL'); akhiri(null); }, BATAS_WAKTU_MS);
    proses.on('close', () => clearTimeout(timer));
    proses.stdin.on('error', () => {});
    proses.stdin.end(buffer);
  });
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const sah = (y, m, d) => y >= 2020 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;

// Tanggal di bukti: "22 Sep 2026", "22 September 2026", "05/10/2026", "05-10-2026", "2026-10-05".
export function tanggalBukti(teks) {
  const t = String(teks ?? '');
  const bulan = Object.keys(BULAN).sort((a, b) => b.length - a.length).join('|');
  const pola = [
    [new RegExp(`(?<!\\d)(\\d{1,2})\\s*(${bulan})[a-z]*\\.?,?\\s*(\\d{4})`, 'i'), (m) => [Number(m[3]), BULAN[m[2].toLowerCase()], Number(m[1])]],
    [/(?<!\d)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/, (m) => [Number(m[1]), Number(m[2]), Number(m[3])]],
    [/(?<!\d)(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?!\d)/, (m) => [Number(m[3]), Number(m[2]), Number(m[1])]],
  ];
  for (const [re, ambil] of pola) {
    const m = t.match(re);
    if (m) {
      const [y, b, d] = ambil(m);
      if (sah(y, b, d)) return ymd(y, b, d);
    }
  }
  return '';
}

// Semua nominal (>= Rp 1.000) di bukti. OCR kadang membaca "Rp" menempel ke angka: "Rp1.081.171,00".
export function nominalBukti(teks) {
  const bersih = String(teks ?? '').replace(/\b(rp|idr)\s*/gi, 'Rp ');
  const semua = findMoney(bersih).filter((u) => u.nilai >= 1000 && u.nilai < 10_000_000_000);
  // Utamakan angka yang diawali Rp/IDR; tahun dan nomor rekening/referensi tidak dianggap nominal.
  const denganRp = semua.filter((u) => /^rp/i.test(u.teks));
  const dipakai = denganRp.length ? denganRp : semua.filter((u) => !/^(19|20)\d{2}$/.test(String(u.nilai)));
  return [...new Set(dipakai.map((u) => u.nilai))];
}

// Nominal utama di bukti/struk: satu-satunya nominal, atau yang ada di baris "total", atau yang terbesar.
export function nominalUtama(teks) {
  const semua = nominalBukti(teks);
  if (semua.length <= 1) return semua[0] || null;
  const total = String(teks).split(/\n+/).filter((b) => /\b(total|jumlah|nominal|grand)\b/i.test(b)).flatMap((b) => nominalBukti(b));
  if (total.length) return total[total.length - 1];
  return Math.max(...semua);
}

export function bacaBukti(teks) {
  return { nominal: nominalBukti(teks), tanggal: tanggalBukti(teks) };
}
