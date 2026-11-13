//
// Cheesy Pen Shells – Antrian pesanan & komplain pelanggan (Google Apps Script web app).
//
// Halaman (satu link web app, dibedakan parameter p):
// ?p=kasir                  -> halaman kasir (PIN): foto struk -> nomor antrian + QR pesanan,
// kolom Menunggu / Dibakar / Siap, foto pesanan saat dibakar, tombol Panggil.
// ?p=pesanan&t=TOKEN        -> halaman pelanggan (dari QR di layar kasir): foto struk, menu (dibaca dari
// struk), nomor antrian, nomor yang sedang dipanggil, status & foto saat dibakar,
// bunyi + getar saat dipanggil.
// ?p=komplain[&e=KODE]      -> form komplain pelanggan (QR di depan booth). Bot WhatsApp meneruskan ke owner.
//
// Data: Google Sheet pembukuan (Script Property SPREADSHEET_ID), tab "Antrian" & "Komplain".
// Foto: folder Drive "CPS ANTRIAN (foto struk & pesanan)", dibagikan "siapa saja yang punya link: lihat".
// PIN kasir: Script Property KASIR_PIN.
// Dipasang sekali oleh owner; tidak ada data rahasia di file ini.

var KOLOM_ANTRIAN = [
  ['id', 'ID'], ['token', 'Token'], ['kode_event', 'Kode Event'], ['tanggal', 'Tanggal'], ['nomor', 'No. Antrian'],
  ['status', 'Status'], ['menu', 'Menu (dari struk)'], ['foto_struk', 'Foto Struk'], ['foto_bakar', 'Foto Dibakar'],
  ['teks_struk', 'Teks Struk'], ['dibuat', 'Dibuat'], ['dibakar', 'Mulai Dibakar'], ['dipanggil', 'Dipanggil'],
  ['panggil_ke', 'Dipanggil Ke'], ['diambil', 'Diambil'],
];
var KOLOM_KOMPLAIN = [
  ['id', 'ID'], ['waktu', 'Waktu'], ['kode_event', 'Kode Event'], ['lokasi', 'Lokasi'], ['kategori', 'Kategori'],
  ['detail', 'Detail'], ['nama', 'Nama (opsional)'], ['kontak', 'Kontak (opsional)'], ['status', 'Status'],
  ['diteruskan', 'Diteruskan ke Owner'],
];
var KATEGORI_KOMPLAIN = [
  'Pelayanan tidak ramah', 'Oyster tidak fresh', 'Penyajian tidak sesuai', 'Orderan tidak sesuai',
  'Menunggu terlalu lama', 'Harga / pembayaran', 'Kebersihan', 'Lainnya',
];
var STATUS = { MENUNGGU: 'MENUNGGU', DIBAKAR: 'DIBAKAR', SIAP: 'SIAP', DIAMBIL: 'DIAMBIL', BATAL: 'BATAL' };

// ---------------------------------------------------------------- pemasangan

// Jalankan SEKALI dari editor (tombol ▶ Jalankan) setelah menempel kode ini lewat
// sheet pembukuan > Ekstensi > Apps Script. Menghubungkan sheet, membuat tab Antrian/Komplain & folder foto,
// sekaligus meminta izin akses Google.
function MULAI_PASANG() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  tab_('Antrian', KOLOM_ANTRIAN);
  tab_('Komplain', KOLOM_KOMPLAIN);
  folder_();
  var t = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
  Logger.log('✅ Siap. Sheet: ' + ss_().getName() + ' · PIN kasir: ' + (pinKasir_() ? 'ada' : 'BELUM (isi pin_kasir di tab Pengaturan)') + ' · ' + t);
  Logger.log('Lanjut: Terapkan > Deployment baru > Aplikasi web (Jalankan sebagai: Saya, Akses: Siapa saja).');
}

// Nilai tab Pengaturan (kolom A kunci, kolom B nilai), disimpan sementara 5 menit.
function atur_(kunci) {
  var c = CacheService.getScriptCache(), simpan = c.get('atur:' + kunci);
  if (simpan !== null) return simpan;
  var v = '';
  var sh = ss_().getSheetByName('Pengaturan');
  if (sh && sh.getLastRow() >= 2) {
    var nilai = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < nilai.length; i++) {
      if (String(nilai[i][0]).trim() === kunci) { v = String(nilai[i][1]).trim(); break; }
    }
  }
  c.put('atur:' + kunci, v, 300);
  return v;
}

// PIN kasir: Script Property / Konfig.gs, atau baris "pin_kasir" di tab Pengaturan (diisi bot / owner).
function pinKasir_() { return prop_('KASIR_PIN') || atur_('pin_kasir'); }

// ---------------------------------------------------------------- dasar

