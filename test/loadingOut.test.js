import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlePesan } from '../src/handlers.js';
import { MemoryStore } from '../src/store/memory.js';
import { buatSesi } from '../src/sesi.js';
import { bagiLoadingOut, bacaKoli, bacaAlat, tugasLoadingOut, TUGAS_LOADING_OUT } from '../src/loadingOut.js';

const OWNER = '6281111111111';
const PIC = '6282222222222';
const G_KELUAR = 'keluar@g.us';
const G_TIM = 'tim@g.us';
const pada = (tgl, hhmm) => new Date(`2026-11-${tgl}T${hhmm}:00+07:00`);
const NAMA = ['Adit', 'Alam', 'Bima', 'Imam', 'Tiara', 'Veri'];
const NOMOR = { Adit: '6281000000001', Alam: '6281000000002', Bima: '6281000000003', Imam: '6281000000004', Tiara: '6281000000005', Veri: '6281000000006' };

test('bagiLoadingOut: tiap bagian punya PJ, kelebihan orang membantu bagian berat, bagian ringan ikut PJ bagian terkait', () => {
  const enam = bagiLoadingOut(NAMA);
  const pj = Object.fromEntries(enam.map((t) => [t.tag, t.nama[0]]));
  assert.equal(enam.find((t) => t.tag === 'bongkarbawah').nama.length, 2); // orang ke-6 membantu bongkar bawah
  assert.deepEqual(enam.find((t) => t.tag === 'bongkarbawah').nama, ['Adit', 'Veri']);
  assert.equal(pj.alat, pj.cuci); // alat ikut PJ cuci
  assert.equal(pj.muat, pj.koli); // muat ikut PJ koli
  assert.equal(new Set(enam.filter((t) => t.bobot > 0).map((t) => t.nama[0])).size, 5); // 5 bagian berat, 5 PJ berbeda
  // orang sedikit: satu orang memegang beberapa bagian
  const dua = bagiLoadingOut(['Adit', 'Alam']);
  assert.ok(dua.every((t) => t.nama.length >= 1));
  assert.deepEqual(bagiLoadingOut([]).map((t) => t.nama), TUGAS_LOADING_OUT.map(() => []));
});

test('bacaKoli & bacaAlat: format caption bebas', () => {
  assert.deepEqual(bacaKoli('#koli kering 23 dingin 4'), { kering: 23, dingin: 4 });
  assert.deepEqual(bacaKoli('23 kering, 4 baku'), { kering: 23, dingin: 4 });
  assert.deepEqual(bacaKoli('koli kering: 22 koli'), { kering: 22, dingin: null });
  assert.deepEqual(bacaKoli('sudah dilabel'), { kering: null, dingin: null });
  assert.deepEqual(bacaAlat('Kompor = 4 baik, 1 rusak\nRegulator gas 4\nLampu LED 120x60 = 6 baik 1 hilang\ncatatan tanpa angka\nrusak 2 payung'),
    [{ alat: 'Kompor', baik: 4, rusak: 1, hilang: 0 }, { alat: 'Regulator gas', baik: 4, rusak: 0, hilang: 0 }, { alat: 'Lampu LED 120x60', baik: 6, rusak: 0, hilang: 1 }]);
});

