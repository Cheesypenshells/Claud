// Catatan harian: kejadian, barang yang perlu dibeli, dan PR (evaluasi) — muncul di pesan tugas jam 08.00 besoknya.
//   #kejadian kompor 2 bocor, sudah diganti        (siapa saja, grup tim / pengeluaran)
//   #beli gas kaleng 10, plastik wrap               (barang yang perlu dibeli; tetap tampil sampai #sudahbeli)
//   #pr evaluasi antrian sore terlalu lama          (PR / evaluasi)
//   #sudahbeli B3                                   (tandai barang sudah dibeli)
// PIC juga ditanya "kejadian / PR hari ini?" di akhir penilaian harian.
// Hanya teks, tanpa harga. Kejadian & barang yang dilapor di grup tim diteruskan ke grup pengeluaran.

import { STATUS } from './schema.js';
import { tanggalLokal, waktuLokal, tambahHari } from './util.js';

const balas = (text) => [{ text }];
export const JENIS = { kejadian: 'KEJADIAN', beli: 'BELI', pr: 'PR' };
const IKON = { KEJADIAN: '⚠️', BELI: '🛒', PR: '📌' };
const AWAL = { KEJADIAN: 'J', BELI: 'B', PR: 'R' };

async function semua(ctx) { try { return await ctx.store.all('Catatan Harian'); } catch { return []; } }

export async function tambahCatatan(ctx, { event, jenis, isi, oleh, tanggal, waktu }) {
  const rows = await semua(ctx);
  const id = `${AWAL[jenis]}${rows.filter((r) => r.jenis === jenis).length + 1}`;
  await ctx.store.append('Catatan Harian', {
    id, tanggal, kode_event: event.kode, jenis, isi: String(isi).trim().slice(0, 500), oleh, status: jenis === 'BELI' ? 'BELUM' : STATUS.OK, dicatat: waktuLokal(waktu),
  });
  return id;
}

// Bagian tambahan pesan tugas pagi: barang belum dibeli (semua hari) + kejadian & PR kemarin.
export async function teksCatatanPagi(ctx, event, tanggal) {
  const rows = (await semua(ctx)).filter((r) => r.kode_event === event.kode && r.status !== STATUS.BATAL);
  const kemarin = tambahHari(tanggal, -1);
  const beli = rows.filter((r) => r.jenis === 'BELI' && r.status === 'BELUM');
  const lalu = rows.filter((r) => (r.jenis === 'KEJADIAN' || r.jenis === 'PR') && String(r.tanggal) === kemarin);
  const bagian = [];
  if (beli.length) bagian.push(`🛒 *Perlu dibeli*\n${beli.map((r) => `   • ${r.isi} _(${r.id})_`).join('\n')}\n   _Sudah dibeli: *#sudahbeli ${beli[0].id}*_`);
  if (lalu.length) bagian.push(`📌 *Kejadian kemarin & PR*\n${lalu.map((r) => `   ${IKON[r.jenis]} ${r.isi}`).join('\n')}`);
  return bagian.join('\n\n');
}

// #kejadian / #beli / #pr
export async function perintahCatatan(ctx, pesan, event, cmd, { grupPengeluaran = [] } = {}) {
  const jenis = { kejadian: 'KEJADIAN', insiden: 'KEJADIAN', beli: 'BELI', belanja: 'BELI', perlubeli: 'BELI', pr: 'PR', evaluasi: 'PR' }[cmd.perintah];
  if (!event) return balas('⚠️ Ketik di grup event.');
  const isi = [cmd.sisaBaris, cmd.badan].filter(Boolean).join('\n').trim();
  if (!isi) {
    return balas({
      KEJADIAN: 'Format: *#kejadian kompor 2 bocor, sudah diganti cadangan*',
      BELI: 'Format: *#beli gas kaleng 10* (boleh beberapa baris)',
      PR: 'Format: *#pr evaluasi antrian sore terlalu lama*',
    }[jenis]);
  }
  const oleh = pesan.senderName || pesan.senderId;
  const tanggal = tanggalLokal(pesan.waktu);
  // #beli boleh banyak baris: satu barang per baris
  const isiList = jenis === 'BELI' ? isi.split(/\n|;/).map((x) => x.trim()).filter(Boolean) : [isi];
  const id = [];
  for (const x of isiList) id.push(await tambahCatatan(ctx, { event, jenis, isi: x, oleh, tanggal, waktu: pesan.waktu }));
  const teks = {
    KEJADIAN: `⚠️ Kejadian dicatat (${id[0]}): ${isi}\n_Muncul di pesan tugas besok pagi untuk evaluasi._`,
    BELI: `🛒 Dicatat perlu dibeli: ${isiList.map((x, i) => `${x} (${id[i]})`).join(', ')}\n_Muncul di pesan tugas setiap pagi sampai *#sudahbeli ${id[0]}*._`,
    PR: `📌 PR dicatat (${id[0]}): ${isi}\n_Muncul di pesan tugas besok pagi._`,
  }[jenis];
  const keluar = [{ text: teks }];
  // Dari grup tim: teruskan ke grup pengeluaran supaya owner/PIC tahu.
  if (grupPengeluaran.length && !grupPengeluaran.includes(pesan.groupId) && jenis !== 'PR') {
    for (const g of grupPengeluaran) keluar.push({ groupId: g, text: `${jenis === 'BELI' ? '🛒 *Perlu dibeli*' : '⚠️ *Kejadian*'} ${event.kode} dari *${oleh}*:\n${isi}` });
  }
  return keluar;
}

// #sudahbeli B3 [B4 ...]
export async function perintahSudahBeli(ctx, pesan, event, argumen) {
  if (!event) return balas('⚠️ Ketik di grup event.');
  const ids = argumen.map((a) => a.toUpperCase()).filter((a) => /^B\d+$/.test(a));
  if (!ids.length) {
    const belum = (await semua(ctx)).filter((r) => r.kode_event === event.kode && r.jenis === 'BELI' && r.status === 'BELUM');
    return balas(belum.length ? `Format: *#sudahbeli B3*\nBelum dibeli: ${belum.map((r) => `${r.isi} (${r.id})`).join(', ')}` : '✅ Tidak ada barang yang menunggu dibeli.');
  }
  const ok = [];
  for (const id of ids) if (await ctx.store.updateWhere('Catatan Harian', (r) => r.kode_event === event.kode && r.id === id && r.status === 'BELUM', { status: 'SUDAH DIBELI' })) ok.push(id);
  return balas(ok.length ? `✅ Sudah dibeli: ${ok.join(', ')}` : '⚠️ Nomor tidak ditemukan atau sudah ditandai.');
}
