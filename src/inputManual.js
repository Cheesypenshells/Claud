// File "INPUT EVENT LAMA": owner mengisi data event sebelumnya secara manual.
// Bot membaca file ini dan menghitungnya dengan mesin yang sama seperti laporan dari grup WhatsApp,
// supaya hasil sistem bisa dicocokkan dengan pembukuan lama.

import { DAFTAR_KATEGORI, tebakKategori, PERAN, UPAH_DEFAULT, normalisasiWilayah } from './parsers.js';
import { JENIS, BUKU, STATUS } from './schema.js';
import { parseMoney } from './util.js';
import { buatKodeEvent } from './wizard.js';

export const NAMA_FILE_INPUT = '0. INPUT EVENT LAMA (manual)';

const PERAN_PILIHAN = [PERAN.PIC, PERAN.TETAP, PERAN.DW, PERAN.KASIR];
const KEHADIRAN_OWNER = ['tidak', '1 hari', 'setengah', 'penuh'];

// Kolom tiap tab. `pilihan` = dropdown; `catatan` = keterangan di judul kolom.
export const TAB_INPUT = [
  {
    nama: '1. Event', warna: '#E8710A',
    kolom: [
      { label: 'Kode Event', lebar: 110, catatan: 'Boleh dikosongkan, dibuat otomatis dari lokasi + bulan (contoh LMB26-09)' },
      { label: 'Lokasi', lebar: 120 }, { label: 'IO', lebar: 130 },
      { label: 'Tanggal Mulai', lebar: 115, catatan: 'Format tanggal, contoh 24/09/2026' },
      { label: 'Tanggal Selesai', lebar: 120 },
      { label: 'Wilayah Harga', lebar: 120, pilihan: ['Jawa', 'Sumatra', 'Kalimantan'] },
      { label: 'Bagi Hasil IO %', lebar: 120, catatan: 'Contoh 30' },
      { label: 'Biaya Admin IO', lebar: 130 },
      { label: 'Kehadiran Owner', lebar: 130, pilihan: KEHADIRAN_OWNER, catatan: 'Menentukan fee PIC: tidak 25%, 1 hari 20%, setengah 15%, penuh 10%' },
      { label: 'Catatan', lebar: 250 },
    ],
  },
  {
    nama: '2. Omzet Harian', warna: '#1A73E8',
    kolom: [
      { label: 'Kode Event', lebar: 110 }, { label: 'Tanggal', lebar: 110 },
      { label: 'Omzet', lebar: 140, catatan: 'Omzet kotor hari itu' }, { label: 'Jumlah Transaksi', lebar: 125 },
      { label: 'Refund / Koreksi', lebar: 130 },
    ],
  },
  {
    nama: '3. Pengeluaran', warna: '#D93025',
    kolom: [
      { label: 'Kode Event', lebar: 110 }, { label: 'Tanggal', lebar: 110 },
      { label: 'Keterangan', lebar: 260, catatan: 'Contoh: lalamove ke venue, hotel 3 malam, sapu' },
      { label: 'Kategori', lebar: 220, pilihan: DAFTAR_KATEGORI, catatan: 'Boleh dikosongkan: bot menebak dari keterangan' },
      { label: 'Nominal', lebar: 130 },
      { label: 'Dibayar Pakai', lebar: 120, pilihan: ['Kas usaha', 'Uang George'] },
    ],
  },
  {
    nama: '4. Transfer & Potongan IO', warna: '#0B8043',
    kolom: [
      { label: 'Kode Event', lebar: 110 }, { label: 'Tanggal', lebar: 110 },
      { label: 'Jenis', lebar: 140, pilihan: [JENIS.MASUK_IO, JENIS.POTONGAN_IO], catatan: 'Transfer IO = uang masuk dari IO. Potongan IO = listrik/air/gas/galon yang dipotong IO' },
      { label: 'Nominal', lebar: 130 }, { label: 'Keterangan', lebar: 240 },
    ],
  },
  {
    nama: '5. Tim', warna: '#8E24AA',
    kolom: [
      { label: 'Kode Event', lebar: 110 }, { label: 'Nama', lebar: 140 },
      { label: 'Peran', lebar: 110, pilihan: PERAN_PILIHAN },
      { label: 'Upah per Hari', lebar: 130, catatan: 'DW & kasir standar 100.000. Karyawan tetap & PIC kosongkan' },
      { label: 'Mulai Kerja', lebar: 115, catatan: 'Kosong = dari awal event' },
      { label: 'Selesai Kerja', lebar: 115, catatan: 'Kosong = sampai akhir event' },
    ],
  },
  {
    nama: '6. Bahan Baku', warna: '#C2185B',
    kolom: [
      { label: 'Kode Event', lebar: 110 }, { label: 'Bahan', lebar: 150, catatan: 'Sesuai tab Harga Bahan di PEMBUKUAN' },
      { label: 'Keluar dari Gudang', lebar: 140 }, { label: 'Restock', lebar: 100 }, { label: 'Kembali ke Gudang', lebar: 140 },
    ],
  },
  {
    nama: '7. Porsi Gratis', warna: '#F9AB00',
    kolom: [
      { label: 'Kode Event', lebar: 110 }, { label: 'Tanggal', lebar: 110 }, { label: 'Menu', lebar: 160 },
      { label: 'Porsi', lebar: 80 }, { label: 'Isi per Porsi (pcs)', lebar: 130 }, { label: 'Diberikan Untuk', lebar: 220 },
    ],
  },
];