// Nilai dari Script Properties, atau dari file Konfig.gs (KONFIG_CPS = { SPREADSHEET_ID: '...', KASIR_PIN: '...' })
// yang dibuat saat pemasangan dan TIDAK disimpan di repo GitHub.
function prop_(k) {
  var v = PropertiesService.getScriptProperties().getProperty(k);
  if (v) return v;
  return (typeof KONFIG_CPS !== 'undefined' && KONFIG_CPS[k]) ? String(KONFIG_CPS[k]) : '';
}
function ss_() {
  var id = prop_('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  // Script dibuat dari menu Ekstensi > Apps Script di sheet pembukuan: pakai sheet itu dan ingat ID-nya.
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Sheet pembukuan belum terhubung. Jalankan MULAI_PASANG dari editor.');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

function sekarang_() { return Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss'); }
function hariIni_() { return Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd'); }
function tglStr_(v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM-dd') : String(v || '').slice(0, 10); }

// Tab dengan judul kolom (label). Tab & kolom yang belum ada dibuat.
function tab_(nama, kolom) {
  var ss = ss_();
  var sh = ss.getSheetByName(nama);
  if (!sh) {
    sh = ss.insertSheet(nama);
    sh.getRange(1, 1, 1, kolom.length).setValues([kolom.map(function (k) { return k[1]; })]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  var judul = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  kolom.forEach(function (k) {
    if (judul.indexOf(k[1]) < 0) { sh.getRange(1, judul.length + 1).setValue(k[1]).setFontWeight('bold'); judul.push(k[1]); }
  });
  var idx = {};
  kolom.forEach(function (k) { idx[k[0]] = judul.indexOf(k[1]); });
  return { sh: sh, idx: idx, lebar: judul.length };
}

function baca_(t) {
  var n = t.sh.getLastRow() - 1;
  if (n < 1) return [];
  var nilai = t.sh.getRange(2, 1, n, t.lebar).getValues();
  return nilai.map(function (r, i) {
    var o = { _baris: i + 2 };
    Object.keys(t.idx).forEach(function (k) { o[k] = r[t.idx[k]]; });
    return o;
  });
}

function tulisBaris_(t, o) {
  var r = new Array(t.lebar).fill('');
  Object.keys(o).forEach(function (k) { if (t.idx[k] >= 0) r[t.idx[k]] = o[k]; });
  t.sh.appendRow(r);
}

function ubah_(t, baris, o) {
  Object.keys(o).forEach(function (k) { if (t.idx[k] >= 0) t.sh.getRange(baris, t.idx[k] + 1).setValue(o[k]); });
}

function cekPin_(pin) {
  var benar = pinKasir_();
  if (!benar || String(pin) !== benar) throw new Error('PIN kasir salah');
}

function url_() { return ScriptApp.getService().getUrl(); }

function folder_() {
  var id = prop_('FOLDER_FOTO');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* dibuat ulang */ } }
  var f = DriveApp.createFolder('CPS ANTRIAN (foto struk & pesanan)');
  PropertiesService.getScriptProperties().setProperty('FOLDER_FOTO', f.getId());
  return f;
}

// dataUrl "data:image/jpeg;base64,..." -> file Drive publik (lihat). Mengembalikan id.
function simpanFoto_(dataUrl, nama) {
  var m = String(dataUrl).match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) throw new Error('Foto tidak terbaca');
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], nama + '.jpg');
  var file = folder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { id: file.getId(), blob: blob };
}

function linkFoto_(id) { return id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000' : ''; }

// OCR struk: unggah ke Drive sebagai Google Docs (Drive membaca teks gambar), ambil teks, buang dokumennya.
function ocr_(blob) {
  try {
    var batas = 'cpsbatas' + Date.now();
    var meta = { name: 'ocr-struk-' + Date.now(), mimeType: 'application/vnd.google-apps.document' };
    var kepala = Utilities.newBlob('--' + batas + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
      '\r\n--' + batas + '\r\nContent-Type: ' + blob.getContentType() + '\r\n\r\n').getBytes();
    var ekor = Utilities.newBlob('\r\n--' + batas + '--').getBytes();
    var res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&ocrLanguage=id', {
      method: 'post', contentType: 'multipart/related; boundary=' + batas, payload: kepala.concat(blob.getBytes()).concat(ekor),
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true,
    });
    var id = JSON.parse(res.getContentText()).id;
    if (!id) return '';
    var teks = DocumentApp.openById(id).getBody().getText();
    DriveApp.getFileById(id).setTrashed(true);
    return teks;
  } catch (e) {
    return '';
  }
}

// Daftar menu dari tab "Harga Menu" (Menu + Kata yang Dikenali Bot). Alias terpanjang dicocokkan dulu.
function daftarMenu_() {
  var sh = ss_().getSheetByName('Harga Menu');
  if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var iMenu = v[0].indexOf('Menu');
  var iAlias = v[0].indexOf('Kata yang Dikenali Bot');
  var hasil = [];
  v.slice(1).forEach(function (r) {
    var menu = String(r[iMenu] || '').trim();
    if (!menu) return;
    var alias = [menu].concat(String(iAlias >= 0 ? r[iAlias] : '').split(',')).map(function (a) { return a.trim().toLowerCase(); }).filter(String);
    alias.forEach(function (a) { hasil.push({ menu: menu, alias: a }); });
  });
  return hasil.sort(function (a, b) { return b.alias.length - a.alias.length; });
}

// Teks struk -> "2× Mozzarella\n1× Garlic". Kosong kalau tidak ada menu yang dikenali.
function bacaMenu_(teks) {
  var menu = daftarMenu_();
  var jumlah = {};
  String(teks || '').split(/\r?\n/).forEach(function (baris) {
    var b = ' ' + baris.toLowerCase() + ' ';
    if (/total|tunai|kembali|cash|pajak|ppn|diskon|subtotal|bayar|qris|kartu|debit/.test(b)) return;
    for (var i = 0; i < menu.length; i++) {
      var a = menu[i].alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp('(^|[^a-z])' + a + '([^a-z]|$)').test(b)) {
        var q = b.match(/(\d{1,2})\s*[x×]\s/) || b.match(/\s[x×]\s*(\d{1,2})\b/) || b.match(/^\s*(\d{1,2})\s+[a-z]/) || b.match(/\s(\d{1,2})\s*(pcs|porsi|pc)\b/);
        jumlah[menu[i].menu] = (jumlah[menu[i].menu] || 0) + (q ? Number(q[1]) : 1);
        break;
      }
    }
  });
  return Object.keys(jumlah).map(function (m) { return jumlah[m] + '× ' + m; }).join('\n');
}

// Event yang sedang berjalan (tanggal hari ini di antara mulai & selesai), lalu yang terdekat.
// Jadwal untuk website (tanpa data keuangan): semua event kecuali BATAL & event tes. Disimpan sementara 10 menit.
function jadwalPublik_() {
  var c = CacheService.getScriptCache(), simpan = c.get('jadwal');
  if (simpan) return JSON.parse(simpan);
  var sh = ss_().getSheetByName('Event');
  if (!sh) return [];
  var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var j = v[0];
  var i = function (label) { return j.indexOf(label); };
  var hasil = v.slice(1).map(function (r) {
    return { kode: String(r[i('Kode Event')] || ''), kota: String(r[i('Kota')] || ''), nama: String(r[i('Event Organizer (IO)')] || ''),
      mulai: tglStr_(r[i('Tanggal Mulai')]), selesai: tglStr_(r[i('Tanggal Selesai')]), status: String(r[i('Status')] || '') };
  }).filter(function (e) { return e.kode && e.mulai && e.status !== 'BATAL' && !/^TES/i.test(e.kode); })
    .map(function (e) { return { kota: e.kota, nama: e.nama, mulai: e.mulai, selesai: e.selesai }; })
    .sort(function (a, b) { return a.mulai.localeCompare(b.mulai); });
  c.put('jadwal', JSON.stringify(hasil), 600);
  return hasil;
}

function daftarEvent() {
  var sh = ss_().getSheetByName('Event');
  if (!sh) return [];
  var v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var j = v[0];
  var i = function (label) { return j.indexOf(label); };
  var hari = hariIni_();
  return v.slice(1).map(function (r) {
    return { kode: String(r[i('Kode Event')] || ''), kota: String(r[i('Kota')] || ''), io: String(r[i('Event Organizer (IO)')] || ''),
      mulai: tglStr_(r[i('Tanggal Mulai')]), selesai: tglStr_(r[i('Tanggal Selesai')]), status: String(r[i('Status')] || '') };
  }).filter(function (e) { return e.kode && e.status !== 'BATAL' && e.status !== 'SELESAI' && e.selesai >= hari; })
    .sort(function (a, b) {
      var aj = a.mulai <= hari ? 0 : 1; var bj = b.mulai <= hari ? 0 : 1;
      return aj - bj || a.mulai.localeCompare(b.mulai);
    });
}

// ---------------------------------------------------------------- antrian (kasir)

function ringkas_(o, denganToken) {
  return {
    id: o.id, token: denganToken ? o.token : undefined, nomor: Number(o.nomor), status: o.status, menu: String(o.menu || ''),
    fotoStruk: linkFoto_(o.foto_struk), fotoBakar: linkFoto_(o.foto_bakar), dibuat: String(o.dibuat || '').slice(11, 16),
    dipanggil: String(o.dipanggil || ''), panggilKe: Number(o.panggil_ke || 0), kodeEvent: o.kode_event,
    link: denganToken ? (atur_('url_pelanggan') ? atur_('url_pelanggan') + '?t=' : url_() + '?p=pesanan&t=') + o.token : undefined,
  };
}

function kasirMasuk(pin) { cekPin_(pin); return { ok: true, events: daftarEvent() }; }

function daftarAntrian(pin, kode) {
  cekPin_(pin);
  var t = tab_('Antrian', KOLOM_ANTRIAN);
  var hari = hariIni_();
  return baca_(t).filter(function (o) { return o.kode_event === kode && tglStr_(o.tanggal) === hari && o.status !== STATUS.DIAMBIL && o.status !== STATUS.BATAL; })
    .map(function (o) { return ringkas_(o, true); }).sort(function (a, b) { return a.nomor - b.nomor; });
}

function buatPesanan(pin, kode, dataUrl) {
  cekPin_(pin);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t = tab_('Antrian', KOLOM_ANTRIAN);
    var hari = hariIni_();
    var semua = baca_(t);
    var nomor = semua.filter(function (o) { return o.kode_event === kode && tglStr_(o.tanggal) === hari; })
      .reduce(function (m, o) { return Math.max(m, Number(o.nomor) || 0); }, 0) + 1;
    var id = 'Q' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyMMddHHmmss') + Math.floor(Math.random() * 90 + 10);
    var token = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    var foto = simpanFoto_(dataUrl, kode + '-' + hari + '-no' + nomor + '-struk');
    var o = { id: id, token: token, kode_event: kode, tanggal: hari, nomor: nomor, status: STATUS.MENUNGGU, menu: '',
      foto_struk: foto.id, foto_bakar: '', teks_struk: '', dibuat: sekarang_(), panggil_ke: 0 };
    tulisBaris_(t, o);
    lock.releaseLock();
    // OCR setelah nomor keluar (kasir tidak perlu menunggu nomor).
    var teks = ocr_(foto.blob);
    o.teks_struk = teks.slice(0, 2000);
    o.menu = bacaMenu_(teks);
    var baris = baca_(t).filter(function (x) { return x.id === id; })[0];
    if (baris) ubah_(t, baris._baris, { teks_struk: o.teks_struk, menu: o.menu });
    return ringkas_(o, true);
  } finally {
    try { lock.releaseLock(); } catch (e) { /* sudah dilepas */ }
  }
}

