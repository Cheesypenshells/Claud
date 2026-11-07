import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, parseRentangTanggal, rupiah } from '../src/util.js';
import { parsePengeluaran, parseEvent, parseOmzet, tebakKategori, parsePerintah } from '../src/parsers.js';

test('parseMoney mengenali format nominal Indonesia', () => {
  const kasus = {
    'lalamove 150k': 150000,
    'makan malam 120rb': 120000,
    'ember 30 ribu': 30000,
    'bensin 1,5jt': 1500000,
    'tiket 1.5 jt': 1500000,
    'gaji 2 juta': 2000000,
    'Rp 150.000': 150000,
    'transfer 3.250.000': 3250000,
    'total 150000': 150000,
    'Rp150,000': 150000,
    'ember 2 unit': null,
    'jam 10 pagi': null,
  };
  for (const [teks, harapan] of Object.entries(kasus)) {
    assert.equal(parseMoney(teks), harapan, teks);
  }
});

test('rupiah memformat dengan titik ribuan', () => {
  assert.equal(rupiah(1500000), 'Rp 1.500.000');
  assert.equal(rupiah(-25000), '-Rp 25.000');
  assert.equal(rupiah(0), 'Rp 0');
});

test('parseRentangTanggal', () => {
  assert.deepEqual(parseRentangTanggal('1-14 Nov 2026'), { mulai: '2026-11-01', selesai: '2026-11-14' });
  assert.deepEqual(parseRentangTanggal('28 Okt - 3 Nov 2026'), { mulai: '2026-10-28', selesai: '2026-11-03' });
  assert.deepEqual(parseRentangTanggal('28 Des - 3 Jan 2027'), { mulai: '2026-12-28', selesai: '2027-01-03' });
  assert.deepEqual(parseRentangTanggal('01/11/2026 - 14/11/2026'), { mulai: '2026-11-01', selesai: '2026-11-14' });
  assert.deepEqual(parseRentangTanggal('5 November', 2026), { mulai: '2026-11-05', selesai: '2026-11-05' });
  assert.equal(parseRentangTanggal('besok'), null);
});

test('parsePengeluaran: banyak baris, qty @ harga, total diabaikan', () => {
  const items = parsePengeluaran('lalamove 150k\nmakan malam 120rb cash\nember 2 unit @30rb\ntotal 330rb\nsudah ya');
  assert.equal(items.length, 3);
  assert.deepEqual(items[0], { keterangan: 'lalamove', nominal: 150000, kategori: 'Transport & Ekspedisi', metode: '', dibayar_oleh: '' });
  assert.equal(items[1].nominal, 120000);
  assert.equal(items[1].metode, 'CASH');
  assert.equal(items[1].kategori, 'Konsumsi');
  assert.equal(items[2].nominal, 60000);
  assert.equal(items[2].kategori, 'Barang Kering Non-Konsumtif');
});

test('parsePengeluaran: chat tanpa nominal tidak dicatat', () => {
  assert.deepEqual(parsePengeluaran('oke siap pak, besok saya kirim'), []);
});

test('tebakKategori', () => {
  assert.equal(tebakKategori('beli oyster 100kg'), 'Oyster');
  assert.equal(tebakKategori('es batu 5 karung'), 'Bahan Operasional');
  assert.equal(tebakKategori('sapu lidi'), 'Barang Kering Non-Konsumtif');
  assert.equal(tebakKategori('sumpit 2 pack'), 'Barang Kering Konsumtif');
  assert.equal(tebakKategori('kompor gas'), 'Barang Kering Non-Konsumtif');
  assert.equal(tebakKategori('endorse @makanjambi'), 'Iklan & Endorse');
  assert.equal(tebakKategori('obat sakit Andi'), 'Tak Terduga');
  assert.equal(tebakKategori('hotel 2 malam'), 'Penginapan');
  assert.equal(tebakKategori('token listrik ruko'), 'Utilitas Ruko');
  assert.equal(tebakKategori('gaji DW joko'), 'Gaji & Upah');
  assert.equal(tebakKategori('sumbangan'), 'Lain-lain');
});

test('parseEvent membaca blok setup event', () => {
  const { data, error } = parseEvent(`#event
Kode: jmb26-11
Kota: Jambi
IO: Kepo Market
Tanggal: 1-14 Nov 2026
Wilayah harga: Sumatra
Target omzet: 150jt
Bagi hasil: 27%
Admin: 500.000
Jadwal trf: H+1, Jumat-Minggu ditransfer Senin
Jam buka: 11.00 (absen 10.00)
PIC: Budi`);
  assert.equal(error, undefined);
  assert.equal(data.kode, 'JMB26-11');
  assert.equal(data.mulai, '2026-11-01');
  assert.equal(data.selesai, '2026-11-14');
  assert.equal(data.wilayah, 'Sumatra');
  assert.equal(data.target_omzet, 150000000);
  assert.equal(data.bagi_hasil_persen, 27);
  assert.equal(data.admin, 500000);
  assert.equal(data.jadwal_trf, 'HARIAN');
  assert.equal(data.jam_buka, '11:00');
});

