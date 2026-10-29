import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlePesan } from '../src/handlers.js';
import { MemoryStore } from '../src/store/memory.js';
import { buatPenjadwal } from '../src/scheduler.js';

const OWNER = '6281111111111';
const PIC = '6282222222222';
const KARYAWAN = '6283333333333';
const G_KELUAR = 'keluar@g.us';
const G_TIM = 'tim@g.us';
const G_RUKO = 'ruko@g.us';
// 3 Nov 2026, 14.00 WIB
const WAKTU = new Date('2026-11-03T07:00:00Z');

function setup({ pembaca = null } = {}) {
  const store = new MemoryStore();
  const ctx = { store, pembaca, ownerIds: new Set([OWNER]) };
  let n = 0;
  const kirim = async (groupId, senderId, text, extra = {}) => {
    const res = await handlePesan(ctx, {
      id: `m${++n}`, groupId, groupName: groupId, senderId, senderName: { [OWNER]: 'George', [PIC]: 'Budi' }[senderId] || 'Joko',
      text, image: null, waktu: WAKTU, ...extra,
    });
    return res.map((r) => r.text).join('\n');
  };
  return { store, kirim };
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

test('foto: caption bernominal tanpa AI, foto tanpa nominal memakai AI', async () => {
  const foto = { buffer: Buffer.from('x'), mimetype: 'image/jpeg' };

  const tanpaAI = setup();
  await tanpaAI.kirim(G_KELUAR, OWNER, BLOK_EVENT);
  assert.match(await tanpaAI.kirim(G_KELUAR, PIC, 'lalamove 150rb', { image: foto }), /\[Transport & Ekspedisi, TRANSFER\]/);
  assert.match(await tanpaAI.kirim(G_KELUAR, PIC, 'bukti lalamove', { image: foto }), /tulis nominal/);

  const pembaca = {
    async bacaFoto({ mode }) {
      return { items: [{ keterangan: 'Lalamove ke venue', nominal: 175000, kategori: 'Transport & Ekspedisi', metode: 'TRANSFER' }], catatan: '', mode };
    },
  };
  const denganAI = setup({ pembaca });
  await denganAI.kirim(G_KELUAR, OWNER, BLOK_EVENT);
  const r = await denganAI.kirim(G_KELUAR, PIC, '', { image: foto });
  assert.match(r, /Lalamove ke venue - \*Rp 175.000\*/);
  assert.match(r, /Dibaca otomatis dari foto/);
  const trf = await denganAI.kirim(G_KELUAR, OWNER, '#trf', { image: foto });
  assert.match(trf, /Transfer masuk dari IO tercatat/);
  assert.match(trf, /Rp 175.000/);
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
