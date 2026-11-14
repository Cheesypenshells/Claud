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
  const ctx = { store, ownerIds: new Set([OWNER]), sesi: buatSesi(null), terakhir: new Map() };
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
  assert.match(r3, /Total omzet kotor event sejauh ini: \*Rp 12.000.000\*/);
  assert.match(r3, /Omzet bersih \(ditransfer IO\): \*Rp 9.000.000\*, dijadwalkan 2026-11-04/);

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
  assert.match(r2, /Bahan baku pengiriman pertama/);
  assert.match(r2, /Mozzarella: awal 10 \+ restock 0 = 10, sisa 0 → terpakai \*10 pack\*/);
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
  assert.equal(bagian('OMZET').length, 2); // 1 hari + baris TOTAL
  assert.equal(bagian('GRATIS').length, 2);
  assert.equal(bagian('OMZET').at(-1)[3], 'TOTAL');
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

  assert.match(await kirim(G_KELUAR, PIC, '1'), /\(1\/13\) Lokasi/); // siapa pun di grup boleh menjawab
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
  assert.match(await kirim(G_KELUAR, PIC, 'kiriman 10 pack keju'), /Bahan baku pengiriman pertama[\s\S]*Mozzarella 10 pack/);
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
  assert.match(r, /Kategori \*sumbangan acara\* belum jelas/);
  assert.match(await kirim(G_KELUAR, PIC, '4'), /sekarang kategori \*Tak Terduga\*/);
  // dua pertanyaan berurutan, dijawab dengan kalimat
  await kirim(G_KELUAR, PIC, 'kawat jemuran 15rb');
  await kirim(G_KELUAR, PIC, 'lem korea 10rb');
  assert.match(await kirim(G_KELUAR, PIC, 'Kawat jemuran masuk nya no9'), /sekarang kategori \*Barang Kering Non-Konsumtif\*/);
  assert.match(await kirim(G_KELUAR, PIC, 'kalau yang lem masuk konsumtif juga'), /sekarang kategori \*Barang Kering Konsumtif\*/);
  // bot belajar: keterangan sama langsung berkategori
  assert.match(await kirim(G_KELUAR, PIC, 'kawat jemuran 20rb'), /\[Barang Kering Non-Konsumtif\]/);

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

test('uang siapa: dari pesan, default pengirim, ubah, penggantian', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, `${BLOK_EVENT}\nSenior: Imam`);
  // Budi (PIC) mengirim: default uang Budi; "uang mama" ditulis -> Mama
  assert.match(await kirim(G_KELUAR, PIC, 'lalamove 150k'), /\(uang Budi\)/);
  assert.match(await kirim(G_KELUAR, PIC, 'makan tim 200rb uang mama'), /makan tim - \*Rp 200.000\* \[Konsumsi\] \(uang Mama\)/);
  assert.match(await kirim(G_KELUAR, OWNER, 'hotel 300rb'), /\(uang George\)/);
  assert.match(await kirim(G_KELUAR, PIC, 'es batu 50rb uang kas'), /\(uang Kas usaha\)/);
  assert.match(await kirim(G_KELUAR, PIC, 'sapu 25rb pakai uang imam'), /\(uang Imam\)/);
  assert.match(await kirim(G_KELUAR, PIC, '#uang T0001 mama'), /T0001 lalamove Rp 150.000 sekarang tercatat \*uang Mama\*/);

  const r = await kirim(G_KELUAR, PIC, '#penggantian');
  assert.match(r, /Mama: keluar Rp 350.000 \(2 catatan\)/);
  assert.match(r, /Imam: keluar Rp 25.000/);
  assert.doesNotMatch(r, /Kas usaha/);

  assert.match(await kirim(G_KELUAR, PIC, '#ganti Mama 100rb'), /khusus owner/);
  assert.match(await kirim(G_KELUAR, OWNER, '#ganti Mama 100rb'), /Sisa yang masih harus ditransfer ke Mama: \*Rp 250.000\*/);
  // penggantian bukan biaya event
  const trx = await store.all('Transaksi');
  assert.equal(trx.find((t) => t.jenis === 'Penggantian').nominal, 100000);
  const { hitungEvent } = await import('../src/laporan.js');
  const r2 = hitungEvent((await store.all('Event'))[0], { transaksi: trx, tim: await store.all('Tim Event') });
  assert.equal(r2.totalBiaya, 150000 + 200000 + 300000 + 50000 + 25000 + 500000 + 2500000); // + admin IO 500rb + gaji pokok Imam
  assert.equal(r2.penggantian.find((u) => u.nama === 'Mama').sisa, 250000);
});

test('koreksi dengan reply pesan bot: uang siapa, tanggal, kategori, nominal, batal', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  const r = await kirim(G_KELUAR, PIC, 'Hotel 236.406 tanggal 2-3 nov\nplastik paper tray dll total330k');
  const kutip = (teks) => ({ kutipan: { teks: r, pengirim: '' }, text: teks });
  const cari = async (id) => (await store.all('Transaksi')).find((t) => t.id === id);

  assert.match(await kirim(G_KELUAR, PIC, '', kutip('Uang valen')), /Sudah diubah.*uang Valen/s);
  assert.equal((await cari('T0001')).dibayar_oleh, 'Valen');
  assert.equal((await cari('T0002')).dibayar_oleh, 'Valen');

  assert.match(await kirim(G_KELUAR, PIC, '', kutip('tanggal 4 nov')), /tanggal 2026-11-04/);
  assert.equal((await cari('T0002')).tanggal, '2026-11-04');

  // Nominal hanya kalau pesan yang di-reply berisi satu catatan
  const satu = await kirim(G_KELUAR, PIC, 'parkir 5rb');
  assert.match(await kirim(G_KELUAR, PIC, '', { kutipan: { teks: satu }, text: 'harusnya 7rb' }), /nominal Rp 7.000/);
  assert.equal((await cari('T0003')).nominal, 7000);
  // Reply berisi pengeluaran baru tetap dicatat sebagai pengeluaran baru
  assert.match(await kirim(G_KELUAR, PIC, '', { kutipan: { teks: satu }, text: 'makan 50rb' }), /T0004 makan/);
  // Karyawan lain tidak boleh mengubah catatan PIC
  assert.match(await kirim(G_KELUAR, KARYAWAN, '', kutip('uang mama')), /Hanya owner atau pengirim asli/);

  assert.match(await kirim(G_KELUAR, PIC, '', { kutipan: { teks: satu }, text: 'batal' }), /Dibatalkan.*T0003/s);
  assert.equal((await cari('T0003')).status, 'BATAL');
});

test('pesan "uang valen" tanpa reply tepat setelah mencatat berlaku untuk catatan itu', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  await kirim(G_KELUAR, PIC, 'Plastik paper tray dll total330k');
  assert.match(await kirim(G_KELUAR, PIC, 'Uang valen'), /Sudah diubah.*T0001 Plastik paper tray dll .*uang Valen/s);
  assert.equal((await store.all('Transaksi'))[0].dibayar_oleh, 'Valen');
});

test('koreksi: kategori hanya kalau diminta jelas', async () => {
  const { bacaKoreksi } = await import('../src/koreksi.js');
  const o = { hariIni: '2026-11-08', satuCatatan: true };
  assert.equal(bacaKoreksi('bayar hotel', o), null);
  assert.deepEqual(bacaKoreksi('masuk konsumsi', o), { kategori: 'Konsumsi' });
  assert.deepEqual(bacaKoreksi('yang ini masuk non konsumtif ya', o), { kategori: 'Barang Kering Non-Konsumtif' });
  assert.deepEqual(bacaKoreksi('Uang valen', o), { siapa: 'Valen' });
  assert.equal(bacaKoreksi('oke siap', o), null);
  assert.equal(bacaKoreksi('parkir 5rb', o), null);
});

test('reply menyebut salah satu item: hanya item itu yang diubah; uang X sesudah item', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  const r = await kirim(G_KELUAR, PIC, 'Makan3 nov 64k, pakai uang mama, grab bandara pulang150k, hotel 100k uang budi');
  const cari = async (id) => (await store.all('Transaksi')).find((t) => t.id === id);
  assert.equal((await cari('T0001')).dibayar_oleh, 'Mama');
  assert.equal((await cari('T0002')).dibayar_oleh, 'Budi'); // pengirim (tidak disebut)
  const b = await kirim(G_KELUAR, PIC, '', { kutipan: { teks: r }, text: 'Grab bandara pulang uang mama itu' });
  assert.match(b, /Sudah diubah.*T0002 grab bandara pulang/s);
  assert.doesNotMatch(b, /T0001|T0003/);
  assert.equal((await cari('T0002')).dibayar_oleh, 'Mama');
  assert.equal((await cari('T0003')).dibayar_oleh, 'Budi');
});

test('reply koreksi dengan kata tambahan tetap dipahami; yang tidak dipahami dijawab contoh', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  const r = await kirim(G_KELUAR, PIC, 'Makan 64k, pakai uang mama, grab bandara pulang150k');
  const cari = async (id) => (await store.all('Transaksi')).find((t) => t.id === id);
  assert.match(await kirim(G_KELUAR, PIC, '', { kutipan: { teks: r }, text: 'Yang transport grab bandara pulang itu uang valen' }), /Sudah diubah.*T0002/s);
  assert.equal((await cari('T0002')).dibayar_oleh, 'Valen');
  assert.equal((await cari('T0001')).dibayar_oleh, 'Mama');
  assert.match(await kirim(G_KELUAR, PIC, '', { kutipan: { teks: r }, text: 'Bagian grab bandara pulang itu uang mama' }), /uang Mama/);
  assert.match(await kirim(G_KELUAR, PIC, '', { kutipan: { teks: r }, text: 'ini gimana ya maksudnya' }), /belum saya pahami/);
});

test('reply "Hotel nya harga nya jadinya 222.540k ya" mengubah nominal hotel; "uang nya salah" ditanya balik', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  const r = await kirim(G_KELUAR, PIC, 'Laundrey valen 24k, makan valen 24.371, hotel valen 22.540');
  const n = (await store.all('Transaksi')).length;
  assert.match(await kirim(G_KELUAR, PIC, '', { kutipan: { teks: r }, text: 'Hotel nya harga nya jadinya 222.540k ya' }), /Sudah diubah\* \(nominal Rp 222.540\).*T0003 hotel valen/s);
  assert.equal((await store.all('Transaksi')).length, n); // tidak ada catatan baru
  assert.equal((await store.all('Transaksi')).find((t) => t.id === 'T0003').nominal, 222540);
  assert.match(await kirim(G_KELUAR, PIC, '', { kutipan: { teks: r }, text: 'Jumlah uang nya salah' }), /Yang benar berapa/);
  assert.ok((await store.all('Transaksi')).every((t) => t.dibayar_oleh !== 'Nya'));
  // reply berisi pengeluaran baru tanpa kata koreksi tetap dicatat baru
  assert.match(await kirim(G_KELUAR, PIC, '', { kutipan: { teks: r }, text: 'hotel 300rb' }), /Pengeluaran tercatat/);
});

test('Rp 1 juta ke atas dengan desimal "1081.171k"; rentang "dari tanggal22 sept sampai2 okt"; susulan "... itu <harga>" = koreksi', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  const r = await kirim(G_KELUAR, PIC, 'Hotel valen dari tanggal2 nov sampai3 nov 1081.17k ya uang valen semua');
  assert.match(r, /T0001 Hotel valen - \*Rp 1.081.170\*/);
  assert.doesNotMatch(r, /T0002/);
  // pesan susulan tanpa reply: koreksi, bukan catatan baru
  assert.match(await kirim(G_KELUAR, PIC, 'Penginapan nya valen itu1081.171k'), /Sudah diubah.*Rp 1.081.171/s);
  assert.equal((await store.all('Transaksi')).length, 1);
  const { parsePengeluaranDetail: p } = await import('../src/parsers.js');
  assert.equal(p('tiket pesawat nya1710k').items[0].nominal, 1710000);
  assert.equal(p('bayar 1500.000').items[0].nominal, 1500000);
  assert.equal(p('Itu untuk tiket pesawat 1710k').items[0].keterangan, 'tiket pesawat');
});

