import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlePesan } from '../src/handlers.js';
import { MemoryStore } from '../src/store/memory.js';
import { buatPenjadwal } from '../src/scheduler.js';
import { buatSesi } from '../src/sesi.js';

const OWNER = '6281111111111';
const PIC = '6282222222222';
const KARYAWAN = '6283333333333';
const G_KELUAR = 'keluar@g.us';
const G_TIM = 'tim@g.us';
const G_RUKO = 'ruko@g.us';
// 3 Nov 2026, 14.00 WIB
const WAKTU = new Date('2026-11-03T07:00:00Z');

function setup() {
  const store = new MemoryStore();
  const ctx = { store, ownerIds: new Set([OWNER]), sesi: buatSesi(null) };
  let n = 0;
  const kirim = async (groupId, senderId, text, extra = {}) => {
    const res = await handlePesan(ctx, {
      id: `m${++n}`, groupId, groupName: groupId, senderId, senderName: { [OWNER]: 'George', [PIC]: 'Budi' }[senderId] || 'Joko',
      text, adaFoto: false, waktu: WAKTU, ...extra,
    });
    return res.map((r) => r.text).join('\n');
  };
  return { store, kirim, ctx };
}

const BLOK_EVENT = `#event
Kode: JMB26-11
Kota: Jambi
IO: Kepo Market
Tanggal: 2-8 Nov 2026
Wilayah harga: Sumatra
Bagi hasil: 25%
Admin: 500rb
PIC: Budi`;

test('grup yang belum terdaftar diabaikan, kecuali perintah owner', async () => {
  const { kirim } = setup();
  assert.equal(await kirim(G_KELUAR, PIC, 'lalamove 150k'), '');
  assert.match(await kirim(G_KELUAR, PIC, BLOK_EVENT), /khusus owner/);
  assert.match(await kirim(G_KELUAR, KARYAWAN, '#idsaya'), /6283333333333/);
});

test('alur lengkap: setup event, pengeluaran, omzet, transfer, rekap, batal', async () => {
  const { store, kirim } = setup();

  assert.match(await kirim(G_KELUAR, OWNER, BLOK_EVENT), /Event JMB26-11 dibuat/);
  assert.match(await kirim(G_TIM, OWNER, '#daftar event JMB26-11'), /grup event/);

  // Pengeluaran
  const r1 = await kirim(G_KELUAR, PIC, 'lalamove 150k\nmakan malam 120rb cash');
  assert.match(r1, /T0001 lalamove - \*Rp 150.000\*/);
  assert.match(r1, /T0002 makan malam - \*Rp 120.000\* \[Konsumsi, CASH\]/);
  assert.match(r1, /Total pengeluaran event: Rp 270.000/);

  // Chat biasa tidak dicatat
  assert.equal(await kirim(G_KELUAR, PIC, 'oke pak siap'), '');

  // Omzet dari grup tim: tidak menampilkan rincian bagi hasil
  const r2 = await kirim(G_TIM, PIC, '#omzet\nOMZET TERVERIFIKASI: Rp 10.000.000\nJUMLAH TRANSAKSI: 70');
  assert.match(r2, /Omzet 2026-11-03 tercatat/);
  assert.doesNotMatch(r2, /transfer IO/);

  // Laporan ulang menggantikan yang lama
  const r3 = await kirim(G_KELUAR, PIC, '#omzet 12jt');
  assert.match(r3, /menggantikan/);
  assert.match(r3, /Total omzet event sejauh ini: \*Rp 12.000.000\*/);
  assert.match(r3, /Perkiraan transfer IO: Rp 9.000.000, dijadwalkan 2026-11-04/);

  // Transfer masuk dan potongan IO
  assert.match(await kirim(G_KELUAR, OWNER, '#trf 9.000.000 omzet 3 nov'), /Transfer masuk dari IO tercatat/);
  assert.match(await kirim(G_KELUAR, OWNER, '#potongan listrik 250rb'), /Potongan IO tercatat/);

  // Batal
  assert.match(await kirim(G_KELUAR, KARYAWAN, '#batal T0002'), /Hanya owner/);
  assert.match(await kirim(G_KELUAR, OWNER, '#batal T0002'), /T0002 dibatalkan/);

  // Kategori
  assert.match(await kirim(G_KELUAR, PIC, '#kategori T0001 transport'), /Transport & Ekspedisi/);

  // Rekap
  const rekap = await kirim(G_KELUAR, PIC, '#rekap');
  assert.match(rekap, /Omzet kotor \(1 hari\): Rp 12.000.000/);
  assert.match(rekap, /Bagi hasil IO \(25%\): -Rp 3.000.000/);
  assert.match(rekap, /Perkiraan transfer IO: \*Rp 8.250.000\*/);
  assert.match(rekap, /Total pengeluaran: \*Rp 150.000\*/);
  assert.match(await kirim(G_TIM, PIC, '#rekap'), /hanya bisa dilihat di grup pengeluaran/);

  const trx = await store.all('Transaksi');
  assert.equal(trx.length, 4);
  assert.equal(trx.find((t) => t.id === 'T0002').status, 'BATAL');
});

