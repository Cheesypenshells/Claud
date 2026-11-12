import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store/memory.js';
import { handlePesan } from '../src/handlers.js';
import { buatSesi } from '../src/sesi.js';
import { isiHargaAwal } from '../src/main.js';
import { perbaruiPembukuan, rentangTanggal, judulFileEvent, KOLOM_REKAP, KOLOM_GAJI } from '../src/pembukuan.js';

const OWNER = '6281111111111';
const G = 'keluar@g.us';
const WAKTU = new Date('2026-11-03T07:00:00Z');

async function siapkan() {
  const store = new MemoryStore();
  const ctx = { store, ownerIds: new Set([OWNER]), sesi: buatSesi(null) };
  await isiHargaAwal(store);
  await store.append('Pengaturan', { kunci: 'folder_event', nilai: 'FOLDER-EVENT' });
  store.files.push({ id: 'F1', nama: '(kosong) cadangan event 01', folder: 'FOLDER-EVENT' });
  let n = 0;
  const kirim = async (text) => (await handlePesan(ctx, { id: `m${++n}`, groupId: G, groupName: G, senderId: OWNER, senderName: 'George', text, adaFoto: false, waktu: WAKTU }))
    .map((b) => b.text).join('\n');
  return { store, kirim };
}

const BLOK = `#event
Kode: LMB26-09
Kota: Lombok
IO: Jangkrik
Tanggal: 2-4 Nov 2026
Wilayah harga: Jawa
Bagi hasil: 30%
PIC: Rina
Senior: Imam
DW: Andi`;

test('rentang tanggal dan judul file event', () => {
  assert.equal(rentangTanggal('2026-09-24', '2026-10-11'), '24 Sep - 11 Okt 2026');
  assert.equal(rentangTanggal('2026-11-01', '2026-11-14'), '1 - 14 Nov 2026');
  assert.equal(rentangTanggal('2026-12-28', '2027-01-03'), '28 Des 2026 - 3 Jan 2027');
  assert.equal(judulFileEvent({ kota: 'Lombok', io: 'Jangkrik', mulai: '2026-09-24', selesai: '2026-10-11' }), 'LOMBOK - JANGKRIK (24 Sep - 11 Okt 2026)');
});

test('event baru memakai file cadangan, rekap & gaji tertulis di PEMBUKUAN', async () => {
  const { store, kirim } = await siapkan();
  await kirim(BLOK);
  await kirim('#omzet 20jt');
  await kirim('lalamove 150k\nhotel 300rb x 2 malam\nsapu 25rb');
  assert.match(await kirim('#owner 1 hari'), /Fee PIC menjadi \*20%\*/);

  const { catatan } = await perbaruiPembukuan(store);
  assert.deepEqual(catatan, []);
  assert.equal(store.files[0].nama, 'LOMBOK - JANGKRIK (2 - 4 Nov 2026)');
  assert.equal((await store.all('Event'))[0].file_event, 'F1');
  assert.equal(store.fileData.F1.kode, 'LMB26-09');
  assert.ok(store.fileData.F1.baris.some((b) => b[1] === 'RINGKASAN'));
  // satu tab per kategori, total di atas
  assert.equal(store.tabel['F1/Transport'].total, 150000);
  assert.equal(store.tabel['F1/Penginapan'].total, 600000);
  assert.equal(store.tabel['F1/BK Non-Konsumtif'].total, 25000);
  assert.equal(store.tabel['F1/Konsumsi'].baris.length, 0);
  assert.equal(store.tabel['F1/Semua Transaksi'].baris.length, 3);

  const rekap = store.tabel['PEMBUKUAN/Rekap Event'];
  assert.equal(rekap.length, 2); // 1 event + baris TOTAL
  const kol = (label) => KOLOM_REKAP.findIndex((c) => c.label === label);
  const baris = rekap[0];
  assert.equal(baris[kol('PIC')], 'Rina');
  assert.equal(baris[kol('Karyawan Tetap')], 'Imam');
  assert.equal(baris[kol('Omzet Kotor')], 20000000);
  assert.equal(baris[kol('Bagi Hasil IO')], 6000000);
  assert.equal(baris[kol('Transport')], 150000);
  assert.equal(baris[kol('Penginapan / Hotel')], 600000);
  assert.equal(baris[kol('Barang Kering Non-Konsumtif (Kelalaian)')], 25000);
  assert.equal(baris[kol('Fee PIC %')], 20);
  assert.match(baris[kol('File Event')], /HYPERLINK\("https:\/\/docs.google.com\/spreadsheets\/d\/F1";"Buka file"\)/);
  assert.equal(rekap[1][0], 'TOTAL');

  const gaji = store.tabel['PEMBUKUAN/Gaji per Event'];
  const kg = (label) => KOLOM_GAJI.findIndex((c) => c.label === label);
  const rina = gaji.find((g) => g[kg('Nama')] === 'Rina');
  assert.equal(rina[kg('Fee PIC')], Math.round(baris[kol('Fee PIC')]));
  assert.equal(gaji.find((g) => g[kg('Nama')] === 'Andi')[kg('Total Upah / Gaji')], 100000);
});