test('pengaman dobel: nominal sama dengan catatan lama ditanya dulu, "catat" untuk tetap mencatat', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  await kirim(G_KELUAR, PIC, 'Hotel valen 1081.171k');
  const r = await kirim(G_KELUAR, PIC, 'Hotel 1081.171k, parkir 5rb');
  assert.match(r, /T0002 parkir/);
  assert.match(r, /nominalnya sama dengan catatan lama.*Lama: \*T0001\*.*kirim foto bukti/s);
  assert.equal((await store.all('Transaksi')).length, 2);
  assert.match(await kirim(G_KELUAR, PIC, 'catat'), /T0003 Hotel - \*Rp 1.081.171\*/);
  assert.equal((await store.all('Transaksi')).length, 3);
});

test('peringatan dobel: reply "catat, uang melia" mencatat sekaligus mengubah uang siapa; siapa pun boleh menjawab', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  await kirim(G_KELUAR, PIC, 'makan karyawan nasi goreng melia 90rb');
  const warn = await kirim(G_KELUAR, PIC, 'makan siang 90rb');
  assert.match(warn, /nominalnya sama dengan catatan lama/);
  const kutip = { kutipan: { teks: warn, pengirim: '', id: 'botwarn' } };
  // owner (bukan pengirim) me-reply peringatan
  const r = await kirim(G_KELUAR, OWNER, 'catat, uang melia', kutip);
  assert.match(r, /T0002 makan siang - \*Rp 90.000\*/);
  assert.doesNotMatch(r, /belum saya pahami/);
  const t2 = (await store.all('Transaksi')).find((t) => t.id === 'T0002');
  assert.match(t2.dibayar_oleh, /melia/i);
  assert.match(t2.pengirim, /Budi/); // tetap atas nama pengirim asli
  // reply "ya" ke peringatan juga berarti catat
  const warn2 = await kirim(G_KELUAR, PIC, 'makan malam 90rb');
  assert.match(await kirim(G_KELUAR, OWNER, 'ya', { kutipan: { teks: warn2, pengirim: '', id: 'botwarn2' } }), /T0003 makan malam/);
  assert.equal((await store.all('Transaksi')).length, 3);
});

test('reply "uang melia semua": ke peringatan dobel = catat baru uang Melia; ke catatan banyak item = semua jadi Melia', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  await kirim(G_KELUAR, OWNER, 'makan karyawan nasi goreng melia 90rb');
  const warn = await kirim(G_KELUAR, OWNER, 'makan siang 90rb');
  const r1 = await kirim(G_KELUAR, OWNER, 'uang melia semua', { kutipan: { teks: warn, pengirim: '', id: 'w' } });
  assert.match(r1, /T0002 makan siang - \*Rp 90.000\*/);
  const t = await store.all('Transaksi');
  assert.equal(t.find((x) => x.id === 'T0001').dibayar_oleh, 'George'); // catatan lama tidak diubah
  assert.equal(t.find((x) => x.id === 'T0002').dibayar_oleh, 'Melia');
  // "45kuang melia" (angka menempel) terbaca; reply "uang melia semua" mengubah semua item
  const r2 = await kirim(G_KELUAR, OWNER, 'makan 30.7k, makan 17.8k uang melia, makan 33k, makan melia 2 okt 45kuang melia');
  assert.match(r2, /T0006 makan melia - \*Rp 45.000\*/);
  const r3 = await kirim(G_KELUAR, OWNER, 'uang melia semua', { kutipan: { teks: r2, pengirim: '', id: 'r2' } });
  assert.match(r3, /Sudah diubah\* \(uang Melia\)/);
  const semua = (await store.all('Transaksi')).filter((x) => ['T0003', 'T0004', 'T0005', 'T0006'].includes(x.id));
  assert.deepEqual(semua.map((x) => x.dibayar_oleh), ['Melia', 'Melia', 'Melia', 'Melia']);
});

test('reply peringatan dobel dengan koreksi ("uang melia"): semua kolom catatan baru dipakai + koreksinya', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  await kirim(G_KELUAR, PIC, 'makan karyawan nasi goreng melia 90rb tanggal 2 nov');
  const peringatan = await kirim(G_KELUAR, PIC, 'makan siang 90rb tanggal 4 nov');
  assert.match(peringatan, /nominalnya sama dengan catatan lama.*Lama: \*T0001\*/s);

  // Tanpa kata "catat" (reply koreksi saja): catatan baru langsung dicatat dengan koreksinya; T0001 tidak diubah
  const r = await kirim(G_KELUAR, PIC, '', { kutipan: { teks: peringatan }, text: 'uang melia' });
  assert.match(r, /T0002 makan siang - \*Rp 90.000\*/i);
  const semua = await store.all('Transaksi');
  assert.equal(semua.length, 2);
  const baru = semua.find((t) => t.id === 'T0002');
  assert.equal(baru.dibayar_oleh, 'Melia');
  assert.equal(baru.tanggal, '2026-11-04');
  assert.equal(Number(baru.nominal), 90000);
  assert.equal(semua.find((t) => t.id === 'T0001').dibayar_oleh, 'Budi');
  // Peringatan yang sudah dijawab: reply koreksi berikutnya tidak mengubah catatan lama
  const r0 = await kirim(G_KELUAR, PIC, '', { kutipan: { teks: peringatan }, text: 'uang valen' });
  assert.match(r0, /sudah tidak tersimpan/);
  assert.equal((await store.all('Transaksi')).find((t) => t.id === 'T0001').dibayar_oleh, 'Budi');

  // Tanpa reply juga bisa: "catat tanggal 5 nov"
  await kirim(G_KELUAR, PIC, 'makan malam 90rb');
  assert.match(await kirim(G_KELUAR, PIC, 'catat tanggal 5 nov'), /T0003/);
  assert.equal((await store.all('Transaksi')).find((t) => t.id === 'T0003').tanggal, '2026-11-05');
});

