// File 1 (PEMBUKUAN): tab "Rekap Event" & "Gaji per Event".
// File 2 (folder EVENT): satu spreadsheet per event, memakai file cadangan "(kosong)" yang dibuat owner.

import { komplainAktif } from './komplain.js';
import { ikutGajian, gajiMulai } from './gajian.js';
import { hitungEvent, barisDataMain, KELOMPOK_GRAFIK, warnaKelompok } from './laporan.js';
import { bacaData } from './main.js';
import { JENIS, STATUS } from './schema.js';
import { eventWajibStruk } from './struk.js';
import { rekapBulanKPI, skorEvent, bahanKpi, teksOtomatis } from './kpi.js';
import { namaBulan } from './util.js';
import { PERAN, KATEGORI } from './parsers.js';

const NAMA_BULAN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const PENANDA_CADANGAN = '(kosong)';
// Naikkan kalau tata letak file event berubah: file event lama ikut dirapikan ulang sekali.
export const VERSI_TATA_LETAK = '16';

// "2026-09-24", "2026-10-11" -> "24 Sep - 11 Okt 2026"; bulan sama -> "1 - 14 Nov 2026"
export function rentangTanggal(mulai, selesai) {
  const [y1, m1, d1] = mulai.split('-').map(Number);
  const [y2, m2, d2] = selesai.split('-').map(Number);
  if (y1 !== y2) return `${d1} ${NAMA_BULAN[m1]} ${y1} - ${d2} ${NAMA_BULAN[m2]} ${y2}`;
  if (m1 !== m2) return `${d1} ${NAMA_BULAN[m1]} - ${d2} ${NAMA_BULAN[m2]} ${y2}`;
  return `${d1} - ${d2} ${NAMA_BULAN[m2]} ${y2}`;
}

export function judulFileEvent(e) {
  return `${String(e.kota).toUpperCase()} - ${String(e.io).toUpperCase()} (${rentangTanggal(e.mulai, e.selesai)})`;
}

const urlFile = (id) => `https://docs.google.com/spreadsheets/d/${id}`;
// Rumus memakai ';' karena spreadsheet berlokal Indonesia.
const tautan = (id) => (id ? `=HYPERLINK("${urlFile(id)}";"Buka file")` : '');

// ---------- Rekap Event ----------

export const KOLOM_REKAP = [
  { label: 'Kode', lebar: 100 }, { label: 'Lokasi', lebar: 110 }, { label: 'IO', lebar: 120 }, { label: 'Tanggal', lebar: 170 },
  { label: 'Hari Jualan', lebar: 80, format: 'angka' }, { label: 'PIC', lebar: 110 }, { label: 'Karyawan Tetap', lebar: 150 },
  { label: 'DW', lebar: 170 }, { label: 'Kasir', lebar: 110 },
  { label: 'Omzet Kotor', lebar: 135, format: 'rupiah' },
  { label: 'Bagi Hasil IO', lebar: 130, format: 'rupiah' }, { label: 'Admin & Listrik/Gas IO', lebar: 140, format: 'rupiah' },
  { label: 'Total Dibayar ke IO', lebar: 140, format: 'rupiah' },
  { label: 'Bahan Baku', lebar: 130, format: 'rupiah' }, { label: 'Bahan Operasional', lebar: 125, format: 'rupiah' },
  { label: 'Admin & Sewa', lebar: 120, format: 'rupiah' },
  { label: 'Barang Kering Konsumtif', lebar: 135, format: 'rupiah' }, { label: 'Barang Kering Non-Konsumtif (Kelalaian)', lebar: 160, format: 'rupiah' },
  { label: 'Transport', lebar: 120, format: 'rupiah' }, { label: 'Penginapan / Hotel', lebar: 125, format: 'rupiah' },
  { label: 'Konsumsi', lebar: 120, format: 'rupiah' }, { label: 'Iklan', lebar: 115, format: 'rupiah' },
  { label: 'Tak Terduga', lebar: 115, format: 'rupiah' }, { label: 'Lain-lain', lebar: 110, format: 'rupiah' },
  { label: 'Gaji Karyawan Tetap', lebar: 130, format: 'rupiah' }, { label: 'Upah DW & Kasir', lebar: 130, format: 'rupiah' },
  { label: 'Bonus Karyawan', lebar: 125, format: 'rupiah' },
  { label: 'Total Pengeluaran', lebar: 140, format: 'rupiah' }, { label: 'Sisa Bahan Kembali', lebar: 130, format: 'rupiah' },
  { label: 'Laba Sebelum Fee PIC', lebar: 140, format: 'rupiah' }, { label: 'Fee PIC %', lebar: 80, format: 'persen' },
  { label: 'Fee PIC', lebar: 125, format: 'rupiah' }, { label: 'LABA BERSIH', lebar: 145, format: 'rupiah' },
  { label: 'Margin', lebar: 80, format: 'persen' },
  { label: 'Sisa Penggantian Uang', lebar: 145, format: 'rupiah' }, { label: 'File Event', lebar: 100 },
];

