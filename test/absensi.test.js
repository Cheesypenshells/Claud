import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlePesan } from '../src/handlers.js';
import { MemoryStore } from '../src/store/memory.js';
import { buatSesi } from '../src/sesi.js';
import { dendaTelat, zonaKota, jadwalHari, tugasAbsensi, gayaHari } from '../src/absensi.js';

const OWNER = '6281111111111';
const PIC = '6282222222222';
const DENA = '6284444444444';
const TIAR = '6285555555555';
const G_KELUAR = 'keluar@g.us';
const G_TIM = 'tim@g.us';
const jam = (hhmm) => new Date(`2026-11-03T${hhmm}:00+07:00`); // WIB (Jambi)

test('denda telat: 1-15 = 10rb, 16-30 = 25rb, >30 = 50rb per jam (kelipatan)', () => {
  assert.deepEqual([0, 1, 15, 16, 30, 31, 60, 61, 120, 121].map(dendaTelat), [0, 10000, 10000, 25000, 25000, 50000, 50000, 100000, 100000, 150000]);
});

test('zona waktu kota event & jadwal hari: gaya 2 jam, batas 1 jam sebelum buka', () => {
  assert.equal(zonaKota('Lombok').nama, 'WITA');
  assert.equal(zonaKota('Semarang').nama, 'WIB');
  assert.equal(zonaKota('Jayapura').nama, 'WIT');
  const j = jadwalHari({ jam_buka: '11.00', kota: 'Bali' }, '2026-11-03');
  assert.equal(j.buka.toISOString(), '2026-11-03T03:00:00.000Z'); // 11.00 WITA
  assert.equal(j.batas.toISOString(), '2026-11-03T02:00:00.000Z');
  assert.equal(j.umum.toISOString(), '2026-11-03T01:00:00.000Z');
});

