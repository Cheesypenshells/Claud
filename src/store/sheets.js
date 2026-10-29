// Penyimpanan di Google Sheets. Setiap tab di schema.js menjadi satu sheet.
// Data dibaca ulang paling lama tiap CACHE_MS supaya koreksi manual owner ikut terbaca.

import { sheets as sheetsApi, auth as googleAuth } from '@googleapis/sheets';
import { TABS } from '../schema.js';

const CACHE_MS = 30_000;

function kolom(n) {
  let s = '';
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

export class SheetsStore {
  constructor({ spreadsheetId, keyFile }) {
    this.spreadsheetId = spreadsheetId;
    const auth = new googleAuth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.api = sheetsApi({ version: 'v4', auth });
    this.cache = new Map();
  }

  // Membuat tab yang belum ada dan menulis judul kolom.
  async init() {
    const meta = await this.api.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    const ada = new Set(meta.data.sheets.map((s) => s.properties.title));
    const baru = Object.keys(TABS).filter((t) => !ada.has(t));
    if (baru.length) {
      await this.api.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: { requests: baru.map((title) => ({ addSheet: { properties: { title } } })) },
      });
    }
    for (const [tab, header] of Object.entries(TABS)) {
      const res = await this.api.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${tab}!1:1`,
      });
      const lama = res.data.values?.[0] || [];
      const kurang = header.filter((h) => !lama.includes(h));
      if (kurang.length) {
        await this.api.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${tab}!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: [[...lama, ...kurang]] },
        });
      }
    }
  }

  async baca(tab) {
    const c = this.cache.get(tab);
    if (c && Date.now() - c.waktu < CACHE_MS) return c;
    const res = await this.api.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${tab}!A1:ZZ`,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    const [header = [], ...rows] = res.data.values || [];
    const data = { waktu: Date.now(), header, rows };
    this.cache.set(tab, data);
    return data;
  }

  async all(tab) {
    const { header, rows } = await this.baca(tab);
    return rows
      .filter((r) => r.some((v) => v !== '' && v != null))
      .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
  }

  async append(tab, row) {
    const { header } = await this.baca(tab);
    const values = header.map((h) => row[h] ?? '');
    await this.api.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [values] },
    });
    this.cache.delete(tab);
    return row;
  }

  async update(tab, kunci, nilai, patch) {
    this.cache.delete(tab);
    const { header, rows } = await this.baca(tab);
    const iKunci = header.indexOf(kunci);
    const idx = rows.findIndex((r) => String(r[iKunci]) === String(nilai));
    if (idx < 0) return null;
    const baris = header.map((h, i) => (h in patch ? patch[h] : rows[idx][i] ?? ''));
    const nomorBaris = idx + 2;
    await this.api.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${tab}!A${nomorBaris}:${kolom(header.length)}${nomorBaris}`,
      valueInputOption: 'RAW',
      requestBody: { values: [baris] },
    });
    this.cache.delete(tab);
    return Object.fromEntries(header.map((h, i) => [h, baris[i]]));
  }
}
