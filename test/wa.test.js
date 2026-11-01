import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buatPencatatId } from '../src/wa.js';

test('pencatat ID pesan tetap ingat setelah bot dinyalakan ulang', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'cps-')), 'terproses.json');
  const a = buatPencatatId(file);
  assert.equal(a.sudah('m1'), false);
  a.tandai('m1');
  a.tandai('m2');
  assert.equal(a.sudah('m1'), true);
  const b = buatPencatatId(file);
  assert.equal(b.sudah('m1'), true);
  assert.equal(b.sudah('m3'), false);
});