// Urutan biaya di laporan.js -> nilai per label.
function nilaiBiaya(r) {
  return Object.fromEntries(r.biaya.map(([nama, nilai]) => [nama, nilai]));
}

function nama(tim, kode, peran) {
  return tim.filter((o) => o.kode_event === kode && o.peran === peran)
    .map((o) => o.nama + (o.status === 'BERHENTI' ? ' (berhenti)' : '')).join(', ');
}

export function barisRekap(r, tim) {
  const e = r.event;
  const b = nilaiBiaya(r);
  const adminIO = b['Admin IO + listrik/air/gas/galon'];
  return [
    e.kode, e.kota, e.io, rentangTanggal(e.mulai, e.selesai), r.hari.length,
    nama(tim, e.kode, PERAN.PIC), nama(tim, e.kode, PERAN.TETAP), nama(tim, e.kode, PERAN.DW), nama(tim, e.kode, PERAN.KASIR),
    r.omzetBersih, r.bagiHasil, adminIO, r.bagiHasil + adminIO,
    b['Bahan baku'], b['Bahan operasional (es, gas, lemon)'], b['Admin & sewa (freezer, kuota, cctv, laundry)'], b['Barang kering konsumtif'], b['Barang kering non-konsumtif ⚠️ kelalaian'],
    b['Transport & ekspedisi'], b.Penginapan, b.Konsumsi, b['Iklan & endorse'], b['Tak terduga'], b['Lain-lain'],
    b['Gaji karyawan tetap (porsi event)'], b['Upah DW + kasir'], b['Estimasi bonus (poin KPI 100%)'],
    r.totalBiaya, r.nilaiSisaKembali, r.labaSebelumFee, r.feePicPersen, r.feePic, r.laba,
    r.omzetBersih ? Number(((r.laba / r.omzetBersih) * 100).toFixed(1)) : 0,
    r.penggantian.reduce((s, u) => s + Math.max(0, u.sisa), 0),
    tautan(e.file_event),
  ];
}

function barisTotal(baris) {
  const total = KOLOM_REKAP.map((c, i) => (c.format === 'rupiah' ? baris.reduce((s, x) => s + (Number(x[i]) || 0), 0) : ''));
  total[0] = 'TOTAL';
  total[4] = baris.reduce((s, x) => s + (Number(x[4]) || 0), 0);
  const iOmzet = KOLOM_REKAP.findIndex((c) => c.label === 'Omzet Kotor');
  const iLaba = KOLOM_REKAP.findIndex((c) => c.label === 'LABA BERSIH');
  total[KOLOM_REKAP.findIndex((c) => c.label === 'Margin')] = total[iOmzet] ? Number(((total[iLaba] / total[iOmzet]) * 100).toFixed(1)) : 0;
  return total;
}

// ---------- Gaji per Event ----------

export const KOLOM_GAJI = [
  { label: 'Kode Event', lebar: 100 }, { label: 'Lokasi', lebar: 110 }, { label: 'Nama', lebar: 140 }, { label: 'Peran', lebar: 110 },
  { label: 'Hari Kerja', lebar: 85, format: 'angka' }, { label: 'Upah / Gaji per Hari', lebar: 135, format: 'rupiah' },
  { label: 'Total Upah / Gaji', lebar: 135, format: 'rupiah' }, { label: 'Estimasi Bonus', lebar: 130, format: 'rupiah' },
  { label: 'Fee PIC', lebar: 125, format: 'rupiah' }, { label: 'Total Diterima', lebar: 140, format: 'rupiah' },
  { label: 'Keterangan', lebar: 280 },
];

