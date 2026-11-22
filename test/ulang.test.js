import { test } from 'node:test';
import assert from 'node:assert/strict';
import { denganUlang, sementara } from '../src/ulang.js';
import { SheetsStore } from '../src/store/sheets.js';

test('kuota Google habis (429) / server sibuk: ditunggu lalu diulang, bukan membuat bot berhenti', async () => {
  const jeda = [];
  let n = 0;
  const hasil = await denganUlang('uji', async () => { if (++n < 3) { const e = new Error("Quota exceeded for quota metric 'Read requests'"); e.code = 429; throw e; } return 'ok'; },
    { jedaMs: 65_000, tidur: async (ms) => jeda.push(ms), log: () => {} });
  assert.equal(hasil, 'ok');
  assert.deepEqual(jeda, [65_000, 65_000]);
  // kesalahan lain (mis. kunci salah) langsung dilempar, tidak diulang
  await assert.rejects(() => denganUlang('uji', async () => { throw new Error('credentials.json tidak ditemukan'); }, { tidur: async () => assert.fail('tidak boleh menunggu'), log: () => {} }), /credentials/);
  // menyerah setelah batas percobaan
  let c = 0;
  await assert.rejects(() => denganUlang('uji', async () => { c++; const e = new Error('Too Many Requests'); e.status = 429; throw e; }, { maks: 3, tidur: async () => {}, log: () => {} }), /Too Many/);
  assert.equal(c, 3);
  assert.equal(sementara({ code: 503 }), true);
  assert.equal(sementara({ code: 403 }), false);
});

test('judul kolom semua tab dibaca dalam SATU permintaan (hemat kuota baca 60/menit)', async () => {
  const panggilan = [];
  const toko = Object.create(SheetsStore.prototype);
  toko.spreadsheetId = 'id';
  toko.api = { spreadsheets: { values: { batchGet: async (a) => { panggilan.push(a.ranges); return { data: { valueRanges: a.ranges.map((r, i) => (i === 1 ? {} : { values: [[`judul${i}`]] })) } }; } } } };
  const hasil = await toko.bacaJudulSemua(['Event', 'Tab Baru', 'Grup']);
  assert.equal(panggilan.length, 1);
  assert.deepEqual(panggilan[0], ["'Event'!1:1", "'Tab Baru'!1:1", "'Grup'!1:1"]);
  assert.deepEqual(hasil, [['judul0'], [], ['judul2']]);
});
