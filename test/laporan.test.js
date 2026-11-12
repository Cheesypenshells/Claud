import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitungEvent, barisDataMain, BATAS_BARIS, KELOMPOK_GRAFIK, warnaKelompok } from '../src/laporan.js';
import { BAHAN_AWAL, MENU_AWAL } from '../src/katalog.js';
import { JENIS } from '../src/schema.js';

const event = {
  kode: 'JMB26-11', kota: 'Jambi', io: 'Kepo Market', mulai: '2026-11-02', selesai: '2026-11-04',
  wilayah: 'Sumatra', bagi_hasil_persen: 30, admin: 500000, jadwal_trf: 'HARIAN',
};

// Omzet 3 hari: 20 jt, 35 jt, 10 jt (total 65 jt, di atas batas bonus karyawan tetap 50 jt).
const omzet = [
  { kode_event: 'JMB26-11', tanggal: '2026-11-02', omzet: 20000000, refund: 0, status: 'OK' },
  { kode_event: 'JMB26-11', tanggal: '2026-11-03', omzet: 35000000, refund: 0, status: 'OK' },
  { kode_event: 'JMB26-11', tanggal: '2026-11-04', omzet: 10000000, refund: 0, status: 'OK' },
];

const keluar = (kategori, nominal, keterangan = kategori) => ({ kode_event: 'JMB26-11', buku: 'EVENT', jenis: JENIS.KELUAR, kategori, nominal, keterangan, status: 'OK', tanggal: '2026-11-02' });
const transaksi = [
  keluar('Transport & Ekspedisi', 300000),
  keluar('Penginapan', 1050000),
  keluar('Konsumsi', 400000),
  keluar('Barang Kering Konsumtif', 50000),
  keluar('Barang Kering Non-Konsumtif', 25000, 'sapu'),
  keluar('Iklan & Endorse', 500000, 'endorse @makanjambi'),
  keluar('Tak Terduga', 50000),
  keluar('Oyster', 1500000),
  { kode_event: 'JMB26-11', buku: 'EVENT', jenis: JENIS.POTONGAN_IO, nominal: 200000, status: 'OK' },
  { kode_event: 'JMB26-11', buku: 'EVENT', jenis: JENIS.MASUK_IO, nominal: 20000000, status: 'OK' },
];

const tim = [
  { kode_event: 'JMB26-11', nama: 'Budi', peran: 'PIC', upah_harian: 0 },
  { kode_event: 'JMB26-11', nama: 'Andi', peran: 'Tetap', upah_harian: 0 },
  { kode_event: 'JMB26-11', nama: 'Joko', peran: 'DW', upah_harian: 100000 },
  { kode_event: 'JMB26-11', nama: 'Tono', peran: 'DW', upah_harian: 120000, selesai: '2026-11-03', status: 'BERHENTI' },
  { kode_event: 'JMB26-11', nama: 'Sari', peran: 'Kasir', upah_harian: 100000 },
];

const bahan = [
  { kode_event: 'JMB26-11', bahan: 'Mozzarella', gerak: 'Keluar', jumlah: 10, status: 'OK' },
  { kode_event: 'JMB26-11', bahan: 'Mozzarella', gerak: 'Restock', jumlah: 5, status: 'OK' },
  { kode_event: 'JMB26-11', bahan: 'Mozzarella', gerak: 'Kembali', jumlah: 3, status: 'OK' },
  { kode_event: 'JMB26-11', bahan: 'Bumbu Garlic', gerak: 'Keluar', jumlah: 2, status: 'OK' },
];

const gratis = [{ kode_event: 'JMB26-11', tanggal: '2026-11-02', menu: 'Mozzarella', porsi: 3, isi: 4, pcs: 12, untuk: '@rina', status: 'OK' }];

const data = { omzet, transaksi, tim, bahan, gratis, hargaBahan: BAHAN_AWAL, hargaMenu: MENU_AWAL };