test('buku ruko dan rekap bulanan khusus owner', async () => {
  const { kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  assert.match(await kirim(G_RUKO, OWNER, '#daftar ruko'), /grup ruko/);
  const r = await kirim(G_RUKO, OWNER, 'token listrik 850rb\ngaji Andi 2jt');
  assert.match(r, /\(RUKO\)/);
  assert.doesNotMatch(r, /Total pengeluaran event/);
  assert.match(await kirim(G_RUKO, PIC, '#rekap'), /khusus owner|hanya untuk owner/);
  const bulan = await kirim(G_RUKO, OWNER, '#rekap');
  assert.match(bulan, /REKAP BULAN NOVEMBER 2026/);
  assert.match(bulan, /Total biaya ruko: -Rp 2.850.000/);
});

test('foto: harga diambil dari caption, foto tanpa harga diminta ditulis', async () => {
  const { kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  assert.match(await kirim(G_KELUAR, PIC, 'lalamove 150rb', { adaFoto: true }), /\[Transport & Ekspedisi, TRANSFER\]/);
  assert.match(await kirim(G_KELUAR, PIC, 'bukti lalamove', { adaFoto: true }), /tulis harga/);
  assert.match(await kirim(G_KELUAR, OWNER, '#trf', { adaFoto: true }), /tulis harga/);
});

test('penjadwal: pengingat omzet, rekap malam, pengingat transfer telat', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  await kirim(G_TIM, OWNER, '#daftar event JMB26-11');
  const tugas = buatPenjadwal({ store, jam: { pengingatOmzet: '23:00', rekapMalam: '23:30', pengingatTransfer: '10:00' } });

  // 3 Nov 23:05 WIB: omzet belum masuk -> pengingat ke grup tim; pengingat transfer 10:00 juga jalan (tidak ada yang telat)
  let keluar = await tugas(new Date('2026-11-03T16:05:00Z'));
  assert.equal(keluar.length, 1);
  assert.equal(keluar[0].groupId, G_TIM);
  assert.match(keluar[0].text, /#omzet\* hari ini \(2026-11-03\)/);

  // Tidak dikirim dua kali
  assert.equal((await tugas(new Date('2026-11-03T16:10:00Z'))).length, 0);

  // 23:35 -> rekap malam ke grup pengeluaran
  keluar = await tugas(new Date('2026-11-03T16:35:00Z'));
  assert.equal(keluar.length, 1);
  assert.equal(keluar[0].groupId, G_KELUAR);
  assert.match(keluar[0].text, /REKAP EVENT JMB26-11/);

  // Omzet 3 Nov jatuh tempo 4 Nov; 5 Nov 10:00 belum ada transfer -> pengingat
  await store.append('Omzet', { tanggal: '2026-11-03', kode_event: 'JMB26-11', omzet: 10000000, refund: 0, status: 'OK', dicatat: 'x' });
  keluar = await tugas(new Date('2026-11-05T03:01:00Z'));
  const pengingat = keluar.find((k) => /Pengingat transfer/.test(k.text));
  assert.ok(pengingat);
  assert.match(pengingat.text, /Rp 7.500.000/);
});

test('tim, bahan, porsi gratis, dan data sheet Main', async () => {
  const { store, kirim } = setup();
  const { isiHargaAwal, perbaruiMain } = await import('../src/main.js');
  await isiHargaAwal(store);

  const r1 = await kirim(G_KELUAR, OWNER, `${BLOK_EVENT}\nSenior: Andi\nDW: Joko 120rb, Tono\nKasir: Sari`);
  assert.match(r1, /Budi - PIC/);
  assert.match(r1, /Joko - DW Rp 120.000\/hari/);
  assert.match(r1, /Sari - Kasir Rp 100.000\/hari/);
  await kirim(G_TIM, OWNER, '#daftar event JMB26-11');

  assert.match(await kirim(G_KELUAR, PIC, '#tambah DW Rina 100rb'), /Rina - DW/);
  assert.match(await kirim(G_KELUAR, PIC, '#tambah DW Rina'), /sudah ada/);
  assert.match(await kirim(G_KELUAR, PIC, '#berhenti Tono'), /Tono \(DW\) ditandai berhenti. Hari kerja terakhir: \*2026-11-02\*/);
  assert.match(await kirim(G_TIM, KARYAWAN, '#berhenti Joko'), /hanya oleh owner/);

  const r2 = await kirim(G_TIM, KARYAWAN, '#keluar\nmozzarella 10 pack\nbumbu garlic 2 pack\noyster 50 kg');
  assert.match(r2, /Bahan keluar dari gudang/);
  assert.match(r2, /Mozzarella: keluar 10 \+ restock 0 − kembali 0 = terpakai \*10 pack\*/);
  assert.match(await kirim(G_TIM, KARYAWAN, '#kembali mozzarella 3 pack'), /terpakai \*7 pack\*/);

  const r3 = await kirim(G_KELUAR, PIC, '#gratis 3 porsi mozzarella isi 4 untuk @rina_food');
  assert.match(r3, /3 porsi × 4 pcs Mozzarella untuk @rina_food = 12 pcs \(Rp 300.000\)/);

  const r4 = await kirim(G_KELUAR, PIC, 'sapu 25rb\nhotel 350rb x 2 malam\nendorse @makanjambi 300rb');
  assert.match(r4, /\[Barang Kering Non-Konsumtif\]/);
  assert.match(r4, /Rp 700.000\* \[Penginapan\]/);
  assert.match(r4, /\[Iklan & Endorse\]/);

  await kirim(G_TIM, PIC, '#omzet 20jt');
  await perbaruiMain(store);
  const bagian = (b) => store.dataMain.filter((x) => x[0] === 'JMB26-11' && x[1] === b);
  assert.equal(bagian('OMZET').length, 1);
  assert.equal(bagian('GRATIS').length, 1);
  assert.equal(bagian('BAHAN').find((x) => x[3] === 'Mozzarella')[8], '7');
  assert.ok(bagian('TIM').some((x) => x[3] === 'Tono' && /berhenti/.test(x[4])));
  const biaya = Object.fromEntries(bagian('BIAYA').map((x) => [x[4], x[5]]));
  assert.equal(biaya['Barang kering non-konsumtif ⚠️ kelalaian'], 25000);
  assert.equal(biaya['Penginapan'], 700000);
});

test('tanya-jawab: grup baru, setup event, ubah data lewat chat', async () => {
  const { store, kirim, ctx } = setup();
  const { handleGrupBaru } = await import('../src/handlers.js');

  const sapa = (await handleGrupBaru(ctx, G_KELUAR)).map((b) => b.text).join('');
  assert.match(sapa, /Grup ini untuk apa/);
  assert.equal((await handleGrupBaru(ctx, G_KELUAR)).length, 0); // tidak menyapa dua kali

  assert.equal(await kirim(G_KELUAR, PIC, '1'), ''); // bukan owner: diabaikan
  assert.match(await kirim(G_KELUAR, OWNER, '1'), /\(1\/13\) Lokasi/);
  const jawaban = ['Lokasi di jambi', 'Kepo Market', '2-8 Nov 2026', '2', 'ok', '500rb', '1', '11.00', '150jt', 'Budi', 'Andi', 'Joko, Tono 120rb', 'Sari'];
  let r = '';
  for (const j of jawaban.slice(0, 2)) r = await kirim(G_KELUAR, OWNER, j);
  assert.match(await kirim(G_KELUAR, OWNER, 'besok'), /Format tanggal belum terbaca/);
  for (const j of jawaban.slice(2)) r = await kirim(G_KELUAR, OWNER, j);
  assert.match(r, /Cek data event/);
  assert.match(r, /5\. Bagi hasil: 30%/);

  // ubah jawaban no. 5 sebelum simpan
  assert.match(await kirim(G_KELUAR, OWNER, '5'), /Bagi hasil IO/);
  assert.match(await kirim(G_KELUAR, OWNER, '27'), /5\. Bagi hasil: 27%/);

  r = await kirim(G_KELUAR, OWNER, 'ya');
  assert.match(r, /Event JMB26-11 dibuat/);
  assert.match(r, /Bagi hasil IO: 27%/);
  assert.match(r, /Tono - DW Rp 120.000\/hari/);
  const ev = (await store.all('Event'))[0];
  assert.equal(ev.wilayah, 'Sumatra');
  assert.equal(ev.target_omzet, 150000000);
  assert.equal((await store.all('Tim Event')).length, 5);
  assert.equal(ev.kota, 'Jambi');

  // setelah tersimpan, chat biasa kembali jadi pencatatan pengeluaran
  assert.match(await kirim(G_KELUAR, OWNER, 'lalamove 150k'), /Pengeluaran tercatat/);

  // ubah lewat chat
  assert.match(await kirim(G_KELUAR, OWNER, '#ubah bagi hasil 25'), /Bagi hasil IO: 25%/);
  assert.match(await kirim(G_KELUAR, OWNER, '#ubah tanggal 2-10 Nov 2026'), /2026-11-02 s\/d 2026-11-10/);
  assert.equal((await store.all('Event')).length, 1);

  // grup tim: pilih event dari daftar
  await handleGrupBaru(ctx, G_TIM);
  assert.match(await kirim(G_TIM, OWNER, '2'), /1 = JMB26-11/);
  assert.match(await kirim(G_TIM, OWNER, '1'), /grup event\* untuk event JMB26-11/);

  // grup ruko
  await handleGrupBaru(ctx, G_RUKO);
  assert.match(await kirim(G_RUKO, OWNER, '3'), /grup ruko/);

  // batal
  assert.match(await kirim(G_KELUAR, OWNER, '#eventbaru'), /Setup event baru/);
  assert.match(await kirim(G_KELUAR, OWNER, 'batal'), /dibatalkan/);
});

test('kode event otomatis', async () => {
  const { buatKodeEvent } = await import('../src/wizard.js');
  assert.equal(buatKodeEvent('Jambi', '2026-11-02'), 'JMB26-11');
  assert.equal(buatKodeEvent('Palembang', '2026-12-01'), 'PLM26-12');
  assert.equal(buatKodeEvent('Jambi', '2026-11-20', ['JMB26-11']), 'JMB26-11-2');
  assert.equal(buatKodeEvent('Bali', '2027-01-05'), 'BAL27-01');
});

test('PIC yang merangkap kasir tidak dihitung sebagai kasir berbayar', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, `${BLOK_EVENT}\nKasir: Budi`);
  const tim = await store.all('Tim Event');
  assert.equal(tim.length, 1);
  assert.equal(tim[0].peran, 'PIC');
});

