// Arsip event: 1 minggu setelah event selesai, data kerja yang besar dibersihkan supaya bot & sheet ringan.
// KPI, pembukuan (transaksi, omzet, rekap, gaji, penggantian), absensi, nilai harian PIC, denda, poin, dan ringkasan
// sesi kasir TIDAK dihapus. Urutan aman (berhenti di langkah mana pun yang gagal, data belum ada yang dihapus):
//   1. bekukan hasil akhir KPI tiap orang ke tab permanen "Arsip KPI" (rapor, gaji, rekap bulanan memakainya)
//   2. salin baris yang akan dibuang ke tab "Arsip ..." di FILE EVENT masing-masing (Drive)
//   3. cek jumlah baris salinan = jumlah baris asli
//   4. baru hapus baris itu dari sheet utama, catat di tab permanen "Arsip Event"
//   #arsip                   daftar event & statusnya
//   #arsip SMR26-11          pratinjau: apa yang dibersihkan dan apa yang tetap
//   #arsip SMR26-11 ya       jalankan (owner; hanya untuk event yang sudah lewat 7 hari dan sudah dinilai)

import { KOLOM } from './schema.js';
import { tanggalLokal, waktuLokal, tambahHari } from './util.js';
import { hitungEvent } from './laporan.js';
import { bacaData } from './main.js';
import { skorEvent, bahanKpi } from './kpi.js';
import { ikutGajian } from './gajian.js';

const balas = (text) => [{ text }];
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
export const HARI_ARSIP = 7;

// Tab yang dibersihkan (baris milik event itu). Semua tab lain tetap.
export const TAB_ARSIP = [
  { tab: 'Antrian', nama: 'Arsip Antrian', ket: 'struk & pesanan kasir' },
  { tab: 'Laporan Foto', nama: 'Arsip Laporan Foto', ket: 'laporan foto (loading in, harian, loading out)' },
  { tab: 'Tugas Harian', nama: 'Arsip Tugas Harian', ket: 'pembagian tugas harian' },
  { tab: 'Stok Harian', nama: 'Arsip Stok Harian', ket: 'stok closing harian' },
  { tab: 'Sidak Stok', nama: 'Arsip Sidak Stok', ket: 'sidak stok' },
  { tab: 'Catatan Harian', nama: 'Arsip Catatan Harian', ket: 'kejadian / barang dibeli / PR' },
  { tab: 'Alat Event', nama: 'Arsip Alat Event', ket: 'data alat loading out' },
  { tab: 'Jobdesk', nama: 'Arsip Jobdesk', ket: 'pembagian jobdesk loading in/out' },
];
const TETAP = 'Transaksi, Omzet, Absensi, Nilai Harian, Nilai KPI, Poin KPI, Denda, Pengiriman, Bahan Event, Sesi Kasir (ringkasan), Komplain, Bahan Rusak, Karyawan, Tim Event, Event';

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tgl = (t) => `${Number(String(t).slice(8, 10))} ${BULAN[Number(String(t).slice(5, 7)) - 1]}`;
async function baca(ctx, tab) { try { return await ctx.store.all(tab); } catch { return []; } }

export const sudahDiarsipkan = (arsip, kode) => arsip.some((a) => a.kode_event === kode && a.status === 'OK');
export const bolehDiarsipkan = (event, hariIni) => Boolean(event.selesai) && hariIni >= tambahHari(event.selesai, HARI_ARSIP);

async function hitungRencana(ctx, event) {
  const rencana = [];
  for (const t of TAB_ARSIP) {
    const baris = (await baca(ctx, t.tab)).filter((r) => r.kode_event === event.kode);
    rencana.push({ ...t, jumlah: baris.length });
  }
  return rencana;
}

