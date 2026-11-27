import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlePesan } from '../src/handlers.js';
import { MemoryStore } from '../src/store/memory.js';
import { buatSesi } from '../src/sesi.js';
import { tugasArsip } from '../src/arsip.js';
import { skorEvent, skorEventAtauArsip, bahanKpi } from '../src/kpi.js';
import { bacaData } from '../src/main.js';
import { hitungEvent } from '../src/laporan.js';

const OWNER = '6281111111111';
const G_KELUAR = 'keluar@g.us';
const waktu = (tgl, hhmm = '10:00') => new Date(`${tgl}T${hhmm}:00+07:00`);

async function siapkan({ nilaiBima = true } = {}) {
  const store = new MemoryStore();
  const ctx = { store, ownerIds: new Set([OWNER]), sesi: buatSesi(null), terakhir: new Map() };
  const kirim = (text, w, extra = {}) => handlePesan(ctx, { id: `a${Math.random()}`, groupId: extra.pribadi ? 'dm' : G_KELUAR, groupName: G_KELUAR, senderId: extra.senderId || OWNER, senderName: 'George', text, adaFoto: false, waktu: w, ...extra }).then((r) => r.map((x) => x.text).join('\n'));
  await kirim('#event\nKode: SMR26-11\nKota: Semarang\nIO: Kepo\nTanggal: 14-22 Nov 2026\nWilayah harga: Jawa\nBagi hasil: 30%\nAdmin: 0\nJam buka: 10.00\nPIC: George\nSenior: Tiara, Bima', waktu('2026-11-14', '07:00'));
  await store.update('Event', 'kode', 'SMR26-11', { file_event: 'FILE-SMR' });
  await store.append('Event', { kode: 'LAIN26-12', kota: 'Lain', mulai: '2026-12-01', selesai: '2026-12-05', status: 'AKTIF' });
  // data kerja event (dibersihkan) + event lain (tidak boleh tersentuh)
  for (let i = 1; i <= 3; i++) await store.append('Antrian', { id: `Q${i}`, kode_event: 'SMR26-11', nomor: i, status: 'DIAMBIL', teks_struk: i === 1 ? '=BERBAHAYA' : `struk ${i}` });
  await store.append('Antrian', { id: 'Q9', kode_event: 'LAIN26-12', nomor: 1 });
  for (const tag of ['depan', 'pulang']) await store.append('Laporan Foto', { id: `L${tag}`, kode_event: 'SMR26-11', tanggal: '2026-11-15', tag, nama: 'Tiara', status: 'OK' });
  await store.append('Tugas Harian', { tanggal: '2026-11-15', kode_event: 'SMR26-11', bagian: 'Kasir', nama: 'Tiara', status: 'OK' });
  await store.append('Tugas Harian', { tanggal: '2026-12-02', kode_event: 'LAIN26-12', bagian: 'Kasir', nama: 'Tiara', status: 'OK' });
  // sumber KPI yang TETAP
  for (const nama of ['Tiara', 'Bima']) await store.append('Absensi', { tanggal: '2026-11-15', kode_event: 'SMR26-11', nama, telat_menit: nama === 'Bima' ? 30 : 0, denda: nama === 'Bima' ? 25000 : 0, status: 'OK' });
  await store.append('Nilai Harian', { tanggal: '2026-11-15', kode_event: 'SMR26-11', nama: 'Tiara', poin: 90, status: 'OK' });
  if (nilaiBima) await store.append('Nilai Harian', { tanggal: '2026-11-15', kode_event: 'SMR26-11', nama: 'Bima', poin: 60, status: 'OK' });
  await store.append('Omzet', { tanggal: '2026-11-15', kode_event: 'SMR26-11', omzet: 10000000, status: 'OK' });
  await store.append('Transaksi', { id: 'T1', tanggal: '2026-11-15', kode_event: 'SMR26-11', jenis: 'Pengeluaran', nominal: 500000, keterangan: 'es batu', status: 'OK' });
  return { store, ctx, kirim };
}
const skorLive = async (store, hariIni) => { const d = await bacaData(store); return skorEvent(hitungEvent(d.events.find((e) => e.kode === 'SMR26-11'), d), { ...(await bahanKpi(store)), hariIni }); };

