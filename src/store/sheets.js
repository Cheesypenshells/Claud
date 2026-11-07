// Penyimpanan di Google Sheets. Setiap tab di schema.js menjadi satu sheet.
// Data dibaca ulang paling lama tiap CACHE_MS supaya koreksi manual owner ikut terbaca.

import { readFileSync } from 'node:fs';
import { sheets as sheetsApi, auth as googleAuth } from '@googleapis/sheets';
import { KOLOM, JENIS_LAMA } from '../schema.js';
import { siapkanMain, tulisDataMain } from './mainSheet.js';
import { TAB_INPUT, CARA_ISI } from '../inputManual.js';

const CACHE_MS = 30_000;
const HITAM = { style: 'SOLID', colorStyle: { rgbColor: { red: 0, green: 0, blue: 0 } } };
const GARIS_HITAM = { top: HITAM, bottom: HITAM, left: HITAM, right: HITAM, innerHorizontal: HITAM, innerVertical: HITAM };
const FORMAT_ANGKA = {
  rupiah: { type: 'CURRENCY', pattern: '"Rp "#,##0' },
  persen: { type: 'NUMBER', pattern: '0.##"%"' },
  angka: { type: 'NUMBER', pattern: '#,##0' },
};

// Nama tab di rumus/rentang harus diberi kutip kalau ada spasi, misalnya 'Tim Event'!A1.
const q = (tab) => `'${String(tab).replace(/'/g, "''")}'`;

function kolom(n) {
  let s = '';
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}

function warna(hex, terang = 0) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => (v + (255 - v) * terang) / 255;
  return { red: c((n >> 16) & 255), green: c((n >> 8) & 255), blue: c(n & 255) };
}

// Judul kolom di Sheets -> key. Judul lama (berupa key) tetap dikenali.
function petaJudul(tab) {
  const peta = new Map();
  for (const c of KOLOM[tab].kolom) {
    peta.set(c.label, c.key);
    peta.set(c.key, c.key);
  }
  return peta;
}

export class SheetsStore {
  constructor({ spreadsheetId, keyFile }) {
    this.spreadsheetId = spreadsheetId;
    const kunci = JSON.parse(readFileSync(keyFile, 'utf8'));
    const auth = new googleAuth.JWT({
      email: kunci.client_email,
      key: kunci.private_key,
      // drive: untuk memakai & memberi nama file cadangan di folder EVENT
      scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'],
    });
    this.auth = auth;
    // Batas Google: ±60 penulisan per menit. Kalau terkena (429) atau server sibuk, ulangi dengan jeda bertambah.
    this.api = sheetsApi({
      version: 'v4',
      auth,
      retryConfig: {
        retry: 6,
        retryDelay: 5000,
        statusCodesToRetry: [[429, 429], [500, 599]],
        httpMethodsToRetry: ['GET', 'PUT', 'POST', 'PATCH', 'DELETE'],
      },
    });
    this.cache = new Map();
  }