// Teks daftar / pratinjau.
export async function perintahArsip(ctx, pesan, event, argumen, { isOwner }) {
  if (!isOwner) return balas('🔒 Arsip event hanya oleh owner.');
  const hariIni = tanggalLokal(pesan.waktu);
  const arsip = await baca(ctx, 'Arsip Event');
  const events = await baca(ctx, 'Event');
  const kata = argumen.filter(Boolean);
  const kode = kata.find((a) => /^[A-Za-z]{3}\d{2}-\d{2}/.test(a)) || null;
  const ya = kata.some((a) => /^(ya|lanjut|ok|gas)$/i.test(a));
  const paksa = kata.some((a) => /^paksa$/i.test(a));

  if (!kode) {
    const daftar = events.filter((e) => e.status !== 'BATAL' && e.selesai && e.selesai < hariIni).sort((a, b) => String(b.selesai).localeCompare(String(a.selesai)));
    if (!daftar.length) return balas('Belum ada event yang sudah selesai.');
    return balas([
      '🗄️ *Arsip event* (data kerja dibersihkan 1 minggu setelah event selesai; KPI & pembukuan tetap tersimpan)',
      ...daftar.map((e) => `• *${e.kode}* (${e.kota}) selesai ${tgl(e.selesai)}: ${sudahDiarsipkan(arsip, e.kode) ? '✅ sudah diarsipkan' : bolehDiarsipkan(e, hariIni) ? '🟢 siap diarsipkan' : `⏳ bisa diarsipkan mulai ${tgl(tambahHari(e.selesai, HARI_ARSIP))}`}`),
      '',
      'Pratinjau: *#arsip KODE* · jalankan: *#arsip KODE ya*',
    ].join('\n'));
  }
  const ev = events.find((e) => sama(e.kode, kode));
  if (!ev) return balas(`⚠️ Event ${kode} tidak ditemukan.`);
  const a = arsip.find((x) => x.kode_event === ev.kode && x.status === 'OK');
  if (a) return balas(`✅ Event ${ev.kode} sudah diarsipkan ${a.tanggal_arsip} (${a.baris_dibersihkan} baris dibersihkan).\nFile arsip: ${a.file_arsip || '-'}`);

  const rencana = await hitungRencana(ctx, ev);
  const total = rencana.reduce((s, r) => s + r.jumlah, 0);
  const layak = bolehDiarsipkan(ev, hariIni);
  const data = await bacaData(ctx.store);
  const e2 = data.events.find((e) => e.kode === ev.kode) || ev;
  const skor = skorEvent(hitungEvent(e2, data), await bahanKpi(ctx.store));
  const belumDinilai = skor.filter((s) => s.total === null).map((s) => s.nama);

  if (!ya) {
    return balas([
      `🗄️ *Pratinjau arsip ${ev.kode}* (${ev.kota}, selesai ${tgl(ev.selesai)})`,
      layak ? '🟢 Sudah lewat 7 hari: boleh diarsipkan.' : `⏳ Baru bisa diarsipkan mulai ${tgl(tambahHari(ev.selesai, HARI_ARSIP))} (7 hari setelah selesai).`,
      '',
      `*Dibersihkan dari sheet utama* (${total} baris; disalin dulu ke file event di Drive):`,
      ...rencana.map((r) => `• ${r.ket}: ${r.jumlah} baris`),
      '',
      `*Tetap di sheet:* ${TETAP}.`,
      `*Dibekukan permanen:* hasil akhir KPI ${skor.length} orang (rapor, gaji, rekap bulanan tetap bisa dibuka).`,
      belumDinilai.length ? `⚠️ Belum punya skor akhir: ${belumDinilai.join(', ')}. Selesaikan penilaian dulu (*#nilaiharian semua*), atau tambahkan *paksa*.` : '✅ Semua anggota tim sudah punya skor.',
      '',
      `Jalankan: *#arsip ${ev.kode} ya*`,
    ].join('\n'));
  }

  // ---------- jalankan ----------
  if (!layak) return balas(`⏳ ${ev.kode} baru bisa diarsipkan mulai ${tgl(tambahHari(ev.selesai, HARI_ARSIP))}.`);
  if (belumDinilai.length && !paksa) return balas(`⚠️ Arsip dihentikan: ${belumDinilai.join(', ')} belum punya skor akhir. Setelah dibekukan, nilai baru tidak ikut. Selesaikan penilaian, atau ketik *#arsip ${ev.kode} ya paksa*.`);
  const fileId = ev.file_event;
  if (!fileId) return balas(`⚠️ Arsip dihentikan: ${ev.kode} belum punya file event di Drive untuk menyimpan salinan. Data belum ada yang diubah.`);
  const waktu = waktuLokal(pesan.waktu);
  const oleh = pesan.senderName || pesan.senderId;

  // 1) bekukan KPI (ganti bekuan lama kalau pernah setengah jalan)
  await ctx.store.hapusWhere('Arsip KPI', (r) => r.kode_event === ev.kode);
  for (const s of skor) {
    await ctx.store.append('Arsip KPI', {
      kode_event: ev.kode, nama: s.nama, peran: s.peran, total: s.total ?? '', individu: s.individu ?? '', kelompok: s.kelompok ?? '',
      laporan_minus: s.laporanMinus ?? 0, dibekukan: waktu, data_json: JSON.stringify(s),
    });
  }
  // 2 & 3) salin & verifikasi
  const sudahSalin = [];
  try {
    for (const t of TAB_ARSIP) {
      const baris = (await ctx.store.all(t.tab)).filter((r) => r.kode_event === ev.kode);
      if (!baris.length) continue;
      const kolom = KOLOM[t.tab].kolom;
      const n = await ctx.store.tulisArsip(fileId, t.nama, kolom.map((c) => c.label), baris.map((r) => kolom.map((c) => r[c.key] ?? '')));
      if (n !== baris.length) throw new Error(`salinan ${t.nama} tidak sama (${n} dari ${baris.length} baris)`);
      sudahSalin.push({ ...t, jumlah: baris.length });
    }
  } catch (e) {
    return balas(`⚠️ Arsip dihentikan di tahap menyalin: ${e.message}. *Tidak ada data yang dihapus.* (KPI sudah dibekukan; ulangi *#arsip ${ev.kode} ya* setelah masalahnya beres.)`);
  }
  // 4) hapus dari sheet utama
  const hasil = [];
  for (const t of sudahSalin) {
    const n = await ctx.store.hapusWhere(t.tab, (r) => r.kode_event === ev.kode);
    hasil.push(`${t.ket}: ${n}`);
  }
  const jumlah = sudahSalin.reduce((s, t) => s + t.jumlah, 0);
  await ctx.store.append('Arsip Event', {
    kode_event: ev.kode, tanggal_arsip: waktu, baris_dibersihkan: jumlah, rincian: hasil.join(' · '),
    file_arsip: `https://docs.google.com/spreadsheets/d/${fileId}`, oleh, status: 'OK',
  });
  return balas([
    `✅ *Arsip ${ev.kode} selesai.* ${jumlah} baris dibersihkan dari sheet utama.`,
    ...hasil.map((h) => `• ${h}`),
    '',
    `📁 Salinannya ada di file event: https://docs.google.com/spreadsheets/d/${fileId} (tab "Arsip ...").`,
    `🧊 KPI ${skor.length} orang dibekukan permanen (tab Arsip KPI). Pembukuan, absensi, nilai harian, denda, dan poin tetap utuh.`,
  ].join('\n'));
}