function ubahMenu(pin, id, menu) {
  cekPin_(pin);
  var t = tab_('Antrian', KOLOM_ANTRIAN);
  var o = baca_(t).filter(function (x) { return x.id === id; })[0];
  if (!o) throw new Error('Pesanan tidak ditemukan');
  ubah_(t, o._baris, { menu: String(menu || '').slice(0, 500) });
  return true;
}

// status: DIBAKAR (boleh dengan foto), SIAP (panggil / panggil ulang), DIAMBIL, BATAL
// Perpindahan status yang sah. Kasir bisa membuka halaman di beberapa HP sekaligus; tombol dari tampilan yang
// belum diperbarui (misalnya "Panggil ulang" setelah HP lain menandai "Sudah diambil") ditolak.
var STATUS_BOLEH = {
  MENUNGGU: ['DIBAKAR', 'SIAP', 'BATAL'], DIBAKAR: ['SIAP', 'BATAL'], SIAP: ['SIAP', 'DIAMBIL', 'BATAL'], DIAMBIL: [], BATAL: [],
};
var NAMA_STATUS = { MENUNGGU: 'menunggu', DIBAKAR: 'sedang dibakar', SIAP: 'dipanggil', DIAMBIL: 'sudah diambil', BATAL: 'dibatalkan' };

function ubahStatus(pin, id, status, dataUrl) {
  cekPin_(pin);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return ubahStatusTerkunci_(id, status, dataUrl); } finally { lock.releaseLock(); }
}

function ubahStatusTerkunci_(id, status, dataUrl) {
  var t = tab_('Antrian', KOLOM_ANTRIAN);
  var o = baca_(t).filter(function (x) { return x.id === id; })[0];
  if (!o) throw new Error('Pesanan tidak ditemukan');
  var boleh = STATUS_BOLEH[o.status];
  if (boleh && boleh.indexOf(status) < 0) {
    throw new Error('Pesanan #' + o.nomor + ' sudah diubah dari HP lain (sekarang: ' + (NAMA_STATUS[o.status] || o.status) + '). Tampilan diperbarui.');
  }
  var isi = { status: status };
  if (status === STATUS.DIBAKAR) {
    isi.dibakar = sekarang_();
    if (dataUrl) isi.foto_bakar = simpanFoto_(dataUrl, o.kode_event + '-no' + o.nomor + '-dibakar').id;
  }
  if (status === STATUS.SIAP) { isi.dipanggil = sekarang_(); isi.panggil_ke = Number(o.panggil_ke || 0) + 1; }
  if (status === STATUS.DIAMBIL) isi.diambil = sekarang_();
  ubah_(t, o._baris, isi);
  CacheService.getScriptCache().remove('status:' + o.kode_event);
  return true;
}

// ---------------------------------------------------------------- halaman pelanggan

function statusPesanan(token) {
  var t = tab_('Antrian', KOLOM_ANTRIAN);
  var semua = baca_(t);
  var o = semua.filter(function (x) { return x.token === token; })[0];
  if (!o) return { ada: false };
  var hari = tglStr_(o.tanggal);
  var hariItu = semua.filter(function (x) { return x.kode_event === o.kode_event && tglStr_(x.tanggal) === hari; });
  var dipanggil = hariItu.filter(function (x) { return x.status === STATUS.SIAP || x.status === STATUS.DIAMBIL; })
    .sort(function (a, b) { return String(b.dipanggil).localeCompare(String(a.dipanggil)); })[0];
  var didepan = hariItu.filter(function (x) { return (x.status === STATUS.MENUNGGU || x.status === STATUS.DIBAKAR) && Number(x.nomor) < Number(o.nomor); }).length;
  var ev = daftarEvent().filter(function (e) { return e.kode === o.kode_event; })[0];
  var r = ringkas_(o, false);
  r.ada = true;
  r.nomorDipanggil = dipanggil ? Number(dipanggil.nomor) : null;
  r.antrianDidepan = o.status === STATUS.MENUNGGU || o.status === STATUS.DIBAKAR ? didepan : 0;
  r.lokasi = ev ? ev.kota + (ev.io ? ' · ' + ev.io : '') : o.kode_event;
  r.komplain = url_() + '?p=komplain&e=' + encodeURIComponent(o.kode_event);
  return r;
}

// ---------------------------------------------------------------- komplain

function kirimKomplain(f) {
  var kategori = KATEGORI_KOMPLAIN.indexOf(f.kategori) >= 0 ? f.kategori : 'Lainnya';
  var detail = String(f.detail || '').trim().slice(0, 1500);
  if (detail.length < 3) throw new Error('Mohon tulis detail keluhannya');
  var evs = daftarEvent();
  var ev = evs.filter(function (e) { return e.kode === f.kode; })[0] || evs[0];
  var t = tab_('Komplain', KOLOM_KOMPLAIN);
  tulisBaris_(t, {
    id: 'C' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyMMddHHmmss'), waktu: sekarang_(), kode_event: ev ? ev.kode : String(f.kode || ''),
    lokasi: ev ? ev.kota + (ev.io ? ' – ' + ev.io : '') : '', kategori: kategori, detail: detail,
    nama: String(f.nama || '').slice(0, 80), kontak: String(f.kontak || '').slice(0, 40), status: 'BARU', diteruskan: '',
  });
  return true;
}

// ---------------------------------------------------------------- web

function doGet(e) {
  var p = (e && e.parameter && e.parameter.p) || 'komplain';
  var html;
  if (p === 'api') {
    // Status pesanan JSON untuk halaman pelanggan di luar Apps Script (GitHub Pages, supaya HP bisa bergetar).
    var hasil = statusPesanan(String(e.parameter.t || '').replace(/[^a-z0-9]/gi, ''));
    return ContentService.createTextOutput(JSON.stringify(hasil)).setMimeType(ContentService.MimeType.JSON);
  }
  if (p === 'jadwal') {
    return ContentService.createTextOutput(JSON.stringify(jadwalPublik_())).setMimeType(ContentService.MimeType.JSON);
  }
  if (p === 'kasir') html = HTML_KASIR.replace('__K__', String(e.parameter.k || '').replace(/[^0-9A-Za-z]/g, '')).replace('__E__', String(e.parameter.e || '').replace(/[^A-Za-z0-9-]/g, ''));
  else if (p === 'pesanan') html = HTML_PESANAN.replace('__TOKEN__', String(e.parameter.t || '').replace(/[^a-z0-9]/gi, ''));
  else html = HTML_KOMPLAIN.replace('__KODE__', String((e && e.parameter && e.parameter.e) || '').replace(/[^A-Za-z0-9-]/g, ''))
    .replace('__KATEGORI__', JSON.stringify(KATEGORI_KOMPLAIN));
  return HtmlService.createHtmlOutput((GAYA + html).replace(/__ASET__/g, ASET))
    .setTitle('Cheesy Pen Shells')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}

// Dijalankan sekali saat pemasangan (dari editor atau API): simpan ID sheet & PIN, buat tab & folder.
function pasang(spreadsheetId, pin) {
  var p = PropertiesService.getScriptProperties();
  if (spreadsheetId) p.setProperty('SPREADSHEET_ID', spreadsheetId);
  if (pin) p.setProperty('KASIR_PIN', String(pin));
  tab_('Antrian', KOLOM_ANTRIAN);
  tab_('Komplain', KOLOM_KOMPLAIN);
  folder_();
  return 'ok';
}

