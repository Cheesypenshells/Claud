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