export function barisGaji(r) {
  const e = r.event;
  const jumlahPic = r.barisTim.filter((o) => o.peran === PERAN.PIC && !o.owner).length || 1;
  return r.barisTim.map((o) => {
    const fee = o.peran === PERAN.PIC && !o.owner ? r.feePic / jumlahPic : 0;
    const ket = {
      [PERAN.TETAP]: 'Porsi gaji pokok Rp 2,5 jt/bulan; bonus 1% (1,5% kalau sendiri) dari omzet ≥ 50 jt',
      [PERAN.DW]: 'Bonus harian: omzet > 15 jt +50rb, > 30 jt +100rb',
      [PERAN.KASIR]: 'Bonus harian: omzet ≥ 10/20/30 jt = 100/150/200rb',
      [PERAN.PIC]: `Fee ${r.feePicPersen}% dari laba bersih`,
    }[o.peran] || '';
    if (o.owner) return [e.kode, e.kota, o.nama, o.peran, o.hari, 0, 0, 0, 0, 0, 'Owner ikut bekerja: tidak digaji'];
    return [e.kode, e.kota, o.nama + (o.status === 'BERHENTI' ? ' (berhenti)' : ''), o.peran, o.hari, Math.round(o.upahHarian), Math.round(o.upah), Math.round(o.bonus), Math.round(fee), Math.round(o.upah + o.bonus + fee), ket];
  });
}

// ---------- Penggantian uang ----------

export const KOLOM_PENGGANTIAN = [
  { label: 'Kode Event', lebar: 100 }, { label: 'Lokasi', lebar: 110 }, { label: 'Nama', lebar: 140 },
  { label: 'Uang yang Terpakai', lebar: 145, format: 'rupiah' }, { label: 'Sudah Diganti', lebar: 135, format: 'rupiah' },
  { label: 'Sisa Harus Ditransfer', lebar: 155, format: 'rupiah' }, { label: 'Jumlah Catatan', lebar: 110, format: 'angka' },
];

export const barisPenggantian = (r) => r.penggantian.map((u) => [r.event.kode, r.event.kota, u.nama, u.dibayar, u.diganti, u.sisa, u.catatan]);

// ---------- Pengeluaran per kategori (file event) ----------

// Satu tab per kategori, seperti pembukuan lama (admin, hotel, transportation, food and bev, ...).
// Warna tab mengikuti warna kelompok di tabel komposisi & grafik file event.
const W = (nama) => warnaKelompok(KELOMPOK_GRAFIK.find((k) => k.nama === nama));
export const TAB_KATEGORI = [
  { tab: 'Transport', judul: 'TRANSPORT & EKSPEDISI', kategori: [KATEGORI.TRANSPORT], warna: '#1A73E8' },
  { tab: 'Penginapan', judul: 'PENGINAPAN / HOTEL', kategori: [KATEGORI.PENGINAPAN], warna: W('Penginapan') },
  { tab: 'Konsumsi', judul: 'KONSUMSI (MAKAN & MINUM)', kategori: [KATEGORI.KONSUMSI], warna: '#0B8043' },
  { tab: 'Bahan Baku', judul: 'BAHAN BAKU (gudang + beli di lokasi)', kategori: [KATEGORI.OYSTER, KATEGORI.BAHAN_LAIN], gudang: true, warna: '#C2185B' },
  { tab: 'Bahan Operasional', judul: 'BAHAN OPERASIONAL (es, gas, lemon)', kategori: [KATEGORI.OPERASIONAL], warna: W('Bahan baku') },
  { tab: 'BK Konsumtif', judul: 'BARANG KERING KONSUMTIF', kategori: [KATEGORI.KONSUMTIF], warna: W('Barang kering') },
  { tab: 'BK Non-Konsumtif', judul: 'BARANG KERING NON-KONSUMTIF ⚠️ KELALAIAN', kategori: [KATEGORI.NON_KONSUMTIF, 'Peralatan'], warna: W('Barang kering') },
  { tab: 'Admin & Sewa', judul: 'ADMIN & SEWA', kategori: [KATEGORI.ADMIN], warna: W('Sewa & admin') },
  { tab: 'Iklan', judul: 'IKLAN & ENDORSE', kategori: [KATEGORI.IKLAN], warna: '#F9AB00' },
  { tab: 'Tak Terduga', judul: 'TAK TERDUGA', kategori: [KATEGORI.TAK_TERDUGA], warna: W('Tak terduga dll') },
  { tab: 'Gaji & Upah', judul: 'GAJI & UPAH (yang dibayar lewat grup)', kategori: [KATEGORI.GAJI], warna: W('Gaji & bonus') },
  { tab: 'Lain-lain', judul: 'LAIN-LAIN', kategori: null, warna: W('Tak terduga dll') },
];