// ---------------------------------------------------------------- tampilan

// ==== TAMPILAN (dibuat otomatis oleh scripts/bangun-apps-script.mjs dari apps-script/klien/, jangan diedit di sini) ====
var ASET = "https://raw.githubusercontent.com/cheesypenshells/Claud/claude/cheesy-pen-shells-management-nq92xx/docs/img/";
var GAYA =
  "<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Caveat:wght@700&family=Nunito:wght@400;700;800&display=swap\">\n" +
  "<style>\n" +
  ":root{--navy:#22348C;--navy-tua:#16226A;--kuning:#F6B800;--kuning-muda:#FFF1BF;--kertas:#F7F6F1;--putih:#FFFFFF;--teks:#1A2050;--redup:#5F6690;--garis:#DCDDEA;--hijau:#0B8043;--merah:#D93025;--abu:#8A8FA8; --judul:\"Barlow Condensed\",\"Arial Narrow\",Impact,sans-serif;--isi:\"Nunito\",system-ui,-apple-system,\"Segoe UI\",Roboto,sans-serif;--skrip:\"Caveat\",\"Comic Sans MS\",cursive;--kuas:url(\"data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 400 60%27 preserveAspectRatio=%27none%27%3E%3Cpath fill=%27%23F6B800%27 d=%27M8 16C62 5 140 11 212 6 C282 2 350 9 394 12 L386 21 L398 29 L384 40 C330 52 252 47 182 54 C120 59 62 52 10 49 L19 39 L2 31 L15 23Z%27/%3E%3Cpath fill=%27%23F6B800%27 opacity=%27.55%27 d=%27M30 8 L120 4 L118 7 L32 11Z M250 52 L360 48 L358 51 L252 55Z%27/%3E%3C/svg%3E\")}\n" +
  "*{box-sizing:border-box}\n" +
  "html{-webkit-text-size-adjust:100%}\n" +
  "body{margin:0;font-family:var(--isi);font-size:16px;line-height:1.5;color:var(--teks);background:var(--kertas) url(\"data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27260%27 height=%27150%27%3E%3Cg fill=%27%2322348C%27 fill-opacity=%27.075%27 font-family=%27Arial,sans-serif%27 font-weight=%27900%27 font-size=%2712%27 transform=%27rotate%28-8 130 75%29%27%3E%3Ctext x=%270%27 y=%2720%27%3ECHEESY PEN SHELLS %C2%B7 oyster bakar %C2%B7%3C/text%3E%3Ctext x=%27-60%27 y=%2752%27%3Echeesy pen shells %C2%B7 CHEESY PEN SHELLS%3C/text%3E%3Ctext x=%2710%27 y=%2784%27%3Eoyster %C2%B7 CHEESY PEN SHELLS %C2%B7 bakar%3C/text%3E%3Ctext x=%27-40%27 y=%27116%27%3ECHEESY PEN SHELLS %C2%B7 cheesy pen shells%3C/text%3E%3Ctext x=%270%27 y=%27148%27%3Ebakar %C2%B7 CHEESY PEN SHELLS %C2%B7 oyster %C2%B7%3C/text%3E%3C/g%3E%3C/svg%3E\") repeat}\n" +
  "a{color:var(--navy);font-weight:700}\n" +
  "header,.kepala{background:var(--navy);color:var(--putih);padding:10px max(16px,env(safe-area-inset-right,0px)) 14px max(16px,env(safe-area-inset-left,0px));display:flex;align-items:center;gap:12px;position:relative;font-weight:800}\n" +
  "header::after,.kepala::after{content:\"\";position:absolute;left:0;right:0;bottom:-7px;height:12px;background:var(--kuas) center/100% 100% no-repeat}\n" +
  "header img,.kepala img{width:52px;height:52px;object-fit:contain;flex:none}\n" +
  ".merek{display:flex;flex-direction:column;line-height:1.05;min-width:0}\n" +
  ".merek b{font-family:var(--judul);font-weight:800;font-size:24px;letter-spacing:.04em}\n" +
  ".merek small{font-family:var(--skrip);font-size:19px;color:var(--kuning);font-weight:700}\n" +
  "header .kanan{margin-left:auto;font-family:var(--judul);font-size:20px;color:var(--kuning)}\n" +
  "main{padding:22px max(16px,env(safe-area-inset-right,0px)) 28px max(16px,env(safe-area-inset-left,0px));max-width:1100px;margin:0 auto}\n" +
  ".kartu{background:var(--putih);border-radius:18px;padding:18px;margin-bottom:16px;border:2px solid var(--garis);box-shadow:0 3px 0 var(--garis)}\n" +
  "h2,h3{font-family:var(--judul);font-weight:800;letter-spacing:.02em;text-transform:uppercase;color:var(--navy);margin:0 0 10px}\n" +
  "h3{font-size:22px}\n" +
  ".judul{font-size:26px;line-height:1.1;margin:0 0 12px}\n" +
  ".judul span{display:inline-block;padding:4px 18px 6px;background:var(--kuas) center/100% 100% no-repeat}\n" +
  ".skrip{font-family:var(--skrip);font-size:24px;color:var(--navy);margin:-6px 0 10px;font-weight:700}\n" +
  "button,.tombol{border:0;border-radius:14px;padding:15px 16px;font:800 17px var(--isi);cursor:pointer;background:var(--navy);color:var(--putih);width:100%;box-shadow:0 4px 0 var(--navy-tua);display:block}\n" +
  "button:active,.tombol:active{transform:translateY(2px);box-shadow:0 2px 0 var(--navy-tua)}\n" +
  "button:focus-visible,.tombol:focus-within,a:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid var(--kuning);outline-offset:2px}\n" +
  "button.kecil{padding:10px 12px;font-size:14px;width:auto;box-shadow:0 3px 0 rgba(0,0,0,.18)}\n" +
  "button.hijau{background:var(--hijau)}button.biru{background:var(--navy)}button.abu{background:var(--abu)}button.merah{background:var(--merah)}\n" +
  "button.kuning,.tombol.kuning{background:var(--kuning);color:var(--navy-tua);box-shadow:0 4px 0 #C99700}\n" +
  "input,select,textarea{width:100%;padding:13px;border:2px solid var(--garis);border-radius:12px;font:16px var(--isi);color:var(--teks);background:var(--putih)}\n" +
  "label{font-weight:800;display:block;margin:12px 0 6px}\n" +
  ".nomor{font-family:var(--judul);font-size:96px;font-weight:800;color:var(--navy);text-align:center;line-height:.95}\n" +
  ".redup{color:var(--redup);font-size:14px}\n" +
  ".lencana{display:inline-block;padding:6px 14px;border-radius:999px;font-weight:800;color:var(--putih);font-size:15px}\n" +
  ".MENUNGGU{background:var(--abu)}.DIBAKAR{background:#E8710A}.SIAP{background:var(--hijau)}.DIAMBIL{background:var(--navy)}.BATAL{background:var(--merah)}\n" +
  "img.foto{width:100%;border-radius:14px;display:block;background:#E9E9F2}\n" +
  ".kolom{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}@media(max-width:800px){.kolom{grid-template-columns:1fr}}\n" +
  ".kolom h3{display:inline-block;padding:2px 16px 4px;background:var(--kuas) center/100% 100% no-repeat}\n" +
  ".pesanan{background:var(--putih);border-radius:14px;padding:12px;margin-bottom:10px;border:2px solid var(--garis);border-left:8px solid var(--abu)}.pesanan.DIBAKAR{border-left-color:#E8710A}.pesanan.SIAP{border-left-color:var(--hijau)}\n" +
  ".pesanan .no{font-family:var(--judul);font-size:36px;font-weight:800;color:var(--navy);line-height:1}.pesanan img{width:86px;height:86px;object-fit:cover;border-radius:10px;float:right;margin-left:8px}\n" +
  ".aksi{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;clear:both}\n" +
  ".modal{position:fixed;inset:0;background:rgba(22,34,106,.7);display:flex;align-items:center;justify-content:center;padding:16px;z-index:9}\n" +
  ".modal .kartu{max-width:440px;width:100%;max-height:92vh;overflow:auto}\n" +
  ".pilihan label{font-weight:600;display:flex;gap:10px;align-items:center;background:var(--putih);border:2px solid var(--garis);border-radius:12px;padding:12px;margin:6px 0}\n" +
  ".pilihan label:has(input:checked){border-color:var(--navy);background:var(--kuning-muda)}\n" +
  ".pilihan input{width:auto;accent-color:var(--navy)}\n" +
  "/* tiket antrian pelanggan */ .tiket{background:var(--putih);border-radius:22px;padding:18px 18px 16px;margin-bottom:16px;text-align:center;border:3px solid var(--navy);box-shadow:0 6px 0 var(--navy);position:relative}\n" +
  ".tiket::before,.tiket::after{content:\"\";position:absolute;top:56%;width:22px;height:22px;border-radius:50%;background:var(--kertas);border:3px solid var(--navy)}\n" +
  ".tiket::before{left:-13px;border-left-color:transparent;border-bottom-color:transparent;transform:rotate(45deg)}.tiket::after{right:-13px;border-right-color:transparent;border-top-color:transparent;transform:rotate(45deg)}\n" +
  ".uap{display:flex;justify-content:center;color:var(--navy);margin-bottom:-4px}.uap svg{width:84px;height:36px}\n" +
  ".tiket .label{font-family:var(--skrip);font-size:24px;font-weight:700;color:var(--redup)}\n" +
  ".tiket .nomor{font-size:120px}\n" +
  ".langkah{list-style:none;display:flex;gap:6px;padding:0;margin:16px 0 14px;counter-reset:l}\n" +
  ".langkah li{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:13px;font-weight:700;color:var(--abu);position:relative}\n" +
  ".langkah li span{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-size:21px;background:#EEEFF5;border:2px dashed var(--garis)}\n" +
  ".langkah li.lewat span{background:var(--kuning-muda);border:2px solid var(--kuning)}.langkah li.lewat{color:var(--navy)}\n" +
  ".langkah li.kini span{background:var(--kuning);border:2px solid var(--navy);animation:denyut 1.6s ease-in-out infinite}.langkah li.kini{color:var(--navy)}\n" +
  "@keyframes denyut{50%{transform:scale(1.1)}}\n" +
  ".info{display:grid;grid-template-columns:1fr 1fr;border-top:2px dashed var(--garis);margin-top:4px}\n" +
  ".info div{padding:10px 4px 2px;display:flex;flex-direction:column}.info div+div{border-left:2px dashed var(--garis)}\n" +
  ".info small{color:var(--redup);font-weight:700}.info b{font-family:var(--judul);font-size:34px;color:var(--navy);line-height:1.1}\n" +
  ".lokasi{margin-top:8px;color:var(--redup);font-size:14px;font-weight:700}\n" +
  ".menu-pesanan{white-space:pre-line;font-size:19px;font-weight:800;color:var(--navy)}\n" +
  "details{margin-top:12px}summary{cursor:pointer;font-weight:800;color:var(--navy)}details img{margin-top:10px}\n" +
  ".ajak{background:var(--kuning);border-radius:18px;padding:14px;margin-bottom:16px;box-shadow:0 4px 0 #C99700;text-align:center}\n" +
  ".ajak button{background:var(--navy)}.ajak p{margin:10px 0 0;font-weight:700;color:var(--navy-tua);font-size:14px}\n" +
  ".ajak.aktif{background:var(--kuning-muda);box-shadow:none;border:2px solid var(--kuning)}\n" +
  ".geser{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 2px 12px;margin:0 -2px}\n" +
  ".geser figure{flex:0 0 74%;max-width:300px;margin:0;scroll-snap-align:start;background:var(--putih);border-radius:16px;overflow:hidden;border:2px solid var(--garis)}\n" +
  ".geser img{width:100%;aspect-ratio:1/1.1;object-fit:cover;display:block}\n" +
  ".geser figcaption{padding:8px 12px;font-weight:800;color:var(--navy);display:flex;justify-content:space-between;gap:8px}\n" +
  ".geser figcaption em{font-style:normal;background:var(--kuning);border-radius:999px;padding:0 10px;color:var(--navy-tua)}\n" +
  ".poster{width:100%;border-radius:18px;display:block;margin-top:6px;border:3px solid var(--navy)}\n" +
  ".kaki{text-align:center;padding:18px 0 4px;display:flex;flex-direction:column;gap:6px;font-size:14px;color:var(--redup)}\n" +
  ".kaki .tagar{font-family:var(--skrip);font-size:22px;color:var(--navy);font-weight:700}\n" +
  ".siap-besar{position:fixed;inset:0;background:var(--kuning);color:var(--navy-tua);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;z-index:10;gap:6px}\n" +
  ".siap-besar .judul-siap{font-family:var(--judul);font-weight:800;font-size:40px;line-height:1;text-transform:uppercase}\n" +
  ".siap-besar .nomor{font-size:150px;color:var(--navy)}.siap-besar .uap svg{width:120px;height:52px}\n" +
  ".siap-besar p{font-weight:800;font-size:19px;margin:0}.siap-besar small{opacity:.75;font-weight:700}\n" +
  "@media (prefers-reduced-motion:reduce){.langkah li.kini span{animation:none}}.ig{display:flex;align-items:center;gap:14px;background:var(--navy);color:var(--putih);border-radius:18px;padding:16px;margin-bottom:16px;text-decoration:none;box-shadow:0 4px 0 var(--navy-tua)}\n" +
  ".ig svg{width:46px;height:46px;flex:none;color:var(--kuning)}\n" +
  ".ig span{display:flex;flex-direction:column;line-height:1.25;min-width:0}\n" +
  ".ig small{font-weight:700;opacity:.85}\n" +
  ".ig b{font-family:var(--judul);font-size:26px;letter-spacing:.02em}\n" +
  ".ig em{margin-left:auto;flex:none;font-style:normal;background:var(--kuning);color:var(--navy-tua);border-radius:999px;padding:8px 14px;font-weight:800;font-size:14px}\n" +
  ".ig:active{transform:translateY(2px)}.cara{list-style:none;padding:0;margin:14px 0 0;display:grid;gap:10px;counter-reset:c}\n" +
  ".cara li{counter-increment:c;display:grid;grid-template-columns:36px minmax(0,1fr);gap:10px;align-items:start}\n" +
  ".cara li::before{content:counter(c);width:36px;height:36px;border-radius:50%;background:var(--kuning);color:var(--navy-tua);font:800 20px var(--judul);display:grid;place-items:center}\n" +
  ".cara b{color:var(--navy)}\n" +
  ".tepok .poster{border-width:2px}\n" +
  "</style>";
