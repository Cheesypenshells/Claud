// File 1 (PEMBUKUAN): tab "Rekap Event" & "Gaji per Event".
// File 2 (folder EVENT): satu spreadsheet per event, memakai file cadangan "(kosong)" yang dibuat owner.

import { hitungEvent, barisDataMain } from './laporan.js';
import { bacaData } from './main.js';
import { JENIS } from './schema.js';
import { PERAN } from './parsers.js';

const NAMA_BULAN = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const PENANDA_CADANGAN = '(kosong)';

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
  { label: 'Barang Kering Konsumtif', lebar: 135, format: 'rupiah' }, { label: 'Barang Kering Non-Konsumtif (Kelalaian)', lebar: 160, format: 'rupiah' },
  { label: 'Transport', lebar: 120, format: 'rupiah' }, { label: 'Penginapan / Hotel', lebar: 125, format: 'rupiah' },
  { label: 'Konsumsi', lebar: 120, format: 'rupiah' }, { label: 'Iklan', lebar: 115, format: 'rupiah' },
  { label: 'Tak Terduga', lebar: 115, format: 'rupiah' }, { label: 'Lain-lain', lebar: 110, format: 'rupiah' },
  { label: 'Gaji Karyawan Tetap', lebar: 130, format: 'rupiah' }, { label: 'Upah DW & Kasir', lebar: 130, format: 'rupiah' },
  { label: 'Bonus Karyawan', lebar: 125, format: 'rupiah' },
  { label: 'Total Pengeluaran', lebar: 140, format: 'rupiah' }, { label: 'Sisa Bahan Kembali', lebar: 130, format: 'rupiah' },
  { label: 'Laba Sebelum Fee PIC', lebar: 140, format: 'rupiah' }, { label: 'Fee PIC %', lebar: 80, format: 'persen' },
  { label: 'Fee PIC', lebar: 125, format: 'rupiah' }, { label: 'LABA BERSIH', lebar: 145, format: 'rupiah' },
  { label: 'Margin', lebar: 80, format: 'persen' }, { label: 'File Event', lebar: 100 },
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
    b['Bahan baku'], b['Bahan operasional (es, gas, lemon)'], b['Barang kering konsumtif'], b['Barang kering non-konsumtif ⚠️ kelalaian'],
    b['Transport & ekspedisi'], b.Penginapan, b.Konsumsi, b['Iklan & endorse'], b['Tak terduga'], b['Lain-lain'],
    b['Gaji karyawan tetap (porsi event)'], b['Upah DW + kasir'], b['Estimasi bonus (poin KPI 100%)'],
    r.totalBiaya, r.nilaiSisaKembali, r.labaSebelumFee, r.feePicPersen, r.feePic, r.laba,
    r.omzetBersih ? Number(((r.laba / r.omzetBersih) * 100).toFixed(1)) : 0,
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

// ---------- Transaksi per event ----------

export const KOLOM_TRANSAKSI_EVENT = [
  { label: 'Tanggal', lebar: 100 }, { label: 'No. Catatan', lebar: 95 }, { label: 'Jenis', lebar: 115 }, { label: 'Kategori', lebar: 190 },
  { label: 'Keterangan', lebar: 260 }, { label: 'Nominal', lebar: 130, format: 'rupiah' }, { label: 'Metode', lebar: 95 },
  { label: 'Dicatat Oleh', lebar: 190 }, { label: 'Status', lebar: 80 },
];

function barisTransaksiEvent(transaksi, kode) {
  return transaksi
    .filter((t) => t.kode_event === kode)
    .sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal)) || String(a.id).localeCompare(String(b.id)))
    .map((t) => [t.tanggal, t.id, t.jenis === JENIS.KELUAR ? 'Pengeluaran' : t.jenis, t.kategori, t.keterangan, Number(t.nominal) || 0, t.metode, t.pengirim, t.status]);
}

// ---------- Proses utama ----------

// Menyimpan isi terakhir tiap file supaya hanya file yang berubah yang ditulis ulang.
const terakhirDitulis = new Map();

async function pengaturan(store) {
  const rows = await store.all('Pengaturan');
  return Object.fromEntries(rows.map((r) => [r.kunci, r.nilai]));
}

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
  await store.update('Event', 'kode', e.kode, { file_event: file.id });
  e.file_event = file.id;
  terakhirDitulis.delete(file.id);
  return file.id;
}

export async function perbaruiPembukuan(store) {
  const data = await bacaData(store);
  const atur = await pengaturan(store);
  const catatan = [];
  const hasil = [];

  for (const e of data.events) {
    const r = hitungEvent(e, data);
    hasil.push(r);
    const fileId = await pastikanFileEvent(store, e, atur.folder_event, catatan);
    if (!fileId) continue;

    // Judul file ikut berubah kalau kota/IO/tanggal event diubah.
    const isi = JSON.stringify({ judul: judulFileEvent(e), main: barisDataMain(r), trx: barisTransaksiEvent(data.transaksi, e.kode) });
    if (terakhirDitulis.get(fileId) === isi) continue;
    const lama = terakhirDitulis.get(fileId);
    if (lama && JSON.parse(lama).judul !== judulFileEvent(e)) await store.gantiNamaFile(fileId, judulFileEvent(e));
    await store.tulisDataMainDi(fileId, barisDataMain(r));
    await store.tulisTabel(fileId, 'Transaksi', { kolom: KOLOM_TRANSAKSI_EVENT, baris: barisTransaksiEvent(data.transaksi, e.kode), warna: '#0B8043', index: 1 });
    terakhirDitulis.set(fileId, isi);
  }

  const rekap = hasil.map((r) => barisRekap(r, data.tim));
  const isiPembukuan = JSON.stringify({ rekap, gaji: hasil.flatMap(barisGaji) });
  if (terakhirDitulis.get('PEMBUKUAN') !== isiPembukuan) {
    await store.tulisTabel(store.spreadsheetId, 'Rekap Event', {
      kolom: KOLOM_REKAP, baris: rekap.length ? [...rekap, barisTotal(rekap)] : [], warna: '#E8710A', index: 0, barisTotal: rekap.length > 0,
    });
    await store.tulisTabel(store.spreadsheetId, 'Gaji per Event', { kolom: KOLOM_GAJI, baris: hasil.flatMap(barisGaji), warna: '#8E24AA', index: 1 });
    terakhirDitulis.set('PEMBUKUAN', isiPembukuan);
  }
  return { jumlahEvent: hasil.length, catatan };
}
