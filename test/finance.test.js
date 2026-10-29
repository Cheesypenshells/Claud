import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jatuhTempo, rekapEvent, rekapBulan } from '../src/finance.js';

const event = {
  kode: 'JMB26-11', kota: 'Jambi', io: 'Kepo Market',
  mulai: '2026-11-02', selesai: '2026-11-08', // Senin - Minggu
  bagi_hasil_persen: 25, admin: 500000, jadwal_trf: 'HARIAN',
};

test('jatuhTempo: H+1, Jumat-Minggu dibayar Senin', () => {
  assert.equal(jatuhTempo('2026-11-02', event), '2026-11-03'); // Senin -> Selasa
  assert.equal(jatuhTempo('2026-11-05', event), '2026-11-06'); // Kamis -> Jumat
  assert.equal(jatuhTempo('2026-11-06', event), '2026-11-09'); // Jumat -> Senin
  assert.equal(jatuhTempo('2026-11-07', event), '2026-11-09'); // Sabtu -> Senin
  assert.equal(jatuhTempo('2026-11-08', event), '2026-11-09'); // Minggu -> Senin
  assert.equal(jatuhTempo('2026-11-03', { ...event, jadwal_trf: 'AKHIR' }), '2026-11-09');
});

test('rekapEvent menghitung perkiraan transfer, piutang, dan telat', () => {
  const omzet = [
    { kode_event: 'JMB26-11', tanggal: '2026-11-02', omzet: 10000000, refund: 0, status: 'OK' },
    { kode_event: 'JMB26-11', tanggal: '2026-11-03', omzet: 8000000, refund: 0, status: 'BATAL' },
    { kode_event: 'JMB26-11', tanggal: '2026-11-03', omzet: 12000000, refund: 0, status: 'OK' },
  ];
  const transaksi = [
    { kode_event: 'JMB26-11', jenis: 'MASUK_IO', nominal: 7500000, status: 'OK' },
    { kode_event: 'JMB26-11', jenis: 'KELUAR', kategori: 'Transport & Ekspedisi', nominal: 150000, status: 'OK' },
    { kode_event: 'JMB26-11', jenis: 'KELUAR', kategori: 'Konsumsi', nominal: 120000, status: 'OK' },
    { kode_event: 'JMB26-11', jenis: 'KELUAR', kategori: 'Konsumsi', nominal: 999999, status: 'BATAL' },
    { kode_event: 'JMB26-11', jenis: 'POTONGAN_IO', nominal: 250000, status: 'OK' },
    { kode_event: 'LAIN', jenis: 'KELUAR', nominal: 5000000, status: 'OK' },
  ];
  // 5 Nov: omzet 2 Nov (jatuh tempo 3 Nov) dan 3 Nov (jatuh tempo 4 Nov) sudah wajib masuk.
  const r = rekapEvent(event, { omzet, transaksi }, '2026-11-05');
  assert.equal(r.omzetKotor, 22000000);
  assert.equal(r.bagiHasil, 5500000);
  assert.equal(r.potonganIO, 250000);
  assert.equal(r.perkiraanTransfer, 22000000 - 5500000 - 500000 - 250000);
  assert.equal(r.diterima, 7500000);
  assert.equal(r.telat, 9000000); // 7,5 jt + 9 jt jatuh tempo, baru 7,5 jt masuk
  assert.equal(r.totalPengeluaran, 270000);
  assert.deepEqual(r.perKategori, { 'Transport & Ekspedisi': 150000, Konsumsi: 120000 });
  assert.equal(r.labaSementara, r.perkiraanTransfer - 270000);
});

test('rekapEvent: setelah pelunasan, admin dan potongan ikut diperhitungkan', () => {
  const omzet = [{ kode_event: 'JMB26-11', tanggal: '2026-11-02', omzet: 10000000, refund: 0, status: 'OK' }];
  const transaksi = [{ kode_event: 'JMB26-11', jenis: 'MASUK_IO', nominal: 7000000, status: 'OK' }];
  const r = rekapEvent(event, { omzet, transaksi }, '2026-11-10');
  assert.equal(r.perkiraanTransfer, 7000000);
  assert.equal(r.telat, 0);
  assert.equal(r.sisaPiutang, 0);
});

test('rekapBulan menggabungkan event dan buku ruko', () => {
  const events = [event, { ...event, kode: 'PLB26-10', mulai: '2026-10-20', selesai: '2026-10-30' }];
  const omzet = [
    { kode_event: 'JMB26-11', tanggal: '2026-11-02', omzet: 10000000, refund: 0, status: 'OK' },
    { kode_event: 'PLB26-10', tanggal: '2026-10-25', omzet: 20000000, refund: 0, status: 'OK' },
  ];
  const transaksi = [
    { kode_event: 'JMB26-11', buku: 'EVENT', jenis: 'KELUAR', nominal: 1000000, tanggal: '2026-11-02', status: 'OK' },
    { kode_event: 'RUKO', buku: 'RUKO', jenis: 'KELUAR', kategori: 'Utilitas Ruko', nominal: 850000, tanggal: '2026-11-05', status: 'OK' },
    { kode_event: 'RUKO', buku: 'RUKO', jenis: 'KELUAR', kategori: 'Gaji & Upah', nominal: 2000000, tanggal: '2026-10-30', status: 'OK' },
  ];
  const r = rekapBulan('2026-11', { events, omzet, transaksi });
  assert.equal(r.perEvent.length, 1);
  assert.equal(r.omzetKotor, 10000000);
  assert.equal(r.pendapatanBersih, 10000000 * 0.75 - 500000);
  assert.equal(r.pengeluaranEvent, 1000000);
  assert.equal(r.totalRuko, 850000);
  assert.equal(r.labaBersih, 7000000 - 1000000 - 850000);
});
