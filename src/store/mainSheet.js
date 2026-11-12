// Tata letak sheet "Main": pilih event di sel C2, semua tabel terisi otomatis lewat rumus FILTER
// dari tab tersembunyi "Data Main" (diisi bot). Rumus memakai ';' karena spreadsheet berlokal Indonesia.

import { TAB_DATA_MAIN, KOLOM_DATA_MAIN } from '../schema.js';
import { BATAS_BARIS, KELOMPOK_GRAFIK, warnaKelompok } from '../laporan.js';

export const TAB_MAIN = 'Main';

const RP = { type: 'CURRENCY', pattern: '"Rp "#,##0' };
const HITAM = { style: 'SOLID', colorStyle: { rgbColor: { red: 0, green: 0, blue: 0 } } };
const GARIS = { top: HITAM, bottom: HITAM, left: HITAM, right: HITAM, innerHorizontal: HITAM, innerVertical: HITAM };

// Tabel di sisi kanan (kolom L dst.): komposisi untuk grafik & omzet/pengeluaran per tanggal.
const KOMPOSISI = { judul: 23, kolom: 24, data: 25, akhir: 24 + BATAS_BARIS.GRAFIK };
const WARNA_NETRAL = '#37474F'; // baris omzet & laba di tabel komposisi
const HARIAN = { judul: 64, kolom: 65, data: 66, akhir: 65 + BATAS_BARIS.HARIAN };
// Alokasi harian (sumber grafik garis): kolom L:S di bawah tabel harian.
const ALOKASI = { judul: 99, kolom: 100, data: 101, akhir: 100 + BATAS_BARIS.ALOKASI };
const KOLOM_ALOKASI = ['Tanggal', 'Omzet', 'Potongan IO', 'Bahan baku terpakai', 'Gaji & upah', 'Penginapan', 'Biaya lain', 'Laba'];
const WARNA_ALOKASI = ['#1A73E8', '#FF6D01', '#EA4335', '#46BDC6', '#8E24AA', '#9AA0A6', '#0B8043'];
const JUDUL_GRAFIK = ['Omzet Harian', 'Omzet & Pengeluaran Harian', 'Omzet vs Biaya', 'Porsi Biaya', 'Porsi Biaya (% dari total biaya)', 'Grafik Harian: Omzet, Bahan Baku, Gaji, Hotel & Laba'];
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
  { kode: 'BAHAN', judul: '⑤ BAHAN BAKU (awal + restock − sisa = terpakai)', warna: '#C2185B', mulai: 121, kolom: ['Bahan', 'Satuan', 'Awal (kiriman 1)', 'Restock', 'Sisa', 'Terpakai', 'Harga', 'Nilai Terpakai', 'Nilai Sisa'], rupiah: [6, 7, 8] },
  { kode: 'UANG', judul: '⑥ UANG SIAPA (penggantian dari owner)', warna: '#5F6368', mulai: 134, kolom: ['Nama', 'Uang yang Terpakai', 'Sudah Diganti', 'Sisa Harus Ditransfer', 'Jumlah Catatan'], rupiah: [1, 2, 3] },
];

function warna(hex, terang = 0) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => (v + (255 - v) * terang) / 255;
  return { red: c((n >> 16) & 255), green: c((n >> 8) & 255), blue: c(n & 255) };
}

const huruf = (i) => String.fromCharCode(65 + i);

