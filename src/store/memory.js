// Penyimpanan di memori dengan antarmuka yang sama seperti SheetsStore.
// Dipakai untuk tes dan untuk mencoba bot tanpa Google Sheets.

import { TABS } from '../schema.js';

export class MemoryStore {
  constructor() {
    this.data = Object.fromEntries(Object.keys(TABS).map((t) => [t, []]));
    this.spreadsheetId = 'PEMBUKUAN';
    this.files = []; // file di "Drive" tiruan: { id, nama, folder }
    this.fileData = {};
    this.tabel = {};
  }

  async cariFileDiFolder(folderId, mengandung) {
    return this.files.filter((f) => f.folder === folderId && f.nama.includes(mengandung)).map((f) => ({ id: f.id, name: f.nama }));
  }

  async gantiNamaFile(fileId, nama) {
    const f = this.files.find((x) => x.id === fileId);
    if (f) f.nama = nama;
  }

  async siapkanFileEvent(fileId, kode) {
    this.fileData[fileId] = { kode, baris: [] };
  }

  async tulisDataMainDi(fileId, baris) {
    this.fileData[fileId] = { ...this.fileData[fileId], baris };
  }

  async tulisTabel(spreadsheetId, tab, { baris }) {
    this.tabel[`${spreadsheetId}/${tab}`] = baris;
  }

  async hapusTab() {}

  async tulisBanyakTabel(spreadsheetId, daftar) {
    for (const d of daftar) this.tabel[`${spreadsheetId}/${d.tab}`] = { total: d.total, baris: d.baris };
  }

  async bacaInputManual() {
    return this.inputManual || {};
  }

  async init() {}

  async siapkanMain() {}

  async tulisDataMain(baris) {
    this.dataMain = baris;
  }

  async pilihEventDefault() {}

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

  // Ubah baris pertama yang memenuhi fungsi `cocok(baris)`.
  async updateWhere(tab, cocok, patch) {
    const row = this.data[tab].find((r) => cocok({ ...r }));
    if (!row) return null;
    Object.assign(row, patch);
    return { ...row };
  }
}
