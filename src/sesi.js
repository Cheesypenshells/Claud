// Penyimpanan sesi tanya-jawab per grup. Disimpan ke file supaya tidak hilang saat bot dinyalakan ulang.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const KEDALUWARSA_MS = 2 * 24 * 60 * 60 * 1000;

export function buatSesi(file) {
  let data = {};
  try {
    if (file && existsSync(file)) data = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    data = {};
  }
  const simpan = () => {
    if (file) writeFileSync(file, JSON.stringify(data));
  };
  return {
    get(id) {
      const s = data[id];
      if (!s) return null;
      // Pengeluaran yang menunggu struk/ACC disimpan lebih lama (60 hari).
      const batas = String(id).startsWith('tunda|') ? 60 * 24 * 60 * 60 * 1000 : KEDALUWARSA_MS;
      if (Date.now() - s.waktu > batas) {
        delete data[id];
        simpan();
        return null;
      }
      return s.isi;
    },
    set(id, isi) {
      data[id] = { isi, waktu: Date.now() };
      simpan();
    },
    hapus(id) {
      delete data[id];
      simpan();
    },
  };
}