var HTML_KASIR =
  "<header><img src=\"__ASET__logo-putih.png\" alt=\"Cheesy Pen Shells\"><div class=\"merek\"><b>KASIR ANTRIAN</b><small>Cheesy Pen Shells</small></div><span id=\"ev\" class=\"kanan\"></span></header><main><div id=\"masuk\" class=\"kartu\"><label>PIN kasir</label><input id=\"pin\" type=\"password\" inputmode=\"numeric\"><br><br><button onclick=\"masuk()\">Masuk</button><p id=\"salah\" style=\"color:var(--merah)\"></p></div><div id=\"isi\" style=\"display:none\"><div class=\"kartu\"><label>Event</label><select id=\"event\" onchange=\"muat()\"></select><br><br><label class=\"tombol kuning\" style=\"text-align:center\">📷 Pesanan baru – foto struk<input id=\"struk\" type=\"file\" accept=\"image/*\" capture=\"environment\" style=\"display:none\" onchange=\"pesananBaru(this)\"></label><p id=\"proses\" class=\"redup\"></p><p id=\"sinkron\" class=\"redup\" style=\"margin:0\"></p></div><div class=\"kolom\"><div><h3>⏳ Menunggu</h3><div id=\"k-MENUNGGU\"></div></div><div><h3>🔥 Dibakar</h3><div id=\"k-DIBAKAR\"></div></div><div><h3>✅ Siap / dipanggil</h3><div id=\"k-SIAP\"></div></div></div></div></main><div id=\"modal\"></div><input id=\"fotoBakar\" type=\"file\" accept=\"image/*\" capture=\"environment\" style=\"display:none\"><script src=\"https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js\"></script>\n" +
  "<script>\n" +
  "var KUNCI=\"__K__\",EVLINK=\"__E__\";var PIN=KUNCI||localStorage.getItem(\"cps_pin\")||\"\";var data=[];if(EVLINK)localStorage.setItem(\"cps_ev\",EVLINK);\n" +
  "function el(i){return document.getElementById(i)}function kecilkan(file,cb){var r=new FileReader();r.onload=function(){var g=new Image();g.onload=function(){var m=1280,s=Math.min(1,m/Math.max(g.width,g.height));var c=document.createElement(\"canvas\");c.width=g.width*s;c.height=g.height*s;c.getContext(\"2d\").drawImage(g,0,0,c.width,c.height);cb(c.toDataURL(\"image/jpeg\",0.72))};g.src=r.result};r.readAsDataURL(file)}function masuk(){var p=el(\"pin\").value||PIN;google.script.run.withSuccessHandler(function(r){PIN=p;localStorage.setItem(\"cps_pin\",p);el(\"masuk\").style.display=\"none\";el(\"isi\").style.display=\"\";var s=el(\"event\");s.innerHTML=r.events.map(function(e){return \"<option value=\\\"\"+e.kode+\"\\\">\"+e.kode+\" – \"+e.kota+\"</option>\"}).join(\"\");var ingat=localStorage.getItem(\"cps_ev\");if(ingat)s.value=ingat;muat();setInterval(muat,4000)}).withFailureHandler(function(e){el(\"salah\").textContent=e.message;localStorage.removeItem(\"cps_pin\")}).kasirMasuk(p)}function kode(){var k=el(\"event\").value;localStorage.setItem(\"cps_ev\",k);el(\"ev\").textContent=k;return k}function muat(){google.script.run.withSuccessHandler(tampil).daftarAntrian(PIN,kode())}function aman(s){return String(s||\"\").replace(/[&<>\"]/g,function(c){return {\"&\":\"&amp;\",\"<\":\"&lt;\",\">\":\"&gt;\",\"\\\"\":\"&quot;\"}[c]})}function tampil(d){data=d;var j=new Date();el(\"sinkron\").textContent=\"🔄 Tersinkron \"+(\"0\"+j.getHours()).slice(-2)+\":\"+(\"0\"+j.getMinutes()).slice(-2)+\":\"+(\"0\"+j.getSeconds()).slice(-2)+\" · boleh dibuka di beberapa HP sekaligus\";[\"MENUNGGU\",\"DIBAKAR\",\"SIAP\"].forEach(function(st){el(\"k-\"+st).innerHTML=d.filter(function(o){return o.status===st}).map(kartu).join(\"\")||\"<p class=redup>–</p>\"})}function kartu(o){var a=\"\";if(o.status===\"MENUNGGU\")a=\"<button class=\\\"kecil\\\" onclick=\\\"bakar('\"+o.id+\"')\\\">📷 Foto & mulai bakar</button><button class=\\\"kecil abu\\\" onclick=\\\"status('\"+o.id+\"','DIBAKAR')\\\">Bakar tanpa foto</button>\";if(o.status===\"DIBAKAR\")a=\"<button class=\\\"kecil hijau\\\" onclick=\\\"status('\"+o.id+\"','SIAP')\\\">🔔 Panggil</button>\";if(o.status===\"SIAP\")a=\"<button class=\\\"kecil biru\\\" onclick=\\\"status('\"+o.id+\"','SIAP')\\\">🔔 Panggil ulang (\"+o.panggilKe+\"x)</button><button class=\\\"kecil hijau\\\" onclick=\\\"status('\"+o.id+\"','DIAMBIL')\\\">✓ Sudah diambil</button>\";return \"<div class=\\\"pesanan \"+o.status+\"\\\"><img src=\\\"\"+(o.fotoBakar||o.fotoStruk)+\"\\\" onclick=\\\"lihat('\"+o.id+\"')\\\"><div class=no>#\"+o.nomor+\"</div><div class=redup>\"+o.dibuat+\"</div><div style=\\\"white-space:pre-line\\\">\"+(aman(o.menu)||\"<i class=redup>menu: lihat struk</i>\")+\"</div><div class=aksi>\"+a+\"<button class=\\\"kecil abu\\\" onclick=\\\"lihat('\"+o.id+\"')\\\">QR / detail</button></div></div>\"}function cari(id){return data.filter(function(o){return o.id===id})[0]}function pesananBaru(inp){var f=inp.files[0];inp.value=\"\";if(!f)return;el(\"proses\").textContent=\"Menyimpan struk & membuat nomor antrian...\";kecilkan(f,function(u){google.script.run.withSuccessHandler(function(o){el(\"proses\").textContent=\"\";data.push(o);lihat(o.id,o);muat()}).withFailureHandler(function(e){el(\"proses\").textContent=\"Gagal: \"+e.message}).buatPesanan(PIN,kode(),u)})}function lihat(id,o){o=o||cari(id);if(!o)return;el(\"modal\").innerHTML=\"<div class=modal onclick=\\\"if(event.target===this)tutup()\\\"><div class=kartu><div class=redup style=\\\"text-align:center\\\">Nomor antrian</div><div class=nomor>#\"+o.nomor+\"</div><p style=\\\"text-align:center\\\">Minta pelanggan <b>scan QR ini</b> untuk melihat pesanannya:</p><div id=qr style=\\\"display:flex;justify-content:center;margin:10px 0\\\"></div><label>Menu (dari struk, bisa diperbaiki)</label><textarea id=menuEdit rows=4>\"+aman(o.menu)+\"</textarea><br><br><button class=\\\"kecil hijau\\\" onclick=\\\"simpanMenu('\"+o.id+\"')\\\">Simpan menu</button> <button class=\\\"kecil merah\\\" onclick=\\\"if(confirm('Batalkan pesanan #\"+o.nomor+\"?'))status('\"+o.id+\"','BATAL')\\\">Batalkan</button><br><br><img class=foto src=\\\"\"+o.fotoStruk+\"\\\">\"+(o.fotoBakar?\"<br><img class=foto src=\\\"\"+o.fotoBakar+\"\\\">\":\"\")+\"<br><button onclick=\\\"tutup()\\\">Tutup</button></div></div>\";var q=qrcode(0,\"L\");q.addData(o.link);q.make();el(\"qr\").innerHTML=q.createSvgTag({cellSize:5,margin:4,scalable:true}).replace(\"<svg \",\"<svg style=\\\"width:min(86vw,380px);height:auto;background:#fff\\\" \")}function tutup(){el(\"modal\").innerHTML=\"\"}function simpanMenu(id){google.script.run.withSuccessHandler(function(){tutup();muat()}).ubahMenu(PIN,id,el(\"menuEdit\").value)}function status(id,st,foto){google.script.run.withSuccessHandler(function(){tutup();muat()}).withFailureHandler(function(e){tutup();el(\"proses\").textContent=\"⚠️ \"+e.message;setTimeout(function(){el(\"proses\").textContent=\"\"},6000);muat()}).ubahStatus(PIN,id,st,foto||\"\")}function bakar(id){var i=el(\"fotoBakar\");i.onchange=function(){var f=i.files[0];i.value=\"\";if(!f)return;el(\"proses\").textContent=\"Menyimpan foto pesanan...\";kecilkan(f,function(u){el(\"proses\").textContent=\"\";status(id,\"DIBAKAR\",u)})};i.click()}if(PIN){el(\"pin\").value=PIN;masuk()}\n" +
  "</script>";