test('loading out: pembagian otomatis setelah closing, koli vs kiriman awal, alat rusak/hilang, pengingat 2 jam, ringkasan owner', async () => {
  const store = new MemoryStore();
  const ctx = { store, ownerIds: new Set([OWNER]), sesi: buatSesi(null), terakhir: new Map() };
  let n = 0;
  const kirimRaw = (groupId, senderId, text, waktu, extra = {}) => handlePesan(ctx, {
    id: `o${++n}`, groupId, groupName: groupId, senderId, senderName: 'X', text, adaFoto: false, waktu, ...extra,
  });
  const kirim = async (...a) => (await kirimRaw(...a)).map((r) => r.text).join('\n');
  const foto = (isi) => ({ adaFoto: true, ambilFoto: async () => Buffer.from(isi) });
  await kirim(G_KELUAR, OWNER, `#event\nKode: SMR26-11\nKota: Semarang\nIO: Kepo\nTanggal: 14-22 Nov 2026\nWilayah harga: Jawa\nBagi hasil: 30%\nAdmin: 0\nJam buka: 10.00\nPIC: George\nSenior: ${NAMA.join(', ')}`, pada('14', '07:00'));
  await kirim(G_TIM, OWNER, '#daftar event SMR26-11', pada('14', '07:01'));
  for (const [nama, no] of Object.entries(NOMOR)) await store.append('Karyawan', { nama, nomor_wa: no });
  await store.append('Karyawan', { nama: 'George', nomor_wa: PIC });
  await store.append('Pengiriman', { kode_event: 'SMR26-11', tanggal: '2026-11-12', koli_kering: 23, koli_baku: 4, status: 'OK' });
  await store.append('Event', { kode: 'JKT26-12', kota: 'Jakarta', mulai: '2026-12-05', selesai: '2026-12-10', status: 'AKTIF' });

  // belum closing: tidak ada pengumuman
  assert.equal((await tugasLoadingOut(ctx, pada('22', '21:30'))).length, 0);
  // kasir ditutup 22.10 -> pengumuman grup tim + chat pribadi tiap PJ
  await store.append('Sesi Kasir', { id: 'S22', kode_event: 'SMR26-11', tanggal: '2026-11-22', status: 'TUTUP', dibuka: '2026-11-22 10:00:00', ditutup: '2026-11-22 22:10:00' });
  const umum = await tugasLoadingOut(ctx, pada('22', '22:15'));
  const grup = umum.find((x) => x.groupId === G_TIM);
  assert.match(grup.text, /Waktunya LOADING OUT.*JOBDESK LOADING OUT SMR26-11.*event berikutnya Jakarta.*BONGKAR bagian BAWAH.*PJ: \*Adit\*.*dibantu Veri.*#bongkarbawah/s);
  assert.match(grup.text, /23 koli kering \+ 4 koli bahan baku/);
  const dmAdit = umum.find((x) => x.nomor === NOMOR.Adit);
  assert.match(dmAdit.text, /Adit.*penanggung jawab loading out.*#bongkarbawah/s);
  const jb = await store.all('Jobdesk');
  assert.equal(jb.filter((j) => j.tahap === 'Loading out').length, 7); // 7 bagian, masing-masing 1 PJ
  assert.deepEqual(jb.filter((j) => j.tahap === 'Loading out (bantu)').map((j) => j.nama), ['Veri']); // pembantu tidak ikut dihukum KPI
  assert.equal((await tugasLoadingOut(ctx, pada('22', '22:20'))).length, 0); // tidak diulang

  // lihat pembagian lagi (#jobdeskout) = pembagian yang sama; karyawan biasa tidak boleh bagi ulang
  assert.match(await kirim(G_TIM, NOMOR.Alam, '#jobdeskout', pada('22', '22:30')), /JOBDESK LOADING OUT.*PJ: \*Adit\*/s);
  assert.match(await kirim(G_TIM, NOMOR.Alam, '#jobdeskout ulang', pada('22', '22:31')), /hanya oleh owner atau PIC/);

  // laporan: koli kurang 1 -> dibandingkan kiriman awal + diteruskan ke grup pengeluaran
  const koli = await kirimRaw(G_TIM, NOMOR.Imam, '#koli kering 22 dingin 4', pada('23', '00:10'), foto('koli1'));
  assert.match(koli[0].text, /Koli balik.*Koli kering: 22\/23 ⚠️ kurang 1.*koli dingin\/bahan baku: 4\/4 ✅/s);
  assert.ok(koli.some((x) => x.groupId === G_KELUAR && /Koli SMR26-11 tidak sama dengan kiriman awal/.test(x.text)));

  // alat: rusak & hilang -> tersimpan + dilaporkan ke owner/PIC
  const alat = await kirimRaw(G_TIM, NOMOR.Tiara, '#alat\nKompor = 4 baik, 1 rusak\nRegulator gas = 4 baik\nLampu gantung = 5 baik 1 hilang', pada('23', '00:20'), foto('alat1'));
  assert.match(alat[0].text, /Data alat.*3 jenis alat \(15 buah\) tercatat.*Kompor rusak 1, Lampu gantung hilang 1/s);
  assert.match(alat.find((x) => x.groupId === G_KELUAR).text, /Alat rusak\/hilang SMR26-11.*Kompor: rusak 1.*Lampu gantung: hilang 1/s);
  assert.equal((await store.all('Alat Event')).length, 3);
  // kirim ulang alat yang sama menggantikan, bukan menambah
  await kirimRaw(G_TIM, NOMOR.Tiara, '#alat\nKompor = 5 baik', pada('23', '00:30'), foto('alat2'));
  assert.deepEqual((await store.all('Alat Event')).filter((r) => r.alat === 'Kompor' && r.status !== 'BATAL').map((r) => r.baik), [5]);

  // status memuat penanggung jawab
  assert.match(await kirim(G_TIM, NOMOR.Alam, '#loadingout', pada('23', '00:40')), /Bongkar booth bagian bawah.*👷 Adit.*✅ Koli balik: Imam.*✅ Data alat.*Tiara/s);

  // pengingat tiap 2 jam: yang belum lapor disebut dengan PJ-nya
  const ingat = await tugasLoadingOut(ctx, pada('23', '00:16'));
  assert.match(ingat.find((x) => x.groupId === G_TIM).text, /Update loading out SMR26-11.*belum lapor.*Adit.*#bongkarbawah/s);
  assert.equal((await tugasLoadingOut(ctx, pada('23', '00:30'))).length, 0); // satu pengingat per 2 jam

  // semua bagian lapor -> ringkasan ke owner & grup pengeluaran, sekali
  const nilai = [['Adit', 'bongkarbawah'], ['Alam', 'bongkaratas'], ['Bima', 'cuci'], ['Imam', 'stokakhir'], ['Imam', 'muat']];
  for (const [nama, tag] of nilai) await kirim(G_TIM, NOMOR[nama], `#${tag}${tag === 'muat' ? ' sopir Pak Eko B 1234 XY jam 08.00 tujuan Jakarta' : ''}`, pada('23', '02:00'), foto(`f-${tag}`));
  await kirim(G_TIM, NOMOR.Alam, '#bongkaratas', pada('23', '02:01'), foto('f-atas'));
  const sisa = await tugasLoadingOut(ctx, pada('23', '03:00'));
  const ringkas = sisa.find((x) => x.nomor === OWNER);
  assert.match(ringkas.text, /Loading out SMR26-11 selesai.*Koli kembali: kering 22 ⚠️ \(kiriman awal 23\).*dingin 4 ✅.*Alat: 3 jenis.*rusak.*Sisa bahan baku.*belum ada.*Muat: Imam.*Penanggung jawab/s);
  assert.ok(sisa.some((x) => x.groupId === G_KELUAR));
  assert.equal((await tugasLoadingOut(ctx, pada('23', '04:00'))).length, 0);
});

test('pengingat loading out tetap terkirim walau bot sempat mati lebih dari 18 jam (sampai 48 jam)', async () => {
  const store = new MemoryStore();
  const ctx = { store, ownerIds: new Set([OWNER]), sesi: buatSesi(null), terakhir: new Map() };
  const kirim = async (groupId, senderId, text, waktu) => (await handlePesan(ctx, { id: `x${Math.random()}`, groupId, groupName: groupId, senderId, senderName: 'X', text, adaFoto: false, waktu })).map((r) => r.text).join('\n');
  await kirim(G_KELUAR, OWNER, `#event\nKode: SMR26-11\nKota: Semarang\nIO: Kepo\nTanggal: 14-22 Nov 2026\nWilayah harga: Jawa\nBagi hasil: 30%\nAdmin: 0\nJam buka: 10.00\nPIC: George\nSenior: Adit, Alam`, pada('14', '07:00'));
  await kirim(G_TIM, OWNER, '#daftar event SMR26-11', pada('14', '07:01'));
  await store.append('Sesi Kasir', { id: 'S22', kode_event: 'SMR26-11', tanggal: '2026-11-22', status: 'TUTUP', dibuka: '2026-11-22 10:00:00', ditutup: '2026-11-22 21:40:00' });
  assert.ok((await tugasLoadingOut(ctx, pada('22', '21:45'))).some((x) => x.groupId === G_TIM)); // pengumuman
  // bot mati sampai 23 Nov 20.30 (22,8 jam kemudian): pengingat pertama setelah bot menyala tetap terkirim
  const telat = await tugasLoadingOut(ctx, pada('23', '20:30'));
  assert.match(telat.find((x) => x.groupId === G_TIM).text, /Update loading out SMR26-11.*belum lapor/s);
  assert.equal((await tugasLoadingOut(ctx, pada('23', '20:40'))).length, 0); // tidak dobel di slot yang sama
});
