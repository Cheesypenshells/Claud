import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlePesan } from '../src/handlers.js';
import { MemoryStore } from '../src/store/memory.js';
import { buatSesi } from '../src/sesi.js';
import { followersDari, tugasLaporan } from '../src/laporanFoto.js';

const OWNER = '6281111111111';
const PIC = '6282222222222';
const DENA = '6284444444444';
const TIAR = '6285555555555';
const G_KELUAR = 'keluar@g.us';
const G_TIM = 'tim@g.us';
const pada = (tgl, hhmm) => new Date(`2026-11-${tgl}T${hhmm}:00+07:00`);

test('followersDari: angka followers dari teks OCR Instagram', () => {
  assert.equal(followersDari('cheesypenshells\n312 12,5 rb 401\nPostingan Pengikut Mengikuti'), 12500);
  assert.equal(followersDari('312 posts 12.540 followers 401 following'), 12540);
  assert.equal(followersDari('1.204\nPostingan\n'), null);
});

test('laporan foto: loading in, harian (followers OCR, temuan, pulang), loading out', async () => {
  const store = new MemoryStore();
  let ocr = '';
  const ctx = { store, ownerIds: new Set([OWNER]), sesi: buatSesi(null), terakhir: new Map(), bacaGambar: async () => ocr };
  let n = 0;
  const kirimRaw = (groupId, senderId, text, waktu, extra = {}) => handlePesan(ctx, {
    id: `f${++n}`, groupId, groupName: groupId, senderId, senderName: 'X', text, adaFoto: false, waktu, ...extra,
  });
  const kirim = async (...a) => (await kirimRaw(...a)).map((r) => r.text).join('\n');
  const foto = (isi) => ({ adaFoto: true, ambilFoto: async () => Buffer.from(isi) });
  await kirim(G_KELUAR, OWNER, '#event\nKode: JMB26-11\nKota: Jambi\nIO: Kepo\nTanggal: 2-8 Nov 2026\nWilayah harga: Sumatra\nBagi hasil: 25%\nAdmin: 500rb\nJam buka: 11.00\nPIC: Budi\nSenior: Dena, Tiar', pada('01', '20:00'));
  await kirim(G_TIM, OWNER, '#daftar event JMB26-11', pada('01', '20:01'));
  await kirim(G_TIM, DENA, 'saya Dena', pada('01', '20:02'));
  await kirim(G_TIM, TIAR, 'saya Tiar', pada('01', '20:03'));
  await kirim(G_TIM, PIC, 'saya Budi', pada('01', '20:04'));

  // ---- loading in (hari pertama, 2 Nov) ----
  assert.match(await kirim(G_TIM, DENA, '#loadingin', pada('02', '06:00')), /Loading in JMB26-11 – 2026-11-02.*❌ Barang tiba → \*#tiba\*.*❌ Data pengiriman.*#kirim.*❌ ACC PIC/s);
  assert.match(await kirim(G_TIM, TIAR, 'barang sudah tiba semua pak', pada('02', '06:10'), foto('tiba1')),
    /Barang tiba\* \(#tiba\) dari \*Tiar\* jam 06:10 WIB tercatat.*Belum: #booth, #gudang, #listrik, #display, #kirim, #acc/s);
  assert.deepEqual(await kirimRaw(G_TIM, TIAR, '', pada('02', '06:11'), foto('tiba2')), []); // album: diam-diam
  await kirimRaw(G_TIM, TIAR, '', pada('02', '06:11'), foto('tiba3'));
  assert.equal((await store.all('Laporan Foto'))[0].jumlah_foto, 3);
  assert.match(await kirim(G_TIM, DENA, '#booth', pada('02', '08:00')), /wajib pakai foto/);
  assert.match(await kirim(G_TIM, DENA, '#booth', pada('02', '08:01'), { ...foto('b'), diteruskan: true }), /terusan \(forward\) tidak diterima/);
  assert.match(await kirim(G_TIM, DENA, '#booth', pada('02', '08:02'), foto('tiba1')), /sama persis/);
  assert.match(await kirim(G_TIM, DENA, 'booth sudah siap', pada('02', '08:03'), foto('booth1')), /Booth bagian bawah.*Dena/s);
  assert.match(await kirim(G_TIM, DENA, '#acc', pada('02', '09:00')), /hanya oleh PIC atau owner/);
  assert.match(await kirim(G_TIM, PIC, '#acc semua aman', pada('02', '09:01')), /ACC PIC sebelum buka.*Budi.*Belum: #gudang, #listrik, #display, #kirim/s);

  // ---- harian ----
  ocr = 'cheesypenshells\n312 12.500 401\nPostingan Pengikut Mengikuti';
  assert.match(await kirim(G_TIM, DENA, '#followers', pada('02', '10:50'), foto('ig1')), /Followers terbaca: \*12.500\*/);
  // saat buka: pengingat laporan sebelum buka & loading in yang belum
  const ingat = await tugasLaporan(ctx, pada('02', '11:00'));
  assert.equal(ingat[0].groupId, G_TIM);
  assert.match(ingat[0].text, /sudah buka.*#posisi, #grill, #cooler, #nampan.*Loading in belum lengkap.*Gudang belakang.*Data pengiriman/s);
  assert.equal((await tugasLaporan(ctx, pada('02', '11:01'))).length, 0);
  // temuan diteruskan ke grup pengeluaran
  const temuan = await kirimRaw(G_TIM, TIAR, '#temuan oyster bau 3 pcs, sudah dibuang', pada('02', '15:00'), foto('bau'));
  assert.match(temuan[0].text, /Temuan dari \*Tiar\* tercatat.*diteruskan/s);
  assert.equal(temuan[1].groupId, G_KELUAR);
  assert.match(temuan[1].text, /TEMUAN JMB26-11.*Tiar.*oyster bau 3 pcs/s);
  ocr = '312 12.540 401\nPostingan Pengikut Mengikuti';
  assert.match(await kirim(G_TIM, DENA, 'followers tutup', pada('02', '22:10'), foto('ig2')), /12.540\* \(\+40 sejak 10:50 WIB\)/);
  assert.match(await kirim(G_TIM, DENA, '#pulang', pada('02', '22:30')), /Absen pulang.*Dena/s);
  assert.match(await kirim(G_TIM, DENA, '#pulang', pada('02', '22:31')), /sudah #pulang/);
  const harian = await kirim(G_TIM, PIC, '#harian', pada('02', '22:40'));
  assert.match(harian, /Laporan harian JMB26-11 – 2026-11-02.*❌ Pembagian posisi.*✅ Followers.*12.500.*12.540.*✅ Temuan.*❌ Omzet harian.*Absen pulang: 1\/3 \(belum: Budi, Tiar\)/s);
  // obrolan tanpa foto tidak dibalas
  assert.equal(await kirim(G_TIM, DENA, 'cooler nya dimana ya', pada('03', '09:00')), '');

  // ---- loading out (hari terakhir, 8 Nov) ----
  assert.match(await kirim(G_TIM, TIAR, 'koli sudah dilabel 12 koli', pada('08', '23:00'), foto('koli')), /Koli balik\* \(#koli\).*Belum: #stokakhir, #bongkar, #muat, #terima/s);
  assert.match(await kirim(G_TIM, TIAR, '#loadingout', pada('08', '23:05')), /Loading out JMB26-11 – 2026-11-08.*✅ Koli balik: Tiar 23:00 WIB, 1 foto/s);
});

test('jobdesk loading in: dibagi rata H-2 jam 10.00 di grup tim, PJ tampil di #loadingin, #jobdesk', async () => {
  const { bagiJobdesk, tugasJobdesk } = await import('../src/jobdesk.js');
  // 6 orang: 4 tim booth (60%), 2 tim barang (40%); senior tersebar; penghitung koli dari tim barang
  const b6 = Object.fromEntries(bagiJobdesk(['S1', 'S2', 'S3', 'S4', 'D1', 'D2']).map((t) => [t.tag, t.nama]));
  assert.deepEqual(b6, { tiba: ['S2'], booth: ['S1', 'D2'], listrik: ['S3'], display: ['S4'], gudang: ['S2', 'D1'] });
  // 4 senior: booth 2 senior, stok bahan baku 2 orang
  const b4 = Object.fromEntries(bagiJobdesk(['S1', 'S2', 'S3', 'S4']).map((t) => [t.tag, t.nama]));
  assert.deepEqual(b4.gudang, ['S2', 'S4']);
  assert.deepEqual([...new Set([...b4.booth, ...b4.listrik, ...b4.display])], ['S1', 'S3']);
  // 2 orang: 1 booth (semua bagian), 1 barang + hitung koli
  const b2 = Object.fromEntries(bagiJobdesk(['A', 'B']).map((t) => [t.tag, t.nama]));
  assert.deepEqual(b2, { tiba: ['B'], booth: ['A'], listrik: ['A'], display: ['A'], gudang: ['B'] });

  const store = new MemoryStore();
  const ctx = { store, ownerIds: new Set([OWNER]), sesi: buatSesi(null), terakhir: new Map() };
  let n = 0;
  const kirim = async (groupId, senderId, text, waktu, extra = {}) => (await handlePesan(ctx, {
    id: `j${++n}`, groupId, groupName: groupId, senderId, senderName: 'X', text, adaFoto: false, waktu, ...extra,
  })).map((r) => r.text).join('\n');
  await kirim(G_KELUAR, OWNER, '#event\nKode: JMB26-11\nKota: Jambi\nIO: Kepo\nTanggal: 5-8 Nov 2026\nWilayah harga: Sumatra\nBagi hasil: 25%\nAdmin: 500rb\nJam buka: 11.00\nPIC: Budi\nSenior: Dena, Tiar\nDW: Joko, Tono', pada('01', '09:00'));
  await kirim(G_TIM, OWNER, '#daftar event JMB26-11', pada('01', '09:01'));
  const foto = (isi) => ({ adaFoto: true, ambilFoto: async () => Buffer.from(isi) });
  const { tanggalLokal } = await import('../src/util.js');
  assert.equal((await tugasJobdesk(ctx, pada('02', '12:00'), { tanggalLokal })).length, 0); // H-3: belum
  assert.equal((await tugasJobdesk(ctx, pada('03', '09:59'), { tanggalLokal })).length, 0); // H-2 sebelum jam 10
  const j = await tugasJobdesk(ctx, pada('03', '10:00'), { tanggalLokal });
  assert.equal(j[0].groupId, G_TIM);
  assert.match(j[0].text, /JOBDESK LOADING IN JMB26-11.*SEMUA turunkan barang.*Hitung & cek koli.*TIM BOOTH.*bagian BAWAH.*#booth.*bagian ATAS.*#listrik.*TIM BARANG.*#gudang/s);
  assert.doesNotMatch(j[0].text, /Budi/); // PIC tidak dibagi pekerjaan
  assert.equal((await tugasJobdesk(ctx, pada('04', '10:00'), { tanggalLokal })).length, 0); // sekali saja
  assert.match(await kirim(G_TIM, DENA, '#jobdesk', pada('04', '11:00')), /JOBDESK LOADING IN/);
  assert.match(await kirim(G_TIM, DENA, '#jobdesk ulang', pada('04', '11:01')), /hanya oleh owner atau PIC/);
  assert.match(await kirim(G_TIM, OWNER, '#loadingin', pada('05', '07:00')), /Booth bagian bawah.*👷/s);
  assert.match(await kirim(G_TIM, TIAR, 'lampu sudah nyala semua', pada('05', '08:00'), foto('lampu')), /Booth bagian atas.*\(#listrik\)/);
});

test('penilaian jobdesk: foto laporan -> bot tanya PIC lewat chat pribadi, jawaban jadi Poin KPI penanggung jawab', async () => {
  const store = new MemoryStore();
  const ctx = { store, ownerIds: new Set([OWNER]), sesi: buatSesi(null), terakhir: new Map() };
  let n = 0;
  const raw = (groupId, senderId, text, waktu, extra = {}) => handlePesan(ctx, {
    id: `n${++n}`, groupId, groupName: groupId, senderId, senderName: senderId === PIC ? 'Budi' : 'X', text, adaFoto: false, waktu, pribadi: groupId === 'dm', ...extra,
  });
  const foto = (isi) => ({ adaFoto: true, ambilFoto: async () => Buffer.from(isi) });
  await raw(G_KELUAR, OWNER, '#event\nKode: JMB26-11\nKota: Jambi\nIO: Kepo\nTanggal: 5-8 Nov 2026\nWilayah harga: Sumatra\nBagi hasil: 25%\nAdmin: 500rb\nJam buka: 11.00\nPIC: Budi\nSenior: Dena, Tiar', pada('01', '09:00'));
  await raw(G_TIM, OWNER, '#daftar event JMB26-11', pada('01', '09:01'));
  await raw(G_TIM, PIC, 'saya Budi', pada('01', '09:02'));
  await raw(G_TIM, DENA, 'saya Dena', pada('01', '09:03'));
  await raw(G_TIM, OWNER, '#jobdesk', pada('03', '10:00'));
  const { pjPerTag } = await import('../src/jobdesk.js');
  const pj = (await pjPerTag(ctx, 'JMB26-11', { denganBantu: true })).booth; // penanggung jawab + pembantu
  // foto booth -> pertanyaan ke chat pribadi PIC
  const r = await raw(G_TIM, DENA, '#booth', pada('05', '08:00'), foto('booth'));
  const tanya = r.find((b) => b.nomor === PIC);
  assert.match(tanya.text, new RegExp(`Cek jobdesk JMB26-11: Rakit booth bagian BAWAH.*Penanggung jawab: \\*${pj.join(', ')}\\*.*sesuai 10`, 's'));
  assert.match(r[0].text, /PIC akan mengecek/);
  // foto listrik juga -> antre
  const r2 = await raw(G_TIM, DENA, '#listrik', pada('05', '08:10'), foto('listrik'));
  assert.match(r2.find((b) => b.nomor === PIC).text, /masih ada 1 pekerjaan lain/);
  // PIC menjawab di chat pribadi
  const j = await raw('dm', PIC, 'kurang 7 banner miring', pada('05', '09:00'));
  assert.match(j[0].text, /Rakit booth bagian BAWAH.*kurang sesuai, \*\+7 poin\* untuk .*banner miring.*Cek jobdesk JMB26-11: Rakit booth bagian ATAS/s);
  const poin = await store.all('Poin KPI');
  assert.deepEqual(poin.map((p) => [p.nama, p.poin]), pj.map((nm) => [nm, 7]));
  assert.match(poin[0].alasan, /^Jobdesk #booth .*kurang sesuai – banner miring/);
  assert.match((await store.all('Laporan Foto')).find((x) => x.tag === 'booth').penilaian, /kurang sesuai, 7 poin/);
  assert.match((await raw('dm', PIC, 'sesuai 10', pada('05', '09:05')))[0].text, /bagian ATAS.*sesuai, \*\+10 poin\*/s);
  // pekerjaan yang sudah dinilai tidak ditanya lagi
  const r3 = await raw(G_TIM, DENA, '#booth', pada('05', '09:30'), foto('booth2'));
  assert.ok(!r3.some((b) => b.nomor));
});

test('jobdesk: PJ cek barang tiba membantu rakit booth; pembantu ikut tercantum & dapat poin booth', async () => {
  const { bagiJobdesk, pembantuDari } = await import('../src/jobdesk.js');
  const b = bagiJobdesk(['Adit', 'Alam', 'Bima', 'Imam', 'TiarA', 'Veri']);
  assert.deepEqual(b.find((t) => t.tag === 'booth').nama, ['Adit', 'Veri']);
  assert.deepEqual(b.find((t) => t.tag === 'tiba').nama, ['Alam']);
  assert.deepEqual(pembantuDari(Object.fromEntries(b.map((t) => [t.tag, t.nama]))), { booth: ['Alam'] });

  const store = new MemoryStore();
  const ctx = { store, ownerIds: new Set([OWNER]), sesi: buatSesi(null), terakhir: new Map() };
  let n = 0;
  const raw = (groupId, senderId, text, waktu, extra = {}) => handlePesan(ctx, {
    id: `b${++n}`, groupId, groupName: groupId, senderId, senderName: 'X', text, adaFoto: false, waktu, pribadi: groupId === 'dm', ...extra,
  });
  await raw(G_KELUAR, OWNER, '#event\nKode: SMR26-11\nKota: Semarang\nIO: Kepo\nTanggal: 5-8 Nov 2026\nWilayah harga: Jawa\nBagi hasil: 30%\nAdmin: 0\nJam buka: 10.00\nPIC: Budi\nSenior: Adit, Alam, Bima, Imam, TiarA, Veri', pada('01', '09:00'));
  await raw(G_TIM, OWNER, '#daftar event SMR26-11', pada('01', '09:01'));
  await raw(G_TIM, PIC, 'saya Budi', pada('01', '09:02'));
  const j = (await raw(G_TIM, OWNER, '#jobdesk', pada('03', '10:00')))[0].text;
  assert.match(j, /bagian BAWAH.*👷 Adit, Veri.*🤝 Dibantu: Alam \(setelah hitung koli selesai\)/s);
  assert.match(j, /Hitung & cek koli.*👷 Alam.*Setelah selesai, bantu rakit booth/s);
  assert.match((await raw(G_TIM, OWNER, '#loadingin', pada('05', '07:00'))).map((x) => x.text).join('\n'), /Booth bagian bawah.*👷 Adit, Veri 🤝 Alam/s);
  const r = await raw(G_TIM, PIC, '#booth', pada('05', '08:00'), { adaFoto: true, ambilFoto: async () => Buffer.from('b') });
  assert.match(r.find((x) => x.nomor === PIC).text, /Penanggung jawab: \*Adit, Veri, Alam\*/);
  await raw('dm', PIC, 'sesuai 9', pada('05', '09:00'));
  assert.deepEqual((await store.all('Poin KPI')).map((p) => p.nama), ['Adit', 'Veri', 'Alam']);
});