test('foto bukti trf untuk catatan dobel: nominal & tanggal dicek', async () => {
  const { store, kirim, ctx } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  await kirim(G_KELUAR, PIC, 'Hotel valen tanggal 2 nov 1081.171k');
  const foto = (teks) => ({ adaFoto: true, ambilFoto: async () => Buffer.from(teks) });
  ctx.bacaGambar = async (buf) => buf.toString();
  const jumlah = async () => (await store.all('Transaksi')).length;

  // Tanggal di bukti sama dengan catatan lama -> tidak dicatat lagi
  assert.match(await kirim(G_KELUAR, PIC, 'Hotel 1081.171k'), /Tanggalnya beda/);
  const r1 = await kirim(G_KELUAR, PIC, '', foto('Transfer Berhasil\n02 Nov 2026 14:32\nRp 1.081.171'));
  assert.match(r1, /sama dengan \*T0001\*.*tidak saya catat lagi/s);
  assert.equal(await jumlah(), 1);

  // Tanggal di bukti beda -> dicatat dengan tanggal bukti
  await kirim(G_KELUAR, PIC, 'Hotel 1081.171k');
  const r2 = await kirim(G_KELUAR, PIC, '', foto('BRImo\nTanggal 03/11/2026\nNominal IDR 1,081,171.00'));
  assert.match(r2, /cocok dengan bukti.*dicatat.*T0002 Hotel/s);
  const t2 = (await store.all('Transaksi')).find((t) => t.id === 'T0002');
  assert.equal(t2.tanggal, '2026-11-03');
  assert.equal(t2.sumber, 'foto bukti');

  // Nominal tidak ada di bukti -> tetap ditanya; "batal" -> tidak dicatat
  const peringatan = await kirim(G_KELUAR, PIC, 'Hotel 1081.171k');
  assert.match(await kirim(G_KELUAR, PIC, '', { ...foto('Rp 50.000 03 Nov 2026'), kutipan: { teks: peringatan } }), /tidak ada\* di bukti/);
  assert.match(await kirim(G_KELUAR, PIC, 'batal'), /tidak dicatat \(dobel/);
  assert.equal(await jumlah(), 2);

  // Foto tidak terbaca
  ctx.bacaGambar = async () => null;
  await kirim(G_KELUAR, PIC, 'Hotel 1081.171k');
  const p2 = await kirim(G_KELUAR, PIC, 'Hotel 1081.171k');
  assert.match(await kirim(G_KELUAR, PIC, '', { ...foto('x'), kutipan: { teks: p2 } }), /belum bisa saya baca/);
  assert.match(await kirim(G_KELUAR, PIC, '', foto('x')), /tidak terbaca dari foto/);
});

test('baca bukti: nominal & tanggal dari teks OCR', async () => {
  const { bacaBukti } = await import('../src/bukti.js');
  assert.deepEqual(bacaBukti('Transfer Berhasil\n22 Sep 2026 » 14:32:10 WITA\nRp 1.081.171\nBCA 1234567890\nNo. Referensi\n2026092214321055\nTotal\nRp1.081.171,00'),
    { nominal: [1081171], tanggal: '2026-09-22' });
  assert.deepEqual(bacaBukti('BRImo\nTanggal 05/10/2026 09:12\nNominal IDR 222,540.00\nBiaya IDR 2,500.00'), { nominal: [222540, 2500], tanggal: '2026-10-05' });
  assert.equal(bacaBukti('2026-10-07 transfer Rp 50.000').tanggal, '2026-10-07');
});


// Event yang mulai setelah aturan struk berlaku (8 Nov 2026).
const BLOK_BARU = BLOK_EVENT.replace('Tanggal: 2-8 Nov 2026', 'Tanggal: 9-15 Nov 2026');

// Hari laporan di tes struk: 10 Nov 2026 (di dalam masa event 9-15 Nov).
const WAKTU_STRUK = new Date('2026-11-10T07:00:00Z');
function setupStruk() {
  const s = setup();
  s.ctx.wajibStruk = true;
  s.ctx.bacaGambar = async (buf) => buf.toString();
  const kirimAsli = s.kirim;
  s.kirim = (g, p, t, extra = {}) => kirimAsli(g, p, t, { waktu: WAKTU_STRUK, ...extra });
  return s;
}
const fotoStruk = (teks) => ({ adaFoto: true, ambilFoto: async () => Buffer.from(teks) });
const KFC = 'KFC LOMBOK EPICENTRUM\n10/11/2026 12:30\nBucket Rp 150.000\nTotal Rp 150.000';
const PECEL = 'RM PECEL AYAM BU SRI\n10/11/2026\nTotal 150.000';
const GRAB = 'Grab\nTrip completed 10 Nov 2026\nTotal Rp 150.000\nBooking ID 123456789012';

test('struk: >= 100rb tanpa struk ditahan; foto struk yang sesuai -> masuk pembukuan', async () => {
  const { store, kirim } = setupStruk();
  await kirim(G_KELUAR, OWNER, BLOK_BARU);
  const r = await kirim(G_KELUAR, PIC, 'makan KFC 150rb');
  assert.match(r, /wajib struk.*P0001 makan KFC/s);
  assert.equal((await store.all('Transaksi')).length, 0);
  // reply foto struk KFC
  const ok = await kirim(G_KELUAR, PIC, '', { ...fotoStruk(KFC), kutipan: { teks: r } });
  assert.match(ok, /Struk sesuai.*T0001 makan KFC.*struk ✓/s);
  const t = (await store.all('Transaksi'))[0];
  assert.equal(t.bukti, 'Struk ✓');
  assert.equal(t.tanggal, '2026-11-10');
  assert.equal(t.pengirim.includes(PIC), true);
  assert.equal((await store.all('Struk')).length, 1);
});

test('struk: KFC tapi struk pecel ayam / grab tapi struk KFC ditolak & ditanya; owner acc', async () => {
  const { store, kirim } = setupStruk();
  await kirim(G_KELUAR, OWNER, BLOK_BARU);
  const r1 = await kirim(G_KELUAR, PIC, 'makan KFC 150rb', fotoStruk(PECEL));
  assert.match(r1, /Struk tidak sesuai.*menyebut \*KFC\*.*PECEL AYAM.*penjelasannya di grup/s);
  const r2 = await kirim(G_KELUAR, PIC, 'grab ke venue 150rb', fotoStruk(KFC));
  assert.match(r2, /Kategori pengeluaran \*Transport & Ekspedisi\*, tapi struknya \*Konsumsi\*/);
  assert.equal((await store.all('Transaksi')).length, 0);
  // penjelasan dari PIC, lalu owner acc
  assert.match(await kirim(G_KELUAR, PIC, '', { kutipan: { teks: r1 }, text: 'KFC nya tutup jadi beli pecel ayam' }), /Penjelasan dicatat untuk P0001/);
  assert.match(await kirim(G_KELUAR, PIC, '', { kutipan: { teks: r1 }, text: 'acc' }), /Hanya \*owner\*/);
  const acc = await kirim(G_KELUAR, OWNER, '', { kutipan: { teks: r1 }, text: 'acc' });
  assert.match(acc, /Disetujui owner.*T0001 makan KFC \(KFC nya tutup/s);
  assert.equal((await store.all('Transaksi'))[0].bukti, 'ACC owner (struk tidak sesuai)');
  // salah input -> batal
  assert.match(await kirim(G_KELUAR, PIC, '', { kutipan: { teks: r2 }, text: 'batal' }), /Tidak dicatat: P0002/);
  assert.equal((await store.all('Transaksi')).length, 1);
});

test('struk: struk kembar ditolak; nominal beda ditolak; tanggal di luar masa event ditolak', async () => {
  const { store, kirim } = setupStruk();
  await kirim(G_KELUAR, OWNER, BLOK_BARU);
  assert.match(await kirim(G_KELUAR, PIC, 'grab ke venue 150rb', fotoStruk(GRAB)), /T0001 grab ke venue.*struk ✓/s);
  assert.match(await kirim(G_KELUAR, PIC, 'grab pulang 150rb', fotoStruk(GRAB)), /sudah pernah dipakai\* untuk T0001/);
  assert.match(await kirim(G_KELUAR, PIC, 'grab pulang 120rb', fotoStruk('Grab\n10 Nov 2026\nTotal Rp 150.000\nID 99999999999')), /Nominal Rp 120.000 tidak ada di struk/);
  assert.match(await kirim(G_KELUAR, PIC, 'grab 150rb', fotoStruk('Grab\n01 Jan 2026\nTotal Rp 150.000\nID 77777777777')), /di luar batas/);
  assert.equal((await store.all('Transaksi')).length, 1);
  // struk dari catatan yang dibatalkan boleh dipakai lagi
  await kirim(G_KELUAR, OWNER, '#batal T0001');
  assert.match(await kirim(G_KELUAR, PIC, 'grab ke venue 150rb', fotoStruk(GRAB)), /T0002 grab ke venue/);
});

test('struk: owner tidak wajib struk; cash < 100rb dengan keterangan umum ditanya detail', async () => {
  const { store, kirim } = setupStruk();
  await kirim(G_KELUAR, OWNER, BLOK_BARU);
  assert.match(await kirim(G_KELUAR, OWNER, 'hotel 300rb'), /T0001 hotel/);
  assert.equal((await store.all('Transaksi'))[0].bukti, 'Tanpa struk (input owner)');
  assert.match(await kirim(G_KELUAR, PIC, 'lakban 20rb'), /T0002 lakban/);
  const r = await kirim(G_KELUAR, PIC, 'belanja 45rb');
  assert.match(r, /detailnya belum jelas.*P0001 belanja/s);
  assert.match(await kirim(G_KELUAR, PIC, '', { kutipan: { teks: r }, text: 'beli' }), /Masih kurang jelas/);
  assert.match(await kirim(G_KELUAR, PIC, '', { kutipan: { teks: r }, text: 'lakban & plastik di toko Maju' }), /T0003 belanja \(lakban & plastik di toko Maju\)/);
  // banyak item: yang < 100rb langsung, yang >= 100rb ditahan
  const m = await kirim(G_KELUAR, PIC, 'parkir 5rb, hotel valen 350rb');
  assert.match(m, /T0004 parkir.*wajib struk.*hotel valen/s);
  // owner acc tanpa reply kalau hanya satu yang menunggu
  assert.match(await kirim(G_KELUAR, OWNER, 'acc'), /Disetujui owner:\* P0002.*hotel valen/s);
  assert.equal((await store.all('Transaksi')).find((t) => t.keterangan === 'hotel valen').bukti, 'ACC owner (tanpa struk)');
});

test('struk: event yang sudah berjalan sebelum aturan struk tidak ditahan', async () => {
  const { store, kirim } = setupStruk();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT.replace('Tanggal: 2-8 Nov 2026', 'Tanggal: 24 Sep - 11 Okt 2026'));
  assert.match(await kirim(G_KELUAR, PIC, 'hotel valen 350rb'), /T0001 hotel valen/);
  assert.equal((await store.all('Transaksi'))[0].bukti, '');
});

test('event yang sudah selesai: mode rekap data lama, omzet per tanggal sekaligus, tim terbaca benar', async () => {
  const { store, kirim } = setup();
  const blok = `#event
Kode: BAL26-09
Kota: Bali
IO: Jangkrik kuliner
Tanggal: 23 Sep - 4 Okt 2026
Wilayah harga: Jawa
Bagi hasil: 30%
Admin: 0
PIC: Melia
Senior: Dena, tiar veri, dan dw1
DW: Dw nya hanya1 100k harga nya
Kasir: Dena atau tiar`;
  const r = await kirim(G_KELUAR, OWNER, blok);
  assert.match(r, /sudah selesai.*mode REKAP DATA LAMA.*tidak perlu/s);
  assert.doesNotMatch(r, /Hanya harga|Tetap 1|Dena atau tiar - Kasir/);
  const tim = (await store.all('Tim Event')).map((o) => `${o.nama}/${o.peran}`);
  assert.deepEqual(tim, ['Melia/PIC', 'Dena/Tetap', 'Tiar veri/Tetap', 'DW 1/DW']);
  assert.match(await kirim(G_KELUAR, OWNER, 'Okk sekarang kita rekapn pengeluaran ya, ini event yang sudah selesai'), /Siap!.*mode REKAP/s);
  const o = await kirim(G_KELUAR, OWNER, '#omzet 23 sept 12,5jt\n24 sept 15jt\n25 sept 9.750.000');
  assert.match(o, /Omzet 3 hari tercatat.*2026-09-23: Rp 12.500.000.*2026-09-25: Rp 9.750.000.*Total omzet event: \*Rp 37.250.000\*/s);
  assert.equal((await store.all('Omzet')).length, 3);
  assert.match(await kirim(G_KELUAR, OWNER, '#omzet 26 sept 11jt'), /Omzet 2026-09-26 tercatat/);
});

test('status event: belum mulai dan sedang berjalan', async () => {
  const { kirim } = setup();
  const belum = await kirim(G_KELUAR, OWNER, BLOK_EVENT.replace('Tanggal: 2-8 Nov 2026', 'Tanggal: 20-28 Nov 2026'));
  assert.match(belum, /belum mulai.*persiapan.*#daftar event JMB26-11/s);
  const { kirim: k2 } = setup();
  assert.match(await k2(G_KELUAR, OWNER, BLOK_EVENT), /sedang berjalan/);
});

test('foto bukti trf dengan caption tanpa harga: nominal & tanggal dibaca dari foto', async () => {
  const { store, kirim, ctx } = setup();
  ctx.bacaGambar = async (buf) => buf.toString();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  const foto = (t) => ({ adaFoto: true, ambilFoto: async () => Buffer.from(t) });
  const r = await kirim(G_KELUAR, PIC, 'Dp penginapan bali', foto('IDR 530,000.00\nNama Penerima YULIANTI\nRekening Tujuan 236 - 026 - 8929\n03 Nov 2026'));
  assert.match(r, /T0001 Dp penginapan bali - \*Rp 530.000\* \[Penginapan.*Dibaca dari foto/s);
  assert.equal((await store.all('Transaksi'))[0].tanggal, '2026-11-03');
  // pesan susulan "Uang mami" berlaku untuk catatan itu
  assert.match(await kirim(G_KELUAR, PIC, 'Uang mama'), /Sudah diubah.*uang Mama/s);
  // foto tanpa caption: ditanya untuk apa
  assert.match(await kirim(G_KELUAR, PIC, '', foto('Total Rp 75.000')), /terbaca \*Rp 75.000\*.*untuk apa/s);
  // struk dengan beberapa angka: ambil baris total
  const { nominalUtama } = await import('../src/bukti.js');
  assert.equal(nominalUtama('Nasi 25.000\nEs teh 5.000\nTOTAL Rp 30.000\nTunai 50.000\nKembali 20.000'), 30000);
});

test('foto tanpa caption: struk jelas langsung dicatat, bukti transfer polos ditanya', async () => {
  const { store, kirim, ctx } = setup();
  ctx.bacaGambar = async (buf) => buf.toString();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  const foto = (t) => ({ adaFoto: true, ambilFoto: async () => Buffer.from(t) });
  assert.match(await kirim(G_KELUAR, PIC, '', foto('ShopeeFood\nPesanan selesai\nAyam Geprek\nTotal Rp 65.500\n04 Nov 2026')),
    /T0001 ShopeeFood - \*Rp 65.500\* \[Konsumsi.*Dibaca dari foto/s);
  assert.equal((await store.all('Transaksi'))[0].tanggal, '2026-11-04');
  assert.match(await kirim(G_KELUAR, PIC, '', foto('Grab\nTrip completed\nTotal Rp 35.000')), /T0002 Grab - \*Rp 35.000\* \[Transport/);
  assert.match(await kirim(G_KELUAR, PIC, '', foto('IDR 530,000.00\nNama Penerima YULIANTI\nTransfer ke rekening BCA')), /terbaca \*Rp 530.000\*, tapi belum jelas.*untuk apa/s);
  assert.equal((await store.all('Transaksi')).length, 2);
  // dijawab -> dicatat
  assert.match(await kirim(G_KELUAR, PIC, 'dp penginapan bali'), /dp penginapan bali - \*Rp 530.000\* \[Penginapan/);
});

test('screenshot daftar pesanan Shopee: satu catatan per pesanan; jawaban "untuk apa" boleh dari anggota lain', async () => {
  const { store, kirim, ctx } = setup();
  ctx.bacaGambar = async (buf) => buf.toString();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  const foto = (t) => ({ adaFoto: true, ambilFoto: async () => Buffer.from(t) });
  const shopee = `Semua  BelumBayar Dikemas Dikirim Sel
ISTANA_ELECTRONIC Dikemas
vere ‘ @ VOSCO Lampu Led Jumbo ultra 60...
a2
s2o0 % GOW Rp58.750
Total 2 produk: Rp117.658
Estimasi Tiba: 24 Sep - 27 Sep
Hubungi Penjual
Gudang Lakban Semarang Dikemas
Harmony Lakban 45 mm x 300 Yar...
x5
Rpt5-533 Rp15.123
Total 5 produk: Rp76.482`;
  const r = await kirim(G_KELUAR, PIC, '', foto(shopee));
  assert.match(r, /T0001 VOSCO Lampu Led Jumbo ultra 60 x2 \(ISTANA_ELECTRONIC\) - \*Rp 117.658\* \[Barang Kering Non-Konsumtif/);
  assert.match(r, /T0002 Harmony Lakban 45 mm x 300 Yar x5 \(Gudang Lakban Semarang\) - \*Rp 76.482\* \[Barang Kering Konsumtif/);
  // Bukti transfer polos dari PIC; yang menjawab owner dengan reply -> tercatat atas nama PIC
  const t = await kirim(G_KELUAR, PIC, '', foto('IDR 45,000.00\nTransfer ke rekening BCA'));
  assert.match(t, /Pengeluaran \*Rp 45.000\* ini untuk apa/);
  const j = await kirim(G_KELUAR, OWNER, '', { kutipan: { teks: t }, text: 'Itu untuk lakban' });
  assert.match(j, /T0003 lakban - \*Rp 45.000\*/);
  assert.match((await store.all('Transaksi'))[2].pengirim, new RegExp(PIC));
  // pertanyaan lama untuk PIC sudah ditutup: pesan PIC berikutnya tidak dianggap jawaban
  assert.equal(await kirim(G_KELUAR, PIC, 'oke siap'), '');
});

test('batas tanggal: transaksi hanya 2 hari sebelum s/d 2 hari sesudah event; owner bisa acc', async () => {
  const { store, kirim } = setupStruk();
  await kirim(G_KELUAR, OWNER, BLOK_BARU); // 9-15 Nov -> batas 7-17 Nov
  const foto = (t) => ({ adaFoto: true, ambilFoto: async () => Buffer.from(t) });
  assert.match(await kirim(G_KELUAR, PIC, 'lakban 6 nov 20rb'), /2026-11-06 di luar batas \(2026-11-07 s\/d 2026-11-17\).*tidak bisa dimasukkan/s);
  assert.match(await kirim(G_KELUAR, PIC, 'lakban 7 nov 20rb'), /T0001 lakban/);
  assert.match(await kirim(G_KELUAR, PIC, 'lakban 17 nov 20rb'), /T0002 lakban/);
  assert.match(await kirim(G_KELUAR, PIC, 'grab 150rb', foto('Grab\n01 Nov 2026\nTotal Rp 150.000\nID 88888888888')), /Tanggal struk 2026-11-01 di luar batas/);
  // laporan terlambat tanpa tanggal (hari laporan 20 Nov) juga ditolak
  assert.match(await kirim(G_KELUAR, PIC, 'lakban 20rb', { waktu: new Date('2026-11-20T07:00:00Z') }), /2026-11-20 di luar batas/);
  // daftar pesanan online tanpa tanggal pesan -> minta detail pesanan
  const shopee = 'Toko Plastik Dikemas\nKantong plastik besar sekali\nx2\nTotal 2 produk: Rp40.000';
  assert.match(await kirim(G_KELUAR, PIC, '', foto(shopee)), /Waktu Pemesanan/);
  // owner tetap bisa acc
  assert.match(await kirim(G_KELUAR, OWNER, 'acc P0001'), /Disetujui owner.*lakban/s);
  assert.equal((await store.all('Transaksi')).length, 3);
});

test('reply koreksi deposit: biaya = transfer - deposit; tidak jadi catatan baru', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  const r = await kirim(G_KELUAR, PIC, 'Penginapan veri 500rb');
  const k = await kirim(G_KELUAR, OWNER, '', { kutipan: { teks: r }, text: 'Penginapan veri bukan500k, total dari trf 2620k itu termasuk deposit 500k yang nantinya setelah check out dikembalikan' });
  assert.match(k, /Sudah diubah\* \(nominal Rp 2.120.000\).*trf Rp 2.620.000 termasuk deposit Rp 500.000/s);
  assert.equal((await store.all('Transaksi')).length, 1);
  // tidak jelas -> ditanya, tidak dicatat
  assert.match(await kirim(G_KELUAR, OWNER, '', { kutipan: { teks: r }, text: 'bukan 500k tapi 450k dan 50k' }), /tidak saya catat/);
  assert.equal((await store.all('Transaksi')).length, 1);
});

test('peringatan dobel tidak menelan foto bukti transfer lain', async () => {
  const { store, kirim, ctx } = setup();
  ctx.bacaGambar = async (buf) => buf.toString();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  await kirim(G_KELUAR, PIC, 'lampu 117.658');
  assert.match(await kirim(G_KELUAR, PIC, 'lampu led 117.658'), /nominalnya sama dengan catatan lama/);
  const foto = (t) => ({ adaFoto: true, ambilFoto: async () => Buffer.from(t) });
  // foto bukti lain (nominal beda) -> diproses sebagai pengeluaran baru (ditanya untuk apa)
  assert.match(await kirim(G_KELUAR, PIC, '', foto('IDR 600,000.00\nTransfer ke rekening BCA\n21 Sep 2026')), /Rp 600.000\*, tapi belum jelas/);
  assert.equal((await store.all('Transaksi')).length, 1);
});

test('foto bukti: "dikurangi 500k jadi 2120k uang melia" mengubah nominal, lalu ditanya untuk apa', async () => {
  const { store, kirim, ctx } = setup();
  ctx.bacaGambar = async (buf) => buf.toString();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  const foto = (t) => ({ adaFoto: true, ambilFoto: async () => Buffer.from(t) });
  assert.match(await kirim(G_KELUAR, PIC, '', foto('IDR 2,620,000.00\nTransfer ke rekening BCA')), /Rp 2.620.000\* ini untuk apa/);
  const r = await kirim(G_KELUAR, PIC, 'Biaya total bukan 2620k tapi dokurangi 500k hadi total nya 2120k uang melia');
  assert.match(r, /nominal jadi \*Rp 2.120.000\* \(Rp 2.620.000 dikurangi Rp 500.000\), uang Melia.*ini untuk apa/s);
  assert.equal((await store.all('Transaksi')).length, 0);
  assert.match(await kirim(G_KELUAR, PIC, 'hotel'), /T0001 hotel - \*Rp 2.120.000\* \[Penginapan\] \(uang Melia\)/);

  // jawaban lewat reply oleh orang lain memakai nominal & uang siapa yang baru
  const q = await kirim(G_KELUAR, PIC, '', foto('IDR 1,000,000.00\nTransfer ke rekening BCA'));
  const r2 = await kirim(G_KELUAR, PIC, 'dikurangi deposit 300k uang melia');
  assert.match(r2, /nominal jadi \*Rp 700.000\*/);
  assert.match(await kirim(G_KELUAR, OWNER, '', { kutipan: { teks: r2 }, text: 'kos karyawan' }), /T0002 kos karyawan - \*Rp 700.000\*.*uang Melia/s);
  assert.ok(q);
  // langsung dengan keterangan
  await kirim(G_KELUAR, PIC, '', foto('IDR 900,000.00\nTransfer ke rekening BCA'));
  assert.match(await kirim(G_KELUAR, PIC, 'villa dikurangi deposit 200k'), /T0003 villa - \*Rp 700.000\*/);
});

test('reply ke foto yang sudah tercatat tidak mencatat dua kali; "38" di reply foto = 38rb', async () => {
  const { store, kirim, ctx } = setup();
  ctx.bacaGambar = async () => 'struk buram';
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  const foto = { id: 'foto1', adaFoto: true, ambilFoto: async () => Buffer.from('x') };
  await kirim(G_KELUAR, PIC, 'Makan mama', foto);
  assert.equal((await store.all('Transaksi')).length, 0);
  const kutipFoto = { kutipan: { teks: 'Makan mama', id: 'foto1', foto: true } };
  assert.match(await kirim(G_KELUAR, PIC, '', { ...kutipFoto, text: 'Makan mama 38 uang melia ya' }), /T0001 Makan mama - \*Rp 38.000\*.*uang Melia/s);
  // reply lagi ke foto yang sama: tidak dicatat lagi
  assert.match(await kirim(G_KELUAR, PIC, '', { ...kutipFoto, text: 'Uang melia untuk makan 38k ya' }), /sudah tercatat\*, tidak saya catat lagi.*T0001/s);
  assert.match(await kirim(G_KELUAR, PIC, '', { ...kutipFoto, text: 'harusnya 40rb' }), /Sudah diubah.*Rp 40.000/s);
  assert.equal((await store.all('Transaksi')).length, 1);
});

test('pertanyaan kategori tidak menangkap reply ke pesan lain', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  assert.match(await kirim(G_KELUAR, PIC, 'mkn siang krywn 60rb'), /T0001/);
  const sebelum = (await store.all('Transaksi'))[0].kategori;
  await kirim(G_KELUAR, PIC, '', { kutipan: { teks: 'Foto lain', id: 'zz' }, text: 'masuk transport' });
  assert.equal((await store.all('Transaksi'))[0].kategori, sebelum);
});

test('reply "ini pengeluaran makan" / "ini untuk makan bukan influencer" mengganti keterangan & kategori', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  const r = await kirim(G_KELUAR, PIC, 'Influencer 1 54rb');
  assert.match(await kirim(G_KELUAR, PIC, '', { kutipan: { teks: r }, text: 'Ini pengeluaran makan pakai uang melia' }),
    /Sudah diubah\* \(keterangan "Makan", uang Melia, kategori Konsumsi\)/);
  const r2 = await kirim(G_KELUAR, PIC, 'Influencer 2 60rb');
  assert.match(await kirim(G_KELUAR, PIC, '', { kutipan: { teks: r2 }, text: 'Ini untuk makam bukan influencer, kategorinya diganti jadi konsumsi' }), /keterangan "Makan".*kategori Konsumsi/s);
  const t = await store.all('Transaksi');
  assert.deepEqual(t.map((x) => [x.keterangan, x.kategori]), [['Makan', 'Konsumsi'], ['Makan', 'Konsumsi']]);
});

test('tanya-jawab setup event boleh dijawab siapa pun di grup', async () => {
  const { store, kirim } = setup();
  assert.match(await kirim(G_KELUAR, OWNER, '#eventbaru'), /\(1\/13\) Lokasi/);
  assert.match(await kirim(G_KELUAR, KARYAWAN, 'Semarang'), /Kota: Semarang.*\(2\/13\)/s);
  assert.match(await kirim(G_KELUAR, PIC, 'Jangkrik Kuliner'), /\(3\/13\)/);
  assert.match(await kirim(G_KELUAR, KARYAWAN, '#eventbaru'), /khusus owner/);
  assert.equal((await store.all('Event')).length, 0);
});

test('pengiriman & stok awal: ditanya di grup pengeluaran setelah grup tim didaftarkan; harga tidak ke grup tim', async () => {
  const { store, ctx } = setup();
  const { isiHargaAwal } = await import('../src/main.js');
  await isiHargaAwal(store);
  let n = 0;
  const kirimRaw = (groupId, senderId, text) => handlePesan(ctx, { id: `k${++n}`, groupId, groupName: groupId, senderId, senderName: senderId === OWNER ? 'George' : 'Budi', text, adaFoto: false, waktu: WAKTU });
  const teks = async (...a) => (await kirimRaw(...a)).map((r) => r.text).join('\n');
  await teks(G_KELUAR, OWNER, BLOK_EVENT); // event 2-8 Nov, hari ini 3 Nov (berjalan)
  const daftar = await kirimRaw(G_TIM, OWNER, '#daftar event JMB26-11');
  const keKeluar = daftar.filter((b) => b.groupId === G_KELUAR);
  assert.equal(keKeluar.length, 1);
  assert.match(keKeluar[0].text, /\(1\/6\).*penanggung jawab pengiriman/s);
  assert.match(daftar.filter((b) => !b.groupId).map((b) => b.text).join('\n'), /grup event.*Tim JMB26-11/s);
  // pengeluaran biasa & obrolan tetap jalan selama pertanyaan pengiriman menunggu
  assert.match(await teks(G_KELUAR, PIC, 'lalamove 150k'), /T0001 lalamove/);
  assert.equal(await teks(G_KELUAR, PIC, 'oke pak siap'), '');
  // karyawan mengirim daftar barang kering di grup tim (seperti di WhatsApp): disimpan
  const LIST = 'CPS Barang Dry Semarang\n\n1. Freezer\n2. Box L\n3. Lampu display depan\n4. Meja besi 2\n5. Color box 300kg ( kompor 3 )\n6. Color box 200kg ( prabotan masak, hexos,\n kain hitam )\n7. Styrofoam keju balok ( Frozen )';
  assert.match(await teks(G_TIM, '6289999999999', LIST), /Daftar barang.*7 barang \(1 di antaranya frozen\).*isi bahan kering/s);
  assert.match(await teks(G_KELUAR, PIC, 'Imam'), /\(2\/6\)/);
  assert.match(await teks(G_KELUAR, PIC, '2'), /\(3\/6\).*bahan kering/s);
  assert.match(await teks(G_KELUAR, OWNER, '7'), /\(4\/6\).*isi bahan kering.*Sudah ada daftar.*7 barang.*Balas \*ya\*/s);
  assert.match(await teks(G_KELUAR, PIC, 'ya'), /\(5\/6\).*koli bahan baku/s);
  assert.match(await teks(G_KELUAR, PIC, '4'), /\(6\/6\).*isi bahan baku/s);
  const cek = await teks(G_KELUAR, PIC, 'keju 5 balok, bumbu garlic 3 pack, packaging 886 pcs');
  assert.match(cek, /Kereta \(transit\).*7 koli.*1\. Freezer.*6\. Color box 200kg \( prabotan masak, hexos, kain hitam \).*4 koli.*Mozzarella 5 pack.*Bumbu Garlic 3 pack.*packaging 886 pcs/s);
  const hasil = await kirimRaw(G_KELUAR, PIC, 'ya');
  assert.equal(hasil.length, 1);
  assert.match(hasil[0].text, /Mozzarella 5 pack × Rp 234.000 = \*Rp 1.170.000\*.*Total nilai bahan baku: Rp 2.670.000/s);
  const bahan = await store.all('Bahan Event');
  assert.deepEqual(bahan.map((b) => [b.bahan, b.gerak, b.jumlah]), [['Mozzarella', 'Keluar', 5], ['Bumbu Garlic', 'Keluar', 3]]);
  assert.match((await store.all('Pengiriman'))[0].isi_kering, /^Freezer; Box L; .*Styrofoam keju balok \( Frozen \)$/);
  assert.equal((await store.all('Pengiriman'))[0].moda, 'Kereta (transit)');
});

test('pengiriman: daftar barang bernomor dikirim saat ditanya langsung dipakai sebagai isi bahan kering', async () => {
  const { store, ctx } = setup();
  let n = 0;
  const teks = async (g, s, text) => (await handlePesan(ctx, { id: `d${++n}`, groupId: g, groupName: g, senderId: s, senderName: 'Alam', text, adaFoto: false, waktu: WAKTU })).map((r) => r.text).join('\n');
  await teks(G_KELUAR, OWNER, BLOK_EVENT);
  await teks(G_TIM, OWNER, '#daftar event JMB26-11');
  assert.match(await teks(G_TIM, OWNER, '#kirim'), /\(1\/6\)/);
  await teks(G_TIM, PIC, 'Alam');
  // daftar dikirim saat bot masih menanyakan moda: daftar tercatat, pertanyaan moda tetap menunggu
  const r = await teks(G_TIM, PIC, 'Barang Dry\n1. Freezer\n2. Box L\n3. Tangga\n4. Troli');
  assert.match(r, /Isi bahan kering tercatat: \*4 barang\*.*\(2\/6\)/s);
  assert.match(await teks(G_TIM, PIC, 'truk'), /\(3\/6\)/);
  assert.match(await teks(G_TIM, PIC, '4'), /\(5\/6\).*bahan baku/s); // isi kering sudah ada, tidak ditanya lagi
  assert.match(await teks(G_TIM, PIC, '0'), /Cek data.*4 koli.*1\. Freezer.*4\. Troli/s);
  // daftar pengeluaran bernomor dengan nominal tetap dicatat sebagai pengeluaran
  assert.match(await teks(G_KELUAR, PIC, 'Belanja\n1. lakban 20rb\n2. tali 15rb\n3. plastik 30rb'), /lakban/);
  assert.equal((await store.all('Pengiriman')).length, 0);
});

test('anggota grup tim: tiap karyawan menyebut namanya, nomor pengirim tercatat otomatis', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, `${BLOK_EVENT}\nSenior: Dena, Tiar veri\nDW: 2 orang`);
  const r = await kirim(G_TIM, OWNER, '#daftar event JMB26-11');
  assert.match(r, /Tim JMB26-11.*2\. Dena \(Tetap\).*4\. DW 1 \(DW\).*balas nama sendiri/s);
  assert.match(await kirim(G_TIM, '6284444444444', 'saya Dena'), /Dena\* \(Tetap\) → 084444444444.*Belum: Budi, Tiar veri, DW 1, DW 2/s);
  assert.match(await kirim(G_TIM, '6285555555555', '3'), /Tiar veri\* \(Tetap\) → 085555555555/);
  assert.match(await kirim(G_TIM, '6286666666666', 'saya Joko DW'), /Joko\* \(DW\) → 086666666666 \(menggantikan DW 1\)/);
  assert.match(await kirim(G_TIM, '6287777777777', 'saya Rina'), /belum ada di tim.*saya Rina DW/s);
  assert.equal(await kirim(G_TIM, '6287777777777', 'besok booth buka jam berapa ya'), ''); // obrolan biasa diabaikan
  const k = await store.all('Karyawan');
  assert.deepEqual(k.map((x) => [x.nama, x.nomor_wa, x.peran]), [['Dena', '084444444444', 'Tetap'], ['Tiar veri', '085555555555', 'Tetap'], ['Joko', '086666666666', 'DW']]);
  assert.ok((await store.all('Tim Event')).some((o) => o.nama === 'Joko' && o.peran === 'DW'));
  assert.match(await kirim(G_TIM, OWNER, '#anggota'), /2\. Dena \(Tetap\) ✅/);
});

test('anggota: nama WhatsApp dicocokkan otomatis; owner bisa menempel daftar nama + nomor (#karyawan)', async () => {
  const { store, kirim, ctx } = setup();
  await kirim(G_KELUAR, OWNER, `${BLOK_EVENT}\nSenior: Alam, Dena, Tiar veri\nDW: 1 orang`);
  // Alam pernah chat di grup dengan nama WA "Alam (Karyawan Cheesy Banjarmasin)"
  await kirim(G_TIM, '6281111110001', 'halo semua', { senderName: 'Alam (Karyawan Cheesy Banjarmasin)' });
  ctx.anggotaGrup = async () => [
    { nomor: OWNER }, { nomor: '6281111110001' }, { nomor: '6281111110002' }, { nomor: '6281111110003' },
  ];
  const r = await kirim(G_TIM, OWNER, '#daftar event JMB26-11');
  assert.match(r, /Dicocokkan dari nama WhatsApp: Alam → 081111110001.*Belum tercatat: \*Budi, Dena, Tiar veri, DW 1\*.*belum dikenal: …0002, …0003/s);
  // Dena chat biasa dengan nama WA "Dena CPS": nomornya tercatat diam-diam
  await kirim(G_TIM, '6281111110002', 'otw booth', { senderName: 'Dena CPS' });
  assert.equal((await store.all('Karyawan')).find((k) => k.nama === 'Dena')?.nomor_wa, '081111110002');
  // owner menempel daftar di grup pengeluaran
  assert.match(await kirim(G_TIM, OWNER, '#karyawan Tiar 0813'), /hanya di grup pengeluaran/);
  const t = await kirim(G_KELUAR, OWNER, '#karyawan\n1. Tiar veri 0812-2222-3333\nRina: 081244445555 kasir\nbudi');
  assert.match(t, /Tiar veri \(Tetap\) → 081222223333.*Rina \(Kasir\) → 081244445555 _\(baru\)_.*Tidak terbaca: budi/s);
  assert.match(await kirim(G_KELUAR, OWNER, '#karyawan'), /Data karyawan.*Alam.*081111110001.*belum bernomor: \*Budi, DW 1\*/s);
});

test('"omset bali 125055000jt" tanpa # = omzet (bukan pengeluaran); angka lengkap + jt tidak dikali sejuta', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  const r = await kirim(G_KELUAR, OWNER, 'omset jambi 125055000jt');
  assert.match(r, /Omzet .* tercatat.*Rp 125.055.000/s);
  assert.equal((await store.all('Transaksi')).length, 0);
  assert.equal((await store.all('Omzet'))[0].omzet, 125055000);
});

test('omset bersih (setelah potongan IO) dikembalikan ke omzet kotor; balasan menampilkan kotor, potongan, bersih', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT); // bagi hasil 25%
  const r = await kirim(G_KELUAR, OWNER, 'omset bersih 3 nov 7.500.000');
  assert.match(r, /Omzet kotor: \*Rp 10.000.000\*.*setelah dipotong IO.*Potongan IO 25%: Rp 2.500.000.*Omzet bersih \(ditransfer IO\): \*Rp 7.500.000\*/s);
  assert.equal((await store.all('Omzet'))[0].omzet, 10000000);
  const k = await kirim(G_KELUAR, OWNER, 'omset kotor 4 nov 12jt');
  assert.match(k, /Omzet kotor: \*Rp 12.000.000\*/);
  assert.match(await kirim(G_KELUAR, OWNER, '#rekap'), /Omzet kotor \(2 hari\): Rp 22.000.000.*Omzet bersih \(setelah bagi hasil IO\): Rp 16.500.000/s);
});