test('absensi foto: pengumuman gaya, absen tepat waktu / telat dengan denda, tolak & bebas denda', async () => {
  const store = new MemoryStore();
  const ctx = { store, ownerIds: new Set([OWNER]), sesi: buatSesi(null), terakhir: new Map() };
  let n = 0;
  const kirim = async (groupId, senderId, text, waktu, extra = {}) => (await handlePesan(ctx, {
    id: `a${++n}`, groupId, groupName: groupId, senderId, senderName: 'X', text, adaFoto: false, waktu, ...extra,
  })).map((r) => r.text).join('\n');
  const foto = (isi) => ({ adaFoto: true, ambilFoto: async () => Buffer.from(isi) });
  await kirim(G_KELUAR, OWNER, '#event\nKode: JMB26-11\nKota: Jambi\nIO: Kepo\nTanggal: 2-8 Nov 2026\nWilayah harga: Sumatra\nBagi hasil: 25%\nAdmin: 500rb\nJam buka: 11.00\nPIC: Budi\nSenior: Dena, Tiar\nDW: Joko', jam('07:00'));
  await kirim(G_TIM, OWNER, '#daftar event JMB26-11', jam('07:01'));
  await kirim(G_TIM, DENA, 'saya Dena', jam('07:02'));
  await kirim(G_TIM, TIAR, 'saya Tiar', jam('07:03'));
  await kirim(G_TIM, PIC, 'saya Budi', jam('07:04'));

  // 08.59: belum ada pengumuman; 09.00 (2 jam sebelum buka): gaya foto diumumkan
  assert.equal((await tugasAbsensi(ctx, jam('08:59'))).length, 0);
  const umum = await tugasAbsensi(ctx, jam('09:00'));
  assert.equal(umum.length, 1);
  assert.equal(umum[0].groupId, G_TIM);
  assert.match(umum[0].text, /ABSENSI JMB26-11 – 2026-11-03.*buka \*11:00 WIB\*.*paling lambat \*10:00 WIB\*.*Gaya foto hari ini.*caption: \*absen\*.*1–15 menit: \*Rp 10.000\*/s);
  assert.equal((await tugasAbsensi(ctx, jam('09:05'))).length, 0); // tidak diulang
  const gaya = gayaHari('JMB26-11', '2026-11-03').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // foto sebelum pengumuman ditolak (hari lain disimulasikan lewat jam 08:00)
  assert.match(await kirim(G_TIM, DENA, 'absen', jam('08:00'), foto('x')), /belum dibagikan.*09:00 WIB/s);
  // tanpa foto
  assert.match(await kirim(G_TIM, DENA, 'absen', jam('09:30')), /wajib pakai \*foto\*/);
  // tepat waktu
  assert.match(await kirim(G_TIM, DENA, 'absen', jam('09:50'), foto('dena1')), new RegExp(`Absen \\*Dena\\* jam 09:50 WIB tercatat. ✅ Tepat waktu.*${gaya}`, 's'));
  assert.match(await kirim(G_TIM, DENA, 'absen', jam('09:55'), foto('dena2')), /sudah absen hari ini jam 09:50/);
  // forward & foto kembar ditolak
  assert.match(await kirim(G_TIM, TIAR, 'absen', jam('10:05'), { ...foto('t'), diteruskan: true }), /terusan \(forward\) tidak diterima/);
  assert.match(await kirim(G_TIM, TIAR, 'absen', jam('10:06'), foto('dena1')), /sama persis/);
  // nomor tak dikenal
  assert.match(await kirim(G_TIM, '6289999999999', 'absen', jam('10:06'), foto('z')), /belum dikenal.*saya \[nama kamu\]/s);

  // 10.00: pengingat yang belum absen
  const ingat = await tugasAbsensi(ctx, jam('10:00'));
  assert.match(ingat[0].text, /Batas absen 10:00 WIB sudah lewat.*Belum absen: \*Budi, Tiar, Joko\*/s);

  // telat 17 menit -> 25rb
  const idTiar = `a${n + 1}`;
  assert.match(await kirim(G_TIM, TIAR, 'absen', jam('10:17'), foto('tiar1')), /Telat \*17 menit\* → denda \*Rp 25.000\*/);
  // karyawan biasa tidak bisa menolak; PIC bisa
  assert.match(await kirim(G_TIM, DENA, 'tolak', jam('10:20'), { kutipan: { id: idTiar, teks: 'absen' } }), /Hanya owner atau PIC/);
  assert.match(await kirim(G_TIM, PIC, 'tolak gaya salah', jam('10:21'), { kutipan: { id: idTiar, teks: 'absen' } }), /Absen \*Tiar\* 2026-11-03 \*ditolak\*/);
  // foto ulang jam 11.10 -> telat 70 menit -> 100rb
  const idTiar2 = `a${n + 1}`;
  assert.match(await kirim(G_TIM, TIAR, 'absen', jam('11:10'), foto('tiar2')), /Telat \*70 menit\* → denda \*Rp 100.000\*/);
  // owner memaafkan
  assert.match(await kirim(G_TIM, OWNER, 'bebas denda izin ban bocor', jam('11:15'), { kutipan: { id: idTiar2, teks: 'absen' } }), /Denda absen \*Tiar\* 2026-11-03 dihapus/);
  // absen manual oleh PIC: Joko datang 10.40 -> 40 menit -> 50rb
  assert.match(await kirim(G_TIM, PIC, '#absen Joko 10.40', jam('11:20')), /Absen manual \*Joko\* jam 10.40 WIB.*Telat 40 menit → denda \*Rp 50.000\*/s);
  assert.match(await kirim(G_TIM, PIC, '#absen', jam('11:30')), /✅ Dena 09:50 WIB.*✅ Tiar 11:10 WIB.*✅ Joko 10:40 WIB – telat 40 mnt.*Belum absen: \*Budi\*/s);
  assert.match(await kirim(G_KELUAR, OWNER, '#absen denda', jam('11:31')), /Dena: 1 hari, telat 0× → \*Rp 0\*.*Tiar: 1 hari, telat 1× → \*Rp 0\*.*Joko: 1 hari, telat 1× → \*Rp 50.000\*.*Total denda: Rp 50.000/s);
  // obrolan yang menyebut absen tidak dibalas
  assert.equal(await kirim(G_TIM, DENA, 'nanti jangan lupa absen ya teman teman', jam('11:40')), '');
});