// Total yang ditulis di judul berwarna tiap tabel (kecuali ringkasan): kolom isi (0 = kolom D di Data Main)
// dan kolom tempat tulisan "TOTAL". MAKAN tidak punya baris TOTAL: angka "sudah terpakai" baris pertama.
const TOTAL_JUDUL = {
  OMZET: { label: 'TOTAL OMZET', kolom: 2, labelKolom: 0 },
  BIAYA: { label: 'TOTAL BIAYA', kolom: 2, labelKolom: 1 },
  MAKAN: { label: 'TERPAKAI', kolom: 1, tanpaBarisTotal: true },
  TIM: { label: 'TOTAL GAJI & BONUS', kolom: 6, labelKolom: 0 },
  IKLAN: { label: 'TOTAL IKLAN', kolom: 2, labelKolom: 0 },
  BAHAN: { label: 'TOTAL TERPAKAI', kolom: 7, labelKolom: 0 },
  UANG: { label: 'TOTAL UANG TERPAKAI', kolom: 1, labelKolom: 0 },
};
function judulDenganTotal(b) {
  const t = TOTAL_JUDUL[b.kode];
  if (!t) return b.judul;
  const kol = (i) => `${DATA}!${String.fromCharCode(68 + i)}2:${String.fromCharCode(68 + i)}`;
  const syarat = [`${DATA}!A2:A=$C$2`, `${DATA}!B2:B="${b.kode}"`];
  if (!t.tanpaBarisTotal) syarat.push(`${kol(t.labelKolom)}="TOTAL"`);
  const angka = `INDEX(FILTER(${kol(t.kolom)};${syarat.join(';')});1)`;
  const teks = b.judul.replace(/"/g, '""');
  return `="${teks}"&IFERROR("   ·   ${t.label}: Rp "&TEXT(${angka};"#,##0");"")`;
}
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
  let meta = await api.spreadsheets.get({ spreadsheetId, fields: 'properties.spreadsheetTheme,sheets(properties,charts(chartId,spec.title),conditionalFormats)' });
  const cari = (t) => meta.data.sheets.find((s) => s.properties.title === t);
  const tambah = [];
  if (!cari(tab)) tambah.push({ addSheet: { properties: { title: tab, index: 0, gridProperties: { columnCount: 26, rowCount: 160 } } } });
  if (!cari(TAB_DATA_MAIN)) tambah.push({ addSheet: { properties: { title: TAB_DATA_MAIN, hidden: true } } });
  if (tambah.length) {
    await api.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: tambah } });
    meta = await api.spreadsheets.get({ spreadsheetId, fields: 'properties.spreadsheetTheme,sheets(properties,charts(chartId,spec.title),conditionalFormats)' });
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
    nilai.push({ range: `${qt}!B${b.mulai}`, values: [[judulDenganTotal(b)]] });
    if (!b.tanpaJudulKolom) nilai.push({ range: `${qt}!B${b.mulai + 1}`, values: [b.kolom] });
    nilai.push({ range: `${qt}!B${barisData(b)}`, values: [[rumusFilter(b.kode, b.kolom.length)]] });
  }
  // Data untuk grafik komposisi (kolom L:M) dan omzet/pengeluaran per tanggal (kolom L:O).
  nilai.push({ range: `${qt}!L${KOMPOSISI.judul}`, values: [['📊 KOMPOSISI OMZET & BIAYA', '', '', '']] });
  nilai.push({ range: `${qt}!L${KOMPOSISI.kolom}`, values: [['Kelompok', 'Nilai', '% Biaya', 'Perbandingan']] });
  nilai.push({ range: `${qt}!L${KOMPOSISI.data}`, values: [[`=IFERROR(FILTER(${DATA}!D2:F;${DATA}!A2:A=$C$2;${DATA}!B2:B="GRAFIK");"")`]] });
  // Batang teks sederhana (warna mengikuti kategori), panjang sesuai porsi biaya.
  KELOMPOK_GRAFIK.forEach((k, i) => {
    const r = KOMPOSISI.data + 1 + i;
    nilai.push({ range: `${qt}!O${r}`, values: [[`=IF(N${r}="";"";REPT("█";ROUND(N${r}*25)))`]] });
  });
  nilai.push({ range: `${qt}!L${HARIAN.judul}`, values: [['OMZET & PENGELUARAN PER TANGGAL', '', '', '']] });
  nilai.push({ range: `${qt}!L${HARIAN.kolom}`, values: [['Tanggal', 'Omzet', 'Pengeluaran (catatan grup)', 'Selisih']] });
  nilai.push({ range: `${qt}!L${HARIAN.data}`, values: [[`=IFERROR(FILTER(${DATA}!D2:G;${DATA}!A2:A=$C$2;${DATA}!B2:B="HARIAN");"")`]] });
  nilai.push({ range: `${qt}!L${ALOKASI.judul}`, values: [['📈 PER HARI: OMZET & BIAYA (gaji, hotel, biaya lain dibagi rata; bahan baku menurut porsi omzet)', '', '', '', '', '', '', '']] });
  nilai.push({ range: `${qt}!L${ALOKASI.kolom}`, values: [KOLOM_ALOKASI] });
  nilai.push({ range: `${qt}!L${ALOKASI.data}`, values: [[`=IFERROR(FILTER(${DATA}!D2:K;${DATA}!A2:A=$C$2;${DATA}!B2:B="ALOKASI");"")`]] });
  const gratis = BAGIAN.find((b) => b.kode === 'GRATIS');
  nilai.push({ range: `${qt}!E${gratis.mulai}`, values: [[`=IFERROR(FILTER(${DATA}!D2:D;${DATA}!A2:A=$C$2;${DATA}!B2:B="GRATIS_INFO");"")`]] });
  // Area kanan di bawah tabel komposisi dikosongkan dulu (letak tabel harian bisa berpindah antar versi).
  await api.spreadsheets.values.clear({ spreadsheetId, range: `${qt}!L${KOMPOSISI.akhir + 1}:T160` });
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
  // Kolom E dipakai untuk keterangan rincian biaya: dibuat lebih lebar, teks turun baris di dalam sel.
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 260 }, fields: 'pixelSize' } });
  req.push({ unmergeCells: { range: sel(4, 160, 1, 20) } });
  req.push({ repeatCell: { range: sel(KOMPOSISI.judul, 160, 11, 20), cell: { userEnteredFormat: {} }, fields: 'userEnteredFormat' } });
  // Tema dikembalikan ke warna bawaan Google (versi sebelumnya sempat mengubahnya; tema khusus
  // membuat file tidak bisa dibuka di aplikasi Google Sheets versi lama).
  const tema = meta.data.properties?.spreadsheetTheme;
  if (tema?.themeColors) {
    const aksen = Object.fromEntries(KELOMPOK_GRAFIK.slice(0, 6).map((k, i) => [`ACCENT${i + 1}`, warna(k.warna)]));
    const beda = tema.themeColors.some((t) => aksen[t.colorType] && Math.abs((t.color?.rgbColor?.red || 0) - aksen[t.colorType].red) > 0.01);
    if (beda) {
      req.push({
        updateSpreadsheetProperties: {
          properties: { spreadsheetTheme: { ...tema, themeColors: tema.themeColors.map((t) => (aksen[t.colorType] ? { colorType: t.colorType, color: { rgbColor: aksen[t.colorType] } } : t)) } },
          fields: 'spreadsheetTheme',
        },
      });
    }
  }

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
      verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP',
    }, 'backgroundColorStyle,textFormat,verticalAlignment,wrapStrategy');
    // Judul bagian digabung selebar tabel supaya tulisannya tidak keluar dari tabel.
    // Porsi gratis: kolom E.. berisi info budget, jadi judul hanya B:D.
    if (b.kode === 'GRATIS') {
      req.push({ mergeCells: { range: sel(b.mulai, b.mulai, 1, 4), mergeType: 'MERGE_ALL' } });
      req.push({ mergeCells: { range: sel(b.mulai, b.mulai, 4, lebar), mergeType: 'MERGE_ALL' } });
    } else {
      req.push({ mergeCells: { range: sel(b.mulai, b.mulai, 1, lebar), mergeType: 'MERGE_ALL' } });
    }
    req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: b.mulai - 1, endIndex: b.mulai }, properties: { pixelSize: 30 }, fields: 'pixelSize' } });
    if (!b.tanpaJudulKolom) {
      format(sel(b.mulai + 1, b.mulai + 1, 1, lebar), {
        backgroundColorStyle: { rgbColor: warna(b.warna, 0.82) },
        textFormat: { bold: true }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP',
      }, 'backgroundColorStyle,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy');
    }
    const r1 = barisData(b);
    const r2 = r1 + BATAS_BARIS[b.kode] - 1;
    format(sel(r1, r2, 1, lebar), { backgroundColorStyle: { rgbColor: warna(b.warna, 0.95) }, verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' }, 'backgroundColorStyle,verticalAlignment,wrapStrategy');
    req.push({ updateBorders: { range: sel(b.mulai, r2, 1, lebar), ...GARIS } });
    for (const i of b.rupiah || []) format(sel(r1, r2, 1 + i, 2 + i), { numberFormat: RP, horizontalAlignment: 'RIGHT' }, 'numberFormat,horizontalAlignment');
    for (const i of b.angka || []) format(sel(r1, r2, 1 + i, 2 + i), { numberFormat: ANGKA, horizontalAlignment: 'RIGHT' }, 'numberFormat,horizontalAlignment');
  }

  // Ringkasan: baris LABA / RUGI tebal besar; hijau kalau untung, merah kalau rugi.
  const ring = BAGIAN[0];
  const barisLaba = barisData(ring) + 7; // baris "LABA BERSIH"
  format(sel(barisData(ring), barisData(ring) + 9, 1, 3), { textFormat: { bold: false, fontSize: 10 } }, 'textFormat');
  for (const i of [2, 5]) format(sel(barisData(ring) + i, barisData(ring) + i, 1, 3), { textFormat: { bold: true } }, 'textFormat'); // omzet bersih, laba sebelum fee
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
  // Baris TOTAL di bawah tiap tabel: tebal dengan latar abu muda.
  req.push({
    addConditionalFormatRule: {
      index: 0,
      rule: {
        ranges: [sel(5, 150, 1, 11)],
        booleanRule: {
          condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: '=OR($B5="TOTAL";$C5="TOTAL")' }] },
          format: { textFormat: { bold: true }, backgroundColorStyle: { rgbColor: warna('#BDC1C6', 0.55) } },
        },
      },
    },
  });

  // Tabel komposisi & tabel harian di kanan: lebar kolom, warna per kategori, garis hitam.
  const putih = { red: 1, green: 1, blue: 1 };
  const lebarKolom = (i, px) => req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } });
  [[10, 24], [11, 200], [12, 140], [13, 110], [14, 180], [15, 24]].forEach(([i, px]) => lebarKolom(i, px));
  const K = KOMPOSISI;
  req.push({ mergeCells: { range: sel(K.judul, K.judul, 11, 15), mergeType: 'MERGE_ALL' } });
  format(sel(K.judul, K.judul, 11, 15), { textFormat: { bold: true, fontSize: 12, foregroundColorStyle: { rgbColor: putih } }, backgroundColorStyle: { rgbColor: warna('#202124') }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' }, 'textFormat,backgroundColorStyle,horizontalAlignment,verticalAlignment');
  format(sel(K.kolom, K.kolom, 11, 15), { textFormat: { bold: true }, backgroundColorStyle: { rgbColor: warna('#ECEFF1') }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' }, 'textFormat,backgroundColorStyle,horizontalAlignment,verticalAlignment');
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: K.judul - 1, endIndex: K.kolom }, properties: { pixelSize: 32 }, fields: 'pixelSize' } });
  req.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: K.data - 1, endIndex: K.akhir }, properties: { pixelSize: 28 }, fields: 'pixelSize' } });
  // Sel nama: latar warna kategori (tulisan putih, atau hitam kalau warnanya terang seperti kuning).
  // Nilai & persen: tulisan hitam di latar muda; batang perbandingan memakai warna kategori.
  const gelap = warna('#202124');
  const terang = (hex) => { const c = warna(hex); return 0.299 * c.red + 0.587 * c.green + 0.114 * c.blue > 0.62; };
  const barisWarna = (r, hex) => {
    format(sel(r, r, 11, 12), { textFormat: { bold: true, foregroundColorStyle: { rgbColor: terang(hex) ? gelap : putih } }, backgroundColorStyle: { rgbColor: warna(hex) }, verticalAlignment: 'MIDDLE' }, 'textFormat,backgroundColorStyle,verticalAlignment');
    format(sel(r, r, 12, 14), { textFormat: { bold: true, foregroundColorStyle: { rgbColor: gelap } }, backgroundColorStyle: { rgbColor: warna(hex, 0.88) }, verticalAlignment: 'MIDDLE' }, 'textFormat,backgroundColorStyle,verticalAlignment');
    format(sel(r, r, 14, 15), { textFormat: { foregroundColorStyle: { rgbColor: warna(hex) } }, backgroundColorStyle: { rgbColor: warna(hex, 0.88) }, verticalAlignment: 'MIDDLE' }, 'textFormat.foregroundColorStyle,backgroundColorStyle,verticalAlignment');
  };
  barisWarna(K.data, WARNA_NETRAL);
  KELOMPOK_GRAFIK.forEach((k, i) => barisWarna(K.data + 1 + i, warnaKelompok(k)));
  barisWarna(K.akhir, WARNA_NETRAL);
  format(sel(K.data, K.akhir, 12, 13), { numberFormat: RP, horizontalAlignment: 'RIGHT' }, 'numberFormat,horizontalAlignment');
  format(sel(K.data, K.akhir, 13, 14), { numberFormat: { type: 'PERCENT', pattern: '0.0%' }, horizontalAlignment: 'CENTER' }, 'numberFormat,horizontalAlignment');
  format(sel(K.data, K.akhir, 14, 15), { textFormat: { fontSize: 9 }, horizontalAlignment: 'LEFT', wrapStrategy: 'CLIP' }, 'textFormat.fontSize,horizontalAlignment,wrapStrategy');
  req.push({ updateBorders: { range: sel(K.judul, K.akhir, 11, 15), ...GARIS } });

  req.push({ mergeCells: { range: sel(HARIAN.judul, HARIAN.judul, 11, 15), mergeType: 'MERGE_ALL' } });
  format(sel(HARIAN.judul, HARIAN.judul, 11, 15), { textFormat: { bold: true, foregroundColorStyle: { rgbColor: putih } }, backgroundColorStyle: { rgbColor: warna('#1A73E8') }, verticalAlignment: 'MIDDLE' }, 'textFormat,backgroundColorStyle,verticalAlignment');
  format(sel(HARIAN.kolom, HARIAN.kolom, 11, 15), { textFormat: { bold: true }, backgroundColorStyle: { rgbColor: warna('#1A73E8', 0.82) }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' }, 'textFormat,backgroundColorStyle,horizontalAlignment,verticalAlignment,wrapStrategy');
  format(sel(HARIAN.data, HARIAN.akhir, 11, 15), { backgroundColorStyle: { rgbColor: warna('#1A73E8', 0.95) }, verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' }, 'backgroundColorStyle,verticalAlignment,wrapStrategy');
  format(sel(HARIAN.data, HARIAN.akhir, 12, 15), { numberFormat: RP, horizontalAlignment: 'RIGHT' }, 'numberFormat,horizontalAlignment');
  req.push({ updateBorders: { range: sel(HARIAN.judul, HARIAN.akhir, 11, 15), ...GARIS } });
  // Tabel alokasi harian (L:S).
  format(sel(ALOKASI.judul, ALOKASI.judul, 11, 19), { textFormat: { bold: true, foregroundColorStyle: { rgbColor: putih } }, backgroundColorStyle: { rgbColor: warna('#0B8043') }, verticalAlignment: 'MIDDLE' }, 'textFormat,backgroundColorStyle,verticalAlignment');
  format(sel(ALOKASI.kolom, ALOKASI.kolom, 11, 19), { textFormat: { bold: true }, backgroundColorStyle: { rgbColor: warna('#0B8043', 0.82) }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' }, 'textFormat,backgroundColorStyle,horizontalAlignment,verticalAlignment,wrapStrategy');
  format(sel(ALOKASI.data, ALOKASI.akhir, 11, 19), { backgroundColorStyle: { rgbColor: warna('#0B8043', 0.95) }, verticalAlignment: 'MIDDLE' }, 'backgroundColorStyle,verticalAlignment');
  format(sel(ALOKASI.data, ALOKASI.akhir, 12, 19), { numberFormat: RP, horizontalAlignment: 'RIGHT' }, 'numberFormat,horizontalAlignment');
  req.push({ updateBorders: { range: sel(ALOKASI.judul, ALOKASI.akhir, 11, 19), ...GARIS } });

  // Grafik dibuat ulang setiap tata letak diperbarui (rentang datanya bisa berubah).
  for (const c of main.charts || []) {
    if (JUDUL_GRAFIK.includes(c.spec?.title)) req.push({ deleteEmbeddedObject: { objectId: c.chartId } });
  }
  const sumberSel = (r1, r2, kol) => ({ sourceRange: { sources: [sel(r1, r2, kol, kol + 1)] } });
  const posisi = (baris, kolom, w, h) => ({ overlayPosition: { anchorCell: { sheetId, rowIndex: baris - 1, columnIndex: kolom }, widthPixels: w, heightPixels: h } });
  const judulGrafik = {};
  // Atas: omzet & pengeluaran per tanggal, selebar area kanan.
  req.push({
    addChart: {
      chart: {
        spec: {
          title: 'Omzet & Pengeluaran Harian',
          ...judulGrafik,
          basicChart: {
            chartType: 'COLUMN',
            legendPosition: 'TOP_LEGEND',
            headerCount: 1,
            axis: [{ position: 'BOTTOM_AXIS', title: 'Tanggal' }, { position: 'LEFT_AXIS', title: 'Rupiah' }],
            domains: [{ domain: sumberSel(HARIAN.kolom, HARIAN.akhir, 11) }],
            series: [
              { series: sumberSel(HARIAN.kolom, HARIAN.akhir, 12), targetAxis: 'LEFT_AXIS', colorStyle: { rgbColor: warna('#1A73E8') } },
              { series: sumberSel(HARIAN.kolom, HARIAN.akhir, 13), targetAxis: 'LEFT_AXIS', colorStyle: { rgbColor: warna('#D93025') } },
            ],
          },
        },
        position: posisi(4, 11, 1290, 380),
      },
    },
  });
  // Kanan tabel komposisi: pie porsi biaya (warna potongan = warna tema = warna kategori).
  req.push({
    addChart: {
      chart: {
        spec: {
          title: 'Porsi Biaya (% dari total biaya)',
          ...judulGrafik,
          pieChart: { legendPosition: 'LABELED_LEGEND', domain: sumberSel(K.data + 1, K.akhir - 1, 11), series: sumberSel(K.data + 1, K.akhir - 1, 12), pieHole: 0.5 },
        },
        position: posisi(K.judul, 16, 640, 470),
      },
    },
  });
  // Bawah tabel komposisi: batang omzet vs tiap kelompok biaya, warna sama dengan tabel.
  req.push({
    addChart: {
      chart: {
        spec: {
          title: 'Omzet vs Biaya',
          ...judulGrafik,
          basicChart: {
            chartType: 'BAR',
            legendPosition: 'NO_LEGEND',
            axis: [{ position: 'BOTTOM_AXIS', title: 'Rupiah' }],
            domains: [{ domain: sumberSel(K.data, K.akhir - 1, 11) }],
            series: [{
              series: sumberSel(K.data, K.akhir - 1, 12),
              targetAxis: 'BOTTOM_AXIS',
              colorStyle: { rgbColor: warna(WARNA_NETRAL) },
            }],
          },
        },
        position: posisi(K.akhir + 3, 11, 654, 420),
      },
    },
  });

  // Kanan grafik "Omzet vs Biaya": grafik garis per hari (omzet, potongan IO, bahan, gaji, hotel, biaya lain, laba).
  req.push({
    addChart: {
      chart: {
        spec: {
          title: 'Grafik Harian: Omzet, Bahan Baku, Gaji, Hotel & Laba',
          basicChart: {
            chartType: 'LINE',
            legendPosition: 'BOTTOM_LEGEND',
            headerCount: 1,
            axis: [{ position: 'BOTTOM_AXIS', title: 'Tanggal' }, { position: 'LEFT_AXIS', title: 'Rupiah per hari' }],
            domains: [{ domain: sumberSel(ALOKASI.kolom, ALOKASI.akhir, 11) }],
            series: WARNA_ALOKASI.map((hex, i) => ({ series: sumberSel(ALOKASI.kolom, ALOKASI.akhir, 12 + i), targetAxis: 'LEFT_AXIS', colorStyle: { rgbColor: warna(hex) }, lineStyle: { width: i === 0 || i === 6 ? 3 : 2 } })),
          },
        },
        position: posisi(K.akhir + 12, 16, 640, 420),
      },
    },
  });

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