// Halaman pelanggan: dipakai juga untuk GitHub Pages (docs/antrian, lihat scripts/halaman-pelanggan.mjs).
var BADAN_PESANAN =
  "<header class=\"kepala\"><img src=\"__ASET__logo-putih.png\" alt=\"Cheesy Pen Shells\"><div class=\"merek\"><b>CHEESY PEN SHELLS</b><small>oyster bakar favoritmu</small></div></header>\n" +
  "<main><div class=\"ajak\" id=\"bunyi\"><button onclick=\"aktifkan()\">🔔 Ketuk untuk aktifkan bunyi &amp; getar</button><p>Wajib diketuk sekali. Biarkan halaman ini terbuka: saat oyster kamu siap, HP berbunyi dan bergetar.</p></div><div id=\"isi\"><section class=\"tiket\"><div class=\"label\">Nomor antrian kamu</div><p class=\"redup\">Memuat pesanan...</p></section>\n" +
  "</div><section class=\"kartu\"><h2 class=\"judul\"><span>Sambil nunggu</span></h2><p class=\"skrip\">Intip menu andalan kami!</p><div class=\"geser\"><figure><img src=\"__ASET__menu-garlic.jpg\" alt=\"Oyster bakar garlic\" loading=\"lazy\"><figcaption>Garlic <em>15K/pcs</em></figcaption></figure><figure><img src=\"__ASET__menu-mozzarella.jpg\" alt=\"Oyster bakar mozzarella\" loading=\"lazy\"><figcaption>Mozzarella <em>20K/pcs</em></figcaption></figure><figure><img src=\"__ASET__menu-seafood.jpg\" alt=\"Oyster bakar seafood mix\" loading=\"lazy\"><figcaption>Seafood Mix <em>25K/pcs</em></figcaption></figure><figure><img src=\"__ASET__fresh-oyster.jpg\" alt=\"Fresh oyster dengan lemon\" loading=\"lazy\"><figcaption>Fresh Oyster <em>+ lemon</em></figcaption></figure></div></section>\n" +
  "<section class=\"kartu tepok\"><h2 class=\"judul\"><span>Tepok 3x!</span></h2><p class=\"skrip\">Cara seru ala Cheesy Pen Shells</p><img class=\"poster\" src=\"__ASET__tepok-3x.jpg\" alt=\"Poster Tepok 3x, kami besarin apinya\" loading=\"lazy\"><ol class=\"cara\"><li><span><b>Siapkan kamera</b> saat oyster kamu mulai dibakar.</span></li><li><span><b>Tepuk tangan 3 kali</b> di depan booth.</span></li><li><span><b>Apinya kami besarin!</b> Rekam momen apinya membesar.</span></li><li><span><b>Upload &amp; tag @cheesypenshells</b> di sosial media kamu. Kami otomatis follow back!</span></li></ol></section>\n" +
  "<a class=\"ig\" href=\"https://www.instagram.com/cheesypenshells/\" target=\"_blank\" rel=\"noopener\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" aria-hidden=\"true\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"5\"/><circle cx=\"12\" cy=\"12\" r=\"4\"/><circle cx=\"17.5\" cy=\"6.5\" r=\"1.2\" fill=\"currentColor\" stroke=\"none\"/></svg><span><small>Follow kami di Instagram</small><b>@cheesypenshells</b></span><em>Buka</em></a><footer class=\"kaki\"><span class=\"tagar\">#cheesypenshellslovers</span><a id=\"komplainLink\" href=\"#\" target=\"_top\">Ada keluhan? Sampaikan di sini</a></footer></main><div id=\"siap\"></div>";
