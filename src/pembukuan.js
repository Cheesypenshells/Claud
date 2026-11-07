// File 1 (PEMBUKUAN): tab "Rekap Event" & "Gaji per Event".
// File 2 (folder EVENT): satu spreadsheet per event, memakai file cadangan "(kosong)" yang dibuat owner.

import { hitungEvent, barisDataMain } from './laporan.js';
import { bacaData } from './main.js';
import { JENIS } from './schema.js';
import { PERAN, KATEGORI } from './parsers.js';

const NAMA_BULAN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const PENANDA_CADANGAN = '(kosong)';
// Naikkan kalau tata letak file event berubah: file event lama ikut dirapikan ulang sekali.
export const VERSI_TATA_LETAK = '3';

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
export const TAB_KATEGORI = [
  { tab: 'Transport', judul: 'TRANSPORT & EKSPEDISI', kategori: [KATEGORI.TRANSPORT], warna: '#1A73E8' },
  { tab: 'Penginapan', judul: 'PENGINAPAN / HOTEL', kategori: [KATEGORI.PENGINAPAN], warna: '#8E24AA' },
  { tab: 'Konsumsi', judul: 'KONSUMSI (MAKAN & MINUM)', kategori: [KATEGORI.KONSUMSI], warna: '#0B8043' },
  { tab: 'Bahan Baku', judul: 'BAHAN BAKU (gudang + beli di lokasi)', kategori: [KATEGORI.OYSTER, KATEGORI.BAHAN_LAIN], gudang: true, warna: '#C2185B' },
  { tab: 'Bahan Operasional', judul: 'BAHAN OPERASIONAL (es, gas, lemon)', kategori: [KATEGORI.OPERASIONAL], warna: '#E37400' },
  { tab: 'BK Konsumtif', judul: 'BARANG KERING KONSUMTIF', kategori: [KATEGORI.KONSUMTIF], warna: '#00897B' },
  { tab: 'BK Non-Konsumtif', judul: 'BARANG KERING NON-KONSUMTIF ⚠️ KELALAIAN', kategori: [KATEGORI.NON_KONSUMTIF, 'Peralatan'], warna: '#D93025' },
  { tab: 'Admin & Sewa', judul: 'ADMIN & SEWA', kategori: [KATEGORI.ADMIN], warna: '#5F6368' },
  { tab: 'Iklan', judul: 'IKLAN & ENDORSE', kategori: [KATEGORI.IKLAN], warna: '#F9AB00' },
  { tab: 'Tak Terduga', judul: 'TAK TERDUGA', kategori: [KATEGORI.TAK_TERDUGA], warna: '#B31412' },
  { tab: 'Gaji & Upah', judul: 'GAJI & UPAH (yang dibayar lewat grup)', kategori: [KATEGORI.GAJI], warna: '#6D4C41' },
  { tab: 'Lain-lain', judul: 'LAIN-LAIN', kategori: null, warna: '#9AA0A6' },
];

const KOLOM_KATEGORI = [
  { label: 'Tanggal', lebar: 100 }, { label: 'No. Catatan', lebar: 95 }, { label: 'Keterangan', lebar: 280 },
  { label: 'Nominal', lebar: 130, format: 'rupiah' }, { label: 'Uang Siapa', lebar: 120 }, { label: 'Metode', lebar: 90 },
  { label: 'Dicatat Oleh', lebar: 190 },
];

const KOLOM_IO = [
  { label: 'Tanggal', lebar: 100 }, { label: 'No. Catatan', lebar: 95 }, { label: 'Jenis', lebar: 120 }, { label: 'Keterangan', lebar: 260 },
  { label: 'Nominal', lebar: 130, format: 'rupiah' }, { label: 'Dicatat Oleh', lebar: 190 },
];

export const KOLOM_TRANSAKSI_EVENT = [
  { label: 'Tanggal', lebar: 100 }, { label: 'No. Catatan', lebar: 95 }, { label: 'Jenis', lebar: 115 }, { label: 'Kategori', lebar: 190 },
  { label: 'Keterangan', lebar: 260 }, { label: 'Nominal', lebar: 130, format: 'rupiah' }, { label: 'Metode', lebar: 95 },
  { label: 'Uang Siapa', lebar: 120 }, { label: 'Dicatat Oleh', lebar: 190 }, { label: 'Status', lebar: 80 },
];

const urutTanggal = (a, b) => String(a.tanggal).localeCompare(String(b.tanggal)) || String(a.id).localeCompare(String(b.id));

export function tabelKategoriEvent(r, transaksi) {
  const kode = r.event.kode;
  const milik = transaksi.filter((t) => t.kode_event === kode).sort(urutTanggal);
  const aktif = milik.filter((t) => t.status !== 'BATAL');
  const keluar = aktif.filter((t) => t.jenis === JENIS.KELUAR);
  const dikenal = new Set(TAB_KATEGORI.flatMap((k) => k.kategori || []));
  const baris = (t) => [t.tanggal, t.id, t.keterangan, Number(t.nominal) || 0, t.dibayar_oleh || '', t.metode || '', t.pengirim];

  const tabel = TAB_KATEGORI.map((k) => {
    const isi = keluar.filter((t) => (k.kategori ? k.kategori.includes(t.kategori) : !dikenal.has(t.kategori))).map(baris);
    if (k.gudang) {
      for (const b of r.barisBahan.filter((x) => x.keluar || x.restock)) {
        isi.push(['', 'Gudang', `${b.bahan} dari gudang: keluar ${b.keluar} + restock ${b.restock} ${b.satuan} × ${b.harga.toLocaleString('id-ID')}`, b.nilaiBawa, 'Gudang', '', 'Bot (dari laporan bahan)']);
      }
    }
    return { tab: k.tab, judul: k.judul, warna: k.warna, kolom: KOLOM_KATEGORI, baris: isi, total: isi.reduce((s, x) => s + (Number(x[3]) || 0), 0) };
  });

  const io = aktif.filter((t) => t.jenis === JENIS.MASUK_IO || t.jenis === JENIS.POTONGAN_IO || t.jenis === JENIS.PENGGANTIAN)
    .map((t) => [t.tanggal, t.id, t.jenis, t.keterangan, Number(t.nominal) || 0, t.pengirim]);
  tabel.push({
    tab: 'Transfer & Penggantian', judul: 'TRANSFER DARI IO, POTONGAN IO & PENGGANTIAN UANG (total = transfer masuk dari IO)', warna: '#0B8043', kolom: KOLOM_IO, baris: io,
    total: aktif.filter((t) => t.jenis === JENIS.MASUK_IO).reduce((s, t) => s + (Number(t.nominal) || 0), 0),
  });
  tabel.push({
    tab: 'Semua Transaksi', judul: 'SEMUA CATATAN (termasuk yang dibatalkan; total = pengeluaran aktif)', warna: '#5F6368', kolom: KOLOM_TRANSAKSI_EVENT,
    baris: milik.map((t) => [t.tanggal, t.id, t.jenis, t.kategori, t.keterangan, Number(t.nominal) || 0, t.metode, t.dibayar_oleh || '', t.pengirim, t.status]),
    total: keluar.reduce((s, t) => s + (Number(t.nominal) || 0), 0),
  });
  return tabel;
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
  return { jumlahEvent: hasil.length, catatan };
}
