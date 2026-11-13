import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkKasir, tugasLinkKasir, perintahKasir } from '../src/komplain.js';

const tabel = {
  Pengaturan: [{ kunci: 'url_antrian', nilai: 'https://script.google.com/x/exec' }, { kunci: 'pin_kasir', nilai: '1234' }],
  Event: [{ kode: 'SMR26-11', kota: 'Semarang', mulai: '2026-11-14', jam_buka: '10:00', status: 'AKTIF' }],
  'Tim Event': [{ kode_event: 'SMR26-11', nama: 'Sari', peran: 'Kasir' }, { kode_event: 'SMR26-11', nama: 'Budi', peran: 'DW' }],
  Karyawan: [{ nama: 'Sari', nomor_wa: '08123' }],
  Grup: [{ kode_event: 'SMR26-11', jenis: 'event', group_id: 'g@tim' }],
};
const buatCtx = (t = tabel) => {
  const m = new Map();
  return { store: { all: async (n) => t[n] || [] }, sesi: { get: (k) => m.get(k), set: (k, v) => m.set(k, v) } };
};
const tanggalLokal = (d) => d.toISOString().slice(0, 10);

test('link kasir berisi PIN dan kode event', () => {
  assert.equal(linkKasir({ url_antrian: 'https://u/exec', pin_kasir: '1234' }, 'SMR26-11'), 'https://u/exec?p=kasir&k=1234&e=SMR26-11');
  assert.equal(linkKasir({}, 'X'), '');
});

test('setiap hari event, 2 jam sebelum buka: bot tanya kasir hari ini di grup (sekali per hari, tanpa PIN)', async () => {
  const ctx = buatCtx();
  assert.equal((await tugasLinkKasir(ctx, new Date('2026-11-14T00:30:00Z'), { tanggalLokal })).length, 0); // 07.30 WIB
  const k = await tugasLinkKasir(ctx, new Date('2026-11-14T01:05:00Z'), { tanggalLokal }); // 08.05 WIB
  assert.deepEqual(k.map((x) => x.groupId), ['g@tim']);
  assert.match(k[0].text, /Siapa yang pegang kasir antrian hari ini\?.*14 Nov.*Sebelumnya: Sari/s);
  assert.ok(!k[0].text.includes('1234'), 'PIN tidak dikirim ke grup');
  assert.equal((await tugasLinkKasir(ctx, new Date('2026-11-14T05:00:00Z'), { tanggalLokal })).length, 0); // sekali per hari
  assert.equal((await tugasLinkKasir(ctx, new Date('2026-11-15T01:05:00Z'), { tanggalLokal })).length, 1); // besoknya tanya lagi
});