const KOLOM_KATEGORI = [
  { label: 'Tanggal', lebar: 100 }, { label: 'No. Catatan', lebar: 95 }, { label: 'Keterangan', lebar: 280 },
  { label: 'Nominal', lebar: 130, format: 'rupiah' }, { label: 'Uang Siapa', lebar: 120 }, { label: 'Metode', lebar: 90 },
  { label: 'Dicatat Oleh', lebar: 190 },
];
const KOLOM_BUKTI = { label: 'Bukti', lebar: 170 };

const KOLOM_IO = [
  { label: 'Tanggal', lebar: 100 }, { label: 'No. Catatan', lebar: 95 }, { label: 'Jenis', lebar: 120 }, { label: 'Keterangan', lebar: 260 },
  { label: 'Nominal', lebar: 130, format: 'rupiah' }, { label: 'Dicatat Oleh', lebar: 190 },
];

export const KOLOM_TRANSAKSI_EVENT = [
  { label: 'Tanggal', lebar: 100 }, { label: 'No. Catatan', lebar: 95 }, { label: 'Jenis', lebar: 115 }, { label: 'Kategori', lebar: 190 },
  { label: 'Keterangan', lebar: 260 }, { label: 'Nominal', lebar: 130, format: 'rupiah' }, { label: 'Metode', lebar: 95 },
  { label: 'Uang Siapa', lebar: 120 }, { label: 'Dicatat Oleh', lebar: 190 }, { label: 'Status', lebar: 100 },
];

const urutTanggal = (a, b) => String(a.tanggal).localeCompare(String(b.tanggal)) || String(a.id).localeCompare(String(b.id));

