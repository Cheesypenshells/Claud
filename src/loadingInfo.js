// Jadwal & lokasi loading in per event.
// - H-2 s/d hari pertama (bersama jobdesk), kalau belum diisi: bot bertanya di grup tim kapan loading in
//   (tanggal & jam) dan lokasi pintu/area loading in. Siapa pun di grup boleh menjawab.
// - "#loading 13 nov 22.00 pintu 3 belakang hall B" (owner/PIC) mengisi langsung.
// - Pertanyaan di grup ("loading in jam berapa?", "pintu loading di mana?") dijawab dari data tersimpan.
// Tersimpan di tab Event: loading_in ("YYYY-MM-DD HH:MM") dan lokasi_loading.

import { ambilTanggal } from './parsers.js';
import { tanggalLokal, BULAN } from './util.js';

const balas = (text) => [{ text }];
const kunci = (groupId) => `loadinginfo:${groupId}`;
const RE_LOKASI = /\b(pintu|gate|area|belakang|depan|samping|lobby|lobi|basement|parkir\w*|dock|loading dock|hall|lantai|lt\.?|gedung|gudang|jalan|jl\.?|masuk lewat|lewat)\b/i;
const RE_TANYA = /(\?|\b(kapan|jam berapa|jam brp|dimana|di mana|dmn|lokasi\w*|lewat mana|pintu mana|area mana)\b)/i;

// "13 nov jam 22.00" / "malam ini jam 10" / "besok jam 6 pagi" -> "YYYY-MM-DD HH:MM" atau null.
export function bacaWaktuLoading(teks, sekarang = new Date(), rentang = null) {
  const t = String(teks || '').toLowerCase();
  const hariIni = tanggalLokal(sekarang);
  const m = t.match(/\b(?:jam|pukul|pkl)?\s*(\d{1,2})(?:[.:](\d{2}))?\s*(pagi|siang|sore|malam|subuh|wib|wita|wit)?\b/);
  const jamMatch = [...t.matchAll(/\b(?:jam|pukul|pkl)\s*(\d{1,2})(?:[.:](\d{2}))?|\b(\d{1,2})[.:](\d{2})\b/g)][0];
  if (!jamMatch) return null;
  let jam = Number(jamMatch[1] ?? jamMatch[3]);
  const menit = Number(jamMatch[2] ?? jamMatch[4] ?? 0);
  if (jam > 23 || menit > 59) return null;
  if (/\b(malam|sore)\b/.test(t) && jam < 12) jam += 12;
  if (/\bsiang\b/.test(t) && jam < 11) jam += 12;
  let tanggal = hariIni;
  if (/\b(besok|bsk)\b/.test(t)) tanggal = tanggalLokal(new Date(sekarang.getTime() + 86400000));
  else if (/\blusa\b/.test(t)) tanggal = tanggalLokal(new Date(sekarang.getTime() + 2 * 86400000));
  else {
    const tanpaJam = t.replace(jamMatch[0], ' ');
    const d = ambilTanggal(tanpaJam, hariIni, rentang).tanggal;
    if (d) tanggal = d;
  }
  void m;
  return `${tanggal} ${String(jam).padStart(2, '0')}:${String(menit).padStart(2, '0')}`;
}

function bacaLokasi(teks) {
  const t = String(teks || '').trim();
  if (!RE_LOKASI.test(t)) return '';
  // buang bagian waktu dan kata pengantar
  return t.replace(/^#\w+\s*/, '').replace(/\b(loading ?in|bongkar|muat)\b/gi, ' ')
    .replace(new RegExp(`\\b\\d{1,2}\\s+(${Object.keys(BULAN).join('|')})\\b`, 'gi'), ' ')
    .replace(/\b(besok|lusa|malam ini|nanti malam|hari ini)\b/gi, ' ')
    .replace(/\b(?:jam|pukul|pkl)\s*\d{1,2}(?:[.:]\d{2})?\s*(pagi|siang|sore|malam|wib|wita|wit)?\b/gi, ' ')
    .replace(/\b\d{1,2}[.:]\d{2}\b/g, ' ').replace(/\s+/g, ' ').replace(/^[,.\s-]+|[,.\s-]+$/g, '').trim();
}

const tampilWaktu = (w) => {
  if (!w) return 'belum diisi';
  const [tgl, jam] = String(w).split(' ');
  const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][new Date(`${tgl}T00:00:00Z`).getUTCDay()];
  return `${hari} ${tgl} jam ${jam}`;
};

