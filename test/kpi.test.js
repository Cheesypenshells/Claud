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
  assert.match(andi[18], /Kinerja tim belum dinilai/); // kolom Laporan Terlewat ada sebelum TOTAL
  assert.ok(skorEvent(hasil[0], {}).length === 3 && rekapBulanKPI(hasil, {}).length === 3);
});

test('komplain dari QR booth: diteruskan ke owner sekali, mengurangi KPI kelompok (BATAL tidak dihitung)', async () => {
  const { MemoryStore } = await import('../src/store/memory.js');
  const { tugasKomplain, komplainAktif } = await import('../src/komplain.js');
  const store = new MemoryStore();
  const ctx = { store, ownerIds: new Set(['6281111111111']) };
  await store.append('Komplain', { id: 'C1', waktu: '2026-11-15 19:00:00', kode_event: 'SMR26-11', lokasi: 'Semarang – Kepo market', kategori: 'Oyster tidak fresh', detail: 'oyster bau', nama: '', kontak: '', status: 'BARU', diteruskan: '' });
  await store.append('Komplain', { id: 'C2', waktu: '2026-11-15 19:10:00', kode_event: 'SMR26-11', lokasi: '', kategori: 'Lainnya', detail: 'iseng', status: 'BATAL', diteruskan: '' });
  const t = await tugasKomplain(ctx, new Date('2026-11-15T12:01:00Z'));
  assert.equal(t.length, 1);
  assert.equal(t[0].nomor, '6281111111111');
  assert.match(t[0].text, /Komplain pelanggan SMR26-11.*Oyster tidak fresh.*oyster bau.*anonim/s);
  assert.equal((await tugasKomplain(ctx)).length, 0); // tidak dikirim dua kali
  assert.equal((await store.all('Komplain'))[0].status, 'DITERUSKAN');
  const aktif = await komplainAktif(store);
  assert.deepEqual(aktif.map((k) => k.id), ['C1']);
  const { skorEvent } = await import('../src/kpi.js');
  const r = { event: { kode: 'SMR26-11', target_omzet: '' }, omzetBersih: 0, barisTim: [{ nama: 'Adit', peran: 'Tetap', hari: 9, bonus: 0 }] };
  assert.equal(skorEvent(r, { komplain: aktif })[0].komplain, 8);
  assert.equal(skorEvent(r, { komplain: aktif })[0].jumlahKomplain, 1);
});