var JS_PESANAN =
  "var UAP=\"<svg viewBox='0 0 120 50' aria-hidden='true'><g fill='none' stroke='currentColor' stroke-width='7' stroke-linecap='round'><path d='M24 46c-12-9 10-15 0-24S16 8 26 3'/><path d='M60 46c-12-9 10-15 0-24S52 8 62 3'/><path d='M96 46c-12-9 10-15 0-24S88 8 98 3'/></g></svg>\";var ctx=null,aktif=false,terakhirPanggil=-1,alarm=null,ulang=0,kunciLayar=null,suaraId=null;\n" +
  "function el(i){return document.getElementById(i)}function pilihSuara(){if(!window.speechSynthesis)return;var v=speechSynthesis.getVoices();suaraId=v.filter(function(x){return /^id|^in/i.test(x.lang)})[0]||null}if(window.speechSynthesis){pilihSuara();speechSynthesis.onvoiceschanged=pilihSuara}function bicara(teks){if(!window.speechSynthesis)return;var u=new SpeechSynthesisUtterance(teks);u.lang=\"id-ID\";if(suaraId)u.voice=suaraId;u.rate=0.92;u.pitch=1;u.volume=1;speechSynthesis.speak(u)}function getar(pola){try{if(navigator.vibrate)navigator.vibrate(pola)}catch(e){}}function jagaLayar(){try{if(navigator.wakeLock&&document.visibilityState===\"visible\")navigator.wakeLock.request(\"screen\").then(function(k){kunciLayar=k}).catch(function(){})}catch(e){}}document.addEventListener(\"visibilitychange\",function(){if(aktif&&document.visibilityState===\"visible\")jagaLayar()});\n" +
  "function lonceng(f,t,dur,vol){var n=ctx.currentTime+t;[[1,1],[2.76,0.35],[5.4,0.12]].forEach(function(h){var o=ctx.createOscillator(),g=ctx.createGain();o.type=\"sine\";o.frequency.value=f*h[0];g.gain.setValueAtTime(0.0001,n);g.gain.exponentialRampToValueAtTime(vol*h[1],n+0.02);g.gain.exponentialRampToValueAtTime(0.0001,n+dur);o.connect(g);g.connect(ctx.destination);o.start(n);o.stop(n+dur+0.05)})}function nada(){if(!ctx)return;if(ctx.state===\"suspended\")ctx.resume();lonceng(523.25,0,1.6,0.5);lonceng(659.25,0.45,1.6,0.5);lonceng(783.99,0.9,1.6,0.5);lonceng(1046.5,1.35,2.4,0.45)}function aktifkan(){try{ctx=ctx||new (window.AudioContext||window.webkitAudioContext)()}catch(e){}aktif=true;nada();getar(200);jagaLayar();setTimeout(function(){bicara(\"Bunyi panggilan aktif\")},1600);el(\"bunyi\").className=\"ajak aktif\";el(\"bunyi\").innerHTML=\"<p style=\\\"margin:0\\\">🔔 <b>Bunyi & getar panggilan aktif.</b> Biarkan halaman ini terbuka, layar tetap menyala.</p>\"}function umumkan(d){nada();getar([700,250,700,250,1200]);setTimeout(function(){if(window.speechSynthesis)speechSynthesis.cancel();bicara(\"Nomor antrian \"+d.nomor+\", sudah boleh datang ke kasir untuk mengambil pesanan kamu. Terima kasih.\")},2300)}function panggil(d){ulang=0;umumkan(d);clearInterval(alarm);alarm=setInterval(function(){ulang++;umumkan(d)},11000);el(\"siap\").innerHTML=\"<div class=siap-besar onclick=\\\"berhenti()\\\"><div class=uap>\"+UAP+\"</div><div class=judul-siap>Oyster kamu sudah siap!</div><div class=nomor>\"+d.nomor+\"</div><p>Silakan datang ke kasir untuk mengambil pesanan kamu 🦪</p><small>Ketuk layar untuk mematikan bunyi</small></div>\"}function berhenti(){if(!alarm&&!el(\"siap\").innerHTML)return;clearInterval(alarm);alarm=null;if(window.speechSynthesis)speechSynthesis.cancel();getar(0);el(\"siap\").innerHTML=\"\"}function aman(s){return String(s||\"\").replace(/[&<>\"]/g,function(c){return {\"&\":\"&amp;\",\"<\":\"&lt;\",\">\":\"&gt;\",\"\\\"\":\"&quot;\"}[c]})}function tampil(d){if(!d.ada){el(\"isi\").innerHTML=\"<section class=tiket><h2>Pesanan tidak ditemukan</h2><p>Mohon scan ulang QR dari layar kasir.</p></section>\";return}var urut=[\"MENUNGGU\",\"DIBAKAR\",\"SIAP\",\"DIAMBIL\"],i=urut.indexOf(d.status),nama={MENUNGGU:\"⏳ Menunggu dibakar\",DIBAKAR:\"🔥 Sedang dibakar\",SIAP:\"🔔 Siap diambil!\",DIAMBIL:\"🙏 Sudah diambil, selamat menikmati!\",BATAL:\"Pesanan dibatalkan\"};var langkah=[[\"⏳\",\"Menunggu\"],[\"🔥\",\"Dibakar\"],[\"🔔\",\"Siap\"]].map(function(x,k){return \"<li class=\\\"\"+(k<i||i===3?\"lewat\":k===i?\"kini\":\"\")+\"\\\"><span>\"+x[0]+\"</span>\"+x[1]+\"</li>\"}).join(\"\");var aktifAntri=d.status===\"MENUNGGU\"||d.status===\"DIBAKAR\";el(\"isi\").innerHTML=\"<section class=tiket><div class=uap>\"+UAP+\"</div><div class=label>Nomor antrian kamu</div><div class=nomor>\"+d.nomor+\"</div><span class=\\\"lencana \"+d.status+\"\\\">\"+(nama[d.status]||d.status)+\"</span><ol class=langkah>\"+langkah+\"</ol><div class=info><div><small>Sedang dipanggil</small><b>\"+(d.nomorDipanggil?\"#\"+d.nomorDipanggil:\"–\")+\"</b></div><div><small>Antrian di depan kamu</small><b>\"+(aktifAntri?d.antrianDidepan:\"–\")+\"</b></div></div>\"+(d.lokasi?\"<div class=lokasi>📍 \"+aman(d.lokasi)+\"</div>\":\"\")+\"</section>\"+(d.fotoBakar?\"<section class=kartu><h2 class=judul><span>Lagi dibakar</span></h2><p class=skrip>Ini oyster kamu di atas bara!</p><img class=foto src=\\\"\"+d.fotoBakar+\"\\\" alt=\\\"Foto pesanan kamu saat dibakar\\\"></section>\":\"\")+\"<section class=kartu><h2 class=judul><span>Pesanan kamu</span></h2><div class=menu-pesanan>\"+(aman(d.menu)||\"<span class=redup>Lihat struk di bawah</span>\")+\"</div><details><summary>Lihat bukti pembayaran</summary><img class=foto src=\\\"\"+d.fotoStruk+\"\\\" alt=\\\"Struk pembayaran\\\"></details></section>\";if(d.komplain)el(\"komplainLink\").href=d.komplain;if(d.status===\"SIAP\"&&d.panggilKe!==terakhirPanggil){panggil(d)}if(d.status!==\"SIAP\")berhenti();terakhirPanggil=d.status===\"SIAP\"?d.panggilKe:terakhirPanggil;if(d.status===\"DIAMBIL\"){clearInterval(timer)}}";