test('jawaban "saya": pertama tiap hari menggantikan kasir kemarin, berikutnya ditambah (ganti setengah hari)', async () => {
  const { tanganiJawabKasir } = await import('../src/komplain.js');
  const ev = { ...tabel.Event[0], kasir_antrian: 'Sari' };
  const t = { ...tabel, Event: [ev], 'Tim Event': [], Karyawan: [{ nama: 'TiarA', nomor_wa: '0811111' }, { nama: 'Bima', nomor_wa: '0833333' }] };
  const ctx = buatCtx(t);
  ctx.store.updateWhere = async (tab, f, nilai) => { Object.assign(ev, nilai); };
  const w = new Date('2026-11-14T02:00:00Z');
  await tugasLinkKasir(ctx, w, { tanggalLokal });
  assert.equal(await tanganiJawabKasir(ctx, { groupId: 'lain', text: 'saya', senderId: '62811111', waktu: w }, ev), null);
  const r = await tanganiJawabKasir(ctx, { groupId: 'g@tim', text: 'saya kak', senderId: '62811111', waktu: w }, ev);
  assert.match(r[0].text, /TiarA.*hari ini.*#kasir/s);
  assert.equal(ev.kasir_antrian, 'TiarA');
  await tanganiJawabKasir(ctx, { groupId: 'g@tim', text: 'aku gantiin', senderId: '62833333', waktu: new Date('2026-11-14T08:00:00Z') }, ev);
  assert.equal(ev.kasir_antrian, 'TiarA, Bima');
  assert.equal(await tanganiJawabKasir(ctx, { groupId: 'g@tim', text: 'saya sudah sampai di lokasi bongkar barang sekarang ya', senderId: '62811111', waktu: w }, ev), null);
  // besoknya: pertanyaan baru, jawaban pertama menggantikan
  const w2 = new Date('2026-11-15T02:00:00Z');
  await tugasLinkKasir(ctx, w2, { tanggalLokal });
  await tanganiJawabKasir(ctx, { groupId: 'g@tim', text: 'saya', senderId: '62833333', waktu: w2 }, ev);
  assert.equal(ev.kasir_antrian, 'Bima');
});

test('#kasir hanya owner/PIC', async () => {
  const ctx = buatCtx();
  assert.match((await perintahKasir(ctx, tabel.Event[0], { bolehLihat: false }))[0].text, /hanya bisa/);
  assert.match((await perintahKasir(ctx, tabel.Event[0], { bolehLihat: true }))[0].text, /p=kasir&k=1234/);
});

test('halaman pelanggan GitHub Pages sinkron dengan apps-script/Code.gs', async () => {
  const { readFileSync } = await import('node:fs');
  const { buatHalaman } = await import('../scripts/halaman-pelanggan.mjs');
  const isi = readFileSync(new URL('../docs/antrian/index.html', import.meta.url), 'utf8');
  const api = isi.match(/var API="([^"]+)"/)[1];
  assert.equal(isi, buatHalaman(api), 'jalankan: node scripts/halaman-pelanggan.mjs <url /exec>');
});

test('apps-script/Code.gs: semua halaman bisa dibuat dan semua fungsi yang dipanggil ada', async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const src = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
  const keluaran = { setTitle() { return this; }, addMetaTag() { return this; }, setMimeType() { return this; } };
  const c = {
    HtmlService: { createHtmlOutput: (h) => ({ ...keluaran, html: h }) },
    ContentService: { createTextOutput: (t) => ({ ...keluaran, html: t }), MimeType: { JSON: 'json' } },
  };
  vm.createContext(c);
  vm.runInContext(src, c);
  for (const nama of ['KOLOM_ANTRIAN', 'KOLOM_KOMPLAIN', 'KATEGORI_KOMPLAIN', 'STATUS', 'GAYA', 'ASET', 'HTML_KASIR', 'HTML_PESANAN', 'HTML_KOMPLAIN', 'MULAI_PASANG', 'doGet', 'pasang']) {
    assert.ok(c[nama] !== undefined, `${nama} hilang dari Code.gs`);
  }
  const dipanggil = new Set([...src.matchAll(/\b([a-zA-Z]\w*_)\(/g)].map((m) => m[1]));
  for (const f of dipanggil) assert.equal(typeof c[f], 'function', `fungsi ${f} dipanggil tapi tidak ada`);
  const kasir = c.doGet({ parameter: { p: 'kasir', k: '1234', e: 'SMR26-11' } }).html;
  assert.match(kasir, /KUNCI = "1234", EVLINK = "SMR26-11"/);
  const kom = c.doGet({ parameter: { p: 'komplain', e: 'SMR26-11' } }).html;
  assert.match(kom, /Oyster tidak fresh/);
  const pes = c.doGet({ parameter: { p: 'pesanan', t: 'abc' } }).html;
  assert.match(pes, /var TOKEN="abc"/);
  for (const h of [kasir, kom, pes]) assert.ok(!h.includes('__ASET__') && h.includes(c.ASET + 'logo-putih.png'));
});