export function tabelKategoriEvent(r, transaksi) {
  const kode = r.event.kode;
  const milik = transaksi.filter((t) => t.kode_event === kode).sort(urutTanggal);
  const aktif = milik.filter((t) => t.status !== 'BATAL');
  const keluar = aktif.filter((t) => t.jenis === JENIS.KELUAR);
  const dikenal = new Set(TAB_KATEGORI.flatMap((k) => k.kategori || []));
  // Kolom Bukti hanya untuk event yang memakai aturan struk (event yang sudah berjalan tidak diubah).
  const pakaiBukti = eventWajibStruk(r.event);
  const denganBukti = (kolom) => (pakaiBukti ? [...kolom, KOLOM_BUKTI] : kolom);
  const baris = (t) => [t.tanggal, t.id, t.keterangan, Number(t.nominal) || 0, t.dibayar_oleh || '', t.metode || '', t.pengirim, ...(pakaiBukti ? [t.bukti || ''] : [])];

  const tabel = TAB_KATEGORI.map((k) => {
    const isi = keluar.filter((t) => (k.kategori ? k.kategori.includes(t.kategori) : !dikenal.has(t.kategori))).map(baris);
    if (k.gudang) {
      for (const b of r.barisBahan.filter((x) => x.keluar || x.restock)) {
        isi.push(['', 'Gudang', `${b.bahan} dari gudang: awal ${b.keluar} + restock ${b.restock} = ${b.keluar + b.restock} ${b.satuan} × ${b.harga.toLocaleString('id-ID')}`, b.nilaiBawa, 'Gudang', '', 'Bot (dari laporan bahan)', ...(pakaiBukti ? ['Laporan gudang'] : [])]);
      }
      // Sisa mengurangi biaya: total tab = bahan terpakai.
      for (const b of r.barisBahan.filter((x) => x.kembali)) {
        isi.push(['', 'Gudang', `${b.bahan} SISA ${b.kembali} ${b.satuan} × ${b.harga.toLocaleString('id-ID')} (dikembalikan, mengurangi biaya)`, -b.nilaiKembali, 'Gudang', '', 'Bot (dari laporan bahan)', ...(pakaiBukti ? ['Laporan gudang'] : [])]);
      }
    }
    return { tab: k.tab, judul: k.judul, warna: k.warna, kolom: denganBukti(KOLOM_KATEGORI), baris: isi, total: isi.reduce((s, x) => s + (Number(x[3]) || 0), 0) };
  });

  const io = aktif.filter((t) => t.jenis === JENIS.MASUK_IO || t.jenis === JENIS.POTONGAN_IO || t.jenis === JENIS.PENGGANTIAN)
    .map((t) => [t.tanggal, t.id, t.jenis, t.keterangan, Number(t.nominal) || 0, t.pengirim]);
  tabel.push({
    tab: 'Transfer & Penggantian', judul: 'TRANSFER DARI IO, POTONGAN IO & PENGGANTIAN UANG (total = transfer masuk dari IO)', warna: '#0B8043', kolom: KOLOM_IO, baris: io,
    total: aktif.filter((t) => t.jenis === JENIS.MASUK_IO).reduce((s, t) => s + (Number(t.nominal) || 0), 0),
  });
  // Catatan yang dibatalkan dipindah ke bawah, dicoret abu-abu, dan tidak ikut dihitung.
  const batal = (t) => t.status === STATUS.BATAL;
  const urut = [...milik.filter((t) => !batal(t)), ...milik.filter(batal)];
  tabel.push({
    tab: 'Semua Transaksi', judul: 'SEMUA CATATAN (yang dibatalkan dicoret di bawah & tidak dihitung)', warna: '#5F6368', kolom: denganBukti(KOLOM_TRANSAKSI_EVENT),
    baris: urut.map((t) => [t.tanggal, t.id, t.jenis, t.kategori, t.keterangan, Number(t.nominal) || 0, t.metode, t.dibayar_oleh || '', t.pengirim, batal(t) ? '❌ BATAL' : '✅ OK', ...(pakaiBukti ? [t.bukti || ''] : [])]),
    barisCoret: urut.map((t, i) => (batal(t) ? i : -1)).filter((i) => i >= 0),
    total: keluar.reduce((s, t) => s + (Number(t.nominal) || 0), 0),
  });
  return tabel;
}

// ---------- File 4: KPI KARYAWAN ----------