test('parseEvent: jadwal transfer sekali di akhir dan data kurang', () => {
  const { data } = parseEvent('#event\nKode: A\nKota: B\nIO: C\nTanggal: 1-3 Nov 2026\nJadwal trf: setelah event selesai');
  assert.equal(data.jadwal_trf, 'AKHIR');
  assert.match(parseEvent('#event\nKota: Jambi').error, /kode, io, tanggal/);
});

test('parseOmzet: format SOP BAB 6 dan bentuk singkat', () => {
  const o = parseOmzet(`#omzet
EVENT/KOTA: Jambi
TANGGAL: 2 Nov 2026
OMZET TERVERIFIKASI: Rp 12.500.000
JUMLAH TRANSAKSI: 85
SELISIH / REFUND / KOREKSI: 100rb`, 2026);
  assert.equal(o.omzet, 12500000);
  assert.equal(o.jumlah_transaksi, '85');
  assert.equal(o.refund, 100000);
  assert.equal(o.tanggal, '2026-11-02');
  assert.equal(parseOmzet('#omzet 12,5jt').omzet, 12500000);
});

test('parsePerintah', () => {
  const p = parsePerintah('#rekap bulan 2026-11');
  assert.equal(p.perintah, 'rekap');
  assert.deepEqual(p.argumen, ['bulan', '2026-11']);
  assert.equal(parsePerintah('halo'), null);
  assert.equal(parsePerintah('#trf 3jt omzet\nbaris 2').badan, 'baris 2');
});

test('parseOrang: kata pengisi dibuang, orang tanpa nama diberi nomor', async () => {
  const { parseOrang } = await import('../src/parsers.js');
  const nama = (t, p) => parseOrang(t, p).map((o) => `${o.nama}:${o.upah_harian}`);
  assert.deepEqual(nama('Karyawan senior nya imam', 'Tetap'), ['Imam:0']);
  assert.deepEqual(nama('Dw, dw, dw', 'DW'), ['DW 1:100000', 'DW 2:100000', 'DW 3:100000']);
  assert.deepEqual(nama('4 orang', 'DW'), ['DW 1:100000', 'DW 2:100000', 'DW 3:100000', 'DW 4:100000']);
  assert.deepEqual(nama('Joko, Tono 120rb', 'DW'), ['Joko:100000', 'Tono:120000']);
});

test('uang siapa: nama pemilik vs jenis pengeluaran', async () => {
  const { ambilUangSiapa } = await import('../src/parsers.js');
  assert.equal(ambilUangSiapa('Uang transport imam 250k').siapa, null);
  assert.equal(ambilUangSiapa('uang makan tim 100rb uang mama').siapa, 'Mama');
  assert.equal(ambilUangSiapa('uang muka hotel 500rb').siapa, null);
  assert.equal(ambilUangSiapa('lalamove 150k pakai uang valen').siapa, 'Valen');
  assert.equal(ambilUangSiapa('es batu 20rb (uang saya)').siapa, '@pengirim');
});

test('tanggal di baris pengeluaran: "makan siang 22 sept 53rb"', async () => {
  const { parsePengeluaranDetail: p } = await import('../src/parsers.js');
  const { items } = p('makan siang 22 sept 53rb uang mama\ntgl 3/10 bensin 50rb\nsapu 25rb', { hariIni: '2026-10-05' });
  assert.equal(items[0].tanggal, '2026-09-22');
  assert.equal(items[0].keterangan, 'makan siang');
  assert.equal(items[0].nominal, 53000);
  assert.equal(items[1].tanggal, '2026-10-03');
  assert.equal(items[2].tanggal, undefined);
  // Pesan bulan Januari yang menyebut Desember = tahun lalu
  assert.equal(p('hotel 28 des 300rb', { hariIni: '2027-01-03' }).items[0].tanggal, '2026-12-28');
});

