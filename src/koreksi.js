// Koreksi catatan dengan membalas (reply) pesan bot, atau pesan singkat tepat setelah mencatat:
//   reply "uang valen"       -> semua catatan di pesan itu jadi uang Valen
//   reply "batal"             -> dibatalkan
//   reply "tanggal 3 okt"     -> tanggal diubah
//   reply "masuk konsumsi"    -> kategori diubah
//   reply "250rb" (1 catatan) -> nominal diubah
// Pesan yang bukan koreksi (misalnya pengeluaran baru "parkir 5rb") dikembalikan null.

import { ambilUangSiapa, ambilUangSemua, ambilTanggal } from './parsers.js';
import { SEBUTAN_KATEGORI } from './lengkapi.js';
import { findMoney, bersihkan } from './util.js';

export const BATAS_LANJUTAN_MS = 10 * 60 * 1000;

// Kata yang boleh ada di pesan koreksi tanpa mengubah maknanya.
const PENGISI = new Set([
  'ya', 'iya', 'yg', 'yang', 'itu', 'ini', 'tadi', 'semua', 'semuanya', 'sekalian', 'kak', 'bot', 'tolong', 'pls', 'dong',
  'jadi', 'diganti', 'ganti', 'ubah', 'diubah', 'harusnya', 'seharusnya', 'benarnya', 'yang', 'benar', 'bener', 'bukan', 'tapi',
  'masuk', 'masukin', 'kategori', 'ke', 'nominal', 'harga', 'harganya', 'nya', 'pakai', 'pake', 'dari', 'untuk', 'jd', 'aja', 'saja',
  'dan', 'sama', 'juga', 'tanggalnya', 'tgl', 'tanggal', 'no', 'nomor', 'catatan', 'bagian', 'bagiannya', 'punya', 'pakai',
  'mohon', 'diganti', 'ganti', 'tolongin', 'yah', 'kok', 'tuh', 'nih', 'loh', 'lho', 'udah', 'sudah',
  'jadinya', 'yaa', 'salah', 'bener', 'benernya', 'benarnya', 'sebenarnya', 'sebenernya', 'totalnya', 'total', 'koreksi', 'cuma', 'hanya',
]);
// Koreksi nominal harus jelas diminta, supaya reply "hotel 300rb" tetap dicatat sebagai pengeluaran baru.
const RE_MINTA_NOMINAL = /\b(harusnya|seharusnya|jadinya|jadi|harga|harganya|salah|bener|benar|benernya|benarnya|sebenarnya|sebenernya|bukan|ganti|ubah|koreksi|totalnya|cuma|hanya)\b/;

export function idDariTeks(teks) {
  return [...new Set(String(teks ?? '').toUpperCase().match(/\bT\d{4,}\b/g) || [])];
}

// Menerjemahkan teks koreksi jadi { batal } atau { siapa, tanggal, kategori, nominal }. null kalau bukan koreksi.
export function bacaKoreksi(teks, { hariIni, satuCatatan, rentang = null }) {
  let sisa = bersihkan(String(teks ?? '').toLowerCase().replace(/(?<!\d)[.,!]+|[.,!]+(?!\d)/g, ' '));
  if (!sisa || sisa.startsWith('#')) return null;
  if (/^(batal|batalkan|hapus|cancel|dibatalkan|gak jadi|nggak jadi|tidak jadi)\b/.test(sisa) && sisa.split(/\s+/).length <= 4) return { batal: true };

  const hasil = {};
  const semua = ambilUangSemua(sisa);
  if (semua.siapa) { hasil.siapa = semua.siapa; sisa = semua.sisa; } else {
    const u = ambilUangSiapa(sisa);
    if (u.siapa) { hasil.siapa = u.siapa; sisa = u.sisa; } else if (/^(kas|kas usaha)$/.test(sisa)) { hasil.siapa = 'Kas usaha'; sisa = ''; }
  }
  const tgl = ambilTanggal(sisa, hariIni, rentang);
  if (tgl.tanggal) { hasil.tanggal = tgl.tanggal; sisa = tgl.sisa; }
  const uang = findMoney(sisa);
  if (uang.length === 1 && satuCatatan && RE_MINTA_NOMINAL.test(sisa)) {
    hasil.nominal = uang[0].nilai;
    sisa = sisa.slice(0, uang[0].index) + ' ' + sisa.slice(uang[0].index + uang[0].panjang);
  } else if (uang.length) return null; // ada harga lain: pengeluaran baru, bukan koreksi
  // Kategori hanya kalau jelas diminta ("masuk konsumsi", "kategori transport"), supaya pesan
  // seperti "bayar hotel" tidak dianggap koreksi.
  const minta = /\b(masuk|masukin|kategori|kategorinya|jadi|pindah|harusnya|seharusnya)\b/.test(sisa);
  const kat = minta ? SEBUTAN_KATEGORI.find(([re]) => re.test(sisa)) : null;
  if (kat) { hasil.kategori = kat[1]; sisa = sisa.replace(kat[0], ' '); }
  // "makan 50rb" (kategori + harga) adalah pengeluaran baru, bukan koreksi nominal.
  if (hasil.kategori && hasil.nominal) return null;
  if (!Object.keys(hasil).length) return null;
  // Sisa kata selain kata pengisi berarti kalimat lain (misalnya pengeluaran baru): jangan dianggap koreksi.
  const lain = bersihkan(sisa).split(/\s+/).filter((w) => w && !PENGISI.has(w) && !/^(non|konsumtif|kering|barang|baku|bahan|ekspedisi)$/.test(w));
  // Tanpa harga, koreksi uang siapa/tanggal boleh diselipi beberapa kata lain ("yang transport ... itu").
  const batasKataLain = hasil.nominal ? 0 : (hasil.siapa || hasil.tanggal ? 4 : 2);
  if (lain.length > batasKataLain) return null;
  return hasil;
}

// Reply ke pesan berisi beberapa catatan tapi menyebut salah satunya ("grab bandara pulang uang valen"):
// pilih catatan yang keterangannya paling cocok, lalu buang kata keterangan itu dari teks koreksi.
export function pilihCatatan(teks, catatan) {
  const kata = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const kataTeks = new Set(kata(teks));
  const skor = catatan.map((t) => kata(t.keterangan).filter((w) => kataTeks.has(w) && !PENGISI.has(w)).length);
  const maks = Math.max(0, ...skor);
  if (!maks || catatan.length < 2) return { catatan, teks };
  const pilih = catatan.filter((_, i) => skor[i] === maks);
  const buang = new Set(pilih.flatMap((t) => kata(t.keterangan)));
  const sisa = String(teks).split(/\s+/).filter((w) => !buang.has(w.toLowerCase().replace(/[^a-z0-9]/g, ''))).join(' ');
  return { catatan: pilih, teks: sisa };
}