test('bahan baku di grup pengeluaran (event selesai): awal, restock bertanggal, sisa + nilai sisa ditanya; oyster = pembelian; masuk #rekap', async () => {
  const { store, ctx, kirim } = setup();
  const { isiHargaAwal } = await import('../src/main.js');
  await isiHargaAwal(store);
  await kirim(G_KELUAR, OWNER, BLOK_EVENT); // 2-8 Nov
  const nanti = { waktu: new Date('2026-11-20T07:00:00Z') }; // event sudah selesai
  const r1 = await kirim(G_KELUAR, OWNER, 'bahan baku pengiriman pertama keju 10 balok, bumbu garlic 5 pack, oyster 100 kg', nanti);
  assert.match(r1, /pengiriman pertama\* \(JMB26-11\) – tgl 2026-11-02.*Mozzarella 10 pack × Rp 234.000 = Rp 2.340.000/s);
  assert.match(r1, /Oyster 100 kg\* tidak dicatat sebagai bahan gudang.*pengeluaran pembelian.*oyster 100 kg 3,9jt/s);
  assert.ok(!(await store.all('Bahan Event')).some((b) => b.bahan === 'Oyster'));
  assert.match(await kirim(G_KELUAR, OWNER, 'restock keju 3 balok 5 nov', nanti), /tgl 2026-11-05.*awal 10 \+ restock 3 = 13/s);
  // sisa: bot bertanya nilainya
  const r3 = await kirim(G_KELUAR, OWNER, 'sisah keju 2 balok, bumbu garlic 1 pack', nanti);
  assert.match(r3, /tgl 2026-11-08.*terpakai \*11 pack\*.*dihargai berapa per satuan.*Mozzarella 2 pack – harga tab: Rp 234.000\/pack/s);
  // pengeluaran biasa tetap jalan selama pertanyaan menunggu
  assert.match(await kirim(G_KELUAR, OWNER, 'lalamove 150k', nanti), /T0001 lalamove/);
  const r4 = await kirim(G_KELUAR, OWNER, 'keju 200rb, garlic 450rb', nanti);
  assert.match(r4, /Nilai sisa bahan JMB26-11 dicatat.*Mozzarella 2 pack × Rp 200.000 = \*Rp 400.000\*.*Bumbu Garlic 1 pack × Rp 450.000.*Biaya bahan baku event sekarang: Rp 4.692.000/s);
  // sisa oyster (dibeli di lokasi) boleh, mengurangi biaya
  assert.match(await kirim(G_KELUAR, OWNER, 'sisa oyster 5 kg', nanti), /dihargai berapa/);
  assert.match(await kirim(G_KELUAR, OWNER, '10rb', nanti), /Oyster 5 kg × Rp 10.000 = \*Rp 50.000\*/);
  const rekap = await kirim(G_KELUAR, OWNER, '#rekap', nanti);
  assert.match(rekap, /Bahan baku dari gudang \(terpakai\): Rp 4.642.000.*Mozzarella: awal 10 \+ restock 3 − sisa 2 = 11 pack → Rp 2.642.000.*Sisa Oyster \(dibeli di lokasi\) 5 kg: -Rp 50.000/s);
  // dari grup tim: tanpa harga, pertanyaan nilai sisa dikirim ke grup pengeluaran
  await kirim(G_TIM, OWNER, '#daftar event JMB26-11', nanti);
  const tim = await kirimRawTim(ctx, G_TIM, PIC, 'sisa keju 1 balok', nanti.waktu);
  assert.doesNotMatch(tim.filter((b) => !b.groupId).map((b) => b.text).join('\n'), /Rp/);
  assert.match(tim.find((b) => b.groupId === G_KELUAR).text, /dihargai berapa/);
});

