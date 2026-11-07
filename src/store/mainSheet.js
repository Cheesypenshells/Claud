// Tata letak sheet "Main": pilih event di sel C2, semua tabel terisi otomatis lewat rumus FILTER
// dari tab tersembunyi "Data Main" (diisi bot). Rumus memakai ';' karena spreadsheet berlokal Indonesia.

import { TAB_DATA_MAIN, KOLOM_DATA_MAIN } from '../schema.js';
import { BATAS_BARIS } from '../laporan.js';

export const TAB_MAIN = 'Main';

const RP = { type: 'CURRENCY', pattern: '"Rp "#,##0' };
const ANGKA = { type: 'NUMBER', pattern: '#,##0' };

// Kolom B = indeks 1. Setiap bagian: baris judul bagian, baris judul kolom, lalu baris data.
const BAGIAN = [
  { kode: 'RINGKASAN', judul: '① RINGKASAN UNTUNG / RUGI', warna: '#E8710A', mulai: 4, kolom: ['Keterangan', 'Nilai'], rupiah: [1], tanpaJudulKolom: true },
  { kode: 'OMZET', judul: '② OMZET HARIAN', warna: '#1A73E8', mulai: 15, kolom: ['Tanggal', 'Hari', 'Omzet', 'Jumlah Transaksi', 'Refund', 'Potongan IO', 'Perkiraan Transfer', 'Sudah Ditransfer', 'Selisih'], rupiah: [2, 4, 5, 6, 7, 8], angka: [3] },
  { kode: 'BIAYA', judul: '③ RINCIAN BIAYA', warna: '#D93025', mulai: 49, kolom: ['No', 'Kategori', 'Nominal', 'Keterangan'], rupiah: [2] },
  { kode: 'MAKAN', judul: 'BUDGET MAKAN (akumulasi selama event)', warna: '#0B8043', mulai: 68, kolom: ['Total Budget', 'Sudah Terpakai', 'Sisa Budget', 'Keterangan'], rupiah: [0, 1, 2] },
  { kode: 'TIM', judul: 'TIM & GAJI (estimasi)', warna: '#8E24AA', mulai: 72, kolom: ['Nama', 'Peran', 'Hari Kerja', 'Upah per Hari', 'Total Upah', 'Estimasi Bonus', 'Total'], rupiah: [3, 4, 5, 6] },
  { kode: 'IKLAN', judul: '④ BIAYA IKLAN & ENDORSE', warna: '#F9AB00', mulai: 95, kolom: ['Tanggal', 'Keterangan', 'Nominal'], rupiah: [2] },
  { kode: 'GRATIS', judul: 'PORSI GRATIS (harga jual, budget per event)', warna: '#F9AB00', mulai: 108, kolom: ['Tanggal', 'Menu', 'Porsi', 'Total pcs', 'Harga per pcs', 'Nilai Jual', 'Diberikan Untuk'], rupiah: [4, 5] },
  { kode: 'BAHAN', judul: '⑤ SISA BAHAN BAKU (dikembalikan ke gudang)', warna: '#C2185B', mulai: 121, kolom: ['Bahan', 'Satuan', 'Keluar', 'Restock', 'Dikembalikan', 'Terpakai', 'Harga', 'Nilai Terpakai', 'Nilai Dikembalikan'], rupiah: [6, 7, 8] },
  { kode: 'UANG', judul: '⑥ UANG SIAPA (penggantian dari owner)', warna: '#5F6368', mulai: 134, kolom: ['Nama', 'Uang yang Terpakai', 'Sudah Diganti', 'Sisa Harus Ditransfer', 'Jumlah Catatan'], rupiah: [1, 2, 3] },
];

function warna(hex, terang = 0) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => (v + (255 - v) * terang) / 255;
  return { red: c((n >> 16) & 255), green: c((n >> 8) & 255), blue: c(n & 255) };
}

const huruf = (i) => String.fromCharCode(65 + i);
const DATA = `'${TAB_DATA_MAIN}'`;

function rumusFilter(bagian, jumlahKolom) {
  const akhir = huruf(3 + jumlahKolom - 1); // data mulai kolom D
  return `=IFERROR(FILTER(${DATA}!D2:${akhir};${DATA}!A2:A=$C$2;${DATA}!B2:B="${bagian}");"")`;
}

function barisData(b) {
  return b.mulai + (b.tanpaJudulKolom ? 1 : 2); // baris pertama data (1-based)
}