test('kasir antrian ditunjuk lewat kolom Event (tanpa ubah peran): dapat link otomatis & boleh #kasir', async () => {
  const { namaKasir, eventKasirUntuk } = await import('../src/komplain.js');
  const t = {
    ...tabel,
    Event: [{ ...tabel.Event[0], kasir_antrian: 'Tiara' }],
    'Tim Event': [{ kode_event: 'SMR26-11', nama: 'TiarA', peran: 'Tetap' }, { kode_event: 'SMR26-11', nama: 'George', peran: 'PIC' }],
    Karyawan: [{ nama: 'TiarA', nomor_wa: '0811111' }, { nama: 'George', nomor_wa: '0822222' }, { nama: 'Bima', nomor_wa: '0833333' }],
  };
  assert.deepEqual(namaKasir(t.Event[0], t['Tim Event']), ['Tiara']);
  const ctx = buatCtx(t);
  assert.equal((await eventKasirUntuk(ctx, '62811111', '2026-11-14')).length, 1);
  assert.equal((await eventKasirUntuk(ctx, '62822222', '2026-11-14')).length, 1); // PIC
  assert.equal((await eventKasirUntuk(ctx, '62833333', '2026-11-14')).length, 0);
});

test('apps-script: 2 HP kasir — tombol dari tampilan lama ditolak (tidak memanggil ulang pesanan yang sudah diambil)', async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const c = {};
  vm.createContext(c);
  vm.runInContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), c);
  const baris = { _baris: 2, id: 'Q1', nomor: 7, status: 'SIAP', kode_event: 'SMR26-11', panggil_ke: 1 };
  Object.assign(c, {
    cekPin_: () => {}, tab_: () => ({}), baca_: () => [baris], ubah_: (t, b, isi) => Object.assign(baris, isi), sekarang_: () => 'x',
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }, CacheService: { getScriptCache: () => ({ remove() {} }) },
  });
  assert.equal(c.ubahStatus('1', 'Q1', 'DIAMBIL'), true);   // HP A: sudah diambil
  assert.throws(() => c.ubahStatus('1', 'Q1', 'SIAP'), /#7 sudah diubah dari HP lain \(sekarang: sudah diambil\)/); // HP B: panggil ulang
  assert.equal(baris.status, 'DIAMBIL');
});

test('apps-script/Code.gs sinkron dengan apps-script/klien/ (jalankan: node scripts/bangun-apps-script.mjs)', async () => {
  const { readFileSync } = await import('node:fs');
  const { susunCodeGs } = await import('../scripts/bangun-apps-script.mjs');
  const src = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
  assert.equal(src, susunCodeGs(src));
});

