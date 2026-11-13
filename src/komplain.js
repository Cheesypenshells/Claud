// Komplain pelanggan dari QR di depan booth (halaman Google Apps Script, lihat apps-script/Code.gs):
// baris baru di tab "Komplain" (status BARU) diteruskan bot ke WhatsApp owner, lalu ditandai DITERUSKAN.
// Komplain yang tidak dibatalkan owner (Status BATAL di tab) mengurangi nilai KPI kelompok event itu.
// #qr (owner): link halaman kasir antrian & QR komplain (disimpan di Pengaturan: url_antrian).

import { waktuLokal } from './util.js';

const balas = (text) => [{ text }];

export async function tugasKomplain(ctx, sekarang = new Date()) {
  const keluar = [];
  let rows;
  try { rows = await ctx.store.all('Komplain'); } catch { return keluar; }
  const baru = rows.filter((r) => String(r.status).toUpperCase() === 'BARU');
  if (!baru.length) return keluar;
  const owner = [...(ctx.ownerIds || [])];
  for (const r of baru) {
    const teks = [
      `📣 *Komplain pelanggan ${r.kode_event || ''}*${r.lokasi ? ` (${r.lokasi})` : ''}`,
      `🗂️ ${r.kategori}`,
      `💬 ${r.detail}`,
      r.nama || r.kontak ? `👤 ${[r.nama, r.kontak].filter(Boolean).join(' · ')}` : '👤 (anonim)',
      `🕒 ${r.waktu}`,
      '',
      '_Mengurangi nilai KPI kelompok event ini (−2). Kalau komplain tidak valid, ubah Status jadi BATAL di tab Komplain._',
    ].join('\n');
    for (const n of owner) keluar.push({ nomor: n, text: teks });
    await ctx.store.updateWhere('Komplain', (x) => x.id === r.id && String(x.status).toUpperCase() === 'BARU', { status: 'DITERUSKAN', diteruskan: waktuLokal(sekarang) });
  }
  return keluar;
}

// Baris komplain yang dihitung KPI (bukan BATAL).
export async function komplainAktif(store) {
  try { return (await store.all('Komplain')).filter((r) => String(r.status).toUpperCase() !== 'BATAL'); } catch { return []; }
}

export async function perintahQr(ctx, event, { isOwner }) {
  if (!isOwner) return balas('⚠️ Perintah ini khusus owner.');
  const atur = Object.fromEntries((await ctx.store.all('Pengaturan')).map((p) => [p.kunci, p.nilai]));
  const url = atur.url_antrian;
  if (!url) return balas('⚠️ Halaman antrian & komplain belum dipasang. (Pengaturan: url_antrian kosong)');
  const kode = event?.kode ? `&e=${encodeURIComponent(event.kode)}` : '';
  return balas([
    '🦪 *Link sistem antrian & komplain*',
    '',
    `🧾 *Kasir* (buka di HP/tablet kasir, PIN kasir):\n${url}?p=kasir`,
    '',
    `📣 *Komplain pelanggan* (cetak jadi QR di depan booth):\n${url}?p=komplain${kode}`,
    '',
    '_Pelanggan tidak perlu link antrian: QR khusus setiap pesanan muncul di layar kasir setelah struk difoto._',
  ].join('\n'));
}

// ---------- Link kasir (langsung masuk, PIN ikut di link) ----------
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const nomor62 = (n) => String(n || '').replace(/\D/g, '').replace(/^0/, '62');

// Pemegang halaman kasir sebuah event: kolom Event "Kasir Antrian" (nama, pisah koma) + anggota tim berperan Kasir.
export function namaKasir(event, tim = []) {
  const ditunjuk = String(event?.kasir_antrian || '').split(/[,/&]|\bdan\b/i).map((x) => x.trim()).filter(Boolean);
  const berperan = tim.filter((o) => o.kode_event === event?.kode && o.peran === 'Kasir' && o.status !== 'BATAL').map((o) => o.nama);
  return [...ditunjuk, ...berperan];
}

// Event yang sedang/akan berjalan di mana nomor ini kasir antrian atau PIC (untuk #kasir dari chat pribadi / grup).
export async function eventKasirUntuk(ctx, nomor, tanggal) {
  const [events, tim, karyawan] = await Promise.all([ctx.store.all('Event'), ctx.store.all('Tim Event'), ctx.store.all('Karyawan')]);
  const namaSaya = karyawan.filter((k) => nomor62(k.nomor_wa) === String(nomor)).map((k) => k.nama);
  if (!namaSaya.length) return [];
  return events.filter((e) => e.status !== 'BATAL' && e.status !== 'SELESAI' && (!tanggal || String(e.selesai || e.mulai) >= tanggal))
    .filter((e) => namaKasir(e, tim).some((n) => namaSaya.some((s) => sama(s, n)))
      || tim.some((o) => o.kode_event === e.kode && o.peran === 'PIC' && namaSaya.some((s) => sama(s, o.nama))));
}

