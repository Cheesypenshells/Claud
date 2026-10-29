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
  assert.deepEqual(items[0], { keterangan: 'lalamove', nominal: 150000, kategori: 'Transport & Ekspedisi', metode: '' });
  assert.equal(items[1].nominal, 120000);
  assert.equal(items[1].metode, 'CASH');
  assert.equal(items[1].kategori, 'Konsumsi');
  assert.equal(items[2].nominal, 60000);
  assert.equal(items[2].kategori, 'Peralatan');
});

test('parsePengeluaran: chat tanpa nominal tidak dicatat', () => {
  assert.deepEqual(parsePengeluaran('oke siap pak, besok saya kirim'), []);
});

test('tebakKategori', () => {
  assert.equal(tebakKategori('beli oyster 100kg'), 'Oyster');
  assert.equal(tebakKategori('es batu 5 karung'), 'Bahan Operasional');
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