test('hitungEvent: biaya per kategori, gaji, bonus, bahan, laba', () => {
  const r = hitungEvent(event, data);
  const biaya = Object.fromEntries(r.biaya.map(([nama, nilai]) => [nama, nilai]));

  assert.equal(r.omzetBersih, 65000000);
  assert.equal(biaya['Potongan bagi hasil IO'], 19500000);
  assert.equal(biaya['Admin IO + listrik/air/gas/galon'], 700000);
  // Gudang: mozzarella (10+5) x 234rb + garlic 2 x 500rb = 4.510.000; ditambah oyster beli di lokasi 1,5 jt
  assert.equal(biaya['Bahan baku'], 15 * 234000 + 2 * 500000 + 1500000);
  assert.equal(biaya['Barang kering non-konsumtif ⚠️ kelalaian'], 25000);
  assert.equal(biaya['Iklan & endorse'], 500000);

  // Karyawan tetap (1 orang): gaji pokok 2,5 jt / 30 x 3 hari; bonus 1,5% x 65 jt
  const andi = r.barisTim.find((o) => o.nama === 'Andi');
  assert.equal(Math.round(andi.upah), 250000);
  assert.equal(andi.bonus, 975000);
  // DW Joko 3 hari x 100rb; bonus: 20 jt (>15 jt) 50rb + 35 jt (>30 jt) 100rb + 10 jt 0 = 150rb
  const joko = r.barisTim.find((o) => o.nama === 'Joko');
  assert.equal(joko.upah, 300000);
  assert.equal(joko.bonus, 150000);
  // DW Tono berhenti 3 Nov: 2 hari x 120rb; bonus 50rb + 100rb
  const tono = r.barisTim.find((o) => o.nama === 'Tono');
  assert.equal(tono.hari, 2);
  assert.equal(tono.upah, 240000);
  assert.equal(tono.bonus, 150000);
  // Kasir: 20 jt -> 150rb, 35 jt -> 200rb, 10 jt -> 100rb
  assert.equal(r.barisTim.find((o) => o.nama === 'Sari').bonus, 450000);

  // Budget makan: PIC 100rb + karyawan 30rb x orang hadir per hari
  // Hari 1 & 2: PIC + Andi, Joko, Tono, Sari = 100rb + 4 x 30rb; hari 3: Tono sudah berhenti
  assert.equal(r.budgetMakan, 2 * (100000 + 4 * 30000) + (100000 + 3 * 30000));
  assert.equal(r.makanTerpakai, 400000);

  // Sisa bahan kembali: 3 pack mozzarella
  assert.equal(r.nilaiSisaKembali, 3 * 234000);
  assert.equal(r.labaSebelumFee, r.omzetBersih - r.totalBiaya + r.nilaiSisaKembali);
  // Owner tidak datang: fee PIC 25% dari laba
  assert.equal(r.feePicPersen, 25);
  assert.equal(r.feePic, r.labaSebelumFee * 0.25);
  assert.equal(r.laba, r.labaSebelumFee - r.feePic);

  // Porsi gratis dinilai harga jual Sumatra: 12 pcs x 25rb
  assert.equal(r.barisGratis[0].nilai, 300000);

  // Transfer 20 jt dialokasikan ke hari pertama dulu (perkiraan 14 jt), sisanya ke hari kedua
  assert.equal(r.hari[0].diterima, 14000000);
  assert.equal(r.hari[1].diterima, 6000000);
});

test('bonus karyawan tetap: 2 orang masing-masing 1%, omzet < 50 jt tidak dapat bonus', () => {
  const dua = [...tim, { kode_event: 'JMB26-11', nama: 'Rudi', peran: 'Tetap', upah_harian: 0 }];
  const r = hitungEvent(event, { ...data, tim: dua });
  assert.equal(r.barisTim.find((o) => o.nama === 'Andi').bonus, 650000);
  assert.equal(r.barisTim.find((o) => o.nama === 'Rudi').bonus, 650000);

  const sepi = omzet.map((o) => ({ ...o, omzet: 10000000 }));
  const r2 = hitungEvent(event, { ...data, omzet: sepi });
  assert.equal(r2.barisTim.find((o) => o.nama === 'Andi').bonus, 0);
});