async function kirimRawTim(ctx, groupId, senderId, text, waktu) {
  return handlePesan(ctx, { id: `tim${Math.random()}`, groupId, groupName: groupId, senderId, senderName: 'Budi', text, adaFoto: false, waktu });
}

test('pertanyaan kategori yang menunggu tidak menelan daftar bahan baku ("bahan baku kiriman pertama ...")', async () => {
  const { store, kirim } = setup();
  const { isiHargaAwal } = await import('../src/main.js');
  await isiHargaAwal(store);
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  assert.match(await kirim(G_KELUAR, OWNER, 'barang aneh 75rb'), /belum jelas/);
  const r = await kirim(G_KELUAR, OWNER, 'bahan baku kiriman pertama keju balok 55 pack, bumbu garlic 50 pack, bumbu merah 4 pack, saus keju 32 pack');
  assert.match(r, /pengiriman pertama.*Mozzarella 55 pack.*Bumbu Garlic 50 pack.*Bumbu Merah 4 pack.*Saus Keju 32/s);
  assert.doesNotMatch(r, /sekarang kategori/);
  assert.equal((await store.all('Kamus Kategori')).length, 0);
  assert.equal((await store.all('Bahan Event')).length, 4);
  // jawaban pendek tetap diterima
  assert.match(await kirim(G_KELUAR, OWNER, '9'), /T0001 sekarang kategori/);
});