test('arsip: hanya owner, daftar & pratinjau; belum 7 hari tidak bisa dijalankan', async () => {
  const { kirim } = await siapkan();
  assert.match(await kirim('#arsip', waktu('2026-11-23'), { senderId: '6289999999999' }), /hanya oleh owner/);
  const daftar = await kirim('#arsip', waktu('2026-11-23'), { pribadi: true });
  assert.match(daftar, /SMR26-11.*⏳ bisa diarsipkan mulai 29 Nov/);
  const pratinjau = await kirim('#arsip SMR26-11', waktu('2026-11-23'), { pribadi: true });
  assert.match(pratinjau, /Pratinjau arsip SMR26-11.*⏳ Baru bisa diarsipkan mulai 29 Nov.*struk & pesanan kasir: 3 baris.*laporan foto.*: 2 baris.*Tetap di sheet:.*Omzet, Transaksi.*Dibekukan permanen:\* hasil akhir KPI 2 orang/s);
  assert.match(await kirim('#arsip SMR26-11 ya', waktu('2026-11-23'), { pribadi: true }), /baru bisa diarsipkan mulai 29 Nov/);
});

test('arsip: orang belum punya skor menghentikan arsip (kecuali paksa); tidak ada data dihapus', async () => {
  const { store, kirim } = await siapkan({ nilaiBima: false });
  const jawab = await kirim('#arsip SMR26-11 ya', waktu('2026-11-29'), { pribadi: true });
  assert.match(jawab, /Arsip dihentikan: Bima belum punya skor akhir/);
  assert.equal((await store.all('Antrian')).filter((r) => r.kode_event === 'SMR26-11').length, 3);
});

test('arsip: bekukan KPI, salin ke file event, verifikasi, baru hapus; KPI & pembukuan tetap sama; event lain tidak tersentuh', async () => {
  const { store, kirim, ctx } = await siapkan();
  const sebelum = await skorLive(store, '2026-11-29');
  assert.ok(sebelum.every((s) => s.total !== null));
  assert.ok(sebelum.find((s) => s.nama === 'Tiara').laporanMinus > 0); // laporan terlewat dihitung dari data harian

  const selesai = await kirim('#arsip SMR26-11 ya', waktu('2026-11-29'), { pribadi: true });
  assert.match(selesai, /Arsip SMR26-11 selesai.*7 baris dibersihkan.*struk & pesanan kasir: ditahan 31 hari untuk riwayat kasir.*KPI 2 orang dibekukan permanen/s);
  // data kerja event itu hilang dari sheet utama, event lain utuh
  // riwayat kasir (Antrian) ditahan 31 hari supaya bisa dilihat di halaman kasir; yang lain dibersihkan
  assert.equal((await store.all('Antrian')).filter((r) => r.kode_event === 'SMR26-11').length, 3);
  assert.equal((await store.all('Laporan Foto')).length, 0);
  assert.equal((await store.all('Antrian')).filter((r) => r.kode_event === 'LAIN26-12').length, 1);
  assert.equal((await store.all('Tugas Harian')).filter((r) => r.kode_event === 'LAIN26-12').length, 1);
  // sisa data kerja (absensi, nilai harian, dll.) ikut dibersihkan; yang TETAP: pembukuan & KPI
  assert.equal((await store.all('Absensi')).length, 0);
  assert.equal((await store.all('Nilai Harian')).length, 0);
  assert.equal(store.tabel['FILE-SMR/Arsip Absensi'].baris.length, 2);
  assert.equal(store.tabel['FILE-SMR/Arsip Nilai Harian'].baris.length, 2);
  assert.equal((await store.all('Omzet')).length, 1);
  assert.equal((await store.all('Transaksi')).length, 1);
  assert.equal((await store.all('Event')).filter((e) => e.kode === 'SMR26-11').length, 1);
  assert.equal((await store.all('Tim Event')).length >= 2, true);
  // salinan di file event (Drive), sel berawalan "=" dibuat teks
  const salinan = store.tabel['FILE-SMR/Arsip Antrian'];
  assert.equal(salinan.baris.length, 3);
  assert.ok(salinan.kolom.includes('Teks Struk'));
  assert.equal((await store.all('Arsip Event')).length, 1);
  assert.equal((await store.all('Arsip KPI')).length, 2);
  // KPI sesudah arsip = persis sama dengan sebelum (dibaca dari arsip), walau perhitungan ulang dari data harian kini berbeda
  const d = await bacaData(store);
  const r = hitungEvent(d.events.find((e) => e.kode === 'SMR26-11'), d);
  const sesudah = skorEventAtauArsip(r, await bahanKpi(store));
  assert.deepEqual(sesudah.map((s) => [s.nama, s.total, s.laporanMinus]), sebelum.map((s) => [s.nama, s.total, s.laporanMinus]));
  const hitungUlang = await skorLive(store, '2026-11-29');
  assert.notDeepEqual(hitungUlang.find((s) => s.nama === 'Tiara').laporanTerlewat, sebelum.find((s) => s.nama === 'Tiara').laporanTerlewat); // tanpa arsip hasilnya berubah
  assert.deepEqual(sesudah.find((s) => s.nama === 'Tiara').laporanTerlewat, sebelum.find((s) => s.nama === 'Tiara').laporanTerlewat); // dengan arsip tetap
  // rapor & gaji memakai arsip
  const { rincianGajian } = await import('../src/gajian.js');
  const gaji = (await rincianGajian({ store }, { kode: 'SMR26-11' })).orang;
  assert.equal(gaji.find((o) => o.nama === 'Tiara').skor, sebelum.find((s) => s.nama === 'Tiara').total);
  assert.equal(gaji.find((o) => o.nama === 'Bima').denda.telat, 25000); // denda telat dibaca dari KPI beku (absensi sudah dibersihkan)
  // dijalankan lagi: sudah diarsipkan
  assert.match(await kirim('#arsip SMR26-11 ya', waktu('2026-11-30'), { pribadi: true }), /sudah diarsipkan/);
  assert.match(await kirim('#arsip', waktu('2026-11-30'), { pribadi: true }), /SMR26-11.*✅ sudah diarsipkan/);
  void ctx;
});