test('satu baris beberapa pengeluaran dipisah koma', async () => {
  const { parsePengeluaranDetail: p } = await import('../src/parsers.js');
  const { items, dilewati } = p('Listrik 353k, minuman 25 sept 11k, lemon dan softex 24k tanggal 25 sept', { hariIni: '2026-11-08' });
  assert.equal(dilewati.length, 0);
  assert.deepEqual(items.map((i) => [i.keterangan, i.nominal, i.tanggal]), [
    ['Listrik', 353000, undefined], ['minuman', 11000, '2026-09-25'], ['lemon dan softex', 24000, '2026-09-25'],
  ]);
  assert.equal(items[1].kategori, 'Konsumsi');
  // Bagian tanpa harga yang pendek berlaku untuk semua: uang siapa
  assert.deepEqual(p('es batu 20rb, gas 25rb, uang mama').items.map((i) => i.dibayar_oleh), ['Mama', 'Mama']);
  // Koma desimal tidak dipecah; kalimat obrolan tetap tidak dicatat
  assert.equal(p('minum karyawan 67,865 ribu').items[0].nominal, 67865);
  assert.equal(p('Lalamove kerang ke P2 dan minum karyawan , lalamovenya harganya150k, dan untuk minum 67,865 ribu').items.length, 0);
});

test('"semua uang valen" berlaku untuk semua item di pesan, di mana pun ditulis', async () => {
  const { parsePengeluaranDetail: p } = await import('../src/parsers.js');
  const { items } = p('Listrik 353k, minuman 25 sept 11k, lemon dan softex 24k tanggal 25 sept Semua uang valen', { hariIni: '2026-11-08' });
  assert.deepEqual(items.map((i) => [i.keterangan, i.dibayar_oleh]), [['Listrik', 'Valen'], ['minuman', 'Valen'], ['lemon dan softex', 'Valen']]);
  assert.deepEqual(p('makan 20rb\nbensin 30rb\nuang mama semua').items.map((i) => i.dibayar_oleh), ['Mama', 'Mama']);
  // Tanpa "semua": hanya item yang menyebutnya
  assert.deepEqual(p('hotel 300rb uang valen, makan 20rb').items.map((i) => i.dibayar_oleh), ['Valen', '']);
});

test('tanggal tanpa spasi / tanpa bulan / rentang dibaca, bulan ikut masa event', async () => {
  const { parsePengeluaranDetail: p } = await import('../src/parsers.js');
  const o = { hariIni: '2026-11-08', rentang: { mulai: '2026-09-24', selesai: '2026-10-11' } };
  const t = (x) => p(x, o).items.map((i) => [i.keterangan, i.tanggal]);
  assert.deepEqual(t('Makan malam karyawan tanggal27 sept 224rb'), [['Makan malam karyawan', '2026-09-27']]);
  assert.deepEqual(t('makan karyawan tanggal26 sore 66.110'), [['makan karyawan sore', '2026-09-26']]);
  assert.deepEqual(t('makan karyawan 27 pagi 52.500'), [['makan karyawan pagi', '2026-09-27']]);
  assert.deepEqual(t('makan tanggal 3 50rb'), [['makan', '2026-10-03']]);
  assert.deepEqual(t('Hotel236.406k tanggal2-3 okt'), [['Hotel', '2026-10-02']]);
  assert.deepEqual(t('Plastik paper tray dll total330k'), [['Plastik paper tray dll', undefined]]);
  assert.deepEqual(t('es 2 dus 30rb'), [['es 2 dus', undefined]]);
});

test('"x 2 malam" adalah jumlah malam, bukan tanggal', async () => {
  const { parsePengeluaranDetail: p } = await import('../src/parsers.js');
  const [i] = p('hotel 350rb x 2 malam', { hariIni: '2026-11-08' }).items;
  assert.equal(i.nominal, 700000);
  assert.equal(i.tanggal, undefined);
});

test('"siang ... dan malam nya ..." dipecah, keterangan & tanggal ikut bagian sebelumnya', async () => {
  const { parsePengeluaranDetail: p } = await import('../src/parsers.js');
  const o = { hariIni: '2026-11-08', rentang: { mulai: '2026-09-24', selesai: '2026-10-11' } };
  const { items } = p('makan karyawan tanggal 30 sept 40.11k siang dan malam nya 40.95k, makan tanggal 1 oktober, siang nya 38.5k dan malam nya 45.95k, makan 2 oktober 62.55k, semua uang valen', o);
  assert.deepEqual(items.map((i) => [i.keterangan, i.nominal, i.tanggal, i.dibayar_oleh]), [
    ['makan karyawan siang', 40110, '2026-09-30', 'Valen'],
    ['makan karyawan malam', 40950, '2026-09-30', 'Valen'],
    ['makan siang', 38500, '2026-10-01', 'Valen'],
    ['makan malam', 45950, '2026-10-01', 'Valen'],
    ['makan', 62550, '2026-10-02', 'Valen'],
  ]);
  assert.ok(items.every((i) => i.kategori === 'Konsumsi'));
  // "rp" di dalam kata (warp) bukan tanda Rupiah
  assert.equal(p('plastik warp 87.5k').items[0].keterangan, 'plastik warp');
  assert.deepEqual(p('es 20rb dan gas 25rb').items.map((i) => i.keterangan), ['es', 'gas']);
  assert.equal(p('lemon dan softex 24k').items.length, 1);
});