  // Membuat tab yang belum ada, menulis judul kolom, lalu merapikan tampilan.
  async init() {
    const id = this.spreadsheetId;
    let meta = await this.api.spreadsheets.get({ spreadsheetId: id });
    const ada = new Set(meta.data.sheets.map((s) => s.properties.title));
    const baru = Object.keys(KOLOM).filter((t) => !ada.has(t));
    if (baru.length) {
      await this.api.spreadsheets.batchUpdate({
        spreadsheetId: id,
        requestBody: { requests: baru.map((title) => ({ addSheet: { properties: { title } } })) },
      });
    }

    // Judul kolom: ganti judul lama (key) menjadi label, tambahkan kolom yang belum ada.
    for (const [tab, def] of Object.entries(KOLOM)) {
      const res = await this.api.spreadsheets.values.get({ spreadsheetId: id, range: `${q(tab)}!1:1` });
      const lama = res.data.values?.[0] || [];
      const peta = petaJudul(tab);
      const judul = lama.map((h) => def.kolom.find((c) => c.key === peta.get(h))?.label ?? h);
      for (const c of def.kolom) if (!judul.includes(c.label)) judul.push(c.label);
      if (judul.join('\u0000') !== lama.join('\u0000')) {
        await this.api.spreadsheets.values.update({
          spreadsheetId: id,
          range: `${q(tab)}!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: [judul] },
        });
      }
    }

    // Nilai jenis transaksi versi lama (KELUAR, MASUK_IO, ...) diganti nilai yang mudah dibaca.
    this.cache.clear();
    const { header: hT, rows: rT } = await this.baca('Transaksi');
    const iJenis = hT.indexOf('jenis');
    const ganti = rT.map((r, i) => [i, r[iJenis]]).filter(([, v]) => JENIS_LAMA[v]);
    if (iJenis >= 0 && ganti.length) {
      await this.api.spreadsheets.values.batchUpdate({
        spreadsheetId: id,
        requestBody: {
          valueInputOption: 'RAW',
          data: ganti.map(([i, v]) => ({ range: `Transaksi!${kolom(iJenis + 1)}${i + 2}`, values: [[JENIS_LAMA[v]]] })),
        },
      });
    }

    meta = await this.api.spreadsheets.get({
      spreadsheetId: id,
      fields: 'sheets(properties,bandedRanges.bandedRangeId,conditionalFormats)',
    });
    await this.rapikan(meta.data.sheets);
    this.cache.clear();
  }

  // Warna judul, baris berselang, lebar kolom, format Rupiah, keterangan kolom, dan warna status.
  async rapikan(sheets) {
    const id = this.spreadsheetId;
    const requests = [];
    const urutan = Object.keys(KOLOM);

    // Hapus tab kosong bawaan ("Sheet1"/"Lembar1") kalau masih ada.
    for (const s of sheets) {
      const t = s.properties.title;
      if (urutan.includes(t) || !/^(Sheet|Lembar)\s?\d+$/i.test(t)) continue;
      const isi = await this.api.spreadsheets.values.get({ spreadsheetId: id, range: `${q(t)}!A1:Z20` });
      if (!isi.data.values?.length) requests.push({ deleteSheet: { sheetId: s.properties.sheetId } });
    }

    const header = (await Promise.all(urutan.map((tab) => this.api.spreadsheets.values.get({
      spreadsheetId: id, range: `${q(tab)}!1:1`,
    })))).map((r) => r.data.values?.[0] || []);

    urutan.forEach((tab, iTab) => {
      const s = sheets.find((x) => x.properties.title === tab);
      if (!s) return;
      const sheetId = s.properties.sheetId;
      const def = KOLOM[tab];
      const judul = header[iTab];
      const jumlahKolom = Math.max(judul.length, def.kolom.length);
      const posisi = (key) => judul.indexOf(def.kolom.find((c) => c.key === key).label);

      requests.push({
        updateSheetProperties: {
          properties: { sheetId, index: iTab, tabColorStyle: { rgbColor: warna(def.warna) }, gridProperties: { frozenRowCount: 1 } },
          fields: 'index,tabColorStyle,gridProperties.frozenRowCount',
        },
      });

      // Baris judul: tebal, putih, rata tengah, boleh turun baris supaya tidak terpotong.
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: jumlahKolom },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 10 },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
              wrapStrategy: 'WRAP',
            },
          },
          fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)',
        },
      });
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
          properties: { pixelSize: 42 },
          fields: 'pixelSize',
        },
      });

      // Baris berselang warna (hapus yang lama dulu supaya tidak dobel).
      for (const b of s.bandedRanges || []) requests.push({ deleteBanding: { bandedRangeId: b.bandedRangeId } });
      requests.push({
        addBanding: {
          bandedRange: {
            range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: jumlahKolom },
            rowProperties: {
              headerColorStyle: { rgbColor: warna(def.warna) },
              firstBandColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } },
              secondBandColorStyle: { rgbColor: warna(def.warna, 0.9) },
            },
          },
        },
      });

      for (const c of def.kolom) {
        const i = posisi(c.key);
        if (i < 0) continue;
        requests.push({
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
            properties: { pixelSize: c.lebar, hiddenByUser: Boolean(c.sembunyi) },
            fields: 'pixelSize,hiddenByUser',
          },
        });
        const isiSel = {
          verticalAlignment: 'MIDDLE',
          ...(c.format ? { numberFormat: FORMAT_ANGKA[c.format], horizontalAlignment: 'RIGHT' } : {}),
        };
        requests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: i, endColumnIndex: i + 1 },
            cell: { userEnteredFormat: isiSel },
            fields: `userEnteredFormat(verticalAlignment${c.format ? ',numberFormat,horizontalAlignment' : ''})`,
          },
        });
        requests.push({
          updateCells: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: i, endColumnIndex: i + 1 },
            rows: [{ values: [{ note: c.catatan || '' }] }],
            fields: 'note',
          },
        });
      }

      // Warna otomatis: baris BATAL/SELESAI abu-abu dicoret, jenis transaksi berwarna.
      for (let n = (s.conditionalFormats || []).length - 1; n >= 0; n -= 1) {
        requests.push({ deleteConditionalFormatRule: { sheetId, index: n } });
      }
      const semuaBaris = [{ sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: jumlahKolom }];
      const aturan = (rumus, format, ranges = semuaBaris) => requests.push({
        addConditionalFormatRule: {
          rule: { ranges, booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: rumus }] }, format } },
          index: 0,
        },
      });
      const abu = { textFormat: { strikethrough: true, foregroundColor: { red: 0.6, green: 0.6, blue: 0.6 } } };
      const iStatus = def.kolom.some((c) => c.key === 'status') ? posisi('status') : -1;
      if (iStatus >= 0) {
        const kol = `$${kolom(iStatus + 1)}2`;
        // Satu syarat per aturan: spreadsheet berlokal Indonesia memakai ';' sebagai pemisah rumus.
        aturan(`=${kol}="BATAL"`, abu);
        aturan(`=${kol}="SELESAI"`, abu);
      }
      if (tab === 'Transaksi') {
        const iJenis = posisi('jenis');
        const sel = [{ sheetId, startRowIndex: 1, startColumnIndex: iJenis, endColumnIndex: iJenis + 1 }];
        const kol = `$${kolom(iJenis + 1)}2`;
        aturan(`=${kol}="Transfer IO"`, { backgroundColorStyle: { rgbColor: warna('#B7E1CD') }, textFormat: { bold: true } }, sel);
        aturan(`=${kol}="Pengeluaran"`, { backgroundColorStyle: { rgbColor: warna('#F4C7C3') } }, sel);
        aturan(`=${kol}="Potongan IO"`, { backgroundColorStyle: { rgbColor: warna('#FCE8B2') } }, sel);
      }
    });

    if (requests.length) {
      await this.api.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests } });
    }
  }

  // ---------- File lain (file per event, GUDANG, KPI) ----------

  async drive(path, { method = 'GET', body } = {}) {
    const { token } = await this.auth.getAccessToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Drive ${res.status}: ${data.error?.message || res.statusText}`);
    return data;
  }

  // File spreadsheet di folder yang namanya mengandung teks tertentu (urut nama).
  async cariFileDiFolder(folderId, mengandung) {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and mimeType='application/vnd.google-apps.spreadsheet' and name contains '${mengandung.replace(/'/g, "\\'")}'`);
    const data = await this.drive(`files?q=${q}&orderBy=name&fields=files(id,name)&pageSize=100`);
    return data.files || [];
  }

  async gantiNamaFile(fileId, nama) {
    await this.drive(`files/${fileId}`, { method: 'PATCH', body: { name: nama } });
  }

  async siapkanFileEvent(fileId, kode, judul) {
    await siapkanMain(this.api, fileId, { tab: 'Ringkasan', kode, judul });
    // Hapus tab bawaan file kosong ("Sheet1"/"Lembar1").
    const meta = await this.api.spreadsheets.get({ spreadsheetId: fileId, fields: 'sheets(properties(sheetId,title))' });
    const hapus = meta.data.sheets.filter((x) => /^(Sheet|Lembar)\s?\d+$/i.test(x.properties.title));
    if (hapus.length) {
      await this.api.spreadsheets.batchUpdate({
        spreadsheetId: fileId,
        requestBody: { requests: hapus.map((x) => ({ deleteSheet: { sheetId: x.properties.sheetId } })) },
      });
    }
  }

  async tulisDataMainDi(fileId, baris) {
    await tulisDataMain(this.api, fileId, baris);
  }

  // Menulis ulang satu tab tabel (judul + baris) di spreadsheet mana pun, lengkap dengan tampilan.
  // kolom: [{ label, lebar, format: 'rupiah'|'persen'|'angka' }]
  async tulisTabel(spreadsheetId, tab, { kolom, baris, warna: hex = '#E8710A', index, barisTotal = false }) {
    const meta = await this.api.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId,title),bandedRanges.bandedRangeId)' });
    let s = meta.data.sheets.find((x) => x.properties.title === tab);
    if (!s) {
      const r = await this.api.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: [{ addSheet: { properties: { title: tab, ...(index !== undefined ? { index } : {}) } } }] },
      });
      s = { properties: r.data.replies[0].addSheet.properties, bandedRanges: [] };
    }
    const sheetId = s.properties.sheetId;
    await this.api.spreadsheets.values.clear({ spreadsheetId, range: `${q(tab)}!A:ZZ` });
    await this.api.spreadsheets.values.update({
      spreadsheetId,
      range: `${q(tab)}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [kolom.map((c) => c.label), ...baris] },
    });
    const n = kolom.length;
    const req = [
      { updateSheetProperties: { properties: { sheetId, ...(index !== undefined ? { index } : {}), gridProperties: { frozenRowCount: 1, frozenColumnCount: 2 }, tabColorStyle: { rgbColor: warna(hex) } }, fields: `${index !== undefined ? 'index,' : ''}gridProperties(frozenRowCount,frozenColumnCount),tabColorStyle` } },
      ...(s.bandedRanges || []).map((b) => ({ deleteBanding: { bandedRangeId: b.bandedRangeId } })),
      { addBanding: { bandedRange: { range: { sheetId, startRowIndex: 0, endRowIndex: baris.length + 1, startColumnIndex: 0, endColumnIndex: n }, rowProperties: { headerColorStyle: { rgbColor: warna(hex) }, firstBandColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } }, secondBandColorStyle: { rgbColor: warna(hex, 0.9) } } } } },
      { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: n }, cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)' } },
      { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 48 }, fields: 'pixelSize' } },
      { repeatCell: { range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: n }, cell: { userEnteredFormat: { textFormat: { bold: false }, verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat(textFormat.bold,verticalAlignment,wrapStrategy)' } },
      { repeatCell: { range: { sheetId }, cell: { userEnteredFormat: {} }, fields: 'userEnteredFormat.borders' } },
      { updateBorders: { range: { sheetId, startRowIndex: 0, endRowIndex: baris.length + 1, startColumnIndex: 0, endColumnIndex: n }, ...GARIS_HITAM } },
    ];
    kolom.forEach((c, i) => {
      req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: c.lebar || 120 }, fields: 'pixelSize' } });
      if (c.format) {
        req.push({ repeatCell: { range: { sheetId, startRowIndex: 1, startColumnIndex: i, endColumnIndex: i + 1 }, cell: { userEnteredFormat: { numberFormat: FORMAT_ANGKA[c.format], horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } });
      }
    });
    if (barisTotal && baris.length) {
      req.push({ repeatCell: { range: { sheetId, startRowIndex: baris.length, endRowIndex: baris.length + 1, startColumnIndex: 0, endColumnIndex: n }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColorStyle: { rgbColor: warna(hex, 0.7) } } }, fields: 'userEnteredFormat(textFormat.bold,backgroundColorStyle)' } });
    }
    await this.api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: req } });
  }

  // ---------- File INPUT EVENT LAMA ----------

  // Membuat tab input (judul kolom, dropdown, keterangan). Data yang sudah diisi owner tidak pernah dihapus.
  async siapkanInputManual(fileId) {
    let meta = await this.api.spreadsheets.get({ spreadsheetId: fileId, fields: 'sheets(properties(sheetId,title))' });
    const ada = new Set(meta.data.sheets.map((x) => x.properties.title));
    const tabBaru = ['0. Cara Isi', ...TAB_INPUT.map((t) => t.nama)].filter((t) => !ada.has(t));
    if (tabBaru.length) {
      await this.api.spreadsheets.batchUpdate({ spreadsheetId: fileId, requestBody: { requests: tabBaru.map((title) => ({ addSheet: { properties: { title } } })) } });
      meta = await this.api.spreadsheets.get({ spreadsheetId: fileId, fields: 'sheets(properties(sheetId,title))' });
    }
    const id = (t) => meta.data.sheets.find((x) => x.properties.title === t).properties.sheetId;
    await this.api.spreadsheets.values.update({ spreadsheetId: fileId, range: `${q('0. Cara Isi')}!A1`, valueInputOption: 'RAW', requestBody: { values: CARA_ISI } });
    const req = [
      { updateSheetProperties: { properties: { sheetId: id('0. Cara Isi'), index: 0 }, fields: 'index' } },
      { repeatCell: { range: { sheetId: id('0. Cara Isi'), startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } } }, fields: 'userEnteredFormat.textFormat' } },
      { updateDimensionProperties: { range: { sheetId: id('0. Cara Isi'), dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 900 }, fields: 'pixelSize' } },
    ];
    for (const [i, t] of TAB_INPUT.entries()) {
      const sheetId = id(t.nama);
      await this.api.spreadsheets.values.update({ spreadsheetId: fileId, range: `${q(t.nama)}!A1`, valueInputOption: 'RAW', requestBody: { values: [t.kolom.map((c) => c.label)] } });
      req.push(
        { updateSheetProperties: { properties: { sheetId, index: i + 1, tabColorStyle: { rgbColor: warna(t.warna) }, gridProperties: { frozenRowCount: 1 } }, fields: 'index,tabColorStyle,gridProperties.frozenRowCount' } },
        { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: t.kolom.length }, cell: { userEnteredFormat: { backgroundColorStyle: { rgbColor: warna(t.warna) }, textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat(backgroundColorStyle,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 42 }, fields: 'pixelSize' } },
      );
      t.kolom.forEach((c, j) => {
        req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: j, endIndex: j + 1 }, properties: { pixelSize: c.lebar }, fields: 'pixelSize' } });
        req.push({ updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: j, endColumnIndex: j + 1 }, rows: [{ values: [{ note: c.catatan || '' }] }], fields: 'note' } });
        if (c.pilihan) {
          req.push({ setDataValidation: { range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: j, endColumnIndex: j + 1 }, rule: { condition: { type: 'ONE_OF_LIST', values: c.pilihan.map((v) => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false } } });
        }
      });
    }
    // Hapus tab bawaan file kosong.
    for (const x of meta.data.sheets) if (/^(Sheet|Lembar)\s?\d+$/i.test(x.properties.title)) req.push({ deleteSheet: { sheetId: x.properties.sheetId } });
    await this.api.spreadsheets.batchUpdate({ spreadsheetId: fileId, requestBody: { requests: req } });
  }

  // Isi tab input (tanpa baris judul). Tanggal dibaca sebagai nomor seri supaya tidak bergantung format lokal.
  async bacaInputManual(fileId) {
    const res = await this.api.spreadsheets.values.batchGet({
      spreadsheetId: fileId,
      ranges: TAB_INPUT.map((t) => `${q(t.nama)}!A2:Z`),
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'SERIAL_NUMBER',
    });
    return Object.fromEntries(TAB_INPUT.map((t, i) => [t.nama, res.data.valueRanges[i]?.values || []]));
  }

  // Menulis beberapa tab sekaligus dalam ±4 permintaan ke Google (hemat kuota).
  // daftar: [{ tab, judul, total, kolom: [{label, lebar, format}], baris, warna }]
  // Baris 1: judul + TOTAL, baris 3: judul kolom, baris 4 dst: data.
  async tulisBanyakTabel(spreadsheetId, daftar, { hapus = [], mulaiIndex } = {}) {
    let meta = await this.api.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId,title,index),bandedRanges.bandedRangeId)' });
    const cari = (t) => meta.data.sheets.find((x) => x.properties.title === t);
    const tambah = daftar.filter((d) => !cari(d.tab)).map((d) => ({ addSheet: { properties: { title: d.tab } } }));
    const buang = meta.data.sheets.filter((x) => hapus.includes(x.properties.title)).map((x) => ({ deleteSheet: { sheetId: x.properties.sheetId } }));
    if (tambah.length || buang.length) {
      await this.api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [...tambah, ...buang] } });
      meta = await this.api.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId,title,index),bandedRanges.bandedRangeId)' });
    }
    await this.api.spreadsheets.values.batchClear({ spreadsheetId, requestBody: { ranges: daftar.map((d) => `${q(d.tab)}!A:Z`) } });
    await this.api.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: daftar.map((d) => ({
          range: `${q(d.tab)}!A1`,
          values: [[d.judul, '', '', d.total, '', `${d.baris.length} catatan`], [], d.kolom.map((c) => c.label), ...d.baris],
        })),
      },
    });
    const req = [];
    const indeksAwal = mulaiIndex ?? Math.min(...daftar.map((d) => cari(d.tab).properties.index));
    daftar.forEach((d, urut) => {
      const s = cari(d.tab);
      const sheetId = s.properties.sheetId;
      const n = d.kolom.length;
      const w = d.warna || '#0B8043';
      req.push({ updateSheetProperties: { properties: { sheetId, index: indeksAwal + urut, tabColorStyle: { rgbColor: warna(w) }, gridProperties: { frozenRowCount: 3 } }, fields: 'index,tabColorStyle,gridProperties.frozenRowCount' } });
      for (const b of s.bandedRanges || []) req.push({ deleteBanding: { bandedRangeId: b.bandedRangeId } });
      const akhir = 3 + d.baris.length;
      req.push(
        // Hapus garis & gabungan sel lama dulu (jumlah baris bisa berkurang).
        { repeatCell: { range: { sheetId }, cell: { userEnteredFormat: {} }, fields: 'userEnteredFormat.borders' } },
        { unmergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 26 } } },
        // Judul digabung A1:C1 dan boleh turun baris supaya tidak keluar dari kotaknya.
        { mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 3 }, mergeType: 'MERGE_ALL' } },
        { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: Math.max(n, 6) }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 13, foregroundColorStyle: { rgbColor: warna(w) } }, verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat(textFormat,verticalAlignment,wrapStrategy)' } },
        // Total digabung D1:E1 supaya angkanya muat; jumlah catatan di F1.
        { mergeCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 3, endColumnIndex: 5 }, mergeType: 'MERGE_ALL' } },
        { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 3, endColumnIndex: 5 }, cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"TOTAL  Rp "#,##0' }, backgroundColorStyle: { rgbColor: warna(w, 0.8) }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(numberFormat,backgroundColorStyle,horizontalAlignment)' } },
        { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', backgroundColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } } } }, fields: 'userEnteredFormat(horizontalAlignment,backgroundColorStyle)' } },
        { updateBorders: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 }, ...GARIS_HITAM } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 52 }, fields: 'pixelSize' } },
        { repeatCell: { range: { sheetId, startRowIndex: 3, startColumnIndex: 0, endColumnIndex: n }, cell: { userEnteredFormat: { verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat(verticalAlignment,wrapStrategy)' } },
        { updateBorders: { range: { sheetId, startRowIndex: 2, endRowIndex: akhir, startColumnIndex: 0, endColumnIndex: n }, ...GARIS_HITAM } },
        { addBanding: { bandedRange: { range: { sheetId, startRowIndex: 2, endRowIndex: 3 + d.baris.length, startColumnIndex: 0, endColumnIndex: n }, rowProperties: { headerColorStyle: { rgbColor: warna(w) }, firstBandColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } }, secondBandColorStyle: { rgbColor: warna(w, 0.9) } } } } },
        { repeatCell: { range: { sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: n }, cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat(textFormat,horizontalAlignment,wrapStrategy)' } },
      );
      // Hapus coretan lama, lalu coret baris yang dibatalkan (abu-abu).
      req.push({ repeatCell: { range: { sheetId, startRowIndex: 3, startColumnIndex: 0, endColumnIndex: n }, cell: { userEnteredFormat: { textFormat: { strikethrough: false, foregroundColorStyle: { rgbColor: { red: 0, green: 0, blue: 0 } } } } }, fields: 'userEnteredFormat.textFormat(strikethrough,foregroundColorStyle)' } });
      for (const i of d.barisCoret || []) {
        req.push({ repeatCell: { range: { sheetId, startRowIndex: 3 + i, endRowIndex: 4 + i, startColumnIndex: 0, endColumnIndex: n }, cell: { userEnteredFormat: { textFormat: { strikethrough: true, foregroundColorStyle: { rgbColor: { red: 0.6, green: 0.6, blue: 0.6 } } } } }, fields: 'userEnteredFormat.textFormat(strikethrough,foregroundColorStyle)' } });
      }
      d.kolom.forEach((c, i) => {
        req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: c.lebar || 120 }, fields: 'pixelSize' } });
        if (c.format) req.push({ repeatCell: { range: { sheetId, startRowIndex: 3, startColumnIndex: i, endColumnIndex: i + 1 }, cell: { userEnteredFormat: { numberFormat: FORMAT_ANGKA[c.format], horizontalAlignment: 'RIGHT' } }, fields: 'userEnteredFormat(numberFormat,horizontalAlignment)' } });
      });
    });
    await this.api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: req } });
  }

  // Tab "Main" & "Data Main" versi lama di PEMBUKUAN tidak dipakai lagi (pindah ke file per event).
  async hapusTab(spreadsheetId, namaTab) {
    const meta = await this.api.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId,title))' });
    const hapus = meta.data.sheets.filter((x) => namaTab.includes(x.properties.title));
    if (hapus.length) {
      await this.api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: hapus.map((x) => ({ deleteSheet: { sheetId: x.properties.sheetId } })) } });
    }
  }

  async baca(tab) {
    const c = this.cache.get(tab);
    if (c && Date.now() - c.waktu < CACHE_MS) return c;
    const res = await this.api.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${q(tab)}!A1:ZZ`,
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });
    const [judul = [], ...rows] = res.data.values || [];
    const peta = petaJudul(tab);
    const header = judul.map((h) => peta.get(h) ?? h);
    const data = { waktu: Date.now(), header, rows };
    this.cache.set(tab, data);
    return data;
  }

  async all(tab) {
    const { header, rows } = await this.baca(tab);
    return rows
      .filter((r) => r.some((v) => v !== '' && v != null))
      .map((r) => {
        const obj = Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']));
        if (tab === 'Transaksi' && JENIS_LAMA[obj.jenis]) obj.jenis = JENIS_LAMA[obj.jenis];
        return obj;
      });
  }

  // Menambah baris di bawah baris terakhir. Tidak memakai values.append karena Google bisa salah menebak
  // letak tabel (misalnya ada kolom tersembunyi) dan menulis baris baru di atas judul kolom.
  async append(tab, row) {
    this.cache.delete(tab);
    const { header, rows } = await this.baca(tab);
    const values = header.map((h) => row[h] ?? '');
    const nomorBaris = rows.length + 2;
    const tulis = () => this.api.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${q(tab)}!A${nomorBaris}:${kolom(header.length)}${nomorBaris}`,
      valueInputOption: 'RAW',
      requestBody: { values: [values] },
    });
    try {
      await tulis();
    } catch (err) {
      if (!/exceeds grid limits/i.test(err.message)) throw err;
      const meta = await this.api.spreadsheets.get({ spreadsheetId: this.spreadsheetId, fields: 'sheets(properties(sheetId,title))' });
      const sheetId = meta.data.sheets.find((x) => x.properties.title === tab).properties.sheetId;
      await this.api.spreadsheets.batchUpdate({ spreadsheetId: this.spreadsheetId, requestBody: { requests: [{ appendDimension: { sheetId, dimension: 'ROWS', length: 500 } }] } });
      await tulis();
    }
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
      range: `${q(tab)}!A${nomorBaris}:${kolom(header.length)}${nomorBaris}`,
      valueInputOption: 'RAW',
      requestBody: { values: [baris] },
    });
    this.cache.delete(tab);
    return Object.fromEntries(header.map((h, i) => [h, baris[i]]));
  }

  // Ubah baris pertama yang memenuhi fungsi `cocok(baris)`.
  async updateWhere(tab, cocok, patch) {
    this.cache.delete(tab);
    const { header, rows } = await this.baca(tab);
    const idx = rows.findIndex((r) => cocok(Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))));
    if (idx < 0) return null;
    const baris = header.map((h, i) => (h in patch ? patch[h] : rows[idx][i] ?? ''));
    const nomorBaris = idx + 2;
    await this.api.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${q(tab)}!A${nomorBaris}:${kolom(header.length)}${nomorBaris}`,
      valueInputOption: 'RAW',
      requestBody: { values: [baris] },
    });
    this.cache.delete(tab);
    return Object.fromEntries(header.map((h, i) => [h, baris[i]]));
  }
}
