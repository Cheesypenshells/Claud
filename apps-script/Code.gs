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

// PIN kasir: Script Property / Konfig.gs, atau baris "pin_kasir" di tab Pengaturan (diisi bot / owner).
function pinKasir_() {
  var v = prop_('KASIR_PIN');
  if (v) return v;
  var c = CacheService.getScriptCache(), simpan = c.get('pin_kasir');
  if (simpan) return simpan;
  var sh = ss_().getSheetByName('Pengaturan');
  if (!sh || sh.getLastRow() < 2) return '';
  var nilai = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  for (var i = 0; i < nilai.length; i++) {
    if (String(nilai[i][0]).trim() === 'pin_kasir') { v = String(nilai[i][1]).trim(); break; }
  }
  if (v) c.put('pin_kasir', v, 300);
  return v || '';
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
function ubahStatus(pin, id, status, dataUrl) {
  cekPin_(pin);
  var t = tab_('Antrian', KOLOM_ANTRIAN);
  var o = baca_(t).filter(function (x) { return x.id === id; })[0];
  if (!o) throw new Error('Pesanan tidak ditemukan');
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
  if (p === 'kasir') html = HTML_KASIR.replace('__K__', String(e.parameter.k || '').replace(/[^0-9A-Za-z]/g, '')).replace('__E__', String(e.parameter.e || '').replace(/[^A-Za-z0-9-]/g, ''));
  else if (p === 'pesanan') html = HTML_PESANAN.replace('__TOKEN__', String(e.parameter.t || '').replace(/[^a-z0-9]/gi, ''));
  else html = HTML_KOMPLAIN.replace('__KODE__', String((e && e.parameter && e.parameter.e) || '').replace(/[^A-Za-z0-9-]/g, ''))
    .replace('__KATEGORI__', JSON.stringify(KATEGORI_KOMPLAIN));
  return HtmlService.createHtmlOutput(GAYA + html)
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

var GAYA = '<style>' +
  ':root{--oranye:#E8710A;--tua:#3E2723;--hijau:#0B8043;--merah:#D93025;--biru:#1A73E8;--abu:#f4f1ee;--teks:#222}' +
  '*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--abu);color:var(--teks)}' +
  'header{background:var(--tua);color:#fff;padding:12px 16px;font-weight:700;font-size:18px;display:flex;align-items:center;gap:8px}' +
  'main{padding:16px;max-width:1100px;margin:0 auto}.kartu{background:#fff;border-radius:14px;padding:16px;margin-bottom:14px;box-shadow:0 1px 3px rgba(0,0,0,.08)}' +
  'button,.tombol{border:0;border-radius:12px;padding:14px 16px;font-size:16px;font-weight:700;cursor:pointer;background:var(--oranye);color:#fff;width:100%}' +
  'button.kecil{padding:9px 10px;font-size:14px;width:auto}button.hijau{background:var(--hijau)}button.biru{background:var(--biru)}button.abu{background:#9e9e9e}button.merah{background:var(--merah)}' +
  'input,select,textarea{width:100%;padding:12px;border:1px solid #ccc;border-radius:10px;font-size:16px;font-family:inherit}label{font-weight:600;display:block;margin:10px 0 6px}' +
  '.nomor{font-size:72px;font-weight:800;color:var(--oranye);text-align:center;line-height:1}.redup{color:#777;font-size:14px}' +
  '.lencana{display:inline-block;padding:6px 12px;border-radius:999px;font-weight:700;color:#fff}' +
  '.MENUNGGU{background:#9e9e9e}.DIBAKAR{background:var(--oranye)}.SIAP{background:var(--hijau)}' +
  'img.foto{width:100%;border-radius:10px;display:block;background:#eee}' +
  '.kolom{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}@media(max-width:800px){.kolom{grid-template-columns:1fr}}' +
  '.pesanan{background:#fff;border-radius:12px;padding:10px;margin-bottom:10px;border-left:6px solid #ccc}.pesanan.DIBAKAR{border-color:var(--oranye)}.pesanan.SIAP{border-color:var(--hijau)}' +
  '.pesanan .no{font-size:30px;font-weight:800}.pesanan img{width:86px;height:86px;object-fit:cover;border-radius:8px;float:right;margin-left:8px}' +
  '.aksi{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;clear:both}.modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;z-index:9}' +
  '.modal .kartu{max-width:440px;width:100%;max-height:92vh;overflow:auto}.langkah{display:flex;justify-content:space-between;margin:14px 0}.langkah div{flex:1;text-align:center;font-size:13px;color:#999}.langkah div.aktif{color:var(--teks);font-weight:700}' +
  '.siap-besar{position:fixed;inset:0;background:var(--hijau);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;z-index:10}' +
  '.siap-besar .nomor{color:#fff;font-size:110px}.pilihan label{font-weight:500;display:flex;gap:10px;align-items:center;background:#fff;border:1px solid #ddd;border-radius:10px;padding:12px;margin:6px 0}' +
  '.pilihan input{width:auto}</style>';

var HTML_KASIR = '<header>🦪 Kasir Antrian <span id="ev" class="redup" style="color:#ffd"></span></header><main>' +
  '<div id="masuk" class="kartu"><label>PIN kasir</label><input id="pin" type="password" inputmode="numeric"><br><br><button onclick="masuk()">Masuk</button><p id="salah" style="color:var(--merah)"></p></div>' +
  '<div id="isi" style="display:none">' +
  '<div class="kartu"><label>Event</label><select id="event" onchange="muat()"></select><br><br>' +
  '<label class="tombol" style="text-align:center">📷 Pesanan baru – foto struk<input id="struk" type="file" accept="image/*" capture="environment" style="display:none" onchange="pesananBaru(this)"></label>' +
  '<p id="proses" class="redup"></p></div>' +
  '<div class="kolom"><div><h3>⏳ Menunggu</h3><div id="k-MENUNGGU"></div></div><div><h3>🔥 Dibakar</h3><div id="k-DIBAKAR"></div></div><div><h3>✅ Siap / dipanggil</h3><div id="k-SIAP"></div></div></div>' +
  '</div></main><div id="modal"></div><input id="fotoBakar" type="file" accept="image/*" capture="environment" style="display:none">' +
  '<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"></script><script>' +
  'var KUNCI="__K__",EVLINK="__E__";var PIN=KUNCI||localStorage.getItem("cps_pin")||"";var data=[];if(EVLINK)localStorage.setItem("cps_ev",EVLINK);' +
  'function el(i){return document.getElementById(i)}' +
  'function kecilkan(file,cb){var r=new FileReader();r.onload=function(){var g=new Image();g.onload=function(){var m=1280,s=Math.min(1,m/Math.max(g.width,g.height));var c=document.createElement("canvas");c.width=g.width*s;c.height=g.height*s;c.getContext("2d").drawImage(g,0,0,c.width,c.height);cb(c.toDataURL("image/jpeg",0.72))};g.src=r.result};r.readAsDataURL(file)}' +
  'function masuk(){var p=el("pin").value||PIN;google.script.run.withSuccessHandler(function(r){PIN=p;localStorage.setItem("cps_pin",p);el("masuk").style.display="none";el("isi").style.display="";var s=el("event");s.innerHTML=r.events.map(function(e){return "<option value=\\""+e.kode+"\\">"+e.kode+" – "+e.kota+"</option>"}).join("");var ingat=localStorage.getItem("cps_ev");if(ingat)s.value=ingat;muat();setInterval(muat,4000)}).withFailureHandler(function(e){el("salah").textContent=e.message;localStorage.removeItem("cps_pin")}).kasirMasuk(p)}' +
  'function kode(){var k=el("event").value;localStorage.setItem("cps_ev",k);el("ev").textContent=k;return k}' +
  'function muat(){google.script.run.withSuccessHandler(tampil).daftarAntrian(PIN,kode())}' +
  'function aman(s){return String(s||"").replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]})}' +
  'function tampil(d){data=d;["MENUNGGU","DIBAKAR","SIAP"].forEach(function(st){el("k-"+st).innerHTML=d.filter(function(o){return o.status===st}).map(kartu).join("")||"<p class=redup>–</p>"})}' +
  'function kartu(o){var a="";if(o.status==="MENUNGGU")a="<button class=\\"kecil\\" onclick=\\"bakar(\'"+o.id+"\')\\">📷 Foto & mulai bakar</button><button class=\\"kecil abu\\" onclick=\\"status(\'"+o.id+"\',\'DIBAKAR\')\\">Bakar tanpa foto</button>";' +
  'if(o.status==="DIBAKAR")a="<button class=\\"kecil hijau\\" onclick=\\"status(\'"+o.id+"\',\'SIAP\')\\">🔔 Panggil</button>";' +
  'if(o.status==="SIAP")a="<button class=\\"kecil biru\\" onclick=\\"status(\'"+o.id+"\',\'SIAP\')\\">🔔 Panggil ulang ("+o.panggilKe+"x)</button><button class=\\"kecil hijau\\" onclick=\\"status(\'"+o.id+"\',\'DIAMBIL\')\\">✓ Sudah diambil</button>";' +
  'return "<div class=\\"pesanan "+o.status+"\\"><img src=\\""+(o.fotoBakar||o.fotoStruk)+"\\" onclick=\\"lihat(\'"+o.id+"\')\\"><div class=no>#"+o.nomor+"</div><div class=redup>"+o.dibuat+"</div><div style=\\"white-space:pre-line\\">"+(aman(o.menu)||"<i class=redup>menu: lihat struk</i>")+"</div><div class=aksi>"+a+"<button class=\\"kecil abu\\" onclick=\\"lihat(\'"+o.id+"\')\\">QR / detail</button></div></div>"}' +
  'function cari(id){return data.filter(function(o){return o.id===id})[0]}' +
  'function pesananBaru(inp){var f=inp.files[0];inp.value="";if(!f)return;el("proses").textContent="Menyimpan struk & membuat nomor antrian...";kecilkan(f,function(u){google.script.run.withSuccessHandler(function(o){el("proses").textContent="";data.push(o);lihat(o.id,o);muat()}).withFailureHandler(function(e){el("proses").textContent="Gagal: "+e.message}).buatPesanan(PIN,kode(),u)})}' +
  'function lihat(id,o){o=o||cari(id);if(!o)return;el("modal").innerHTML="<div class=modal onclick=\\"if(event.target===this)tutup()\\"><div class=kartu><div class=redup style=\\"text-align:center\\">Nomor antrian</div><div class=nomor>#"+o.nomor+"</div><p style=\\"text-align:center\\">Minta pelanggan <b>scan QR ini</b> untuk melihat pesanannya:</p><div id=qr style=\\"display:flex;justify-content:center;margin:10px 0\\"></div><label>Menu (dari struk, bisa diperbaiki)</label><textarea id=menuEdit rows=4>"+aman(o.menu)+"</textarea><br><br><button class=\\"kecil hijau\\" onclick=\\"simpanMenu(\'"+o.id+"\')\\">Simpan menu</button> <button class=\\"kecil merah\\" onclick=\\"if(confirm(\'Batalkan pesanan #"+o.nomor+"?\'))status(\'"+o.id+"\',\'BATAL\')\\">Batalkan</button><br><br><img class=foto src=\\""+o.fotoStruk+"\\">"+(o.fotoBakar?"<br><img class=foto src=\\""+o.fotoBakar+"\\">":"")+"<br><button onclick=\\"tutup()\\">Tutup</button></div></div>";var q=qrcode(0,"L");q.addData(o.link);q.make();el("qr").innerHTML=q.createSvgTag({cellSize:5,margin:4,scalable:true}).replace("<svg ","<svg style=\\"width:min(86vw,380px);height:auto;background:#fff\\" ")}' +
  'function tutup(){el("modal").innerHTML=""}' +
  'function simpanMenu(id){google.script.run.withSuccessHandler(function(){tutup();muat()}).ubahMenu(PIN,id,el("menuEdit").value)}' +
  'function status(id,st,foto){google.script.run.withSuccessHandler(function(){tutup();muat()}).withFailureHandler(function(e){alert(e.message)}).ubahStatus(PIN,id,st,foto||"")}' +
  'function bakar(id){var i=el("fotoBakar");i.onchange=function(){var f=i.files[0];i.value="";if(!f)return;el("proses").textContent="Menyimpan foto pesanan...";kecilkan(f,function(u){el("proses").textContent="";status(id,"DIBAKAR",u)})};i.click()}' +
  'if(PIN){el("pin").value=PIN;masuk()}' +
  '</script>';

// Halaman pelanggan: badan HTML & skrip dipakai juga untuk halaman GitHub Pages (docs/antrian, lihat scripts/halaman-pelanggan.mjs).
var BADAN_PESANAN = '<header>🦪 Cheesy Pen Shells</header><main><div class="kartu" id="bunyi"><button class="biru" onclick="aktifkan()">🔔 Ketuk untuk aktifkan bunyi & getar panggilan</button><p class="redup">Wajib diketuk sekali. Biarkan halaman ini terbuka: saat pesanan siap, HP berbunyi seperti panggilan di bioskop dan bergetar.</p></div><div id="isi" class="kartu"><p class="redup">Memuat pesanan...</p></div></main><div id="siap"></div>';
var JS_PESANAN =
  'var ctx=null,aktif=false,terakhirPanggil=-1,alarm=null,ulang=0,kunciLayar=null,suaraId=null;' +
  'function el(i){return document.getElementById(i)}' +
  'function pilihSuara(){if(!window.speechSynthesis)return;var v=speechSynthesis.getVoices();suaraId=v.filter(function(x){return /^id|^in/i.test(x.lang)})[0]||null}' +
  'if(window.speechSynthesis){pilihSuara();speechSynthesis.onvoiceschanged=pilihSuara}' +
  'function bicara(teks){if(!window.speechSynthesis)return;var u=new SpeechSynthesisUtterance(teks);u.lang="id-ID";if(suaraId)u.voice=suaraId;u.rate=0.92;u.pitch=1;u.volume=1;speechSynthesis.speak(u)}' +
  'function getar(pola){try{if(navigator.vibrate)navigator.vibrate(pola)}catch(e){}}' +
  'function jagaLayar(){try{if(navigator.wakeLock&&document.visibilityState==="visible")navigator.wakeLock.request("screen").then(function(k){kunciLayar=k}).catch(function(){})}catch(e){}}' +
  'document.addEventListener("visibilitychange",function(){if(aktif&&document.visibilityState==="visible")jagaLayar()});' +
  'function lonceng(f,t,dur,vol){var n=ctx.currentTime+t;[[1,1],[2.76,0.35],[5.4,0.12]].forEach(function(h){var o=ctx.createOscillator(),g=ctx.createGain();o.type="sine";o.frequency.value=f*h[0];g.gain.setValueAtTime(0.0001,n);g.gain.exponentialRampToValueAtTime(vol*h[1],n+0.02);g.gain.exponentialRampToValueAtTime(0.0001,n+dur);o.connect(g);g.connect(ctx.destination);o.start(n);o.stop(n+dur+0.05)})}' +
  'function nada(){if(!ctx)return;if(ctx.state==="suspended")ctx.resume();lonceng(523.25,0,1.6,0.5);lonceng(659.25,0.45,1.6,0.5);lonceng(783.99,0.9,1.6,0.5);lonceng(1046.5,1.35,2.4,0.45)}' +
  'function aktifkan(){try{ctx=ctx||new (window.AudioContext||window.webkitAudioContext)()}catch(e){}aktif=true;nada();getar(200);jagaLayar();setTimeout(function(){bicara("Bunyi panggilan aktif")},1600);el("bunyi").innerHTML="<p>🔔 <b>Bunyi panggilan aktif.</b> Biarkan halaman ini terbuka, layar akan tetap menyala.</p>"}' +
  'function umumkan(d){nada();getar([700,250,700,250,1200]);setTimeout(function(){if(window.speechSynthesis)speechSynthesis.cancel();bicara("Nomor antrian "+d.nomor+". Oyster kamu sudah siap. Silakan diambil di kasir.")},2300)}' +
  'function panggil(d){ulang=0;umumkan(d);clearInterval(alarm);alarm=setInterval(function(){ulang++;if(ulang>12){clearInterval(alarm);return}umumkan(d)},12000);el("siap").innerHTML="<div class=siap-besar onclick=\\"berhenti()\\"><div style=\\"font-size:28px;font-weight:800\\">OYSTER KAMU SUDAH SIAP!</div><div class=nomor>#"+d.nomor+"</div><div style=\\"font-size:20px\\">Silakan ambil di kasir 🦪</div><p>(ketuk layar untuk mematikan bunyi)</p></div>"}' +
  'function berhenti(){if(!alarm&&!el("siap").innerHTML)return;clearInterval(alarm);alarm=null;if(window.speechSynthesis)speechSynthesis.cancel();getar(0);el("siap").innerHTML=""}' +
  '' +
  'function aman(s){return String(s||"").replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]})}function tampil(d){if(!d.ada){el("isi").innerHTML="<p>Pesanan tidak ditemukan. Mohon scan ulang QR dari kasir.</p>";return}var urut=["MENUNGGU","DIBAKAR","SIAP","DIAMBIL"],i=urut.indexOf(d.status),nama={MENUNGGU:"⏳ Menunggu",DIBAKAR:"🔥 Sedang dibakar",SIAP:"✅ Siap diambil",DIAMBIL:"🙏 Sudah diambil",BATAL:"Dibatalkan"};el("isi").innerHTML="<div class=redup style=\\"text-align:center\\">"+aman(d.lokasi)+"</div><div class=redup style=\\"text-align:center;margin-top:8px\\">Nomor antrian Anda</div><div class=nomor>#"+d.nomor+"</div><p style=\\"text-align:center\\"><span class=\\"lencana "+d.status+"\\">"+(nama[d.status]||d.status)+"</span></p><div class=langkah>"+["Menunggu","Dibakar","Siap"].map(function(n,k){return "<div class=\\""+(k<=i?"aktif":"")+"\\">"+(k<=i?"●":"○")+" "+n+"</div>"}).join("")+"</div><p style=\\"text-align:center\\">Nomor yang sedang dipanggil: <b>"+(d.nomorDipanggil?"#"+d.nomorDipanggil:"–")+"</b>"+(d.antrianDidepan?"<br>Antrian di depan Anda: <b>"+d.antrianDidepan+"</b>":"")+"</p>"+(d.fotoBakar?"<h3>🔥 Pesanan Anda sedang dibakar</h3><img class=foto src=\\""+d.fotoBakar+"\\">":"")+"<h3>🧾 Pesanan</h3><div style=\\"white-space:pre-line;font-size:18px\\">"+(aman(d.menu)||"<span class=redup>lihat struk di bawah</span>")+"</div><h3>Bukti pembayaran</h3><img class=foto src=\\""+d.fotoStruk+"\\"><p class=redup style=\\"margin-top:16px\\">Ada keluhan? <a href=\\""+d.komplain+"\\" target=_top>Sampaikan di sini</a></p>";if(d.status==="SIAP"&&d.panggilKe!==terakhirPanggil){panggil(d)}if(d.status!=="SIAP")berhenti();terakhirPanggil=d.status==="SIAP"?d.panggilKe:terakhirPanggil;if(d.status==="DIAMBIL"){clearInterval(timer)}}' +
  '';
var HTML_PESANAN = BADAN_PESANAN + '<script>var TOKEN="__TOKEN__";' + JS_PESANAN +
  'function muat(){google.script.run.withSuccessHandler(tampil).statusPesanan(TOKEN)}var timer=setInterval(muat,5000);muat();' +
  '</script>';

var HTML_KOMPLAIN = '<header>🦪 Cheesy Pen Shells – Sampaikan keluhan</header><main><div class="kartu" id="form">' +
  '<p>Mohon maaf atas ketidaknyamanannya 🙏 Keluhan Anda langsung kami terima dan ditindaklanjuti.</p>' +
  '<label>Keluhan tentang</label><div class="pilihan" id="kat"></div>' +
  '<label>Ceritakan detailnya</label><textarea id="detail" rows="4" placeholder="Contoh: oyster yang saya terima berbau, pesanan nomor 12"></textarea>' +
  '<label>Nama (opsional)</label><input id="nama"><label>No. WhatsApp (opsional, kalau ingin kami hubungi)</label><input id="kontak" inputmode="tel">' +
  '<br><br><button onclick="kirim()">Kirim keluhan</button><p id="pesan" style="color:var(--merah)"></p></div></main><script>' +
  'var KODE="__KODE__",KAT=__KATEGORI__;function el(i){return document.getElementById(i)}' +
  'el("kat").innerHTML=KAT.map(function(k,i){return "<label><input type=radio name=kat value=\\""+k+"\\""+(i===0?" checked":"")+"> "+k+"</label>"}).join("");' +
  'function kirim(){var k=document.querySelector("input[name=kat]:checked").value;el("pesan").textContent="Mengirim...";google.script.run.withSuccessHandler(function(){el("form").innerHTML="<h2>Terima kasih 🙏</h2><p>Keluhan Anda sudah kami terima dan langsung diteruskan ke pemilik Cheesy Pen Shells.</p>"}).withFailureHandler(function(e){el("pesan").textContent=e.message}).kirimKomplain({kode:KODE,kategori:k,detail:el("detail").value,nama:el("nama").value,kontak:el("kontak").value})}' +
  '</script>';
