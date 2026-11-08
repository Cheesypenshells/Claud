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
  assert.equal(r2.totalBiaya, 150000 + 200000 + 300000 + 50000 + 25000 + 500000); // + admin IO 500rb
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