test('apps-script: mulai/tutup kasir, nomor berlanjut selama event, ringkasan & bintang pelanggan', async () => {
  const { readFileSync } = await import('node:fs');
  const vm = await import('node:vm');
  const c = {};
  vm.createContext(c);
  vm.runInContext(readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8'), c);
  const tabel = {};
  let jam = '2026-11-14 08:00:00';
  Object.assign(c, {
    cekPin_: () => {}, sekarang_: () => jam, hariIni_: () => jam.slice(0, 10), url_: () => 'https://u/exec', atur_: () => '',
    tab_: (nama) => (tabel[nama] = tabel[nama] || { nama, rows: [] }),
    baca_: (t) => t.rows.map((r, i) => ({ ...r, _baris: i + 2 })),
    tulisBaris_: (t, o) => t.rows.push({ ...o }),
    ubah_: (t, b, isi) => Object.assign(t.rows[b - 2], isi),
    simpanFoto_: () => ({ id: 'F', blob: null }), ocr_: () => '', bacaMenu_: () => '', linkFoto_: (id) => id,
    daftarEvent: () => [{ kode: 'SMR26-11', kota: 'Semarang', io: 'Kepo' }],
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) }, CacheService: { getScriptCache: () => ({ remove() {} }) },
    Utilities: { formatDate: () => '261114080000', getUuid: () => `${Math.random()}`.replace('.', 'x').padEnd(20, 'a') },
  });
  assert.throws(() => c.buatPesanan('1', 'SMR26-11', 'data:'), /Kasir belum dibuka/);
  assert.equal(c.daftarAntrian('1', 'SMR26-11').sesi, null);
  c.mulaiKasir('1', 'SMR26-11', 'Tiara');
  c.mulaiKasir('1', 'SMR26-11', 'Orang lain'); // HP kedua: sesi yang sama dipakai
  assert.equal(tabel['Sesi Kasir'].rows.length, 1);
  const p1 = c.buatPesanan('1', 'SMR26-11', 'data:');
  const p2 = c.buatPesanan('1', 'SMR26-11', 'data:');
  assert.deepEqual([p1.nomor, p2.nomor], [1, 2]);
  c.gantiKasir('1', 'SMR26-11', 'Bima');
  jam = '2026-11-15 00:30:00'; // lewat tengah malam: nomor tetap berlanjut
  const p3 = c.buatPesanan('1', 'SMR26-11', 'data:');
  assert.equal(p3.nomor, 3);
  assert.equal(tabel.Antrian.rows[2].kasir, 'Bima');
  const tok = (n) => tabel.Antrian.rows[n].token;
  assert.throws(() => c.nilaiPesanan(tok(0), 5, ''), /setelah pesanan siap/);
  tabel.Antrian.rows[0].dipanggil = '2026-11-14 08:12:00';
  c.ubahStatus('1', p1.id, 'SIAP'); tabel.Antrian.rows[0].dipanggil = '2026-11-14 08:12:00';
  c.ubahStatus('1', p1.id, 'DIAMBIL');
  c.nilaiPesanan(tok(0), 5, 'ramah');
  c.ubahStatus('1', p3.id, 'SIAP');
  c.nilaiPesanan(tok(2), 2, 'lama');
  c.ubahStatus('1', p2.id, 'BATAL');
  const r = c.tutupKasir('1', 'SMR26-11');
  assert.equal(r.jumlah_struk, 2);
  assert.equal(r.diambil, 1);
  assert.equal(r.batal, 1);
  assert.equal(r.belum, 1);
  assert.equal(r.rata_tunggu_menit, 6); // (12 + 0) / 2
  assert.equal(r.rating_rata, 3.5);
  assert.match(r.rating_kasir, /Tiara 5 \(1\).*Bima 2 \(1\)/);
  assert.match(r.ulasan_buruk, /#3 2★ \(Bima\) lama/);
  assert.equal(tabel['Sesi Kasir'].rows[0].status, 'TUTUP');
  assert.throws(() => c.buatPesanan('1', 'SMR26-11', 'data:'), /Kasir belum dibuka/);
  assert.throws(() => c.tutupKasir('1', 'SMR26-11'), /sudah ditutup/);
  // event berikutnya mulai dari 1 lagi
  c.mulaiKasir('1', 'PKL26-12', 'Tiara');
  assert.equal(c.buatPesanan('1', 'PKL26-12', 'data:').nomor, 1);
});

test('ringkasan tutup kasir diteruskan bot ke WhatsApp owner sekali', async () => {
  const { tugasSesiKasir } = await import('../src/komplain.js');
  const rows = [{ id: 'S1', kode_event: 'SMR26-11', tanggal: '2026-11-14', kasir: 'Tiara, Bima', dibuka: '2026-11-14 08:05:00', ditutup: '2026-11-14 22:10:00', jumlah_struk: 126, diambil: 121, batal: 3, belum: 2, rata_tunggu_menit: 11, rating_rata: 4.8, jumlah_rating: 58, rating_kasir: 'Tiara 4,9 (40) · Bima 4,6 (18)', ulasan_buruk: '#88 2★ (Bima) nunggu lama', status: 'TUTUP' }];
  const ctx = { ownerIds: new Set(['62811']), store: { all: async () => rows, updateWhere: async (t, f, v) => { for (const r of rows) if (f(r)) Object.assign(r, v); } } };
  const k = await tugasSesiKasir(ctx);
  assert.equal(k[0].nomor, '62811');
  assert.match(k[0].text, /Kasir SMR26-11 ditutup.*08:05–22:10.*126 struk dilayani.*121 diambil.*2 belum diambil.*11 menit.*4,8 dari 58.*Tiara 4,9.*#88 2★/s);
  assert.equal((await tugasSesiKasir(ctx)).length, 0);
});
