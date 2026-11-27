import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/store/memory.js';
import { catatDenyut, KUNCI_DENYUT } from '../src/denyut.js';

test('denyut: tulis bot_hidup ke Pengaturan, perbarui (bukan dobel), dan dibatasi tiap 2 menit', async () => {
  const store = new MemoryStore();
  const ctx = { store };
  const t0 = new Date('2026-11-27T10:00:00Z');
  assert.equal(await catatDenyut(ctx, t0), true);
  assert.equal(await catatDenyut(ctx, new Date(t0.getTime() + 60_000)), false); // < 2 menit: dilewati
  assert.equal(await catatDenyut(ctx, new Date(t0.getTime() + 130_000)), true);
  const baris = (await store.all('Pengaturan')).filter((r) => r.kunci === KUNCI_DENYUT);
  assert.equal(baris.length, 1);
  assert.equal(baris[0].nilai, new Date(t0.getTime() + 130_000).toISOString());
});

test('denyut: gagal menulis tidak menjatuhkan bot', async () => {
  const store = { all: async () => { throw new Error('kuota'); } };
  assert.equal(await catatDenyut({ store }, new Date()), false);
});
