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

test('link kasir dikirim sekali ke kasir di hari pertama, 2 jam sebelum buka', async () => {
  const ctx = buatCtx();
  assert.equal((await tugasLinkKasir(ctx, new Date('2026-11-14T00:30:00Z'), { tanggalLokal })).length, 0); // 07.30 WIB
  const k = await tugasLinkKasir(ctx, new Date('2026-11-14T01:05:00Z'), { tanggalLokal }); // 08.05 WIB
  assert.equal(k.length, 1);
  assert.equal(k[0].nomor, '628123');
  assert.match(k[0].text, /k=1234&e=SMR26-11/);
  assert.equal((await tugasLinkKasir(ctx, new Date('2026-11-14T02:00:00Z'), { tanggalLokal })).length, 0);
});

test('tanpa kasir bernomor, link ke grup tim', async () => {
  const ctx = buatCtx({ ...tabel, Karyawan: [] });
  const k = await tugasLinkKasir(ctx, new Date('2026-11-14T02:00:00Z'), { tanggalLokal });
  assert.deepEqual(k.map((x) => x.groupId), ['g@tim']);
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
  assert.match(kasir, /KUNCI="1234",EVLINK="SMR26-11"/);
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
  const k = await tugasLinkKasir(ctx, new Date('2026-11-14T01:05:00Z'), { tanggalLokal });
  assert.deepEqual(k.map((x) => x.nomor), ['62811111']);
  assert.equal((await eventKasirUntuk(ctx, '62811111', '2026-11-14')).length, 1);
  assert.equal((await eventKasirUntuk(ctx, '62822222', '2026-11-14')).length, 1); // PIC
  assert.equal((await eventKasirUntuk(ctx, '62833333', '2026-11-14')).length, 0);
});
