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