const KOLOM_KPI_BULAN = [
  { label: 'Bulan', lebar: 110 }, { label: 'Peringkat', lebar: 85, format: 'angka' }, { label: 'Nama', lebar: 140 }, { label: 'Peran', lebar: 90 },
  { label: 'Jumlah Event', lebar: 90, format: 'angka' }, { label: 'Hari Kerja', lebar: 85, format: 'angka' },
  { label: 'Individu (maks 60)', lebar: 120, format: 'poin' }, { label: 'Kelompok (maks 40)', lebar: 125, format: 'poin' },
  { label: 'Poin Plus', lebar: 85, format: 'poin' }, { label: 'Poin Minus', lebar: 90, format: 'poin' },
  { label: 'SKOR AKHIR (maks 100)', lebar: 140, format: 'poin' },
  { label: 'Bonus Maksimal', lebar: 130, format: 'rupiah' }, { label: 'Estimasi Bonus Diterima', lebar: 160, format: 'rupiah' },
  { label: 'Catatan', lebar: 260 },
];
const KOLOM_KPI_EVENT = [
  { label: 'Kode Event', lebar: 100 }, { label: 'Lokasi', lebar: 100 }, { label: 'Tanggal', lebar: 170 }, { label: 'Nama', lebar: 140 },
  { label: 'Peran', lebar: 85 }, { label: 'Hari', lebar: 60, format: 'angka' },
  { label: 'Absen (12)', lebar: 85, format: 'poin' }, { label: 'Kinerja (24)', lebar: 90, format: 'poin' },
  { label: 'Attitude (12)', lebar: 95, format: 'poin' }, { label: 'Karir (12)', lebar: 85, format: 'poin' },
  { label: 'INDIVIDU (60)', lebar: 105, format: 'poin' },
  { label: 'Omzet vs Target (15)', lebar: 130, format: 'poin' }, { label: 'Stok (10)', lebar: 80, format: 'poin' },
  { label: 'Kebersihan & Komplain (10)', lebar: 160, format: 'poin' }, { label: 'Kinerja Tim (5)', lebar: 110, format: 'poin' },
  { label: 'KELOMPOK (40)', lebar: 110, format: 'poin' }, { label: 'Laporan Terlewat (−)', lebar: 130, format: 'poin' },
  { label: 'TOTAL (100)', lebar: 100, format: 'poin' },
  { label: 'Status', lebar: 170 }, { label: 'Nilai Otomatis', lebar: 360 },
];
const KOLOM_KPI_POIN = [
  { label: 'Tanggal', lebar: 100 }, { label: 'No.', lebar: 70 }, { label: 'Nama', lebar: 140 }, { label: 'Poin', lebar: 70, format: 'angka' },
  { label: 'Alasan', lebar: 300 }, { label: 'Kode Event', lebar: 100 }, { label: 'Dicatat Oleh', lebar: 190 },
];
const KOLOM_KPI_CARA = [{ label: 'Bagian', lebar: 220 }, { label: 'Penjelasan', lebar: 760 }];
const CARA_HITUNG_KPI = [
  ['Skor maksimal', '100 poin per bulan: 60 individu + 40 kelompok, lalu + poin plus − poin minus (dibatasi 0–100).'],
  ['Individu (60)', 'Dinilai PIC setelah event (skala 1–5): Absen 20% (12) · Performa kinerja 40% (24) · Attitude 20% (12) · Karir 20% (12). Bot menanyakan ke PIC lewat chat pribadi sehari setelah event selesai, atau ketik #nilai di grup pengeluaran.'],
  ['Otomatis', 'Absen: 12 − 2 per telat − 6 per tidak hadir tanpa izin (karyawan tetap); izin/dispensasi dari owner tidak dipotong. Kasir: kinerja = rata-rata bintang pelanggan ÷ 5 × 24 (minimal 5 penilaian). Laporan foto wajib yang terlewat −2 per laporan (jobdesk loading in milik penanggung jawab, absen pulang tiap hari). Nilai PIC untuk bagian ini dipakai kalau datanya belum ada.'],
  ['Kelompok (40)', 'Sama untuk satu tim event: Omzet vs target (15) · Ketepatan stok (10, −2 per bahan yang selisih saat sidak) · Kebersihan & komplain pelanggan (10, −2 per komplain) · Kinerja tim dari PIC (5) · −2 per hari yang rata-rata tunggu pelanggannya di atas 7 menit.'],
  ['Laporan per bagian', 'Pembagian tugas harian jam 08.00: Kasir #depan & #followers · Pemanggang #grill · Getok #cooler · Plating #nampan. Laporan bagian yang tidak dikirim −2 untuk yang bertugas hari itu.'],
  ['Skor bulan', 'Rata-rata skor semua event di bulan itu (ditimbang hari kerja), ditambah poin plus dan dikurangi poin minus.'],
  ['Poin plus / minus', 'Dicatat owner: #poin Dena +20 bantu masak bumbu · #poin Dena -10 SOP tidak dikerjakan · batalkan: #poinbatal K0001.'],
  ['Bonus', 'Poin = persen klaim bonus. Skor 100 → 100% bonus maksimal; skor 80 → 80%. Bonus maksimal dari hitungan event (karyawan tetap: % omzet; DW & kasir: bonus harian).'],
  ['Peringkat', 'Diurutkan dari skor akhir tertinggi per bulan. Karyawan yang eventnya belum dinilai PIC belum punya skor.'],
];