test('"rekap" tanpa # = #rekap', async () => {
  const { kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  assert.match(await kirim(G_KELUAR, OWNER, 'rekap'), /REKAP EVENT JMB26-11/);
  assert.match(await kirim(G_KELUAR, OWNER, 'lihat rekap'), /REKAP EVENT JMB26-11/);
});

test('omzet dikenali dari berbagai tulisan; pengeluaran >= 25jt ditanya dulu (catat / batal)', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  for (const t of ['omset harian 3 nov 12,5jt', 'total omset 4 nov 10jt', 'ini omset 5 nov 9.000.000', 'penjualan 6 nov 8jt']) {
    assert.match(await kirim(G_KELUAR, OWNER, t), /Omzet .* tercatat/);
  }
  assert.equal((await store.all('Transaksi')).length, 0);
  assert.equal((await store.all('Omzet')).length, 4);
  // nominal raksasa
  const w = await kirim(G_KELUAR, OWNER, 'sewa booth 30jt');
  assert.match(w, /nominalnya sangat besar.*sewa booth \*Rp 30.000.000\*.*omset 125jt/s);
  assert.equal((await store.all('Transaksi')).length, 0);
  assert.match(await kirim(G_KELUAR, OWNER, 'catat', { kutipan: { teks: w, id: 'w' } }), /T0001 sewa booth - \*Rp 30.000.000\*/);
  await kirim(G_KELUAR, OWNER, 'kulkas 26jt');
  assert.match(await kirim(G_KELUAR, OWNER, 'batal'), /Oke, tidak dicatat\./);
  assert.equal((await store.all('Transaksi')).length, 1);
});

test('revisi bahan: reply pesan bahan baku dengan daftar baru mengganti data lama (bukan menambah)', async () => {
  const { store, kirim } = setup();
  const { isiHargaAwal } = await import('../src/main.js');
  await isiHargaAwal(store);
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  const nanti = { waktu: new Date('2026-11-20T07:00:00Z') };
  const asli = 'bahan baku kiriman pertama keju balok 55 pack, bumbu garlic 50 pack, bumbu merah 4 pack, saus keju 32 pack';
  await kirim(G_KELUAR, OWNER, asli, nanti);
  assert.equal(await kirim(G_KELUAR, OWNER, 'revisi', nanti), '');
  const r = await kirim(G_KELUAR, OWNER, 'keju balok 55 pack, bumbu garlic 30 pack, bumbu merah 4 pack, saus keju 32 pack', { ...nanti, kutipan: { teks: asli, id: 'asli' } });
  assert.match(r, /Revisi – Bahan baku pengiriman pertama.*tgl 2026-11-02.*Bumbu Garlic 30 pack.*Data lama dibatalkan: Mozzarella 55 pack, Bumbu Garlic 50 pack/s);
  const aktif = (await store.all('Bahan Event')).filter((b) => b.status !== 'BATAL');
  assert.deepEqual(aktif.map((b) => [b.bahan, b.jumlah]), [['Mozzarella', 55], ['Bumbu Garlic', 30], ['Bumbu Merah', 4], ['Saus Keju', 32]]);
  // reply ke balasan bot juga bisa
  const bot = await kirim(G_KELUAR, OWNER, 'sisa keju 2 balok', nanti);
  await kirim(G_KELUAR, OWNER, 'ya', nanti); // nilai sisa pakai harga tab
  assert.match(await kirim(G_KELUAR, OWNER, 'keju 3 balok', { ...nanti, kutipan: { teks: bot, id: 'bot' } }), /Revisi – Sisa bahan baku.*Mozzarella 3 pack/s);
  assert.equal((await store.all('Bahan Event')).filter((b) => b.status !== 'BATAL' && b.gerak === 'Kembali').map((b) => b.jumlah).join(), '3');
});

test('gaji khusus event karyawan tetap: "gaji tiara, veri, dena masing masing 2 juta" -> #rekap & laporan', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, `${BLOK_EVENT}\nSenior: Tiara, Veri, Dena\nDW: Joko`);
  const r = await kirim(G_KELUAR, OWNER, 'Terus untuk masalah gaji, tiara, veri, dena masing masing di event ini dapat masing masing 2 juta ya jadi buat 3 orang ini dapat 6 jt ya');
  assert.match(r, /Gaji khusus event JMB26-11.*Tiara: \*Rp 2.000.000\*.*Veri.*Dena.*Total: \*Rp 6.000.000\*/s);
  assert.equal((await store.all('Transaksi')).length, 0);
  assert.match(await kirim(G_KELUAR, OWNER, '#rekap'), /Gaji karyawan tetap \(khusus event\): Rp 6.000.000.*Total pengeluaran: \*Rp 6.000.000\*/s);
  assert.match(await kirim(G_KELUAR, PIC, '#gaji dena 3jt'), /hanya diatur owner/);
  assert.match(await kirim(G_KELUAR, OWNER, '#gaji joko 1jt'), /Joko \(DW\) bukan karyawan tetap/);
  // pengeluaran gaji DW biasa tetap tercatat sebagai pengeluaran
  assert.match(await kirim(G_KELUAR, OWNER, 'gaji dave 600rb'), /T0001 gaji dave/);
  const { hitungEvent } = await import('../src/laporan.js');
  const hasil = hitungEvent((await store.all('Event'))[0], {
    omzet: [], transaksi: await store.all('Transaksi'), tim: await store.all('Tim Event'), bahan: [], hargaBahan: [], hargaMenu: [], gratis: [],
  });
  assert.equal(hasil.biaya.find((b) => /Gaji karyawan tetap/.test(b[0]))[1], 6000000);
});

test('fee PIC khusus event: "bonus pic nya 20 persen" / #feepic, kembali normal', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  const r = await kirim(G_KELUAR, OWNER, 'Terus ini karena senior nya banyak bonus pic nya itu 20 persen ya');
  assert.match(r, /Fee PIC JMB26-11: 20%/);
  assert.equal((await store.all('Event'))[0].fee_pic_persen, 20);
  assert.equal((await store.all('Transaksi')).length, 0);
  const { hitungEvent } = await import('../src/laporan.js');
  const ev = (await store.all('Event'))[0];
  const hasil = hitungEvent(ev, { omzet: [{ tanggal: '2026-11-03', kode_event: 'JMB26-11', omzet: 10000000, refund: 0, status: 'OK' }], tim: await store.all('Tim Event') });
  assert.equal(hasil.feePicPersen, 20);
  assert.match(await kirim(G_KELUAR, PIC, '#feepic 30'), /hanya diatur owner/);
  assert.match(await kirim(G_KELUAR, OWNER, '#feepic normal'), /kembali mengikuti kehadiran owner/);
  assert.equal((await store.all('Event'))[0].fee_pic_persen, '');
});

test('setoran ke PIC: #rekap event selesai menanyakan rekening PIC, jawaban disimpan (bukan pengeluaran), #setor menampilkan total', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT); // PIC Budi
  await kirim(G_KELUAR, PIC, 'hotel 2 nov 500rb uang budi');
  await kirim(G_KELUAR, OWNER, 'omset 2 nov 20jt');
  const nanti = { waktu: new Date('2026-11-20T07:00:00Z') };
  const rekap = await kirim(G_KELUAR, OWNER, '#rekap', nanti);
  assert.match(rekap, /Budi\*, mohon kirim \*nomor rekening\*/);
  const r = await kirim(G_KELUAR, PIC, 'BCA 1234 5678 90 a.n. Budi Santoso', nanti);
  assert.match(r, /Rekening \*Budi\* disimpan: \*BCA 1234567890\* a\.n\. Budi Santoso/);
  assert.equal((await store.all('Transaksi')).length, 1); // nomor rekening tidak jadi pengeluaran
  const k = (await store.all('Karyawan')).find((x) => x.nama === 'Budi');
  assert.equal(k.no_rekening, '1234567890');
  assert.doesNotMatch(await kirim(G_KELUAR, OWNER, '#rekap', nanti), /nomor rekening/); // tidak ditanya lagi
  const setor = await kirim(G_KELUAR, OWNER, '#setor', nanti);
  assert.match(setor, /Setoran ke PIC Budi.*Fee PIC 25%.*Uang PIC yang terpakai: keluar Rp 500.000 → Rp 500.000.*TOTAL DITRANSFER: Rp .*Rekening: \*BCA 1234567890\* a\.n\. Budi Santoso.*#ganti Budi 500000/s);
  assert.match(await kirim(G_KELUAR, PIC, '#setor', nanti), /khusus owner/);
  const { bacaData } = await import('../src/main.js');
  const { hitungEvent, barisDataMain } = await import('../src/laporan.js');
  const data = await bacaData(store);
  const baris = barisDataMain(hitungEvent(data.events[0], data)).filter((x) => x[1] === 'SETOR');
  assert.deepEqual(baris.map((x) => x[3]).filter((x) => /^(PIC|TOTAL|Rekening|Atas)/.test(x)), ['PIC: Budi', 'TOTAL DITRANSFER KE PIC', 'Rekening', 'Atas nama']);
  const total = baris.find((x) => x[3] === 'TOTAL DITRANSFER KE PIC')[4];
  const fee = baris.find((x) => /^Fee PIC/.test(x[3]))[4];
  assert.equal(total, fee + 500000);
});

test('#gajian: mulai event Semarang; event sebelumnya sudah dibayar; bonus x KPI, rekening', async () => {
  const { store, kirim } = setup();
  const blok = BLOK_EVENT.replace('Kode: JMB26-11', 'Kode: SMR26-11').replace('Tanggal: 2-8 Nov 2026', 'Tanggal: 14-22 Nov 2026');
  await kirim(G_KELUAR, OWNER, `${blok}\nSenior: Adit, Alam`);
  await kirim(G_KELUAR, OWNER, 'omset 15 nov 130jt');
  const nanti = { waktu: new Date('2026-11-25T07:00:00Z') };
  await kirim(G_KELUAR, OWNER, '#rekening Adit BCA 111222333 a.n. Adit', nanti); // owner isi langsung (nama PIC tidak cocok -> PIC)
  const g = await kirim(G_KELUAR, OWNER, '#gajian', nanti);
  assert.match(g, /Gajian SMR26-11.*Omzet kotor: Rp 130.000.000 ✅.*Adit\*: gaji pokok Rp 2.500.000 \+ bonus Rp 325.000 × KPI _\(belum dinilai\)_.*Alam/s);
  await kirim(G_KELUAR, OWNER, '#nilai Adit 5 5 5 5', nanti);
  await kirim(G_KELUAR, OWNER, '#nilai tim 5', nanti);
  const g2 = await kirim(G_KELUAR, OWNER, '#gajian', nanti);
  assert.match(g2, /Adit\*: gaji pokok Rp 2.500.000 \+ bonus Rp 325.000 × KPI \d+% = Rp [\d.]+ → \*Rp [\d.]+\*/);
  assert.match(await kirim(G_KELUAR, PIC, '#gajian', nanti), /hanya untuk owner/);
  // event sebelum 14 Nov: sudah dibayar
  const { perintahGajian } = await import('../src/gajian.js');
  const lama = await perintahGajian({ store }, {}, { kode: 'X', mulai: '2026-09-23' }, { isOwner: true });
  assert.match(lama[0].text, /sudah dibayar/);
});