// #kasirnya Tiara (owner, grup pengeluaran/tim event): tunjuk pemegang halaman kasir untuk event ini.
export async function perintahKasirnya(ctx, event, isi, { isOwner }) {
  if (!isOwner) return balas('⚠️ Penunjukan kasir antrian hanya oleh owner.');
  if (!event) return balas('⚠️ Ketik di grup event, contoh: *#kasirnya Tiara*');
  const nama = String(isi || '').trim();
  if (!nama) return balas(`🧾 Kasir antrian ${event.kode}: *${event.kasir_antrian || '(belum ditunjuk)'}*\nUbah: *#kasirnya Tiara*`);
  await ctx.store.updateWhere('Event', (e) => e.kode === event.kode, { kasir_antrian: nama });
  return balas(`✅ Kasir antrian ${event.kode}: *${nama}*\nDi hari pertama event, 2 jam sebelum buka, link kasir dikirim ke chat pribadinya. Ia juga bisa meminta lagi dengan *#kasir* lewat chat pribadi ke bot.`);
}
// Pengaturan: url_antrian (link /exec web app) dan pin_kasir (sama dengan KASIR_PIN di Apps Script).
export function linkKasir(atur, kode = '') {
  if (!atur.url_antrian) return '';
  return `${atur.url_antrian}?p=kasir${atur.pin_kasir ? `&k=${encodeURIComponent(atur.pin_kasir)}` : ''}${kode ? `&e=${encodeURIComponent(kode)}` : ''}`;
}

const teksKasir = (event, link) => `🧾 *Link kasir antrian ${event.kode}* (${event.kota})\n${link}\n\nBuka di HP/tablet kasir, langsung masuk (tanpa ketik PIN).\n1. *📷 Pesanan baru – foto struk* → nomor antrian & QR muncul, minta pelanggan scan QR-nya\n2. *📷 Foto & mulai bakar* saat pesanan dibakar\n3. *🔔 Panggil* saat siap → HP pelanggan berbunyi\n_Link ini khusus tim, jangan dibagikan ke pelanggan._`;

// #kasir (owner/PIC): link kasir dibalas di grup tempat perintah diketik.
export async function perintahKasir(ctx, event, { bolehLihat }) {
  if (!bolehLihat) return balas('⚠️ Link kasir hanya bisa diminta owner atau PIC.');
  const atur = Object.fromEntries((await ctx.store.all('Pengaturan')).map((p) => [p.kunci, p.nilai]));
  const link = linkKasir(atur, event?.kode);
  if (!link) return balas('⚠️ Halaman kasir antrian belum dipasang (Pengaturan: url_antrian kosong).');
  return balas(event ? teksKasir(event, link) : `🧾 *Link kasir antrian*\n${link}`);
}

// Hari pertama event, 2 jam sebelum buka (atau jam 08.00 kalau jam buka kosong), sekali per event:
// chat pribadi ke anggota tim berperan Kasir; kalau tidak ada kasir bernomor, ke grup tim.
export async function tugasLinkKasir(ctx, sekarang = new Date(), { tanggalLokal }) {
  const keluar = [];
  if (!ctx.sesi) return keluar;
  const [pengaturan, events, tim, karyawan, grup] = await Promise.all([
    ctx.store.all('Pengaturan'), ctx.store.all('Event'), ctx.store.all('Tim Event'), ctx.store.all('Karyawan'), ctx.store.all('Grup'),
  ]);
  const atur = Object.fromEntries(pengaturan.map((p) => [p.kunci, p.nilai]));
  if (!atur.url_antrian) return keluar;
  const hariIni = tanggalLokal(sekarang);
  const jam = Number(String(sekarang.toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false })).slice(0, 2));
  for (const e of events.filter((x) => x.mulai === hariIni && x.status !== 'BATAL' && x.status !== 'SELESAI')) {
    const buka = e.jam_buka ? Number(String(e.jam_buka).split(/[.:]/)[0]) : 10;
    if (jam < Math.max(0, buka - 2)) continue;
    const tanda = `linkkasir:${e.kode}`;
    if (ctx.sesi.get(tanda)) continue;
    ctx.sesi.set(tanda, { kirim: true });
    const teks = teksKasir(e, linkKasir(atur, e.kode));
    const kasir = [...new Set(namaKasir(e, tim).map((n) => karyawan.find((k) => sama(k.nama, n) && k.nomor_wa)).filter(Boolean))];
    if (kasir.length) for (const k of kasir) keluar.push({ nomor: nomor62(k.nomor_wa), text: teks });
    else for (const g of grup.filter((x) => x.kode_event === e.kode && x.jenis === 'event')) keluar.push({ groupId: g.group_id, text: teks });
  }
  return keluar;
}