test('kalimat biasa tentang bahan dicatat tanpa #perintah', async () => {
  const { store, kirim } = setup();
  const { isiHargaAwal } = await import('../src/main.js');
  await isiHargaAwal(store);
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  assert.match(await kirim(G_KELUAR, PIC, 'kiriman 10 pack keju'), /Bahan keluar dari gudang[\s\S]*Mozzarella 10 pack/);
  assert.match(await kirim(G_KELUAR, PIC, 'restock bumbu garlic 2 pack'), /Restock bahan[\s\S]*Bumbu Garlic 2 pack/);
  assert.match(await kirim(G_KELUAR, PIC, 'barang datang 5 pack keju'), /Restock bahan[\s\S]*Mozzarella 5 pack/);
  assert.match(await kirim(G_KELUAR, PIC, 'kiriman restock 2 pack keju'), /Restock bahan[\s\S]*Mozzarella 2 pack/);
  assert.match(await kirim(G_KELUAR, PIC, 'sisa 3 pack keju dikembalikan'), /terpakai \*14 pack\*/);
  // ada harga -> tetap pengeluaran biasa
  assert.match(await kirim(G_KELUAR, PIC, 'kirim barang lalamove 150rb'), /Pengeluaran tercatat/);
  // chat biasa tanpa bahan tetap diabaikan
  assert.equal(await kirim(G_KELUAR, PIC, 'besok kirim jam 8 ya'), '');
});