test('rekening tim setelah event selesai: chat pribadi ke yang bernomor, grup tim untuk yang belum; jawaban di chat pribadi disimpan', async () => {
  const { store, kirim, ctx } = setup();
  const blok = BLOK_EVENT.replace('Kode: JMB26-11', 'Kode: SMR26-11').replace('Tanggal: 2-8 Nov 2026', 'Tanggal: 14-22 Nov 2026');
  await kirim(G_KELUAR, OWNER, `${blok}\nSenior: Adit, Alam\nDW: Joko`);
  await kirim(G_TIM, OWNER, '#daftar event SMR26-11');
  await kirim(G_TIM, '6284444444444', 'saya Adit');
  const { tugasRekening } = await import('../src/rekening.js');
  const { ikutGajian } = await import('../src/gajian.js');
  const { tanggalLokal } = await import('../src/util.js');
  const opsi = { tanggalLokal, ikutGajian };
  assert.equal((await tugasRekening(ctx, new Date('2026-11-23T02:00:00Z'), opsi)).length, 0); // 09.00 WIB: belum
  const t = await tugasRekening(ctx, new Date('2026-11-23T03:30:00Z'), opsi); // 10.30 WIB
  assert.equal(t.find((x) => x.nomor === '6284444444444')?.text.includes('Halo *Adit*'), true);
  const grupTim = t.find((x) => x.groupId === G_TIM);
  assert.match(grupTim.text, /\*Alam, Joko\*:.*chat pribadi ke nomor bot ini/s);
  assert.equal((await tugasRekening(ctx, new Date('2026-11-23T05:00:00Z'), opsi)).length, 0); // sekali saja
  // jawaban lewat chat pribadi
  const dm = (senderId, text) => handlePesan(ctx, { id: `dm${Math.random()}`, groupId: `${senderId}@s.whatsapp.net`, senderId, senderName: 'X', text, pribadi: true, adaFoto: false, waktu: new Date('2026-11-23T04:00:00Z') });
  assert.match((await dm('6284444444444', 'BCA 123 456 7890 a.n. Adit Pratama'))[0].text, /Terima kasih \*Adit\*.*BCA 1234567890/s);
  assert.match((await dm('6289999999999', 'BRI 987654321 a.n. Joko'))[0].text, /Terima kasih \*Joko\*/);
  assert.match((await dm('6288888888888', 'BNI 55556666'))[0].text, /belum dikenal bot/);
  const k = await store.all('Karyawan');
  assert.equal(k.find((x) => x.nama === 'Adit').no_rekening, '1234567890');
  assert.equal(k.find((x) => x.nama === 'Joko').no_rekening, '987654321');
  assert.equal(k.find((x) => x.nama === 'Joko').peran, 'DW');
  // event sebelum batas penggajian tidak ditanya
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  assert.ok(!(await tugasRekening(ctx, new Date('2026-11-24T03:30:00Z'), opsi)).some((x) => /JMB26-11/.test(x.text)));
});

test('omzet: pesan panjang diawali "omset" tetap omzet; "catat" atas peringatan nominal besar berisi omset = omzet; rentang tanggal = total', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT); // 2-8 Nov
  const r = await kirim(G_KELUAR, OWNER, 'omset 93.835.000 dari tanggal 2 sampai 8 november kemarin di jambi ya');
  assert.match(r, /Omzet 2026-11-08 tercatat.*Rp 93.835.000/s);
  assert.match((await store.all('Omzet'))[0].catatan, /Omzet total event/);
  assert.match(await kirim(G_KELUAR, OWNER, 'omset jambi 50jt belum dipotong io'), /Omzet kotor: \*Rp 50.000.000\*/);
  // pesan yang tidak diawali omset & panjang -> ditahan sebagai nominal besar; "catat" -> omzet
  const w = await kirim(G_KELUAR, OWNER, 'ini kemarin itu pendapatan omset kita yang di jambi dari awal sampai akhir event 93.835.000 ya pak');
  if (/sangat besar/.test(w)) {
    assert.match(await kirim(G_KELUAR, OWNER, 'catat', { kutipan: { teks: w, id: 'w' } }), /Omzet .* tercatat/);
  }
  assert.equal((await store.all('Transaksi')).filter((t) => t.status !== 'BATAL').length, 0);
});

test('gaji karyawan tetap yang dicatat di grup tidak dobel dengan estimasi gaji pokok & tidak masuk upah DW', async () => {
  const { hitungEvent } = await import('../src/laporan.js');
  const ev = { kode: 'BNY', mulai: '2026-09-15', selesai: '2026-09-20', bagi_hasil_persen: 27.5 };
  const tim = [{ kode_event: 'BNY', nama: 'Veri', peran: 'Tetap', status: 'AKTIF' }, { kode_event: 'BNY', nama: 'Imam', peran: 'Tetap', status: 'AKTIF' }];
  const trx = [
    { id: 'T1', kode_event: 'BNY', jenis: 'Pengeluaran', kategori: 'Gaji & Upah', keterangan: 'gaji karyawan tetap buat 2 orang', nominal: 3600000, status: 'OK' },
    { id: 'T2', kode_event: 'BNY', jenis: 'Pengeluaran', kategori: 'Gaji & Upah', keterangan: 'gaji DW sharul', nominal: 450000, status: 'OK' },
  ];
  const r = hitungEvent(ev, { omzet: [], transaksi: trx, tim });
  const b = Object.fromEntries(r.biaya.map(([n, v]) => [n, v]));
  assert.equal(b['Gaji karyawan tetap (porsi event)'], 3600000);
  assert.equal(b['Upah DW + kasir'], 450000);
  assert.equal(r.barisTim.find((o) => o.nama === 'Veri').upah, 1800000);
});

test('"laba bersih" / "pendapatan bersih" / "omset sudah dipotong" = omzet setelah potongan IO', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, BLOK_EVENT); // bagi hasil 25%
  assert.match(await kirim(G_KELUAR, OWNER, 'laba bersih 3 nov 7.500.000'), /Omzet kotor: \*Rp 10.000.000\*.*setelah dipotong IO 25%/s);
  assert.match(await kirim(G_KELUAR, OWNER, 'pendapatan bersih 4 nov 7.500.000'), /Omzet kotor: \*Rp 10.000.000\*/);
  assert.match(await kirim(G_KELUAR, OWNER, 'omset sudah dipotong 5 nov 7.500.000'), /Omzet kotor: \*Rp 10.000.000\*/);
  assert.equal((await store.all('Transaksi')).length, 0);
});

test('gaji khusus: nominal berbeda per orang ("veri, tiara, bima 2 juta masing masing, imam 500k"); reply batal', async () => {
  const { store, kirim } = setup();
  await kirim(G_KELUAR, OWNER, `${BLOK_EVENT}\nSenior: Bima, Veri, Tiara, Imam`);
  const r = await kirim(G_KELUAR, OWNER, 'gaji veri, tiara, bima 2 juta masing masing, imam 500k saja ya');
  assert.match(r, /Bima: \*Rp 2.000.000\*.*Veri: \*Rp 2.000.000\*.*Tiara: \*Rp 2.000.000\*.*Imam: \*Rp 500.000\*.*Total: \*Rp 6.500.000\*/s);
  const gaji = Object.fromEntries((await store.all('Tim Event')).map((o) => [o.nama, o.gaji_event]));
  assert.deepEqual([gaji.Bima, gaji.Veri, gaji.Tiara, gaji.Imam], [2000000, 2000000, 2000000, 500000]);
  assert.match(await kirim(G_KELUAR, OWNER, 'batal', { kutipan: { teks: r, id: 'g' } }), /Gaji khusus JMB26-11 untuk \*Bima, Veri, Tiara, Imam\* dibatalkan/);
  assert.ok((await store.all('Tim Event')).filter((o) => o.peran === 'Tetap').every((o) => o.gaji_event === ''));
  // kalimat lama tetap: satu nominal untuk semua, ringkasan "jadi ... 6 jt" diabaikan
  assert.match(await kirim(G_KELUAR, OWNER, 'gaji tiara, veri, bima masing masing 2 juta ya jadi buat 3 orang ini 6 jt'), /Total: \*Rp 6.000.000\*/);
});

