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
    /Barang tiba\* \(#tiba\) dari \*Tiar\* jam 06:10 WIB tercatat.*Belum: #booth, #gudang, #kirim, #acc/s);
  assert.deepEqual(await kirimRaw(G_TIM, TIAR, '', pada('02', '06:11'), foto('tiba2')), []); // album: diam-diam
  await kirimRaw(G_TIM, TIAR, '', pada('02', '06:11'), foto('tiba3'));
  assert.equal((await store.all('Laporan Foto'))[0].jumlah_foto, 3);
  assert.match(await kirim(G_TIM, DENA, '#booth', pada('02', '08:00')), /wajib pakai foto/);
  assert.match(await kirim(G_TIM, DENA, '#booth', pada('02', '08:01'), { ...foto('b'), diteruskan: true }), /terusan \(forward\) tidak diterima/);
  assert.match(await kirim(G_TIM, DENA, '#booth', pada('02', '08:02'), foto('tiba1')), /sama persis/);
  assert.match(await kirim(G_TIM, DENA, 'booth sudah siap', pada('02', '08:03'), foto('booth1')), /Booth selesai dirakit.*Dena/s);
  assert.match(await kirim(G_TIM, DENA, '#acc', pada('02', '09:00')), /hanya oleh PIC atau owner/);
  assert.match(await kirim(G_TIM, PIC, '#acc semua aman', pada('02', '09:01')), /ACC PIC sebelum buka.*Budi.*Belum: #gudang, #kirim/s);

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