export function teksInfoLoading(event) {
  return `🚚 *Loading in ${event.kode}* (${event.kota})\n🕙 Waktu: *${tampilWaktu(event.loading_in)}*\n📍 Lokasi/pintu: *${event.lokasi_loading || 'belum diisi'}*`;
}

export function teksTanyaLoading(event) {
  const kurang = [];
  if (!event.loading_in) kurang.push('*kapan & jam berapa* loading in bisa dimulai (contoh: *loading in 13 nov jam 22.00*)');
  if (!event.lokasi_loading) kurang.push('*lokasi pintu / area loading in* (contoh: *pintu 3 belakang hall B, dekat parkir motor*)');
  return `🚚 *Info loading in ${event.kode}*\nMohon dijawab (siapa saja yang tahu):\n${kurang.map((k, i) => `${i + 1}. ${k}`).join('\n')}`;
}

async function simpan(ctx, event, isi) {
  await ctx.store.update('Event', 'kode', event.kode, isi);
  return { ...event, ...isi };
}

// Mulai bertanya (dipanggil penjadwal jobdesk). Mengembalikan teks pertanyaan atau ''.
export function mulaiTanyaLoading(ctx, groupId, event) {
  if (!ctx.sesi || (event.loading_in && event.lokasi_loading)) return '';
  ctx.sesi.set(kunci(groupId), { kode: event.kode, waktu: Date.now() });
  return teksTanyaLoading(event);
}

// #loading [waktu] [lokasi]
export async function perintahLoading(ctx, pesan, event, teks, { bolehUbah }) {
  if (!event) return balas('⚠️ Grup ini belum terhubung ke event.');
  const isi = String(teks || '').trim();
  if (!isi) return balas(teksInfoLoading(event));
  if (!bolehUbah) return balas('⚠️ Jadwal loading in hanya diubah owner atau PIC.');
  const waktu = bacaWaktuLoading(isi, pesan.waktu, { mulai: event.mulai, selesai: event.selesai });
  const lokasi = bacaLokasi(isi);
  const baru = await simpan(ctx, event, { ...(waktu ? { loading_in: waktu } : {}), ...(lokasi ? { lokasi_loading: lokasi } : {}) });
  return balas(`✅ Disimpan.\n${teksInfoLoading(baru)}`);
}

// Jawaban pertanyaan info loading in, atau pertanyaan dari tim ("loading in jam berapa?"). null kalau bukan.
export async function tanganiInfoLoading(ctx, pesan, event) {
  if (!ctx.sesi || !event || pesan.adaFoto) return null;
  const t = String(pesan.text || '').trim();
  if (!t || t.startsWith('#')) return null;
  const s = ctx.sesi.get(kunci(pesan.groupId));
  const aktif = s && s.kode === event.kode && Date.now() - s.waktu < 3 * 86400000;
  const balasTanya = /Info loading in/i.test(pesan.kutipan?.teks || '');
  const soalLoading = /\b(loading|bongkar|pintu|area loading|turun barang|truk)\b/i.test(t);

  // Jawaban (sesi aktif): waktu dan/atau lokasi.
  if ((aktif && (balasTanya || soalLoading || RE_LOKASI.test(t))) && !RE_TANYA.test(t)) {
    const waktu = !event.loading_in || balasTanya || soalLoading ? bacaWaktuLoading(t, pesan.waktu, { mulai: event.mulai, selesai: event.selesai }) : null;
    const lokasi = bacaLokasi(t);
    if (waktu || lokasi) {
      const baru = await simpan(ctx, event, { ...(waktu ? { loading_in: waktu } : {}), ...(lokasi ? { lokasi_loading: lokasi } : {}) });
      const kurang = !baru.loading_in || !baru.lokasi_loading;
      if (!kurang) ctx.sesi.hapus(kunci(pesan.groupId)); else ctx.sesi.set(kunci(pesan.groupId), { ...s, waktu: Date.now() });
      return balas(`✅ Dicatat, terima kasih!\n${teksInfoLoading(baru)}${kurang ? `\n\n${teksTanyaLoading(baru)}` : ''}`);
    }
  }
  // Pertanyaan tim: jawab dari data tersimpan.
  if (soalLoading && RE_TANYA.test(t)) {
    if (event.loading_in || event.lokasi_loading) return balas(teksInfoLoading(event));
    ctx.sesi.set(kunci(pesan.groupId), { kode: event.kode, waktu: Date.now() });
    return balas(`Info loading in belum ada di bot.\n${teksTanyaLoading(event)}`);
  }
  return null;
}