// Harian jam 10.00: beri tahu owner event yang sudah 7 hari sejak selesai dan belum diarsipkan.
export async function tugasArsip(ctx, sekarang = new Date()) {
  const keluar = [];
  if (!ctx.sesi) return keluar;
  const jam = Number(sekarang.toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).slice(0, 2));
  if (jam < 10) return keluar;
  const hariIni = tanggalLokal(sekarang);
  const [events, arsip, pengaturan] = await Promise.all([baca(ctx, 'Event'), baca(ctx, 'Arsip Event'), baca(ctx, 'Pengaturan')]);
  const atur = Object.fromEntries(pengaturan.map((r) => [r.kunci, r.nilai]));
  // Pemberitahuan otomatis hanya untuk event dengan sistem baru (mulai tanggal penggajian lewat bot); event lama: #arsip KODE manual.
  for (const e of events.filter((x) => x.status !== 'BATAL' && ikutGajian(x, atur) && bolehDiarsipkan(x, hariIni) && !sudahDiarsipkan(arsip, x.kode))) {
    const kunci = `arsip-siap:${e.kode}`;
    if (ctx.sesi.get(kunci)) continue;
    ctx.sesi.set(kunci, { kirim: true });
    const rencana = await hitungRencana(ctx, e);
    const total = rencana.reduce((s, r) => s + r.jumlah, 0);
    if (!total) continue; // tidak ada yang perlu dibersihkan
    for (const o of ctx.ownerIds || []) {
      keluar.push({ nomor: o, text: `🗄️ *${e.kode} (${e.kota}) sudah 7 hari sejak selesai.* ${total} baris data kerja siap diarsipkan supaya bot ringan.\nKPI & pembukuan tetap tersimpan permanen.\nLihat rinciannya: *#arsip ${e.kode}* · jalankan: *#arsip ${e.kode} ya*\n_Pastikan pembukuan event ini sudah selesai dulu._` });
    }
  }
  return keluar;
}