export function tabelKpi(hasil, { poin, ...bahan }) {
  const rekap = rekapBulanKPI(hasil, { ...bahan, poin });
  const evIndex = new Map(hasil.map((r) => [r.event.kode, r.event]));
  const bulan = rekap.map((h) => [namaBulan(h.bulan), h.peringkat || '', h.nama, h.peran, h.jumlahEvent, h.hari,
    h.individu ?? '', h.kelompok ?? '', h.plus, h.minus, h.skor ?? '', h.bonusMaks, h.bonusDiterima ?? '',
    h.belumDinilai ? `${h.belumDinilai} event belum dinilai PIC` : '']);
  const perEvent = hasil.flatMap((r) => skorEvent(r, bahan).map((s) => {
    const e = evIndex.get(s.kode);
    return [s.kode, e.kota, `${e.mulai} s/d ${e.selesai}`, s.nama, s.peran, s.hari, s.absen ?? '', s.kinerja ?? '', s.attitude ?? '', s.karir ?? '',
      s.individu ?? '', s.omzet, s.stok, s.komplain, s.tim ?? '', s.kelompok, s.laporanMinus ? -s.laporanMinus : '', s.total ?? '',
      s.lengkap ? '✅ Lengkap' : (s.total === null ? '⏳ Belum dinilai PIC' : '⏳ Kinerja tim belum dinilai'), teksOtomatis(s)];
  }));
  const riwayat = poin.filter((p) => p.status !== 'BATAL').map((p) => [p.tanggal, p.id, p.nama, Number(p.poin) || 0, p.alasan, p.kode_event, p.dicatat_oleh]);
  return [
    { tab: 'Peringkat & Bonus', judul: 'PERINGKAT KPI & ESTIMASI BONUS PER BULAN', warna: '#3949AB', kolom: KOLOM_KPI_BULAN, baris: bulan,
      total: bulan.reduce((s, b) => s + (Number(b[12]) || 0), 0) },
    { tab: 'Nilai per Event', judul: 'NILAI KPI PER EVENT (individu dari PIC + kelompok dari data event)', warna: '#00897B', kolom: KOLOM_KPI_EVENT, baris: perEvent,
      total: `${perEvent.filter((b) => String(b[17]).startsWith('✅')).length}/${perEvent.length} dinilai` },
    { tab: 'Riwayat Poin', judul: 'RIWAYAT POIN PLUS / MINUS', warna: '#E8710A', kolom: KOLOM_KPI_POIN, baris: riwayat,
      total: `${riwayat.reduce((s, b) => s + b[3], 0) >= 0 ? '+' : ''}${riwayat.reduce((s, b) => s + b[3], 0)} poin` },
    { tab: 'Cara Hitung', judul: 'CARA HITUNG KPI & BONUS', warna: '#5F6368', kolom: KOLOM_KPI_CARA, baris: CARA_HITUNG_KPI, total: '' },
  ];
}

// ---------- Proses utama ----------

// Menyimpan isi terakhir tiap file supaya hanya file yang berubah yang ditulis ulang.
const terakhirDitulis = new Map();

// Memberi file event yang belum punya: memakai file cadangan "(kosong)" di folder EVENT.
async function pastikanFileEvent(store, e, folderEvent, catatan) {
  if (e.file_event || !folderEvent) return e.file_event;
  const cadangan = await store.cariFileDiFolder(folderEvent, PENANDA_CADANGAN);
  if (!cadangan.length) {
    catatan.push(`⚠️ File cadangan di folder EVENT habis; event ${e.kode} belum punya file. Buat spreadsheet kosong bernama "(kosong)" di folder EVENT.`);
    return '';
  }
  const file = cadangan[0];
  await store.gantiNamaFile(file.id, judulFileEvent(e));
  await store.siapkanFileEvent(file.id, e.kode, `${judulFileEvent(e)} – BEDAH UNTUNG / RUGI`);
  if (e.sumber === 'manual') {
    await store.append('Pengaturan', { kunci: `file_event_${e.kode}`, nilai: file.id, keterangan: `File event ${e.kode} (dari INPUT EVENT LAMA)` });
  } else {
    await store.update('Event', 'kode', e.kode, { file_event: file.id });
  }
  e.file_event = file.id;
  terakhirDitulis.delete(file.id);
  return file.id;
}