test('bot bertanya balik kalau laporan kurang lengkap', async () => {
  const { store, kirim } = setup();
  const { isiHargaAwal } = await import('../src/main.js');
  await isiHargaAwal(store);
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);

  // pembelian tanpa harga -> ditanya harga -> dicatat
  assert.match(await kirim(G_KELUAR, PIC, 'beli sapu'), /Berapa harga untuk \*"beli sapu"\*/);
  assert.match(await kirim(G_KELUAR, PIC, '25rb'), /beli sapu - \*Rp 25.000\* \[Barang Kering Non-Konsumtif\]/);

  // orang lain yang menjawab tidak dianggap jawaban
  assert.match(await kirim(G_KELUAR, PIC, 'bayar hotel'), /Berapa harga/);
  assert.match(await kirim(G_KELUAR, KARYAWAN, '300rb'), /Pengeluaran \*Rp 300.000\* ini untuk apa/);
  assert.match(await kirim(G_KELUAR, PIC, '300rb'), /bayar hotel - \*Rp 300.000\* \[Penginapan\]/);
  assert.match(await kirim(G_KELUAR, KARYAWAN, 'lalamove ke venue'), /lalamove ke venue - \*Rp 300.000\* \[Transport & Ekspedisi\]/);

  // bahan tanpa jumlah / tanpa nama
  assert.match(await kirim(G_KELUAR, PIC, 'kiriman keju'), /Berapa \*pack Mozzarella\*/);
  assert.match(await kirim(G_KELUAR, PIC, '12'), /Mozzarella 12 pack/);
  assert.match(await kirim(G_KELUAR, PIC, 'kiriman 5 pack'), /Bahan apa yang 5 itu/);
  assert.match(await kirim(G_KELUAR, PIC, '3'), /Bumbu Garlic 5 pack/);

  // kategori belum jelas -> ditawarkan pilihan
  const r = await kirim(G_KELUAR, PIC, 'sumbangan acara 50rb');
  assert.match(r, /Kategorinya belum jelas/);
  assert.match(await kirim(G_KELUAR, PIC, '4'), /sekarang kategori \*Tak Terduga\*/);

  // batal & jawaban bukan angka
  assert.match(await kirim(G_KELUAR, PIC, 'beli gas'), /Berapa harga/);
  assert.match(await kirim(G_KELUAR, PIC, 'batal'), /tidak dicatat/);
  assert.equal(await kirim(G_KELUAR, PIC, 'oke siap'), '');
});