test('barisDataMain: bagian lengkap dan tidak melebihi batas baris sheet Main', () => {
  const baris = barisDataMain(hitungEvent(event, data));
  const bagian = (b) => baris.filter((x) => x[1] === b);
  for (const [b, batas] of Object.entries(BATAS_BARIS)) assert.ok(bagian(b).length <= batas, b);
  assert.equal(bagian('OMZET').length, 3);
  assert.equal(bagian('OMZET')[0][4], 'Senin');
  const ringkasan = Object.fromEntries(bagian('RINGKASAN').map((x) => [x[3], x[4]]));
  assert.match(ringkasan.Status, /UNTUNG/);
  assert.equal(ringkasan['Hari jualan'], '3 hari');
  assert.equal(bagian('BAHAN').find((x) => x[3] === 'Mozzarella')[8], '12');
  assert.ok(baris.every((x) => x.length <= 12));
});

test('fee PIC berkurang sesuai kehadiran owner, nol kalau rugi', () => {
  const persen = (owner_hadir) => hitungEvent({ ...event, owner_hadir }, data).feePicPersen;
  assert.equal(persen('tidak'), 25);
  assert.equal(persen('1 hari'), 20);
  assert.equal(persen('setengah'), 15);
  assert.equal(persen('penuh'), 10);
  const rugi = hitungEvent(event, { ...data, omzet: omzet.map((o) => ({ ...o, omzet: 1000000 })) });
  assert.ok(rugi.labaSebelumFee < 0);
  assert.equal(rugi.feePic, 0);
});

test('owner yang ikut bekerja tidak digaji dan tidak dapat fee PIC', () => {
  const timOwner = [
    { kode_event: 'JMB26-11', nama: 'George', peran: 'PIC', upah_harian: 0 },
    { kode_event: 'JMB26-11', nama: 'George', peran: 'Kasir', upah_harian: 100000 },
    { kode_event: 'JMB26-11', nama: 'Joko', peran: 'DW', upah_harian: 100000 },
  ];
  const r = hitungEvent(event, { ...data, tim: timOwner, namaOwner: 'George' });
  const kasir = r.barisTim.find((o) => o.nama === 'George' && o.peran === 'Kasir');
  assert.equal(kasir.upah, 0);
  assert.equal(kasir.bonus, 0);
  assert.equal(r.feePic, 0);
  assert.equal(r.laba, r.labaSebelumFee);
  assert.equal(r.barisTim.find((o) => o.nama === 'Joko').upah, 300000);
});

test('data grafik: omzet, 10 kelompok biaya + porsi, laba; jumlah biaya = total biaya + fee PIC', () => {
  const r = hitungEvent(event, data);
  const g = barisDataMain(r).filter((x) => x[1] === 'GRAFIK').map((x) => x.slice(3));
  assert.equal(g.length, 12);
  assert.equal(g[0][0], 'Omzet');
  assert.equal(g[11][0], 'Laba bersih (margin)');
  assert.deepEqual(g.slice(1, 11).map((x) => x[0]), KELOMPOK_GRAFIK.map((k) => k.nama));
  const biaya = g.slice(1, 11).reduce((s, [, v]) => s + v, 0);
  assert.equal(Math.round(biaya), Math.round(r.totalBiaya + r.feePic));
  assert.ok(Math.abs(g.slice(1, 11).reduce((s, x) => s + x[2], 0) - 1) < 1e-9);
  // Barang kering dipisah dari lain-lain: 50rb konsumtif + 25rb non-konsumtif
  assert.equal(g.find(([n]) => n === 'Barang kering')[1], 75000);
  assert.equal(g.find(([n]) => n === 'Tak terduga dll')[1], 50000);
  assert.equal(warnaKelompok(KELOMPOK_GRAFIK[6]), '#7baaf7'); // biru muda bawaan Google
});

test('data harian: omzet dan pengeluaran per tanggal', () => {
  const r = hitungEvent(event, data);
  const h = barisDataMain(r).filter((x) => x[1] === 'HARIAN').map((x) => x.slice(3));
  assert.equal(h.length, 3);
  const keluarTotal = transaksi.filter((t) => t.jenis === JENIS.KELUAR).reduce((s, t) => s + t.nominal, 0);
  assert.deepEqual(h[0], ['2026-11-02', 20000000, keluarTotal, 20000000 - keluarTotal]);
  assert.deepEqual(h[1], ['2026-11-03', 35000000, 0, 35000000]);
});