export async function perbaruiPembukuan(store) {
  const data = await bacaData(store);
  const { atur } = data;
  const catatan = [];
  const hasil = [];

  const tataLetakBaru = atur.versi_tata_letak_event !== VERSI_TATA_LETAK;

  for (const e of data.events) {
    const r = hitungEvent(e, data);
    hasil.push(r);
    const adaSebelumnya = Boolean(e.file_event);
    const fileId = await pastikanFileEvent(store, e, atur.folder_event, catatan);
    if (!fileId) continue;
    if (tataLetakBaru && adaSebelumnya) {
      await store.siapkanFileEvent(fileId, e.kode, `${judulFileEvent(e)} – BEDAH UNTUNG / RUGI`);
      terakhirDitulis.delete(fileId);
    }

    // Judul file ikut berubah kalau kota/IO/tanggal event diubah.
    const tabel = tabelKategoriEvent(r, data.transaksi);
    const isi = JSON.stringify({ judul: judulFileEvent(e), main: barisDataMain(r), tabel });
    if (terakhirDitulis.get(fileId) === isi) continue;
    const lama = terakhirDitulis.get(fileId);
    if (lama && JSON.parse(lama).judul !== judulFileEvent(e)) await store.gantiNamaFile(fileId, judulFileEvent(e));
    await store.tulisDataMainDi(fileId, barisDataMain(r));
    await store.tulisBanyakTabel(fileId, tabel, { hapus: ['Transaksi'], mulaiIndex: 1 });
    terakhirDitulis.set(fileId, isi);
  }

  if (tataLetakBaru) {
    const ada = (await store.all('Pengaturan')).some((r) => r.kunci === 'versi_tata_letak_event');
    if (ada) await store.update('Pengaturan', 'kunci', 'versi_tata_letak_event', { nilai: VERSI_TATA_LETAK });
    else await store.append('Pengaturan', { kunci: 'versi_tata_letak_event', nilai: VERSI_TATA_LETAK, keterangan: 'Versi tata letak file event (diisi bot)' });
  }

  const rekap = hasil.map((r) => barisRekap(r, data.tim));
  const isiPembukuan = JSON.stringify({ rekap, gaji: hasil.flatMap(barisGaji), uang: hasil.flatMap(barisPenggantian) });
  if (terakhirDitulis.get('PEMBUKUAN') !== isiPembukuan) {
    await store.tulisTabel(store.spreadsheetId, 'Rekap Event', {
      kolom: KOLOM_REKAP, baris: rekap.length ? [...rekap, barisTotal(rekap)] : [], warna: '#E8710A', index: 0, barisTotal: rekap.length > 0,
    });
    await store.tulisTabel(store.spreadsheetId, 'Gaji per Event', { kolom: KOLOM_GAJI, baris: hasil.flatMap(barisGaji), warna: '#8E24AA', index: 1 });
    await store.tulisTabel(store.spreadsheetId, 'Penggantian Uang', { kolom: KOLOM_PENGGANTIAN, baris: hasil.flatMap(barisPenggantian), warna: '#5F6368', index: 2 });
    terakhirDitulis.set('PEMBUKUAN', isiPembukuan);
  }
  // File KPI KARYAWAN (tab Peringkat & Bonus, Nilai per Event, Riwayat Poin, Cara Hitung).
  if (atur.file_kpi) {
    // Event sebelum batas penggajian (sudah dibayar owner) tidak ikut KPI & bonus.
    const tabel = tabelKpi(hasil.filter((r) => ikutGajian(r.event, atur)), { ...(await bahanKpi(store)), poin: (await store.all('Poin KPI')).filter((p) => String(p.tanggal || '') >= gajiMulai(atur)) });
    const isiKpi = JSON.stringify(tabel);
    if (terakhirDitulis.get('KPI') !== isiKpi) {
      await store.tulisBanyakTabel(atur.file_kpi, tabel, { hapus: ['Sheet1'], mulaiIndex: 0 });
      terakhirDitulis.set('KPI', isiKpi);
    }
  }
  return { jumlahEvent: hasil.length, catatan };
}