test('obrolan/koreksi bernominal tidak dicatat; angka dengan satuan; sewa = admin', async () => {
  const { kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  assert.match(await kirim(G_KELUAR, PIC, 'minum karyawan 67,865 ribu'), /minum karyawan - \*Rp 67.865\* \[Konsumsi\]/);
  const r = await kirim(G_KELUAR, OWNER, 'Yang kamu cantumin itu bentuknya 67 juta dong salah ya');
  assert.match(r, /tidak saya catat/);
  const r2 = await kirim(G_KELUAR, PIC, 'Lalamove kerang ke P2 dan minum karyawan, lalamovenya harganya 150k, dan untuk minum 67,865 ribu');
  assert.match(r2, /tidak saya catat/);
  assert.match(r2, /T0001 minum karyawan/);
  assert.match(r2, /#batal T0001/);
  assert.match(await kirim(G_KELUAR, PIC, 'sewa freezer lombok 2.050.000'), /\[Admin & Sewa\]/);
  // campuran: baris laporan dicatat, baris obrolan disebutkan
  const r3 = await kirim(G_KELUAR, PIC, 'lalamove 150k\nkok mahal ya 150k');
  assert.match(r3, /lalamove - \*Rp 150.000\*/);
  assert.match(r3, /Tidak dicatat \(obrolan\)/);
});

test('pertanyaan ke bot dibalas petunjuk, tidak berulang-ulang', async () => {
  const { kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  assert.match(await kirim(G_KELUAR, OWNER, 'Jadi kita sampai mana tadi?'), /belum bisa diajak ngobrol[\s\S]*#rekap/);
  assert.equal(await kirim(G_KELUAR, OWNER, 'Sudah kamu kurangi kah?'), '');
  assert.equal(await kirim(G_KELUAR, OWNER, 'oke siap'), '');
});