test('KPI otomatis: absen (−2 telat, −6 tidak hadir tanpa izin), bintang kasir jadi kinerja, laporan terlewat −2', async () => {
  const { teksOtomatis } = await import('../src/kpi.js');
  const r = {
    event: { kode: 'SMR', mulai: '2026-11-14', selesai: '2026-11-16', target_omzet: '' }, omzetBersih: 0,
    barisTim: [{ nama: 'Tiara', peran: 'Tetap', hari: 3 }, { nama: 'Bima', peran: 'Tetap', hari: 3 }, { nama: 'Joko', peran: 'DW', hari: 3 }],
  };
  const ab = (tanggal, nama, telat = 0) => ({ kode_event: 'SMR', tanggal, nama, telat_menit: telat, status: 'OK' });
  const absensi = [ab('2026-11-14', 'Tiara', 5), ab('2026-11-14', 'Bima'), ab('2026-11-14', 'Joko', 12),
    ab('2026-11-15', 'Tiara'), ab('2026-11-15', 'Joko'), ab('2026-11-16', 'Bima'), ab('2026-11-16', 'Joko')];
  const izin = [{ kode_event: 'SMR', tanggal: '2026-11-16', nama: 'Tiara', jenis: 'IZIN', status: 'OK' }];
  const q = (kasir, rating) => ({ kode_event: 'SMR', kasir, rating });
  const antrian = [5, 5, 4, 5, 5].map((b) => q('tiara', b)).concat([q('Bima', 3), q('Bima', 4)]);
  const jobdesk = [{ kode_event: 'SMR', tag: 'booth', nama: 'Tiara' }, { kode_event: 'SMR', tag: 'gudang', nama: 'Bima' }];
  const lap = (tag, nama, tanggal) => ({ kode_event: 'SMR', tag, nama, tanggal, status: 'OK' });
  const laporan = [lap('booth', 'Tiara', '2026-11-13'), lap('pulang', 'Tiara', '2026-11-14'), lap('pulang', 'Bima', '2026-11-14'), lap('pulang', 'Bima', '2026-11-16')];
  const nilai = [{ kode_event: 'SMR', nama: 'Tiara', absen: 1, kinerja: 1, attitude: 5, karir: 5 }];
  const s = Object.fromEntries(skorEvent(r, { nilai, absensi, izin, antrian, laporan, jobdesk, hariIni: '2026-11-17' }).map((x) => [x.nama, x]));
  assert.equal(s.Tiara.absen, 10);              // telat 1× (tgl 16 izin: tidak dipotong)
  assert.equal(s.Bima.absen, 6);               // tidak hadir tgl 15 tanpa izin
  assert.equal(s.Joko.absen, 10);              // DW: hanya telat yang dihitung
  assert.equal(s.Tiara.kinerja, 23.04);        // ⭐ 4,8 / 5 × 24 (angka PIC 1 tidak dipakai)
  assert.equal(s.Bima.kinerja, null);          // baru 2 penilaian
  assert.deepEqual(s.Tiara.laporanTerlewat, ['#pulang 11-15']);
  assert.deepEqual(s.Bima.laporanTerlewat, ['#gudang']);
  assert.equal(s.Joko.laporanMinus, 6);
  assert.equal(s.Tiara.total, 90.04);          // 10 + 23,04 + 12 + 12 + kelompok 35 − 2
  assert.match(teksOtomatis(s.Tiara), /absen otomatis 10\/12.*telat 1×.*⭐ 4,8 dari 5 penilaian → kinerja 23.04\/24.*laporan terlewat #pulang 11-15 \(−2\)/);
  // event tanpa data absensi: absen tetap dari nilai PIC
  const lama = skorEvent(r, { nilai, hariIni: '2026-11-17' }).find((x) => x.nama === 'Tiara');
  assert.equal(lama.absen, 2.4);
});

test('tugas harian: pembagian 3/4/5/6 orang, kasir & pemanggang tetap, plating bergilir', async () => {
  const { bagiTugas } = await import('../src/tugasHarian.js');
  const s = (d) => d.map((x) => `${x.bagian}:${x.nama}${x.rangkap ? '*' : ''}`).join(' ');
  assert.equal(s(bagiTugas(['Tiara', 'Veri', 'Bima'], { kasir: 'Tiara', pemanggang: 'Veri' })), 'Kasir:Tiara Pemanggang:Veri Plating:Tiara* Getok:Bima');
  assert.equal(s(bagiTugas(['Tiara', 'Veri', 'Bima', 'Imam'], { kasir: 'tiara', pemanggang: 'Veri' })), 'Kasir:Tiara Pemanggang:Veri Plating:Tiara* Getok:Bima Getok:Imam');
  assert.equal(s(bagiTugas(['Tiara', 'Veri', 'Bima', 'Imam', 'Adit'], { kasir: 'Tiara', pemanggang: 'Veri' })), 'Kasir:Tiara Pemanggang:Veri Plating:Bima Getok:Imam Getok:Adit');
  assert.equal(s(bagiTugas(['Tiara', 'Veri', 'Bima', 'Imam', 'Adit'], { kasir: 'Tiara', pemanggang: 'Veri', hariKe: 1 })), 'Kasir:Tiara Pemanggang:Veri Plating:Imam Getok:Adit Getok:Bima');
  assert.equal(s(bagiTugas(['A', 'B', 'C', 'D', 'E', 'F'], { kasir: 'A', pemanggang: 'B' })), 'Kasir:A Pemanggang:B Plating:C Getok:D Getok:E Getok:F');
});

test('KPI: laporan per bagian harian, stok −2 per selisih sidak (rata), hari lambat > 7 menit −2 kelompok', async () => {
  const { tungguPerHari, teksOtomatis } = await import('../src/kpi.js');
  const r = { event: { kode: 'SMR', mulai: '2026-11-14', selesai: '2026-11-15', target_omzet: '' }, omzetBersih: 0,
    barisTim: [{ nama: 'Tiara', peran: 'Tetap', hari: 2 }, { nama: 'Bima', peran: 'Tetap', hari: 2 }] };
  const tugas = [{ kode_event: 'SMR', tanggal: '2026-11-14', bagian: 'Kasir', nama: 'Tiara' }, { kode_event: 'SMR', tanggal: '2026-11-14', bagian: 'Plating', nama: 'Tiara' },
    { kode_event: 'SMR', tanggal: '2026-11-14', bagian: 'Getok', nama: 'Bima' }];
  const lap = (tag, t) => ({ kode_event: 'SMR', tag, tanggal: t, status: 'OK' });
  const laporan = [lap('depan', '2026-11-14'), lap('cooler', '2026-11-14')]; // followers & nampan tidak ada
  const sidak = [{ kode_event: 'SMR', bahan: 'Mozzarella', selisih: -2 }, { kode_event: 'SMR', bahan: 'Garlic', selisih: 0 }, { kode_event: 'SMR', bahan: 'Nampan Garlic', selisih: -1 }];
  const q = (t, a, b) => ({ kode_event: 'SMR', tanggal: t, dibuat: `${t} ${a}:00`, dipanggil: `${t} ${b}:00`, status: 'DIAMBIL' });
  const antrian = [q('2026-11-14', '10:00', '10:05'), q('2026-11-14', '10:10', '10:20'), q('2026-11-15', '11:00', '11:04')];
  assert.deepEqual(tungguPerHari(antrian, 'SMR'), { '2026-11-14': 7.5, '2026-11-15': 4 });
  const s = Object.fromEntries(skorEvent(r, { tugas, laporan, sidak, antrian, hariIni: '2026-11-16' }).map((x) => [x.nama, x]));
  assert.deepEqual(s.Tiara.laporanTerlewat, ['#followers 11-14', '#nampan 11-14']);
  assert.deepEqual(s.Bima.laporanTerlewat, []);
  assert.equal(s.Tiara.stok, 6); assert.equal(s.Bima.stok, 6);   // 2 bahan selisih, sama untuk semua
  assert.equal(s.Tiara.lambatMinus, 2);                          // 14 Nov rata-rata 7,5 menit
  assert.equal(s.Tiara.kelompok, 15 + 6 + 10 - 2);
  assert.match(teksOtomatis(s.Tiara), /stok 6\/10 \(2 selisih saat sidak\).*layanan lambat.*11-14 7.5 mnt/);
});