// opsi.tab  : nama tab tampilan (default 'Main')
// opsi.kode : kalau diisi, file ini khusus satu event (C2 berisi kode tetap, tanpa pilihan)
// opsi.judul: judul besar di B1
export async function siapkanMain(api, spreadsheetId, opsi = {}) {
  const tab = opsi.tab || TAB_MAIN;
  const qt = `'${tab}'`;
  let meta = await api.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties,charts.chartId,conditionalFormats)' });
  const cari = (t) => meta.data.sheets.find((s) => s.properties.title === t);
  const tambah = [];
  if (!cari(tab)) tambah.push({ addSheet: { properties: { title: tab, index: 0, gridProperties: { columnCount: 26, rowCount: 160 } } } });
  if (!cari(TAB_DATA_MAIN)) tambah.push({ addSheet: { properties: { title: TAB_DATA_MAIN, hidden: true } } });
  if (tambah.length) {
    await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: tambah } });
    meta = await api.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties,charts.chartId,conditionalFormats)' });
  }
  const main = cari(tab);
  const sheetId = main.properties.sheetId;

  // Isi: judul, pilihan event, rumus tiap bagian. Pilihan event di C2 dipertahankan.
  const pilihan = (await api.spreadsheets.values.get({ spreadsheetId, range: `${qt}!C2` })).data.values?.[0]?.[0] || '';
  const nilai = [
    { range: `${qt}!B1`, values: [[opsi.judul || 'MAIN – BEDAH UNTUNG / RUGI PER EVENT']] },
    { range: `${qt}!B2`, values: [[opsi.kode ? 'Kode event ▶' : 'Pilih event ▶']] },
    ...(opsi.kode ? [{ range: `${qt}!C2`, values: [[opsi.kode]] }] : []),
    { range: `${qt}!E2`, values: [[`=IFERROR(FILTER(${DATA}!D2:D;${DATA}!A2:A=$C$2;${DATA}!B2:B="INFO");"Pilih kode event di kotak kuning")`]] },
    { range: `${qt}!B3`, values: [['Angka diperbarui otomatis oleh bot setiap ada laporan baru di grup WhatsApp.']] },
  ];
  for (const b of BAGIAN) {
    nilai.push({ range: `${qt}!B${b.mulai}`, values: [[b.judul]] });
    if (!b.tanpaJudulKolom) nilai.push({ range: `${qt}!B${b.mulai + 1}`, values: [b.kolom] });
    nilai.push({ range: `${qt}!B${barisData(b)}`, values: [[rumusFilter(b.kode, b.kolom.length)]] });
  }
  const gratis = BAGIAN.find((b) => b.kode === 'GRATIS');
  nilai.push({ range: `${qt}!E${gratis.mulai}`, values: [[`=IFERROR(FILTER(${DATA}!D2:D;${DATA}!A2:A=$C$2;${DATA}!B2:B="GRATIS_INFO");"")`]] });
  await api.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'USER_ENTERED', data: nilai } });

  // Tampilan.
  const req = [];
  const sel = (r1, r2, c1, c2) => ({ sheetId, startRowIndex: r1 - 1, endRowIndex: r2, startColumnIndex: c1, endColumnIndex: c2 });
  const format = (range, userEnteredFormat, fields) => req.push({ repeatCell: { range, cell: { userEnteredFormat }, fields: `userEnteredFormat(${fields})` } });

  req.push({ updateSheetProperties: { properties: { sheetId, index: 0, tabColorStyle: { rgbColor: warna('#E8710A') }, gridProperties: { frozenRowCount: 2, hideGridlines: true, rowCount: Math.max(160, main.properties.gridProperties?.rowCount || 0) } }, fields: 'index,tabColorStyle,gridProperties(frozenRowCount,hideGridlines,rowCount)' } });
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 16 }, fields: 'pixelSize' } });
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 210 }, fields: 'pixelSize' } });
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 270 }, fields: 'pixelSize' } });
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 10 }, properties: { pixelSize: 135 }, fields: 'pixelSize' } });

  format(sel(1, 1, 1, 10), { textFormat: { bold: true, fontSize: 16, foregroundColorStyle: { rgbColor: warna('#E8710A') } } }, 'textFormat');
  format(sel(2, 2, 1, 2), { textFormat: { bold: true }, horizontalAlignment: 'RIGHT', verticalAlignment: 'MIDDLE' }, 'textFormat,horizontalAlignment,verticalAlignment');
  format(sel(2, 2, 2, 3), {
    textFormat: { bold: true, fontSize: 12 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE',
    backgroundColorStyle: { rgbColor: warna('#FFF2CC') },
    borders: Object.fromEntries(['top', 'bottom', 'left', 'right'].map((s) => [s, { style: 'SOLID_MEDIUM', colorStyle: { rgbColor: warna('#E8710A') } }])),
  }, 'textFormat,horizontalAlignment,verticalAlignment,backgroundColorStyle,borders');
  format(sel(2, 2, 4, 10), { textFormat: { italic: true, foregroundColorStyle: { rgbColor: warna('#5F6368') } }, verticalAlignment: 'MIDDLE' }, 'textFormat,verticalAlignment');
  format(sel(3, 3, 1, 10), { textFormat: { italic: true, fontSize: 9, foregroundColorStyle: { rgbColor: warna('#9AA0A6') } } }, 'textFormat');
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 34 }, fields: 'pixelSize' } });
  req.push(opsi.kode
    ? { setDataValidation: { range: sel(2, 2, 2, 3) } }
    : {
      setDataValidation: {
        range: sel(2, 2, 2, 3),
        rule: { condition: { type: 'ONE_OF_RANGE', values: [{ userEnteredValue: '=Event!$A$2:$A' }] }, showCustomUi: true, strict: false },
      },
    });

  for (const b of BAGIAN) {
    const lebar = 1 + Math.max(b.kolom.length, 2);
    format(sel(b.mulai, b.mulai, 1, lebar), {
      backgroundColorStyle: { rgbColor: warna(b.warna) },
      textFormat: { bold: true, fontSize: 11, foregroundColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } } },
      verticalAlignment: 'MIDDLE',
    }, 'backgroundColorStyle,textFormat,verticalAlignment');
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: b.mulai - 1, endIndex: b.mulai }, properties: { pixelSize: 30 }, fields: 'pixelSize' } });
    if (!b.tanpaJudulKolom) {
      format(sel(b.mulai + 1, b.mulai + 1, 1, lebar), {
        backgroundColorStyle: { rgbColor: warna(b.warna, 0.82) },
        textFormat: { bold: true }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP',
      }, 'backgroundColorStyle,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy');
    }
    const r1 = barisData(b);
    const r2 = r1 + BATAS_BARIS[b.kode] - 1;
    format(sel(r1, r2, 1, lebar), { backgroundColorStyle: { rgbColor: warna(b.warna, 0.95) }, verticalAlignment: 'MIDDLE' }, 'backgroundColorStyle,verticalAlignment');
    for (const i of b.rupiah || []) format(sel(r1, r2, 1 + i, 2 + i), { numberFormat: RP, horizontalAlignment: 'RIGHT' }, 'numberFormat,horizontalAlignment');
    for (const i of b.angka || []) format(sel(r1, r2, 1 + i, 2 + i), { numberFormat: ANGKA, horizontalAlignment: 'RIGHT' }, 'numberFormat,horizontalAlignment');
  }

  // Ringkasan: baris LABA / RUGI tebal besar; hijau kalau untung, merah kalau rugi.
  const ring = BAGIAN[0];
  const barisLaba = barisData(ring) + 5; // baris "LABA BERSIH"
  format(sel(barisData(ring) + 3, barisData(ring) + 3, 1, 3), { textFormat: { bold: true } }, 'textFormat');
  format(sel(barisLaba, barisLaba, 1, 3), { textFormat: { bold: true, fontSize: 13 } }, 'textFormat');
  for (let n = (main.conditionalFormats || []).length - 1; n >= 0; n -= 1) req.push({ deleteConditionalFormatRule: { sheetId, index: n } });
  const aturan = (rumus, hex) => req.push({
    addConditionalFormatRule: {
      index: 0,
      rule: {
        ranges: [sel(barisLaba, barisLaba + 1, 1, 3)],
        booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: rumus }] }, format: { backgroundColorStyle: { rgbColor: warna(hex, 0.6) } } },
      },
    },
  });
  aturan(`=AND($C$${barisLaba}<>"";$C$${barisLaba}>=0)`, '#0B8043');
  aturan(`=AND($C$${barisLaba}<>"";$C$${barisLaba}<0)`, '#D93025');

  // Grafik batang omzet harian (sekali saja).
  if (!(main.charts || []).length) {
    const om = BAGIAN[1];
    const r1 = barisData(om);
    const r2 = r1 + BATAS_BARIS.OMZET - 1;
    const sumber = (kol) => ({ sourceRange: { sources: [sel(r1, r2, kol, kol + 1)] } });
    req.push({
      addChart: {
        chart: {
          spec: {
            title: 'Omzet Harian',
            basicChart: {
              chartType: 'COLUMN',
              legendPosition: 'NO_LEGEND',
              axis: [{ position: 'BOTTOM_AXIS', title: 'Tanggal' }, { position: 'LEFT_AXIS', title: 'Omzet (Rp)' }],
              domains: [{ domain: sumber(1) }],
              series: [{ series: sumber(3), targetAxis: 'LEFT_AXIS', colorStyle: { rgbColor: warna('#1A73E8') } }],
            },
          },
          position: { overlayPosition: { anchorCell: { sheetId, rowIndex: 3, columnIndex: 11 }, widthPixels: 620, heightPixels: 340 } },
        },
      },
    });
  }

  await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: req } });
  return { pilihan };
}

// Menulis ulang seluruh isi tab "Data Main".
export async function tulisDataMain(api, spreadsheetId, baris) {
  await api.spreadsheets.values.clear({ spreadsheetId, range: `${DATA}!A:Z` });
  await api.spreadsheets.values.update({
    spreadsheetId,
    range: `${DATA}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [KOLOM_DATA_MAIN, ...baris] },
  });
}

// Isi pilihan event di C2 kalau masih kosong.
export async function pilihEventDefault(api, spreadsheetId, kode, tab = TAB_MAIN) {
  const ada = (await api.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'!C2` })).data.values?.[0]?.[0];
  if (ada || !kode) return;
  await api.spreadsheets.values.update({ spreadsheetId, range: `'${tab}'!C2`, valueInputOption: 'RAW', requestBody: { values: [[kode]] } });
}
