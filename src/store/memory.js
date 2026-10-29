// Penyimpanan di memori dengan antarmuka yang sama seperti SheetsStore.
// Dipakai untuk tes dan untuk mencoba bot tanpa Google Sheets.

import { TABS } from '../schema.js';

export class MemoryStore {
  constructor() {
    this.data = Object.fromEntries(Object.keys(TABS).map((t) => [t, []]));
  }

  async init() {}

  async all(tab) {
    return this.data[tab].map((r) => ({ ...r }));
  }

  async append(tab, row) {
    const bersih = Object.fromEntries(TABS[tab].map((k) => [k, row[k] ?? '']));
    this.data[tab].push(bersih);
    return bersih;
  }

  // Ubah baris pertama yang kolom `kunci`-nya bernilai `nilai`.
  async update(tab, kunci, nilai, patch) {
    const row = this.data[tab].find((r) => String(r[kunci]) === String(nilai));
    if (!row) return null;
    Object.assign(row, patch);
    return { ...row };
  }
}