test('data harian: pengeluaran yang diketik jauh setelah event masuk baris "Di luar tgl event"', () => {
  const telat = [...transaksi, { ...keluar('Konsumsi', 30000), tanggal: '2026-12-20' }];
  const r = hitungEvent(event, { ...data, transaksi: telat });
  assert.deepEqual(r.harian.at(-1), { tanggal: 'Di luar tgl event', omzet: 0, pengeluaran: 30000 });
  assert.equal(r.harian.length, 4);
});

test('gaji yang dibayar lewat grup dipakai sebagai upah (sama dengan #rekap), walau omzet belum ada', () => {
  const gaji = [...transaksi, keluar('Gaji & Upah', 1700000, 'gaji dw1'), keluar('Gaji & Upah', 1400000, 'gaji dw2')];
  const r = hitungEvent(event, { ...data, omzet: [], transaksi: gaji });
  const upah = r.biaya.find(([n]) => n === 'Upah DW + kasir');
  assert.equal(upah[1], 3100000);
  const totalCatatan = gaji.filter((t) => t.jenis === JENIS.KELUAR).reduce((s, t) => s + t.nominal, 0);
  // tanpa omzet & tanpa bahan gudang/gaji tetap: total biaya = jumlah semua pengeluaran grup + bahan gudang
  assert.equal(r.totalBiaya - r.biaya.find(([n]) => n === 'Bahan baku')[1] + 1500000 - r.biaya.find(([n]) => n === 'Admin IO + listrik/air/gas/galon')[1] + 0, totalCatatan - 0);
});

test('rekap event lama: omzet total -> semua hari event dihitung; upah DW = total catatan gaji PIC (satu baris); gaji khusus tetap tanpa bonus', async () => {
  const { hitungEvent } = await import('../src/laporan.js');
  const event = { kode: 'BAL', kota: 'Bali', mulai: '2026-09-23', selesai: '2026-10-04', bagi_hasil_persen: 30, admin: 0, jadwal_trf: 'AKHIR' };
  const r = hitungEvent(event, {
    omzet: [{ tanggal: '2026-10-04', kode_event: 'BAL', omzet: 125055000, refund: 0, catatan: 'Omzet total event (tanpa tanggal per hari)', status: 'OK' }],
    transaksi: [
      { id: 'T1', kode_event: 'BAL', jenis: 'Pengeluaran', kategori: 'Gaji & Upah', keterangan: 'bayar gaji dave', nominal: 600000, status: 'OK' },
      { id: 'T2', kode_event: 'BAL', jenis: 'Pengeluaran', kategori: 'Gaji & Upah', keterangan: 'gaji dave', nominal: 550000, status: 'OK' },
      { id: 'T3', kode_event: 'BAL', jenis: 'Pengeluaran', kategori: 'Gaji & Upah', keterangan: 'gaji dw loading in', nominal: 300000, status: 'OK' },
    ],
    tim: [
      { kode_event: 'BAL', nama: 'Tiara', peran: 'Tetap', upah_harian: 0, mulai: '2026-09-23', status: 'AKTIF', gaji_event: 2000000 },
      { kode_event: 'BAL', nama: 'Dave', peran: 'DW', upah_harian: 100000, mulai: '2026-09-23', status: 'AKTIF' },
    ],
  });
  const tiara = r.barisTim.find((o) => o.nama === 'Tiara');
  assert.equal(tiara.hari, 12);
  assert.equal(tiara.upah, 2000000);
  assert.equal(tiara.bonus, 0);
  // DW tidak dipecah per nama / hari: satu baris = total catatan gaji PIC
  assert.ok(!r.barisTim.some((o) => o.nama === 'Dave'));
  const dw = r.barisTim.find((o) => o.catatanGaji);
  assert.match(dw.nama, /DW & kasir \(Dave\) – sesuai catatan gaji PIC/);
  assert.equal(dw.upah, 1450000);
  assert.equal(dw.bonus, 0);
  assert.equal(r.biaya.find((b) => b[0] === 'Upah DW + kasir')[1], 1450000);
});