test('arsip: salinan tidak cocok -> berhenti sebelum menghapus apa pun', async () => {
  const { store, kirim } = await siapkan();
  store.tulisArsip = async () => 1; // salinan gagal / terpotong
  const jawab = await kirim('#arsip SMR26-11 ya', waktu('2026-11-29'), { pribadi: true });
  assert.match(jawab, /dihentikan di tahap menyalin.*Tidak ada data yang dihapus/s);
  assert.equal((await store.all('Antrian')).filter((r) => r.kode_event === 'SMR26-11').length, 3);
  assert.equal((await store.all('Laporan Foto')).length, 2);
  assert.equal((await store.all('Arsip Event')).length, 0);
});

test('arsip: event tanpa file event di Drive berhenti sebelum membekukan atau menghapus', async () => {
  const { store, kirim } = await siapkan();
  await store.update('Event', 'kode', 'SMR26-11', { file_event: '' });
  assert.match(await kirim('#arsip SMR26-11 ya', waktu('2026-11-29'), { pribadi: true }), /belum punya file event di Drive/);
  assert.equal((await store.all('Arsip KPI')).length, 0);
});

test('tugasArsip: owner diberi tahu sekali, 7 hari setelah event selesai', async () => {
  const { ctx } = await siapkan();
  assert.equal((await tugasArsip(ctx, waktu('2026-11-28', '11:00'))).length, 0); // belum 7 hari
  assert.equal((await tugasArsip(ctx, waktu('2026-11-29', '09:00'))).length, 0); // sebelum jam 10
  const info = await tugasArsip(ctx, waktu('2026-11-29', '10:05'));
  assert.equal(info[0].nomor, OWNER);
  assert.match(info[0].text, /SMR26-11.*sudah 7 hari.*10 baris.*#arsip SMR26-11 ya/s);
  assert.equal((await tugasArsip(ctx, waktu('2026-11-29', '10:15'))).length, 0);
});

test('tugasArsip: event lama (sebelum sistem baru) tidak dibanjiri pemberitahuan otomatis', async () => {
  const { store, ctx } = await siapkan();
  await store.append('Event', { kode: 'LMB26-09', kota: 'Lombok', mulai: '2026-09-23', selesai: '2026-10-01', status: 'SELESAI' });
  await store.append('Laporan Foto', { id: 'Lx', kode_event: 'LMB26-09', tanggal: '2026-09-24', tag: 'depan', nama: 'Tiara', status: 'OK' });
  const info = await tugasArsip(ctx, waktu('2026-11-29', '10:05'));
  assert.ok(info.every((x) => !/LMB26-09/.test(x.text)));
  assert.ok(info.some((x) => /SMR26-11/.test(x.text)));
});

test('arsip: riwayat kasir (Antrian) dibersihkan harian setelah 31 hari sejak event selesai', async () => {
  const { store, kirim, ctx } = await siapkan();
  await kirim('#arsip SMR26-11 ya', waktu('2026-11-29'), { pribadi: true });
  assert.equal((await store.all('Antrian')).filter((r) => r.kode_event === 'SMR26-11').length, 3);
  await tugasArsip(ctx, waktu('2026-12-10', '10:30')); // belum 31 hari (selesai 22 Nov -> 23 Des)
  assert.equal((await store.all('Antrian')).filter((r) => r.kode_event === 'SMR26-11').length, 3);
  await tugasArsip(ctx, waktu('2026-12-23', '10:30'));
  assert.equal((await store.all('Antrian')).filter((r) => r.kode_event === 'SMR26-11').length, 0);
  assert.equal((await store.all('Antrian')).filter((r) => r.kode_event === 'LAIN26-12').length, 1);
});