export const CARA_ISI = [
  ['INPUT EVENT LAMA – CARA MENGISI'],
  [''],
  ['File ini untuk memasukkan data event sebelumnya. Bot menghitungnya dengan cara yang sama seperti laporan dari grup WhatsApp,'],
  ['lalu hasilnya muncul di PEMBUKUAN (Rekap Event, Gaji per Event) dan di file event masing-masing (folder EVENT).'],
  [''],
  ['1. Isi tab "1. Event": satu baris per event. Kode boleh kosong.'],
  ['2. Isi tab 2–7 dengan Kode Event yang sama. Kalau kode di tab 1 kosong, lihat kode yang dibuat bot di PEMBUKUAN > Rekap Event.'],
  ['3. Tanggal ditulis sebagai tanggal (contoh 24/09/2026). Nominal cukup angka (contoh 150000).'],
  ['4. Kategori pengeluaran boleh kosong: bot menebak dari keterangan (sapu = non-konsumtif/kelalaian, sumpit = konsumtif, hotel = penginapan, dst.).'],
  ['5. Hasil diperbarui otomatis setiap 5 menit selama bot menyala.'],
  [''],
  ['Pembayaran pakai "Uang George" dicatat supaya mudah dihitung penggantiannya.'],
];

// ---------- Membaca nilai sel ----------