test('stok closing harian: format dari bot, berkurang dihitung dari stok awal/kemarin + restock, koreksi di hari yang sama', async () => {
  const { store, kirim, ctx } = setup();
  const { isiHargaAwal } = await import('../src/main.js');
  await isiHargaAwal(store);
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  await kirim(G_TIM, OWNER, '#daftar event JMB26-11');
  const w = (tgl, jam) => ({ waktu: new Date(`2026-11-${tgl}T${jam}:00+07:00`) });
  await kirim(G_TIM, KARYAWAN, '#keluar\nmozzarella 20 pack\nbumbu garlic 10 pack', w('02', '08:00'));
  // format: bahan event + oyster
  const format = await kirim(G_TIM, KARYAWAN, '#stok', w('02', '22:00'));
  assert.match(format, /Stok closing JMB26-11.*2 Nov.*#stok\n.*Mozzarella = \.\.\. pack/s);
  assert.doesNotMatch(format, /Rp/); // tanpa harga di grup tim
  // closing hari 1 (lewat tengah malam = closing tgl 2)
  const h1 = await kirim(G_TIM, KARYAWAN, '#stok\nMozzarella = 14 pack\nBumbu Garlic = 8 pack', w('03', '00:30'));
  assert.match(h1, /2 Nov tercatat.*Mozzarella: \*14 pack\* \(stok awal 20\) → berkurang \*6 pack\*.*Bumbu Garlic: \*8 pack\* \(stok awal 10\) → berkurang \*2 pack\*/s);
  // hari 2: restock 10, closing 15 -> berkurang 14 + 10 - 15 = 9
  await kirim(G_TIM, KARYAWAN, '#restock mozzarella 10 pack', w('03', '15:00'));
  const h2 = await kirim(G_TIM, KARYAWAN, '#stok\nmozzarella 15 pack', w('03', '22:10'));
  assert.match(h2, /Mozzarella: \*15 pack\* \(kemarin 14 \+ restock 10\) → berkurang \*9 pack\*/);
  assert.match(h2, /Belum diisi:.*Bumbu Garlic/);
  // koreksi: kirim ulang hari yang sama menggantikan
  await kirim(G_TIM, KARYAWAN, '#stok\nmozzarella 16 pack', w('03', '22:20'));
  const aktif = (await store.all('Stok Harian')).filter((r) => r.status !== 'BATAL' && r.bahan === 'Mozzarella' && r.tanggal === '2026-11-03');
  assert.deepEqual(aktif.map((r) => [r.jumlah, r.terpakai]), [[16, 8]]);
  // stok naik -> peringatan
  assert.match(await kirim(G_TIM, KARYAWAN, '#stok\nbumbu garlic 9 pack', w('04', '22:00')), /naik 1/);
  // pengingat otomatis jam 23.00 kalau belum diisi
  const { tugasStokHarian } = await import('../src/stokHarian.js');
  assert.equal((await tugasStokHarian(ctx, new Date('2026-11-05T22:00:00+07:00'))).length, 0);
  const ingat = await tugasStokHarian(ctx, new Date('2026-11-05T23:01:00+07:00'));
  assert.equal(ingat[0].groupId, G_TIM);
  assert.match(ingat[0].text, /Stok closing hari ini belum diisi.*#stok/s);
  assert.equal((await tugasStokHarian(ctx, new Date('2026-11-05T23:30:00+07:00'))).length, 0);
});

test('sidak stok dadakan: hanya PIC/owner di luar grup tim, dibandingkan laporan closing, minus poin untuk pelapor', async () => {
  const { store, kirim } = setup();
  const { isiHargaAwal } = await import('../src/main.js');
  await isiHargaAwal(store);
  await kirim(G_KELUAR, OWNER, `${BLOK_EVENT}\nSenior: Andi`);
  await kirim(G_TIM, OWNER, '#daftar event JMB26-11');
  await store.append('Karyawan', { nama: 'Andi', nomor_wa: KARYAWAN });
  const w = (tgl, jam) => ({ waktu: new Date(`2026-11-${tgl}T${jam}:00+07:00`) });
  await kirim(G_TIM, KARYAWAN, '#keluar\nmozzarella 20 pack\nbumbu garlic 10 pack', w('02', '08:00'));
  await kirim(G_TIM, KARYAWAN, '#stok\nmozzarella 14 pack\nbumbu garlic 8 pack', w('02', '22:00'));
  // di grup tim ditolak (supaya dadakan), karyawan biasa ditolak
  assert.match(await kirim(G_TIM, OWNER, '#sidak', w('03', '08:00')), /chat pribadi ke bot/);
  assert.match(await kirim(G_KELUAR, KARYAWAN, '#sidak', w('03', '08:00')), /hanya oleh owner atau PIC/);
  // restock pagi lalu sidak di grup pengeluaran oleh PIC
  await kirim(G_TIM, KARYAWAN, '#restock mozzarella 5 pack', w('03', '07:00'));
  const hasil = await kirim(G_KELUAR, OWNER, '#sidak\nmozzarella 17 pack\nbumbu garlic 8 pack', w('03', '08:30'));
  assert.match(hasil, /❌ Mozzarella: sidak \*17 pack\*, laporan closing 2 Nov oleh Andi: 14 \+ restock 5 = 19 → selisih \*-2 pack\*/);
  assert.match(hasil, /✅ Bumbu Garlic: sidak \*8 pack\* = sesuai/);
  assert.match(hasil, /minus poin KPI untuk pelapor closing \(Andi\)/);
  const minus = await kirim(G_KELUAR, OWNER, 'minus 5', w('03', '08:31'));
  assert.match(minus, /-5 poin KPI\* untuk Andi.*Mozzarella -2 pack/s);
  const p = (await store.all('Poin KPI')).pop();
  assert.equal(p.nama, 'Andi'); assert.equal(p.poin, -5);
  assert.equal((await store.all('Sidak Stok')).length, 2);
  const jumlah = (await store.all('Poin KPI')).length;
  await kirim(G_KELUAR, OWNER, 'minus 5', w('03', '08:32'));
  assert.equal((await store.all('Poin KPI')).length, jumlah); // sudah selesai, tidak dobel
});

test('stok closing nampan freezer: 3 jenis, total dibanding minimal 7, ikut sidak', async () => {
  const { store, kirim } = setup();
  const { isiHargaAwal } = await import('../src/main.js');
  const { pisahNampan } = await import('../src/stokHarian.js');
  assert.deepEqual(pisahNampan('Nampan Garlic = 3 nampan\nnampan garlic mozza 2\nNampan Garlic Mozza Topping = 1 nampan\nbumbu garlic 8 pack').nampan.map((n) => [n.bahan, n.jumlah]),
    [['Nampan Garlic', 3], ['Nampan Garlic Mozza', 2], ['Nampan Garlic Mozza Topping', 1]]);
  await isiHargaAwal(store);
  await kirim(G_KELUAR, OWNER, BLOK_EVENT);
  await kirim(G_TIM, OWNER, '#daftar event JMB26-11');
  const w = (tgl, jam) => ({ waktu: new Date(`2026-11-${tgl}T${jam}:00+07:00`) });
  assert.match(await kirim(G_TIM, KARYAWAN, '#stok', w('02', '22:00')), /minimal 7.*Nampan Garlic = \.\.\. nampan\nNampan Garlic Mozza = \.\.\. nampan\nNampan Garlic Mozza Topping = \.\.\. nampan/s);
  const kurang = await kirim(G_TIM, KARYAWAN, '#stok\nNampan Garlic = 3 nampan\nNampan Garlic Mozza = 2 nampan\nNampan Garlic Mozza Topping = 1 nampan', w('02', '22:05'));
  assert.match(kurang, /Nampan siap bakar.*Nampan Garlic: \*3\*.*Total nampan di freezer: \*6\* ⚠️ \*kurang 1 dari minimal 7\*/s);
  assert.doesNotMatch(kurang, /Bumbu Garlic: \*3/); // nampan tidak tertukar dengan bahan baku
  // koreksi sebagian: total ikut nampan yang sudah dilapor hari ini
  assert.match(await kirim(G_TIM, KARYAWAN, '#stok\nNampan Garlic = 4 nampan', w('02', '22:10')), /Total nampan di freezer: \*7\* ✅/);
  // sidak besok pagi: nampan dibandingkan dengan closing
  assert.match(await kirim(G_KELUAR, OWNER, '#sidak\nNampan Garlic = 2 nampan\nNampan Garlic Mozza = 2 nampan', w('03', '08:00')),
    /❌ Nampan Garlic: sidak \*2 nampan\*, laporan closing 2 Nov.*: 4 = 4 → selisih \*-2 nampan\*.*✅ Nampan Garlic Mozza/s);
});

test('tugas harian jam 08.00 di grup tim, #pemanggang & #tukar oleh owner/PIC, denda selisih stok rata ke senior & potong di #gajian', async () => {
  const { store, kirim, ctx } = setup();
  const { isiHargaAwal } = await import('../src/main.js');
  await isiHargaAwal(store);
  await kirim(G_KELUAR, OWNER, `${BLOK_EVENT}\nSenior: Tiara, Veri, Bima, Imam`);
  await kirim(G_TIM, OWNER, '#daftar event JMB26-11');
  const w = (tgl, jam) => ({ waktu: new Date(`2026-11-${tgl}T${jam}:00+07:00`) });
  await store.updateWhere('Event', (e) => e.kode === 'JMB26-11', { kasir_antrian: 'Tiara' });
  assert.match(await kirim(G_TIM, KARYAWAN, '#pemanggang Veri', w('02', '07:00')), /hanya|owner atau PIC/);
  const p = await kirim(G_TIM, OWNER, '#pemanggang veri', w('02', '07:30'));
  assert.match(p, /Pemanggang tetap JMB26-11: \*Veri\*.*KASIR\*: \*Tiara\*.*PEMANGGANG\*: \*Veri\*.*GETOK\*: \*Bima\*, \*Imam\*.*09.30.*#cooler.*PLATING\*: dirangkap kasir/s);
  const { tugasPembagianHarian } = await import('../src/tugasHarian.js');
  assert.equal((await tugasPembagianHarian(ctx, new Date('2026-11-03T07:59:00+07:00'))).length, 0);
  const pagi = await tugasPembagianHarian(ctx, new Date('2026-11-03T08:00:00+07:00'));
  assert.equal(pagi[0].groupId, G_TIM);
  assert.match(pagi[0].text, /TUGAS HARI INI JMB26-11.*3 Nov.*#depan.*#grill.*#nampan/s);
  assert.equal((await tugasPembagianHarian(ctx, new Date('2026-11-03T09:00:00+07:00'))).length, 0);
  assert.match(await kirim(G_TIM, OWNER, '#tukar Bima Veri', w('03', '09:00')), /Bima\* ⇄ \*Veri\*.*PEMANGGANG\*: \*Bima\*/s);
  // denda selisih stok dibagi rata ke senior, terpotong di #gajian
  await kirim(G_TIM, KARYAWAN, '#keluar\nmozzarella 20 pack', w('02', '08:00'));
  await kirim(G_TIM, KARYAWAN, '#stok\nmozzarella 14 pack', w('03', '22:00'));
  await kirim(G_KELUAR, OWNER, '#sidak\nmozzarella 10 pack', w('04', '08:00'));
  assert.match(await kirim(G_KELUAR, PIC, 'denda 400rb rata', w('04', '08:01')), /hanya diputuskan owner/);
  const d = await kirim(G_KELUAR, OWNER, 'denda 400rb rata', w('04', '08:02'));
  assert.match(d, /Denda selisih stok JMB26-11\*: Tiara Rp 100.000, Veri Rp 100.000, Bima Rp 100.000, Imam Rp 100.000 \(dibagi rata dari Rp 400.000\)/);
  assert.equal((await store.all('Denda')).length, 4);
});

test('penilaian harian PIC jam 22.00: per orang sesuai bagian, kategori 1-4 + poin + catatan, masuk kinerja KPI', async () => {
  const { store, kirim, ctx } = setup();
  const { bacaJawaban, tugasNilaiHarian } = await import('../src/nilaiHarian.js');
  assert.deepEqual(bacaJawaban('1 90 cepat & rapi'), { kategori: 1, poin: 90, catatan: 'cepat & rapi' });
  assert.deepEqual(bacaJawaban('2'), { kategori: 2, poin: 65, catatan: '' });
  assert.match(bacaJawaban('4 50 telat').salah, /1–20/);
  await kirim(G_KELUAR, OWNER, `${BLOK_EVENT}\nSenior: Tiara, Bima`);
  await kirim(G_TIM, OWNER, '#daftar event JMB26-11');
  await store.append('Karyawan', { nama: 'Budi', nomor_wa: '082222222222' });
  await store.append('Tugas Harian', { tanggal: '2026-11-03', kode_event: 'JMB26-11', bagian: 'Kasir', nama: 'Tiara', status: 'OK' });
  await store.append('Tugas Harian', { tanggal: '2026-11-03', kode_event: 'JMB26-11', bagian: 'Plating', nama: 'Tiara', rangkap: 'ya', status: 'OK' });
  await store.append('Tugas Harian', { tanggal: '2026-11-03', kode_event: 'JMB26-11', bagian: 'Getok', nama: 'Bima', status: 'OK' });
  assert.equal((await tugasNilaiHarian(ctx, new Date('2026-11-03T21:00:00+07:00'))).length, 0);
  const k = await tugasNilaiHarian(ctx, new Date('2026-11-03T22:00:00+07:00'));
  assert.equal(k[0].nomor, PIC);
  assert.match(k[0].text, /Penilaian harian JMB26-11.*3 Nov \(1\/2\).*Tiara\* – Kasir \+ Plating.*Ramah & cepat.*Stok nampan.*1️⃣ Sangat baik \(75–100\).*4️⃣ Buruk \(1–20\)/s);
  assert.equal((await tugasNilaiHarian(ctx, new Date('2026-11-03T22:30:00+07:00'))).length, 0);
  const dm = (text) => handlePesan(ctx, { id: `d${Math.random()}`, groupId: 'dm', pribadi: true, senderId: PIC, senderName: 'Budi', text, adaFoto: false, waktu: new Date('2026-11-03T22:05:00+07:00') }).then((r) => r.map((x) => x.text).join('\n'));
  assert.match(await dm('1 95 cepat'), /Bima\* – Getok.*Es batu dipesan jam 09.30/s);
  const akhir = await dm('3 40 sering main hp');
  assert.match(akhir, /selesai.*Tiara: \*95\* – cepat.*Bima: \*40\* – sering main hp/s);
  const { skorEvent, bahanKpi } = await import('../src/kpi.js');
  const { bacaData } = await import('../src/main.js');
  const { hitungEvent } = await import('../src/laporan.js');
  const data = await bacaData(store);
  const s = skorEvent(hitungEvent(data.events[0], data), { ...(await bahanKpi(store)), hariIni: '2026-11-04' }).find((x) => x.nama === 'Bima');
  assert.equal(s.kinerja, 9.6); // 40/100 × 24
});