var HTML_PESANAN = BADAN_PESANAN + '<script>var TOKEN="__TOKEN__";' + JS_PESANAN +
  'function muat(){google.script.run.withSuccessHandler(tampil).statusPesanan(TOKEN)}' +
  'function kirimNilai(b,u,ok,gagal){google.script.run.withSuccessHandler(ok).withFailureHandler(gagal).nilaiPesanan(TOKEN,b,u)}' +
  'var timer=setInterval(muat,5000);muat();</script>';
var HTML_KOMPLAIN =
  "<header>\n" +
  "<img src=\"__ASET__logo-putih.png\" alt=\"Cheesy Pen Shells\">\n" +
  "<div class=\"merek\">\n" +
  "<b>CHEESY PEN SHELLS</b>\n" +
  "<small>kami dengar, kami perbaiki</small>\n" +
  "</div>\n" +
  "</header>\n" +
  "<main style=\"max-width:560px\">\n" +
  "<div class=\"kartu\" id=\"form\">\n" +
  "<h2 class=\"judul\">\n" +
  "<span>Sampaikan keluhan</span>\n" +
  "</h2>\n" +
  "<p>Mohon maaf atas ketidaknyamanannya 🙏 Keluhan kamu langsung diterima pemilik Cheesy Pen Shells dan segera ditindaklanjuti.</p>\n" +
  "<label>Keluhan tentang</label>\n" +
  "<div class=\"pilihan\" id=\"kat\">\n" +
  "</div>\n" +
  "<label>Ceritakan detailnya</label>\n" +
  "<textarea id=\"detail\" rows=\"4\" placeholder=\"Contoh: oyster yang saya terima berbau, pesanan nomor 12\">\n" +
  "</textarea>\n" +
  "<label>Nama (opsional)</label>\n" +
  "<input id=\"nama\">\n" +
  "<label>No. WhatsApp (opsional, kalau ingin kami hubungi)</label>\n" +
  "<input id=\"kontak\" inputmode=\"tel\">\n" +
  "<br>\n" +
  "<br>\n" +
  "<button class=\"kuning\" onclick=\"kirim()\">Kirim keluhan</button>\n" +
  "<p id=\"pesan\" style=\"color:var(--merah)\">\n" +
  "</p>\n" +
  "</div>\n" +
  "<a class=\"ig\" href=\"https://www.instagram.com/cheesypenshells/\" target=\"_blank\" rel=\"noopener\">\n" +
  "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" aria-hidden=\"true\">\n" +
  "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"5\"/>\n" +
  "<circle cx=\"12\" cy=\"12\" r=\"4\"/>\n" +
  "<circle cx=\"17.5\" cy=\"6.5\" r=\"1.2\" fill=\"currentColor\" stroke=\"none\"/>\n" +
  "</svg>\n" +
  "<span>\n" +
  "<small>Follow kami di Instagram</small>\n" +
  "<b>@cheesypenshells</b>\n" +
  "</span>\n" +
  "<em>Buka</em>\n" +
  "</a>\n" +
  "</main>\n" +
  "<script>\n" +
  "var KODE=\"__KODE__\",KAT=__KATEGORI__;\n" +
  "function el(i){return document.getElementById(i)}el(\"kat\").innerHTML=KAT.map(function(k,i){return \"<label><input type=radio name=kat value=\\\"\"+k+\"\\\"\"+(i===0?\" checked\":\"\")+\"> \"+k+\"</label>\"}).join(\"\");\n" +
  "function kirim(){var k=document.querySelector(\"input[name=kat]:checked\").value;el(\"pesan\").textContent=\"Mengirim...\";google.script.run.withSuccessHandler(function(){el(\"form\").innerHTML=\"<h2 class=judul><span>Terima kasih 🙏</span></h2><p>Keluhan kamu sudah kami terima dan langsung diteruskan ke pemilik Cheesy Pen Shells.</p>\"}).withFailureHandler(function(e){el(\"pesan\").textContent=e.message}).kirimKomplain({kode:KODE,kategori:k,detail:el(\"detail\").value,nama:el(\"nama\").value,kontak:el(\"kontak\").value})}\n" +
  "</script>";
// ==== AKHIR TAMPILAN ====