// Tanggal bisa berupa nomor seri Sheets (hari sejak 30 Des 1899), "2026-09-24", atau "24/09/2026".
export function keTanggal(v) {
  if (v === '' || v == null) return '';
  if (typeof v === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const t = String(v).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

export function keAngka(v) {
  if (typeof v === 'number') return v;
  const t = String(v ?? '').trim();
  if (!t) return 0;
  if (/^-?\d+([.,]\d+)?$/.test(t)) return Number(t.replace(',', '.'));
  return parseMoney(t) ?? (Number(t.replace(/[^\d-]/g, '')) || 0);
}

const kosong = (baris) => !baris || baris.every((v) => v === '' || v == null);

// Mengubah isi tab (array baris tanpa judul) menjadi data yang sama dengan data dari grup WhatsApp.
export function ubahInputManual(tab, kodeAda = []) {
  const ambil = (nama) => (tab[nama] || []).filter((b) => !kosong(b));
  const events = [];
  const kodeDipakai = [...kodeAda];
  for (const [kode, lokasi, io, mulai, selesai, wilayah, bagiHasil, admin, owner] of ambil('1. Event')) {
    const m = keTanggal(mulai);
    const s = keTanggal(selesai) || m;
    if (!lokasi || !m) continue;
    const k = String(kode || '').trim().toUpperCase() || buatKodeEvent(lokasi, m, kodeDipakai);
    kodeDipakai.push(k);
    events.push({
      kode: k, kota: String(lokasi).trim(), io: String(io || '').trim(), mulai: m, selesai: s,
      wilayah: normalisasiWilayah(wilayah || '') || 'Jawa', bagi_hasil_persen: keAngka(bagiHasil), admin: keAngka(admin),
      jadwal_trf: 'AKHIR', owner_hadir: String(owner || 'tidak').toLowerCase(), status: 'SELESAI', sumber: 'manual',
    });
  }
  const kodeUpper = (v) => String(v || '').trim().toUpperCase();
  const omzet = ambil('2. Omzet Harian').map(([kode, tgl, om, trx, refund]) => ({
    kode_event: kodeUpper(kode), tanggal: keTanggal(tgl), omzet: keAngka(om), jumlah_transaksi: trx === '' ? '' : keAngka(trx), refund: keAngka(refund), status: STATUS.OK,
  })).filter((o) => o.tanggal);

  let no = 0;
  const transaksi = [];
  for (const [kode, tgl, ket, kategori, nominal, bayar] of ambil('3. Pengeluaran')) {
    transaksi.push({
      id: `M${String(++no).padStart(4, '0')}`, tanggal: keTanggal(tgl), kode_event: kodeUpper(kode), buku: BUKU.EVENT, jenis: JENIS.KELUAR,
      kategori: kategori || tebakKategori(ket || ''), keterangan: String(ket || ''), nominal: keAngka(nominal),
      metode: '', sumber: 'manual', pengirim: bayar ? `Input manual (${bayar})` : 'Input manual', status: STATUS.OK,
    });
  }
  for (const [kode, tgl, jenis, nominal, ket] of ambil('4. Transfer & Potongan IO')) {
    transaksi.push({
      id: `M${String(++no).padStart(4, '0')}`, tanggal: keTanggal(tgl), kode_event: kodeUpper(kode), buku: BUKU.EVENT,
      jenis: jenis === JENIS.POTONGAN_IO ? JENIS.POTONGAN_IO : JENIS.MASUK_IO,
      kategori: jenis === JENIS.POTONGAN_IO ? 'Potongan IO' : 'Transfer IO', keterangan: String(ket || ''), nominal: keAngka(nominal),
      metode: 'TRANSFER', sumber: 'manual', pengirim: 'Input manual', status: STATUS.OK,
    });
  }
  const tim = ambil('5. Tim').map(([kode, nama, peran, upah, mulai, selesai]) => {
    const p = PERAN_PILIHAN.find((x) => x.toLowerCase() === String(peran || '').trim().toLowerCase()) || PERAN.DW;
    return {
      kode_event: kodeUpper(kode), nama: String(nama || '').trim(), peran: p,
      upah_harian: upah === '' ? UPAH_DEFAULT[p] : keAngka(upah), mulai: keTanggal(mulai), selesai: keTanggal(selesai), status: 'AKTIF',
    };
  }).filter((o) => o.nama);
  const bahan = ambil('6. Bahan Baku').flatMap(([kode, nama, keluar, restock, kembali]) => [
    ['Keluar', keluar], ['Restock', restock], ['Kembali', kembali],
  ].filter(([, j]) => keAngka(j)).map(([gerak, j]) => ({ kode_event: kodeUpper(kode), bahan: String(nama || '').trim(), gerak, jumlah: keAngka(j), status: STATUS.OK })));
  const gratis = ambil('7. Porsi Gratis').map(([kode, tgl, menu, porsi, isi, untuk]) => ({
    kode_event: kodeUpper(kode), tanggal: keTanggal(tgl), menu: String(menu || '').trim(), porsi: keAngka(porsi), isi: keAngka(isi),
    pcs: keAngka(porsi) * keAngka(isi), untuk: String(untuk || ''), status: STATUS.OK,
  })).filter((g) => g.pcs);

  return { events, omzet, transaksi, tim, bahan, gratis };
}