test('file cadangan habis: event tetap direkap dan ada peringatan', async () => {
  const { store, kirim } = await siapkan();
  store.files = [];
  await kirim(BLOK);
  const { catatan } = await perbaruiPembukuan(store);
  assert.match(catatan[0], /File cadangan di folder EVENT habis/);
  assert.equal(store.tabel['PEMBUKUAN/Rekap Event'].length, 2);
});

test('#owner dengan jumlah hari', async () => {
  const { kirim } = await siapkan();
  await kirim(BLOK);
  assert.match(await kirim('#owner 3 hari'), /penuh/);
  assert.match(await kirim('#owner 2 hari'), /setengah/);
  assert.match(await kirim('#owner 1 hari'), /\*1 hari\*/);
  assert.match(await kirim('#owner tidak'), /25%/);
});

test('input event lama (manual) dihitung dengan mesin yang sama', async () => {
  const { store } = await siapkan();
  const { ubahInputManual, keTanggal } = await import('../src/inputManual.js');
  assert.equal(keTanggal(46289), '2026-09-24'); // nomor seri Sheets
  assert.equal(keTanggal('24/09/2026'), '2026-09-24');

  await store.append('Pengaturan', { kunci: 'file_input_manual', nilai: 'INPUT' });
  store.inputManual = {
    '1. Event': [['', 'Kediri', 'Jangkrik', '03/09/2026', '05/09/2026', 'Jawa', 30, 0, 'penuh']],
    '2. Omzet Harian': [['KDR26-09', '03/09/2026', 15000000, 90, 0], ['KDR26-09', '04/09/2026', 20000000, 110, 0]],
    '3. Pengeluaran': [['KDR26-09', '03/09/2026', 'lalamove', '', 160000, 'Uang George'], ['KDR26-09', '03/09/2026', 'sapu', '', 25000, 'Kas usaha']],
    '4. Transfer & Potongan IO': [['KDR26-09', '06/09/2026', 'Transfer IO', 24500000, 'pelunasan']],
    '5. Tim': [['KDR26-09', 'Rina', 'PIC', '', '', ''], ['KDR26-09', 'Imam', 'Tetap', '', '', ''], ['KDR26-09', 'Joko', 'DW', 100000, '', '']],
    '6. Bahan Baku': [['KDR26-09', 'Mozzarella', 10, 0, 2]],
    '7. Porsi Gratis': [],
  };
  const m = ubahInputManual(store.inputManual);
  assert.equal(m.events[0].kode, 'KDR26-09');
  assert.equal(m.transaksi[1].kategori, 'Barang Kering Non-Konsumtif');

  await perbaruiPembukuan(store);
  const rekap = store.tabel['PEMBUKUAN/Rekap Event'];
  const kol = (label) => KOLOM_REKAP.findIndex((c) => c.label === label);
  const kediri = rekap.find((b) => b[0] === 'KDR26-09');
  assert.ok(kediri);
  assert.equal(kediri[kol('Omzet Kotor')], 35000000);
  assert.equal(kediri[kol('Transport')], 160000);
  assert.equal(kediri[kol('Fee PIC %')], 10);
  assert.equal(kediri[kol('Bahan Baku')], 10 * 234000);
  assert.equal(kediri[kol('Sisa Bahan Kembali')], 2 * 234000);
  // tab Bahan Baku memuat bahan dari gudang: awal + restock, dikurangi sisa -> total = bahan terpakai
  const fileKediri = (await store.all('Pengaturan')).find((r) => r.kunci === 'file_event_KDR26-09').nilai;
  assert.equal(store.tabel[`${fileKediri}/Bahan Baku`].total, (10 - 2) * 234000);
  assert.ok(store.tabel[`${fileKediri}/Bahan Baku`].baris.some((x) => /SISA 2 pack/.test(x[2]) && x[3] === -2 * 234000));
  assert.equal(store.tabel[`${fileKediri}/Transport`].baris[0][4], 'George');
  // file event diambil dari cadangan dan dicatat di Pengaturan (tidak dobel saat dihitung ulang)
  assert.equal(store.files[0].nama, 'KEDIRI - JANGKRIK (3 - 5 Sep 2026)');
  await perbaruiPembukuan(store);
  assert.equal((await store.all('Pengaturan')).filter((r) => r.kunci === 'file_event_KDR26-09').length, 1);
});
