import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlePesan } from '../src/handlers.js';
import { MemoryStore } from '../src/store/memory.js';
import { buatSesi } from '../src/sesi.js';
import { poinDari, bacaNilai, skorEvent, rekapBulanKPI } from '../src/kpi.js';
import { tugasPenilaian } from '../src/handlersKpi.js';
import { tabelKpi } from '../src/pembukuan.js';
import { hitungEvent } from '../src/laporan.js';
import { bacaData } from '../src/main.js';

const OWNER = '6281111111111';
const PIC = '6282222222222';
const G = 'keluar@g.us';
const WAKTU = new Date('2026-11-03T07:00:00Z');
const BLOK = `#event
Kode: JMB26-11
Kota: Jambi
IO: Kepo Market
Tanggal: 2-4 Nov 2026
Wilayah harga: Sumatra
Bagi hasil: 25%
Admin: 0
Target omzet: 100jt
PIC: Budi
Senior: Andi, Rudi
DW: Joko`;

function setup() {
  const store = new MemoryStore();
  const ctx = { store, ownerIds: new Set([OWNER]), sesi: buatSesi(null), terakhir: new Map() };
  let n = 0;
  const kirim = async (senderId, text, extra = {}) => (await handlePesan(ctx, {
    id: `m${++n}`, groupId: G, groupName: G, senderId, senderName: senderId === OWNER ? 'George' : 'Budi', text, adaFoto: false, waktu: WAKTU, ...extra,
  })).map((r) => r.text).join('\n');
  return { store, ctx, kirim };
}

test('poin dari nilai 1-5 atau persen; bacaan 4 angka', () => {
  assert.equal(poinDari(5, 24), 24);
  assert.equal(poinDari(4, 12), 9.6);
  assert.equal(poinDari(80, 12), 9.6);
  assert.equal(poinDari('', 12), null);
  assert.deepEqual(bacaNilai('5 4 4 3'), { absen: 5, kinerja: 4, attitude: 4, karir: 3 });
  assert.equal(bacaNilai('5 4'), null);
});

test('#nilai: sesi tanya satu per satu, lalu kinerja tim; skor = individu + kelompok', async () => {
  const { store, kirim } = setup();
  await kirim(OWNER, BLOK);
  await kirim(OWNER, '#omzet 2 nov 50jt');
  const r0 = await kirim(OWNER, '#nilai');
  assert.match(r0, /Penilaian KPI JMB26-11\* \(1\/3\).*\*Andi\*/s);
  assert.match(await kirim(OWNER, '5 5 5 5'), /\(2\/3\).*\*Rudi\*/s);
  assert.match(await kirim(OWNER, '4 4 4 4 rajin tapi sering telat'), /\(3\/3\).*\*Joko\*/s);
  assert.match(await kirim(OWNER, 'lewati'), /kinerja tim JMB26-11/);
  const akhir = await kirim(OWNER, '4');
  // Andi: individu 60; kelompok = omzet 50/100*15=7.5 + stok 10 + komplain 10 + tim 4/5*5=4 = 31.5 -> 91.5
  assert.match(akhir, /Andi: individu 60\/60 \+ kelompok 31,5\/40 = \*91,5\*/);
  assert.match(akhir, /Rudi: individu 48\/60/);
  assert.match(akhir, /Joko: individu -\/60/);
  const n = await store.all('Nilai KPI');
  assert.equal(n.find((x) => x.nama === 'Rudi').catatan, 'rajin tapi sering telat');
  // ubah satu nilai langsung
  assert.match(await kirim(OWNER, '#nilai Joko 3 3 3 3'), /Nilai Joko \(JMB26-11\): individu \*36\/60\*, total 67,5/);
});

test('#poin plus/minus, #kpi owner saja, skor bulan dibatasi 100', async () => {
  const { store, kirim } = setup();
  await store.append('Pengaturan', { kunci: 'gaji_mulai', nilai: '2026-01-01' }); // event tes (Nov) ikut penggajian
  await kirim(OWNER, BLOK);
  await kirim(OWNER, '#nilai Andi 5 5 5 5');
  await kirim(OWNER, '#nilai tim 5');
  assert.match(await kirim(OWNER, '#poin Andi -10 SOP closing tidak dikerjakan'), /Andi\* -10 poin.*K0001/s);
  assert.match(await kirim(OWNER, '#poin Andi +20 bantu masak bumbu'), /\+20 poin/);
  assert.match(await kirim(PIC, '#poin Andi +5 rajin'), /hanya bisa dicatat owner/);
  assert.match(await kirim(PIC, '#kpi'), /bersifat pribadi/);
  const kpi = await kirim(OWNER, '#kpi');
  assert.match(kpi, /KPI November 2026.*1\. Andi \(Tetap\): \*95\*/s);
  assert.match(await kirim(OWNER, '#kpi Andi'), /komponen 85 \+ plus 20 − minus 10/);
  assert.match(await kirim(OWNER, '#poinbatal K0002'), /dibatalkan/);
  assert.match(await kirim(OWNER, '#kpi Andi'), /Skor akhir: \*75\/100\*/);
  assert.equal((await store.all('Poin KPI')).length, 2);
});

test('chat pribadi: PIC menjawab penilaian dari bot; orang lain diabaikan', async () => {
  const { store, ctx, kirim } = setup();
  await kirim(OWNER, BLOK);
  await store.append('Karyawan', { kode: 'K01', nama: 'Budi', nomor_wa: '082222222222', peran: 'PIC', status: 'AKTIF' });
  // sehari setelah event selesai (4 Nov) jam 10.00 WIB
  const tugas = await tugasPenilaian(ctx, new Date('2026-11-05T03:30:00Z'));
  assert.equal(tugas.length, 1);
  assert.equal(tugas[0].nomor, PIC);
  assert.match(tugas[0].text, /Penilaian KPI JMB26-11/);
  assert.equal((await tugasPenilaian(ctx, new Date('2026-11-05T05:00:00Z'))).length, 0); // tidak ditanya dua kali
  const dm = async (senderId, text) => (await handlePesan(ctx, { id: 'd', groupId: `${senderId}@s.whatsapp.net`, senderId, text, pribadi: true, waktu: WAKTU })).map((r) => r.text).join('\n');
  assert.match(await dm(PIC, '5 4 4 4'), /\(2\/3\)/);
  assert.equal(await dm('6289999999999', 'halo'), '');
  assert.equal((await store.all('Nilai KPI')).find((n) => n.nama === 'Andi').kinerja, 4);
});

test('tabel file KPI KARYAWAN', async () => {
  const { store, kirim } = setup();
  await kirim(OWNER, BLOK);
  await kirim(OWNER, '#nilai Andi 5 5 5 5');
  const data = await bacaData(store);
  const hasil = data.events.map((e) => hitungEvent(e, data));
  const t = tabelKpi(hasil, { nilai: await store.all('Nilai KPI'), poin: await store.all('Poin KPI') });
  assert.deepEqual(t.map((x) => x.tab), ['Peringkat & Bonus', 'Nilai per Event', 'Riwayat Poin', 'Cara Hitung']);
  const andi = t[1].baris.find((b) => b[3] === 'Andi');
  assert.equal(andi[10], 60);
  assert.match(andi[17], /Kinerja tim belum dinilai/);
  assert.ok(skorEvent(hasil[0], {}).length === 3 && rekapBulanKPI(hasil, {}).length === 3);
});
