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
  ['panggil_ke', 'Dipanggil Ke'], ['diambil', 'Diambil'], ['kasir', 'Kasir'], ['sesi', 'Sesi Kasir'],
  ['rating', 'Bintang'], ['ulasan', 'Ulasan'], ['dinilai', 'Dinilai'],
];
// Sesi kasir: dibuka (▶ Mulai kasir) dan ditutup (⏹ Tutup kasir) di halaman kasir. Ringkasan diteruskan bot ke owner.
var KOLOM_SESI = [
  ['id', 'ID'], ['kode_event', 'Kode Event'], ['tanggal', 'Tanggal'], ['kasir', 'Kasir'], ['dibuka', 'Dibuka'], ['ditutup', 'Ditutup'],
  ['jumlah_struk', 'Struk Dilayani'], ['diambil', 'Diambil'], ['batal', 'Batal'], ['belum', 'Belum Selesai'],
  ['rata_tunggu_menit', 'Rata-rata Tunggu (menit)'], ['rating_rata', 'Bintang Rata-rata'], ['jumlah_rating', 'Jumlah Penilaian'],
  ['rating_kasir', 'Bintang per Kasir'], ['ulasan_buruk', 'Ulasan Bintang Rendah'], ['status', 'Status'], ['diteruskan', 'Diteruskan ke Owner'],
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
  tab_('Sesi Kasir', KOLOM_SESI);
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
// Sel waktu bisa terbaca sebagai Date (Sheets mengubah teks waktu otomatis): seragamkan jadi 'yyyy-MM-dd HH:mm:ss'.
function waktuStr_(v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss') : String(v || ''); }
function waktuDate_(v) {
  if (v instanceof Date) return v;
  var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return m ? new Date(m[1] + '-' + m[2] + '-' + m[3] + 'T' + ('0' + m[4]).slice(-2) + ':' + m[5] + ':' + (m[6] || '00') + '+07:00') : null;
}
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
      mulai: tglStr_(r[i('Tanggal Mulai')]), selesai: tglStr_(r[i('Tanggal Selesai')]), status: String(r[i('Status')] || ''),
      kasir: i('Kasir Antrian') >= 0 ? String(r[i('Kasir Antrian')] || '').replace(/\s*\(\d+\)/g, '').split(',')[0].trim() : '' };
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
    fotoStruk: linkFoto_(o.foto_struk), fotoBakar: linkFoto_(o.foto_bakar), dibuat: waktuStr_(o.dibuat).slice(11, 16),
    dipanggil: waktuStr_(o.dipanggil), panggilKe: Number(o.panggil_ke || 0), kodeEvent: o.kode_event,
    rating: Number(o.rating || 0), ulasan: String(o.ulasan || ''), kasir: String(o.kasir || ''),
    link: denganToken ? (atur_('url_pelanggan') ? atur_('url_pelanggan') + '?t=' : url_() + '?p=pesanan&t=') + o.token : undefined,
  };
}

function kasirMasuk(pin) { cekPin_(pin); return { ok: true, events: daftarEvent() }; }

function daftarAntrian(pin, kode) {
  cekPin_(pin);
  var t = tab_('Antrian', KOLOM_ANTRIAN);
  // Semua pesanan event yang belum selesai (nomor berlanjut selama event, termasuk lewat tengah malam).
  var pesanan = baca_(t).filter(function (o) { return o.kode_event === kode && o.status !== STATUS.DIAMBIL && o.status !== STATUS.BATAL; })
    .map(function (o) { return ringkas_(o, true); }).sort(function (a, b) { return a.nomor - b.nomor; });
  var s = sesiAktif_(kode);
  return { pesanan: pesanan, sesi: s ? ringkasSesi_(s) : null };
}

// ---------------------------------------------------------------- sesi kasir

function sesiAktif_(kode) {
  return baca_(tab_('Sesi Kasir', KOLOM_SESI)).filter(function (x) { return x.kode_event === kode && x.status === 'BUKA'; }).pop() || null;
}
function ringkasSesi_(x) {
  var jumlah = baca_(tab_('Antrian', KOLOM_ANTRIAN)).filter(function (o) { return o.sesi === x.id && o.status !== STATUS.BATAL; }).length;
  return { id: x.id, kasir: String(x.kasir || ''), dibuka: waktuStr_(x.dibuka), jumlah: jumlah };
}
function kunci_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ▶ Mulai kasir. Kalau sudah dibuka dari HP lain, sesi yang ada dipakai.
function mulaiKasir(pin, kode, nama) {
  cekPin_(pin);
  return kunci_(function () {
    var ada = sesiAktif_(kode);
    if (ada) return ringkasSesi_(ada);
    var t = tab_('Sesi Kasir', KOLOM_SESI);
    var x = { id: 'S' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyMMddHHmmss'), kode_event: kode, tanggal: hariIni_(),
      kasir: String(nama || '').trim().slice(0, 60) || 'Kasir', dibuka: sekarang_(), status: 'BUKA' };
    tulisBaris_(t, x);
    return ringkasSesi_(x);
  });
}

// 👤 Ganti kasir di tengah sesi (misalnya setengah hari): pesanan berikutnya tercatat atas nama kasir baru.
function gantiKasir(pin, kode, nama) {
  cekPin_(pin);
  return kunci_(function () {
    var x = sesiAktif_(kode);
    if (!x) throw new Error('Kasir belum dibuka.');
    var baru = String(nama || '').trim().slice(0, 60);
    if (!baru) throw new Error('Nama kasir kosong.');
    var daftar = String(x.kasir || '').split(',').map(function (k) { return k.trim(); }).filter(Boolean);
    if (daftar.indexOf(baru) < 0) daftar.push(baru);
    ubah_(tab_('Sesi Kasir', KOLOM_SESI), x._baris, { kasir: daftar.join(', ') });
    return true;
  });
}
function kasirSekarang_(x) { var d = String(x.kasir || '').split(','); return d[d.length - 1].trim(); }

// Ringkasan pesanan sebuah sesi.
function hitungSesi_(x) {
  var semua = baca_(tab_('Antrian', KOLOM_ANTRIAN)).filter(function (o) { return o.sesi === x.id; });
  var layan = semua.filter(function (o) { return o.status !== STATUS.BATAL; });
  var menit = function (a, b) { var x = waktuDate_(a), y = waktuDate_(b); if (!x || !y) return null; var d = (y - x) / 60000; return d < 0 ? null : d; };
  var tunggu = layan.map(function (o) { return o.dipanggil ? menit(o.dibuat, o.dipanggil) : null; }).filter(function (v) { return v !== null; });
  var dinilai = layan.filter(function (o) { return Number(o.rating) > 0; });
  var perKasir = {};
  dinilai.forEach(function (o) { var k = String(o.kasir || 'Kasir'); perKasir[k] = perKasir[k] || []; perKasir[k].push(Number(o.rating)); });
  var rata = function (a) { return a.length ? Math.round(a.reduce(function (m, v) { return m + v; }, 0) / a.length * 10) / 10 : 0; };
  return {
    jumlah_struk: layan.length,
    diambil: semua.filter(function (o) { return o.status === STATUS.DIAMBIL; }).length,
    batal: semua.length - layan.length,
    belum: semua.filter(function (o) { return [STATUS.MENUNGGU, STATUS.DIBAKAR, STATUS.SIAP].indexOf(o.status) >= 0; }).length,
    rata_tunggu_menit: tunggu.length ? Math.round(rata(tunggu)) : '',
    rating_rata: rata(dinilai.map(function (o) { return Number(o.rating); })),
    jumlah_rating: dinilai.length,
    rating_kasir: Object.keys(perKasir).map(function (k) { return k + ' ' + String(rata(perKasir[k])).replace('.', ',') + ' (' + perKasir[k].length + ')'; }).join(' · '),
    ulasan_buruk: dinilai.filter(function (o) { return Number(o.rating) <= 2; })
      .map(function (o) { return '#' + o.nomor + ' ' + Number(o.rating) + '★ ' + (o.kasir ? '(' + o.kasir + ') ' : '') + String(o.ulasan || '-'); }).join('\n'),
  };
}

// ⏹ Tutup kasir: hitung ringkasan, simpan, bot meneruskan ke WhatsApp owner.
function tutupKasir(pin, kode) {
  cekPin_(pin);
  return kunci_(function () {
    var x = sesiAktif_(kode);
    if (!x) throw new Error('Kasir sudah ditutup (mungkin dari HP lain).');
    var r = hitungSesi_(x);
    r.ditutup = sekarang_();
    r.status = 'TUTUP';
    ubah_(tab_('Sesi Kasir', KOLOM_SESI), x._baris, r);
    r.kode_event = x.kode_event; r.kasir = x.kasir; r.dibuka = waktuStr_(x.dibuka);
    return r;
  });
}


function buatPesanan(pin, kode, dataUrl) {
  cekPin_(pin);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var t = tab_('Antrian', KOLOM_ANTRIAN);
    var hari = hariIni_();
    var semua = baca_(t);
    var sesi = sesiAktif_(kode);
    if (!sesi) throw new Error('Kasir belum dibuka. Tekan ▶ Mulai kasir dulu.');
    // Nomor berlanjut selama event; event berikutnya mulai dari 1 lagi.
    var nomor = semua.filter(function (o) { return o.kode_event === kode; })
      .reduce(function (m, o) { return Math.max(m, Number(o.nomor) || 0); }, 0) + 1;
    var id = 'Q' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyMMddHHmmss') + Math.floor(Math.random() * 90 + 10);
    var token = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    var foto = simpanFoto_(dataUrl, kode + '-' + hari + '-no' + nomor + '-struk');
    var o = { id: id, token: token, kode_event: kode, tanggal: hari, nomor: nomor, status: STATUS.MENUNGGU, menu: '',
      foto_struk: foto.id, foto_bakar: '', teks_struk: '', dibuat: sekarang_(), panggil_ke: 0, kasir: kasirSekarang_(sesi), sesi: sesi.id };
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
  var hariItu = semua.filter(function (x) { return x.kode_event === o.kode_event; });
  var dipanggil = hariItu.filter(function (x) { return x.status === STATUS.SIAP || x.status === STATUS.DIAMBIL; })
    .sort(function (a, b) { return waktuStr_(b.dipanggil).localeCompare(waktuStr_(a.dipanggil)); })[0];
  var didepan = hariItu.filter(function (x) { return (x.status === STATUS.MENUNGGU || x.status === STATUS.DIBAKAR) && Number(x.nomor) < Number(o.nomor); }).length;
  var ev = daftarEvent().filter(function (e) { return e.kode === o.kode_event; })[0];
  var r = ringkas_(o, false);
  r.ada = true;
  r.nomorDipanggil = dipanggil ? Number(dipanggil.nomor) : null;
  r.antrianDidepan = o.status === STATUS.MENUNGGU || o.status === STATUS.DIBAKAR ? didepan : 0;
  r.lokasi = ev ? ev.kota + (ev.io ? ' · ' + ev.io : '') : o.kode_event;
  r.komplain = url_() + '?p=komplain&e=' + encodeURIComponent(o.kode_event);
  r.bolehNilai = o.status === STATUS.SIAP || o.status === STATUS.DIAMBIL;
  return r;
}

// ⭐ Penilaian pelayanan kasir dari pelanggan (1–5 bintang + ulasan), seperti di aplikasi ojek online.
function nilaiPesanan(token, bintang, ulasan) {
  var b = Math.round(Number(bintang));
  if (!(b >= 1 && b <= 5)) throw new Error('Pilih 1 sampai 5 bintang.');
  return kunci_(function () {
    var t = tab_('Antrian', KOLOM_ANTRIAN);
    var o = baca_(t).filter(function (x) { return x.token === String(token || ''); })[0];
    if (!o) throw new Error('Pesanan tidak ditemukan.');
    if (o.status !== STATUS.SIAP && o.status !== STATUS.DIAMBIL) throw new Error('Penilaian bisa diberikan setelah pesanan siap.');
    ubah_(t, o._baris, { rating: b, ulasan: String(ulasan || '').trim().slice(0, 300), dinilai: sekarang_() });
    return true;
  });
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
  if (p === 'nilai') {
    var jawab;
    try { nilaiPesanan(String(e.parameter.t || '').replace(/[^a-z0-9]/gi, ''), e.parameter.b, e.parameter.u); jawab = { ok: true }; }
    catch (err) { jawab = { ok: false, pesan: err.message }; }
    return ContentService.createTextOutput(JSON.stringify(jawab)).setMimeType(ContentService.MimeType.JSON);
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
  "\n" +
  "/* ---- sesi kasir ---- */\n" +
  ".sesi{margin-top:14px;border-radius:16px;padding:14px;border:2px dashed var(--garis)}\n" +
  ".sesi.buka{border:2px solid var(--hijau);background:#EFF8F2}\n" +
  ".sesi.tutup{background:var(--kuning-muda);border-color:var(--kuning)}\n" +
  ".lampu{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--hijau);margin-right:6px;box-shadow:0 0 0 0 rgba(11,128,67,.5);animation:lampu 1.6s infinite}\n" +
  "@keyframes lampu{70%{box-shadow:0 0 0 8px rgba(11,128,67,0)}100%{box-shadow:0 0 0 0 rgba(11,128,67,0)}}\n" +
  ".ringkas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}\n" +
  ".ringkas div{background:var(--kuning-muda);border-radius:14px;padding:10px;text-align:center}\n" +
  ".ringkas b{display:block;font-family:var(--judul);font-size:34px;color:var(--navy);line-height:1}\n" +
  ".ringkas small{font-weight:700;color:var(--redup)}\n" +
  "/* ---- penilaian bintang ---- */\n" +
  ".nilai{text-align:center}\n" +
  ".baris-bintang{display:flex;justify-content:center;gap:6px;margin:8px 0 2px}\n" +
  ".bintang{width:52px;height:52px;padding:0;border-radius:50%;font-size:34px;line-height:1;background:#EEEFF5;color:#C9CBDB;box-shadow:none}\n" +
  ".bintang.nyala{background:var(--kuning-muda);color:var(--kuning)}\n" +
  ".label-bintang{font-weight:800;color:var(--navy);margin:4px 0 8px}\n" +
  ".bintang-teks{color:var(--kuning);font-size:22px;letter-spacing:2px}\n" +
  "button:disabled{opacity:.5;cursor:not-allowed}\n" +
  "/* ---- panggung animasi di kiri & kanan nomor ---- */\n" +
  ".panggung{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:end;gap:4px}\n" +
  ".panggung .sisi{display:flex;justify-content:center;min-width:0}\n" +
  ".adegan{width:100%;max-width:110px;height:auto;overflow:visible}\n" +
  ".adegan.a-laut{overflow:hidden;border-radius:0 0 12px 12px}\n" +
  ".tiket .nomor.panjang{font-size:92px}\n" +
  ".cerita{font-size:14px;font-weight:700;color:var(--redup);margin:6px 0 10px}\n" +
  ".siap-besar .panggung{width:100%;max-width:460px;background:var(--putih);border-radius:22px;padding:10px 8px;box-shadow:0 6px 0 rgba(22,34,106,.18)}\n" +
  ".siap-besar .adegan{max-width:130px}\n" +
  "/* uap di atas nomor: bergoyang seperti asap */\n" +
  ".uap path{animation:uap 2.4s ease-in-out infinite;transform-box:fill-box;transform-origin:50% 100%}\n" +
  ".uap .u2{animation-delay:-.8s}.uap .u3{animation-delay:-1.6s}\n" +
  "@keyframes uap{0%,100%{transform:translateY(0) skewX(0);opacity:1}25%{transform:translateY(-2px) skewX(8deg)}50%{transform:translateY(-4px) skewX(-6deg);opacity:.75}75%{transform:translateY(-2px) skewX(5deg)}}\n" +
  "/* bagian tubuh */\n" +
  ".adegan .kepala,.adegan .lengan-kiri,.adegan .lengan-kanan,.adegan .koki,.adegan g{transform-box:view-box}\n" +
  "/* menunggu: membungkuk terima kasih, perahu & ombak, tiram terbang ke dapur */\n" +
  ".a-terimakasih .koki{transform-origin:40px 104px;animation:bungkuk 2.2s ease-in-out infinite}\n" +
  "@keyframes bungkuk{0%,55%,100%{transform:rotate(0)}20%,40%{transform:rotate(14deg)}}\n" +
  ".a-terimakasih .gelembung{animation:muncul 2.2s ease-in-out infinite}\n" +
  "@keyframes muncul{0%,10%{opacity:0;transform:translateY(4px)}25%,85%{opacity:1;transform:none}100%{opacity:0}}\n" +
  ".a-laut .ombak{animation:ombak 2.4s linear infinite}\n" +
  "@keyframes ombak{to{transform:translateX(40px)}}\n" +
  ".a-laut .perahu{animation:goyang 2.4s ease-in-out infinite;transform-origin:30px 96px}\n" +
  "@keyframes goyang{0%,100%{transform:rotate(-4deg) translateY(0)}50%{transform:rotate(4deg) translateY(2px)}}\n" +
  ".a-laut .tiram-terbang{animation:tiram 4s ease-in-out infinite}\n" +
  "@keyframes tiram{0%{transform:translate(38px,100px) scale(.6);opacity:0}15%{opacity:1}35%{transform:translate(38px,60px) scale(.8)}75%{transform:translate(64px,22px) scale(.7);opacity:1}85%,100%{transform:translate(66px,24px) scale(.3);opacity:0}}\n" +
  ".a-laut .asap-dapur{animation:uap 2s ease-in-out infinite}\n" +
  "/* dibakar: joget keren, keju jatuh, api menari, asap */\n" +
  ".a-joget .penari{transform-origin:40px 106px;animation:joget .8s ease-in-out infinite alternate}\n" +
  "@keyframes joget{0%{transform:rotate(-8deg) translateY(0)}50%{transform:rotate(0) translateY(-4px)}100%{transform:rotate(8deg) translateY(0)}}\n" +
  ".a-joget .lengan-kiri{animation:ayun .4s ease-in-out infinite alternate}\n" +
  "@keyframes ayun{from{transform:rotate(-15deg)}to{transform:rotate(20deg)}}\n" +
  ".a-joget .lengan-kanan{animation:tabur .6s ease-in-out infinite alternate}\n" +
  "@keyframes tabur{from{transform:rotate(0)}to{transform:rotate(-18deg)}}\n" +
  ".a-joget .keju{animation:jatuh 1.2s linear infinite;opacity:0}\n" +
  ".a-joget .k1{animation-delay:.2s}.a-joget .k2{animation-delay:.4s}.a-joget .k3{animation-delay:.6s}.a-joget .k4{animation-delay:.8s}.a-joget .k5{animation-delay:1s}\n" +
  "@keyframes jatuh{0%{transform:translateY(0);opacity:0}10%{opacity:1}100%{transform:translateY(48px);opacity:0}}\n" +
  ".a-joget .not{animation:muncul 1.6s ease-in-out infinite}\n" +
  ".a-panggang .f{transform-origin:50% 100%;transform-box:fill-box;animation:api .5s ease-in-out infinite alternate}\n" +
  ".a-panggang .f2{animation-duration:.4s}.a-panggang .f3{animation-duration:.6s}\n" +
  "@keyframes api{from{transform:scaleY(.8) skewX(-4deg)}to{transform:scaleY(1.12) skewX(4deg)}}\n" +
  ".a-panggang .asap-panggang path{animation:uap 2s ease-in-out infinite}\n" +
  "/* siap: koki memeluk makanan, cemas; anjing mengejar */\n" +
  ".a-jaga .penjaga{animation:waspada 1.8s ease-in-out infinite;transform-origin:40px 110px}\n" +
  "@keyframes waspada{0%,100%{transform:translate(0,8px) rotate(0)}30%{transform:translate(-3px,8px) rotate(-5deg)}60%{transform:translate(2px,8px) rotate(4deg)}}\n" +
  ".a-jaga .keringat{animation:keringat 1.2s ease-in infinite}\n" +
  "@keyframes keringat{0%{transform:translateY(0);opacity:1}100%{transform:translateY(8px);opacity:0}}\n" +
  ".a-jaga .pikir{animation:muncul 3s ease-in-out infinite}\n" +
  ".a-anjing .anjing{animation:lompat .35s ease-in-out infinite alternate}\n" +
  ".a-anjing .a2{animation-delay:.12s}.a-anjing .a3{animation-delay:.24s}\n" +
  "@keyframes lompat{from{translate:0 0}to{translate:0 -4px}}\n" +
  ".a-anjing .lari{animation:kejar 1.6s ease-in-out infinite alternate}\n" +
  "@keyframes kejar{from{transform:translateX(6px)}to{transform:translateX(-8px)}}\n" +
  ".a-anjing .ka{animation:langkah .2s linear infinite alternate}.a-anjing .kb{animation:langkah .2s linear infinite alternate-reverse}\n" +
  "@keyframes langkah{from{transform:translateX(-1.5px)}to{transform:translateX(1.5px)}}\n" +
  ".a-anjing .ekor{animation:ayun .15s linear infinite alternate;transform-box:fill-box;transform-origin:0 100%}\n" +
  ".a-anjing .guk{animation:muncul 1s ease-in-out infinite}\n" +
  ".a-anjing .debu circle{animation:debu 1s ease-out infinite}\n" +
  "@keyframes debu{from{opacity:.9;transform:translateX(0)}to{opacity:0;transform:translateX(10px)}}\n" +
  ".a-hati text{animation:naik 2.4s ease-in infinite;opacity:0}\n" +
  ".a-hati .h2{animation-delay:.8s}.a-hati .h3{animation-delay:1.6s}\n" +
  "@keyframes naik{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(-70px);opacity:0}}\n" +
  "@media (prefers-reduced-motion:reduce){.adegan *,.uap path,.lampu{animation:none!important}}\n" +
  "\n" +
  "/* ---- gerak ala kartun klasik: memantul, mengempis-memanjang, kepala mendongak saat gembira ---- */\n" +
  ".adegan{filter:drop-shadow(0 3px 2px rgba(22,34,106,.28))}\n" +
  ".adegan .tubuh,.adegan .bayangan,.adegan .kaki-kiri,.adegan .kaki-kanan{transform-box:view-box}\n" +
  ".adegan .tubuh{transform-origin:40px 107px;animation:napas 1.1s ease-in-out infinite}\n" +
  ".adegan .bayangan{transform-origin:40px 107px;animation:bayang-napas 1.1s ease-in-out infinite}\n" +
  "@keyframes napas{0%,100%{transform:scale(1,1)}50%{transform:scale(1.03,.97)}}\n" +
  "@keyframes bayang-napas{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}\n" +
  ".a-laut .bayangan{display:none}\n" +
  "/* menunggu: membungkuk \"makasih\" lalu melompat kecil kegirangan */\n" +
  ".a-terimakasih .koki{animation:none}\n" +
  ".a-terimakasih .tubuh{animation:makasih 2.2s cubic-bezier(.4,0,.2,1) infinite}\n" +
  "@keyframes makasih{0%{transform:scale(1,1)}12%{transform:scale(1.06,.92)}24%,40%{transform:rotate(16deg) scale(1,1)}52%{transform:scale(1.08,.9)}64%{transform:translateY(-10px) scale(.94,1.07)}76%{transform:translateY(0) scale(1.08,.92)}88%,100%{transform:scale(1,1)}}\n" +
  ".a-terimakasih .bayangan{animation:bayang-makasih 2.2s cubic-bezier(.4,0,.2,1) infinite}\n" +
  "@keyframes bayang-makasih{0%,52%,76%,100%{transform:scale(1);opacity:.22}64%{transform:scale(.6);opacity:.12}}\n" +
  ".a-terimakasih .kaki-kiri{animation:none}\n" +
  "/* dibakar: joget gembira — melompat, kepala mendongak, kaki menendang bergantian */\n" +
  ".a-joget .penari{animation:none}\n" +
  ".a-joget .tubuh{animation:joget-lompat .62s cubic-bezier(.45,0,.55,1) infinite}\n" +
  "@keyframes joget-lompat{0%,100%{transform:translateY(0) scale(1.07,.93) rotate(0)}30%{transform:translateY(-11px) scale(.94,1.07) rotate(-5deg)}50%{transform:translateY(-12px) scale(.96,1.05) rotate(0)}70%{transform:translateY(-6px) scale(.97,1.03) rotate(5deg)}}\n" +
  ".a-joget .bayangan{animation:bayang-lompat .62s cubic-bezier(.45,0,.55,1) infinite}\n" +
  "@keyframes bayang-lompat{0%,100%{transform:scale(1.1);opacity:.25}50%{transform:scale(.55);opacity:.1}}\n" +
  ".a-joget .kepala{transform-origin:40px 44px;animation:mendongak .62s ease-in-out infinite}\n" +
  "@keyframes mendongak{0%,100%{transform:rotate(0)}40%{transform:rotate(-14deg)}75%{transform:rotate(8deg)}}\n" +
  ".a-joget .kaki-kiri{animation:tendang-kiri .31s ease-in-out infinite alternate}\n" +
  ".a-joget .kaki-kanan{animation:tendang-kanan .31s ease-in-out infinite alternate}\n" +
  "@keyframes tendang-kiri{from{transform:rotate(0)}to{transform:rotate(28deg)}}\n" +
  "@keyframes tendang-kanan{from{transform:rotate(-28deg)}to{transform:rotate(0)}}\n" +
  ".a-joget .lengan-kiri{animation:ayun .31s ease-in-out infinite alternate}\n" +
  "/* siap: koki cemas memeluk makanan, melompat kecil sambil menoleh kiri-kanan */\n" +
  ".a-jaga .penjaga{animation:none}\n" +
  ".a-jaga .tubuh{animation:cemas 1.4s ease-in-out infinite}\n" +
  "@keyframes cemas{0%,100%{transform:translateX(0) scale(1,1)}15%{transform:translateX(-4px) scale(1.05,.95)}30%{transform:translate(-4px,-6px) scale(.96,1.05)}45%{transform:translateX(-4px) scale(1.04,.96)}60%{transform:translateX(4px) scale(1,1)}75%{transform:translate(4px,-5px) scale(.96,1.05)}90%{transform:translateX(4px) scale(1.04,.96)}}\n" +
  ".a-jaga .bayangan{animation:bayang-cemas 1.4s ease-in-out infinite}\n" +
  "@keyframes bayang-cemas{0%,100%,15%,45%,60%,90%{transform:scale(1)}30%,75%{transform:scale(.7)}}\n" +
  ".a-jaga .kepala{transform-origin:40px 44px;animation:menoleh 1.4s ease-in-out infinite}\n" +
  "@keyframes menoleh{0%,100%{transform:rotate(0)}20%,40%{transform:rotate(-10deg)}65%,85%{transform:rotate(10deg)}}\n" +
  ".a-jaga .kaki-kiri{animation:tendang-kiri .35s ease-in-out infinite alternate}\n" +
  ".a-jaga .kaki-kanan{animation:tendang-kanan .35s ease-in-out infinite alternate}\n" +
  "/* anjing: lari memantul dengan badan mengempis-memanjang */\n" +
  ".a-anjing .anjing{animation:none}\n" +
  ".a-anjing .anjing{transform-box:fill-box;transform-origin:50% 100%}\n" +
  ".a-anjing .anjing{animation:galop .36s ease-in-out infinite}\n" +
  "@keyframes galop{0%,100%{translate:0 0;scale:1.05 .93}50%{translate:0 -5px;scale:.95 1.06}}\n" +
  ".a-anjing .a2{animation-delay:-.12s}.a-anjing .a3{animation-delay:-.24s}\n" +
  "/* selamat makan: lompat-lompat gembira */\n" +
  "@media (prefers-reduced-motion:reduce){.adegan .tubuh,.adegan .bayangan,.adegan .kepala,.adegan .kaki-kiri,.adegan .kaki-kanan,.a-anjing .anjing{animation:none!important}}\n" +
  "</style>";
var HTML_KASIR =
  "<header><img src=\"__ASET__logo-putih.png\" alt=\"Cheesy Pen Shells\"><div class=\"merek\"><b>KASIR ANTRIAN</b><small>Cheesy Pen Shells</small></div><span id=\"ev\" class=\"kanan\"></span></header>\n" +
  "<main>\n" +
  "<div id=\"masuk\" class=\"kartu\"><label for=\"pin\">PIN kasir</label><input id=\"pin\" type=\"password\" inputmode=\"numeric\"><br><br><button onclick=\"masuk()\">Masuk</button><p id=\"salah\" style=\"color:var(--merah)\"></p></div>\n" +
  "<div id=\"isi\" style=\"display:none\">\n" +
  "<div class=\"kartu\">\n" +
  "<label for=\"event\">Event</label><select id=\"event\" onchange=\"gantiEvent()\"></select>\n" +
  "<div id=\"sesiBox\"></div>\n" +
  "<p id=\"proses\" class=\"redup\"></p><p id=\"sinkron\" class=\"redup\" style=\"margin:0\"></p>\n" +
  "</div>\n" +
  "<div class=\"kolom\"><div><h3>⏳ Menunggu</h3><div id=\"k-MENUNGGU\"></div></div><div><h3>🔥 Dibakar</h3><div id=\"k-DIBAKAR\"></div></div><div><h3>✅ Siap / dipanggil</h3><div id=\"k-SIAP\"></div></div></div>\n" +
  "</div>\n" +
  "</main>\n" +
  "<div id=\"modal\"></div><input id=\"fotoBakar\" type=\"file\" accept=\"image/*\" capture=\"environment\" style=\"display:none\">\n" +
  "<script src=\"https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js\"></script>\n" +
  "<script>\n" +
  "var KUNCI = \"__K__\", EVLINK = \"__E__\";\n" +
  "// Penyimpanan browser bisa ditolak (mode samaran, dsb.): halaman tetap jalan tanpa mengingat PIN/event.\n" +
  "function ambil(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }\n" +
  "function simpan(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }\n" +
  "function hapus(k) { try { localStorage.removeItem(k); } catch (e) { } }\n" +
  "var PIN = KUNCI || ambil(\"cps_pin\") || \"\";\n" +
  "var data = [], sesi = null, saranKasir = {}, tandaSesi = \"\", events = [];\n" +
  "if (EVLINK) simpan(\"cps_ev\", EVLINK);\n" +
  "\n" +
  "function el(i) { return document.getElementById(i); }\n" +
  "function aman(s) { return String(s || \"\").replace(/[&<>\"]/g, function (c) { return { \"&\": \"&amp;\", \"<\": \"&lt;\", \">\": \"&gt;\", \"\\\"\": \"&quot;\" }[c]; }); }\n" +
  "function jamDari(waktu) { return String(waktu || \"\").slice(11, 16); }\n" +
  "function pesan(t) { el(\"proses\").textContent = t; if (t) setTimeout(function () { if (el(\"proses\").textContent === t) el(\"proses\").textContent = \"\"; }, 7000); }\n" +
  "\n" +
  "function kecilkan(file, cb) {\n" +
  "  var r = new FileReader();\n" +
  "  r.onload = function () {\n" +
  "    var g = new Image();\n" +
  "    g.onload = function () {\n" +
  "      var m = 1280, s = Math.min(1, m / Math.max(g.width, g.height));\n" +
  "      var c = document.createElement(\"canvas\"); c.width = g.width * s; c.height = g.height * s;\n" +
  "      c.getContext(\"2d\").drawImage(g, 0, 0, c.width, c.height);\n" +
  "      cb(c.toDataURL(\"image/jpeg\", 0.72));\n" +
  "    };\n" +
  "    g.src = r.result;\n" +
  "  };\n" +
  "  r.readAsDataURL(file);\n" +
  "}\n" +
  "\n" +
  "function masuk() {\n" +
  "  var p = el(\"pin\").value || PIN;\n" +
  "  google.script.run.withSuccessHandler(function (r) {\n" +
  "    PIN = p; simpan(\"cps_pin\", p);\n" +
  "    el(\"masuk\").style.display = \"none\"; el(\"isi\").style.display = \"\";\n" +
  "    events = r.events;\n" +
  "    r.events.forEach(function (e) { saranKasir[e.kode] = e.kasir || \"\"; });\n" +
  "    var s = el(\"event\");\n" +
  "    s.innerHTML = r.events.map(function (e) { return \"<option value=\\\"\" + e.kode + \"\\\">\" + e.kode + \" – \" + e.kota + \"</option>\"; }).join(\"\");\n" +
  "    var ingat = ambil(\"cps_ev\") || EVLINK; if (ingat) s.value = ingat;\n" +
  "    muat(); setInterval(muat, 4000);\n" +
  "  }).withFailureHandler(function (e) { el(\"salah\").textContent = e.message; hapus(\"cps_pin\"); }).kasirMasuk(p);\n" +
  "}\n" +
  "function kode() { var k = el(\"event\").value; simpan(\"cps_ev\", k); el(\"ev\").textContent = k; return k; }\n" +
  "function gantiEvent() { tandaSesi = \"\"; muat(); }\n" +
  "function muat() { google.script.run.withSuccessHandler(tampil).daftarAntrian(PIN, kode()); }\n" +
  "\n" +
  "// ---- sesi kasir: mulai / ganti kasir / tutup ----\n" +
  "function gambarSesi() {\n" +
  "  var tanda = sesi ? sesi.id + \"|\" + sesi.kasir : \"tutup|\" + kode();\n" +
  "  if (tanda !== tandaSesi) {\n" +
  "    tandaSesi = tanda;\n" +
  "    el(\"sesiBox\").innerHTML = sesi\n" +
  "      ? \"<div class=\\\"sesi buka\\\"><div><span class=lampu></span><b>Kasir buka</b> sejak \" + jamDari(sesi.dibuka) + \" · kasir <b>\" + aman(sesi.kasir) + \"</b></div>\" +\n" +
  "        \"<div class=redup id=statSesi></div>\" +\n" +
  "        \"<label class=\\\"tombol kuning\\\" style=\\\"text-align:center;margin-top:12px\\\">📷 Pesanan baru – foto struk<input id=struk type=file accept=\\\"image/*\\\" capture=environment style=\\\"display:none\\\" onchange=\\\"pesananBaru(this)\\\"></label>\" +\n" +
  "        \"<div class=aksi><button class=\\\"kecil abu\\\" onclick=\\\"gantiKasirUI()\\\">👤 Ganti kasir</button><button class=\\\"kecil merah\\\" onclick=\\\"tutupKasirUI()\\\">⏹ Tutup kasir</button></div></div>\"\n" +
  "      : \"<div class=\\\"sesi tutup\\\"><b>Kasir belum dibuka</b><p class=redup style=\\\"margin:4px 0 0\\\">Tekan <b>Mulai kasir</b> sebelum melayani pelanggan pertama. Nomor antrian berlanjut selama event dan mulai dari 1 lagi di event berikutnya.</p>\" +\n" +
  "        \"<label for=namaKasir>Nama kasir</label><input id=namaKasir value=\\\"\" + aman(saranKasir[kode()] || \"\") + \"\\\" placeholder=\\\"Contoh: Tiara\\\">\" +\n" +
  "        \"<button class=kuning style=\\\"margin-top:12px\\\" onclick=\\\"mulaiKasir()\\\">▶ Mulai kasir</button></div>\";\n" +
  "  }\n" +
  "  if (sesi && el(\"statSesi\")) {\n" +
  "    var n = function (st) { return data.filter(function (o) { return o.status === st; }).length; };\n" +
  "    el(\"statSesi\").textContent = sesi.jumlah + \" struk dilayani · \" + n(\"MENUNGGU\") + \" menunggu · \" + n(\"DIBAKAR\") + \" dibakar · \" + n(\"SIAP\") + \" dipanggil\";\n" +
  "  }\n" +
  "}\n" +
  "function mulaiKasir() {\n" +
  "  var nama = el(\"namaKasir\").value.trim();\n" +
  "  if (!nama) { pesan(\"Isi nama kasir dulu.\"); return; }\n" +
  "  pesan(\"Membuka kasir...\");\n" +
  "  google.script.run.withSuccessHandler(function () { pesan(\"\"); muat(); }).withFailureHandler(function (e) { pesan(\"⚠️ \" + e.message); }).mulaiKasir(PIN, kode(), nama);\n" +
  "}\n" +
  "function gantiKasirUI() {\n" +
  "  el(\"modal\").innerHTML = \"<div class=modal onclick=\\\"if(event.target===this)tutup()\\\"><div class=kartu><h3>Ganti kasir</h3><p class=redup>Pesanan berikutnya tercatat atas nama kasir baru (untuk penilaian bintang).</p><label for=kasirBaru>Nama kasir baru</label><input id=kasirBaru><br><br><button class=kuning onclick=\\\"gantiKasir()\\\">Simpan</button><br><button class=abu onclick=\\\"tutup()\\\">Batal</button></div></div>\";\n" +
  "  el(\"kasirBaru\").focus();\n" +
  "}\n" +
  "function gantiKasir() {\n" +
  "  var nama = el(\"kasirBaru\").value.trim(); if (!nama) return;\n" +
  "  google.script.run.withSuccessHandler(function () { tutup(); muat(); }).withFailureHandler(function (e) { tutup(); pesan(\"⚠️ \" + e.message); }).gantiKasir(PIN, kode(), nama);\n" +
  "}\n" +
  "function tutupKasirUI() {\n" +
  "  var belum = data.length;\n" +
  "  el(\"modal\").innerHTML = \"<div class=modal onclick=\\\"if(event.target===this)tutup()\\\"><div class=kartu><h3>Tutup kasir?</h3>\" +\n" +
  "    (belum ? \"<p>⚠️ Masih ada <b>\" + belum + \" pesanan</b> yang belum diambil. Pesanan itu tetap tampil dan bisa diselesaikan setelah kasir ditutup.</p>\" : \"<p>Semua pesanan sudah selesai.</p>\") +\n" +
  "    \"<p class=redup>Ringkasan sesi ini ditampilkan dan dikirim ke WhatsApp owner.</p><button class=merah onclick=\\\"tutupKasir()\\\">⏹ Ya, tutup kasir</button><br><button class=abu onclick=\\\"tutup()\\\">Batal</button></div></div>\";\n" +
  "}\n" +
  "function tutupKasir() {\n" +
  "  el(\"modal\").innerHTML = \"<div class=modal><div class=kartu><p>Menutup kasir & menghitung ringkasan...</p></div></div>\";\n" +
  "  google.script.run.withSuccessHandler(function (r) { tampilRingkasan(r); muat(); }).withFailureHandler(function (e) { tutup(); pesan(\"⚠️ \" + e.message); muat(); }).tutupKasir(PIN, kode());\n" +
  "}\n" +
  "function tampilRingkasan(r) {\n" +
  "  var bintang = r.jumlah_rating ? \"⭐ \" + String(r.rating_rata).replace(\".\", \",\") + \" dari \" + r.jumlah_rating + \" penilaian\" : \"Belum ada penilaian bintang\";\n" +
  "  el(\"modal\").innerHTML = \"<div class=modal onclick=\\\"if(event.target===this)tutup()\\\"><div class=kartu><h2 class=judul><span>Kasir ditutup</span></h2>\" +\n" +
  "    \"<p class=redup>\" + aman(r.kode_event) + \" · \" + jamDari(r.dibuka) + \"–\" + jamDari(r.ditutup) + \" · kasir \" + aman(r.kasir) + \"</p>\" +\n" +
  "    \"<div class=ringkas><div><b>\" + r.jumlah_struk + \"</b><small>struk dilayani</small></div><div><b>\" + r.diambil + \"</b><small>sudah diambil</small></div><div><b>\" + r.batal + \"</b><small>batal</small></div><div><b>\" + (r.rata_tunggu_menit || \"–\") + \"</b><small>menit rata-rata tunggu</small></div></div>\" +\n" +
  "    \"<p><b>\" + bintang + \"</b>\" + (r.rating_kasir ? \"<br><span class=redup>\" + aman(r.rating_kasir) + \"</span>\" : \"\") + \"</p>\" +\n" +
  "    (r.belum ? \"<p>⚠️ \" + r.belum + \" pesanan belum diambil saat ditutup.</p>\" : \"\") +\n" +
  "    (r.ulasan_buruk ? \"<p class=redup>Ulasan bintang rendah:<br>\" + aman(r.ulasan_buruk).replace(/\\n/g, \"<br>\") + \"</p>\" : \"\") +\n" +
  "    \"<button onclick=\\\"tutup()\\\">Selesai</button></div></div>\";\n" +
  "}\n" +
  "\n" +
  "// ---- daftar pesanan ----\n" +
  "function tampil(d) {\n" +
  "  data = d.pesanan || []; sesi = d.sesi || null;\n" +
  "  var j = new Date();\n" +
  "  el(\"sinkron\").textContent = \"🔄 Tersinkron \" + (\"0\" + j.getHours()).slice(-2) + \":\" + (\"0\" + j.getMinutes()).slice(-2) + \":\" + (\"0\" + j.getSeconds()).slice(-2) + \" · boleh dibuka di beberapa HP sekaligus\";\n" +
  "  gambarSesi();\n" +
  "  [\"MENUNGGU\", \"DIBAKAR\", \"SIAP\"].forEach(function (st) {\n" +
  "    el(\"k-\" + st).innerHTML = data.filter(function (o) { return o.status === st; }).map(kartu).join(\"\") || \"<p class=redup>–</p>\";\n" +
  "  });\n" +
  "}\n" +
  "function kartu(o) {\n" +
  "  var a = \"\";\n" +
  "  if (o.status === \"MENUNGGU\") a = \"<button class=\\\"kecil\\\" onclick=\\\"bakar('\" + o.id + \"')\\\">📷 Foto & mulai bakar</button><button class=\\\"kecil abu\\\" onclick=\\\"status('\" + o.id + \"','DIBAKAR')\\\">Bakar tanpa foto</button>\";\n" +
  "  if (o.status === \"DIBAKAR\") a = \"<button class=\\\"kecil hijau\\\" onclick=\\\"status('\" + o.id + \"','SIAP')\\\">🔔 Panggil</button>\";\n" +
  "  if (o.status === \"SIAP\") a = \"<button class=\\\"kecil biru\\\" onclick=\\\"status('\" + o.id + \"','SIAP')\\\">🔔 Panggil ulang (\" + o.panggilKe + \"x)</button><button class=\\\"kecil hijau\\\" onclick=\\\"status('\" + o.id + \"','DIAMBIL')\\\">✓ Sudah diambil</button>\";\n" +
  "  return \"<div class=\\\"pesanan \" + o.status + \"\\\"><img src=\\\"\" + (o.fotoBakar || o.fotoStruk) + \"\\\" onclick=\\\"lihat('\" + o.id + \"')\\\" alt=\\\"\\\"><div class=no>#\" + o.nomor + \"</div><div class=redup>\" + o.dibuat + \"</div><div style=\\\"white-space:pre-line\\\">\" + (aman(o.menu) || \"<i class=redup>menu: lihat struk</i>\") + \"</div><div class=aksi>\" + a + \"<button class=\\\"kecil abu\\\" onclick=\\\"lihat('\" + o.id + \"')\\\">QR / detail</button></div></div>\";\n" +
  "}\n" +
  "function cari(id) { return data.filter(function (o) { return o.id === id; })[0]; }\n" +
  "function pesananBaru(inp) {\n" +
  "  var f = inp.files[0]; inp.value = \"\"; if (!f) return;\n" +
  "  el(\"proses\").textContent = \"Menyimpan struk & membuat nomor antrian...\";\n" +
  "  kecilkan(f, function (u) {\n" +
  "    google.script.run.withSuccessHandler(function (o) { el(\"proses\").textContent = \"\"; data.push(o); lihat(o.id, o); muat(); })\n" +
  "      .withFailureHandler(function (e) { pesan(\"Gagal: \" + e.message); muat(); }).buatPesanan(PIN, kode(), u);\n" +
  "  });\n" +
  "}\n" +
  "function lihat(id, o) {\n" +
  "  o = o || cari(id); if (!o) return;\n" +
  "  el(\"modal\").innerHTML = \"<div class=modal onclick=\\\"if(event.target===this)tutup()\\\"><div class=kartu><div class=redup style=\\\"text-align:center\\\">Nomor antrian</div><div class=nomor>#\" + o.nomor + \"</div><p style=\\\"text-align:center\\\">Minta pelanggan <b>scan QR ini</b> untuk melihat pesanannya:</p><div id=qr style=\\\"display:flex;justify-content:center;margin:10px 0\\\"></div><label for=menuEdit>Menu (dari struk, bisa diperbaiki)</label><textarea id=menuEdit rows=4>\" + aman(o.menu) + \"</textarea><br><br><button class=\\\"kecil hijau\\\" onclick=\\\"simpanMenu('\" + o.id + \"')\\\">Simpan menu</button> <button class=\\\"kecil merah\\\" onclick=\\\"if(confirm('Batalkan pesanan #\" + o.nomor + \"?'))status('\" + o.id + \"','BATAL')\\\">Batalkan</button><br><br><img class=foto src=\\\"\" + o.fotoStruk + \"\\\" alt=\\\"Struk\\\">\" + (o.fotoBakar ? \"<br><img class=foto src=\\\"\" + o.fotoBakar + \"\\\" alt=\\\"Foto dibakar\\\">\" : \"\") + \"<br><button onclick=\\\"tutup()\\\">Tutup</button></div></div>\";\n" +
  "  var q = qrcode(0, \"L\"); q.addData(o.link); q.make();\n" +
  "  el(\"qr\").innerHTML = q.createSvgTag({ cellSize: 5, margin: 4, scalable: true }).replace(\"<svg \", \"<svg style=\\\"width:min(86vw,380px);height:auto;background:#fff\\\" \");\n" +
  "}\n" +
  "function tutup() { el(\"modal\").innerHTML = \"\"; }\n" +
  "function simpanMenu(id) { google.script.run.withSuccessHandler(function () { tutup(); muat(); }).ubahMenu(PIN, id, el(\"menuEdit\").value); }\n" +
  "function status(id, st, foto) {\n" +
  "  google.script.run.withSuccessHandler(function () { tutup(); muat(); })\n" +
  "    .withFailureHandler(function (e) { tutup(); pesan(\"⚠️ \" + e.message); muat(); }).ubahStatus(PIN, id, st, foto || \"\");\n" +
  "}\n" +
  "function bakar(id) {\n" +
  "  var i = el(\"fotoBakar\");\n" +
  "  i.onchange = function () {\n" +
  "    var f = i.files[0]; i.value = \"\"; if (!f) return;\n" +
  "    el(\"proses\").textContent = \"Menyimpan foto pesanan...\";\n" +
  "    kecilkan(f, function (u) { el(\"proses\").textContent = \"\"; status(id, \"DIBAKAR\", u); });\n" +
  "  };\n" +
  "  i.click();\n" +
  "}\n" +
  "if (PIN) { el(\"pin\").value = PIN; masuk(); }\n" +
  "</script>";
// Halaman pelanggan: dipakai juga untuk GitHub Pages (docs/antrian, lihat scripts/halaman-pelanggan.mjs).
var BADAN_PESANAN =
  "<header class=\"kepala\"><img src=\"__ASET__logo-putih.png\" alt=\"Cheesy Pen Shells\"><div class=\"merek\"><b>CHEESY PEN SHELLS</b><small>oyster bakar favoritmu</small></div></header>\n" +
  "<main><div class=\"ajak\" id=\"bunyi\"><button onclick=\"aktifkan()\">🔔 Ketuk untuk aktifkan bunyi &amp; getar</button><p>Wajib diketuk sekali. Biarkan halaman ini terbuka: saat oyster kamu siap, HP berbunyi dan bergetar.</p></div><div id=\"tiketBox\"><section class=\"tiket\"><div class=\"label\">Nomor antrian kamu</div><p class=\"redup\">Memuat pesanan...</p></section></div>\n" +
  "<div id=\"nilai\"></div>\n" +
  "<div id=\"isi\"></div><section class=\"kartu\"><h2 class=\"judul\"><span>Sambil nunggu</span></h2><p class=\"skrip\">Intip menu andalan kami!</p><div class=\"geser\"><figure><img src=\"__ASET__menu-garlic.jpg\" alt=\"Oyster bakar garlic\" loading=\"lazy\"><figcaption>Garlic <em>15K/pcs</em></figcaption></figure><figure><img src=\"__ASET__menu-mozzarella.jpg\" alt=\"Oyster bakar mozzarella\" loading=\"lazy\"><figcaption>Mozzarella <em>20K/pcs</em></figcaption></figure><figure><img src=\"__ASET__menu-seafood.jpg\" alt=\"Oyster bakar seafood mix\" loading=\"lazy\"><figcaption>Seafood Mix <em>25K/pcs</em></figcaption></figure><figure><img src=\"__ASET__fresh-oyster.jpg\" alt=\"Fresh oyster dengan lemon\" loading=\"lazy\"><figcaption>Fresh Oyster <em>+ lemon</em></figcaption></figure></div></section>\n" +
  "<section class=\"kartu tepok\"><h2 class=\"judul\"><span>Tepok 3x!</span></h2><p class=\"skrip\">Cara seru ala Cheesy Pen Shells</p><img class=\"poster\" src=\"__ASET__tepok-3x.jpg\" alt=\"Poster Tepok 3x, kami besarin apinya\" loading=\"lazy\"><ol class=\"cara\"><li><span><b>Siapkan kamera</b> saat oyster kamu mulai dibakar.</span></li><li><span><b>Tepuk tangan 3 kali</b> di depan booth.</span></li><li><span><b>Apinya kami besarin!</b> Rekam momen apinya membesar.</span></li><li><span><b>Upload &amp; tag @cheesypenshells</b> di sosial media kamu. Kami otomatis follow back!</span></li></ol></section>\n" +
  "<a class=\"ig\" href=\"https://www.instagram.com/cheesypenshells/\" target=\"_blank\" rel=\"noopener\"><svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" aria-hidden=\"true\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"5\"/><circle cx=\"12\" cy=\"12\" r=\"4\"/><circle cx=\"17.5\" cy=\"6.5\" r=\"1.2\" fill=\"currentColor\" stroke=\"none\"/></svg><span><small>Follow kami di Instagram</small><b>@cheesypenshells</b></span><em>Buka</em></a><footer class=\"kaki\"><span class=\"tagar\">#cheesypenshellslovers</span><a id=\"komplainLink\" href=\"#\" target=\"_top\">Ada keluhan? Sampaikan di sini</a></footer></main><div id=\"siap\"></div>";
var JS_PESANAN =
  "// Animasi koki Cheesy Pen Shells di kiri & kanan nomor antrian (SVG + CSS, tanpa gambar tambahan).\n" +
  "// Koki: baju koki lengan panjang biru dengan logo Cheesy Pen Shells di saku kiri, celana kuning,\n" +
  "// topi bergaris kuning-biru, kulit putih.\n" +
  "var WARNA = { navy: \"#22348C\", navyTua: \"#16226A\", kuning: \"#F6B800\", kulit: \"#FBE3D3\", pipi: \"#F4A7A0\", putih: \"#FFFFFF\", sepatu: \"#2B2B2B\", laut: \"#5DA9E9\", lautTua: \"#2F6FB2\" };\n" +
  "\n" +
  "// Gradien & kilap untuk efek 3D (dipakai semua adegan; id sama di tiap SVG, isinya identik).\n" +
  "var DEFS = \"<defs>\" +\n" +
  "  \"<radialGradient id='cps-kulit' cx='.35' cy='.3' r='.75'><stop offset='0' stop-color='#FFF4EC'/><stop offset='.6' stop-color='#FBE0CF'/><stop offset='1' stop-color='#E9BFA6'/></radialGradient>\" +\n" +
  "  \"<linearGradient id='cps-baju' x1='0' x2='1'><stop offset='0' stop-color='#3550C2'/><stop offset='.45' stop-color='#22348C'/><stop offset='1' stop-color='#121C58'/></linearGradient>\" +\n" +
  "  \"<linearGradient id='cps-lengan' x1='0' x2='1'><stop offset='0' stop-color='#3A56C8'/><stop offset='1' stop-color='#17246A'/></linearGradient>\" +\n" +
  "  \"<linearGradient id='cps-celana' x1='0' x2='1'><stop offset='0' stop-color='#FFE07A'/><stop offset='.5' stop-color='#F6B800'/><stop offset='1' stop-color='#C98E00'/></linearGradient>\" +\n" +
  "  \"<linearGradient id='cps-kilap' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.55'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></linearGradient>\" +\n" +
  "  \"<radialGradient id='cps-cangkang' cx='.4' cy='.35' r='.8'><stop offset='0' stop-color='#B8A897'/><stop offset='1' stop-color='#6E5E4F'/></radialGradient>\" +\n" +
  "  \"<radialGradient id='cps-anjing' cx='.35' cy='.3' r='.8'><stop offset='0' stop-color='#C99260'/><stop offset='1' stop-color='#7E5328'/></radialGradient>\" +\n" +
  "  \"<linearGradient id='cps-api' x1='0' y1='1' x2='0' y2='0'><stop offset='0' stop-color='#E2470F'/><stop offset='.6' stop-color='#F6B800'/><stop offset='1' stop-color='#FFE9A0'/></linearGradient>\" +\n" +
  "  \"<linearGradient id='cps-besi' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#3A4FB8'/><stop offset='1' stop-color='#121C58'/></linearGradient>\" +\n" +
  "  \"</defs>\";\n" +
  "\n" +
  "// Topi bergaris kuning-biru.\n" +
  "function topiKoki() {\n" +
  "  return \"<g class=topi><rect x=27 y=8 width=26 height=14 rx=7 fill='\" + WARNA.kuning + \"'/>\" +\n" +
  "    \"<rect x=31 y=8 width=4 height=14 fill='\" + WARNA.navy + \"'/><rect x=39 y=8 width=4 height=14 fill='\" + WARNA.navy + \"'/><rect x=47 y=8 width=4 height=14 fill='\" + WARNA.navy + \"'/>\" +\n" +
  "    \"<rect x=27 y=8 width=26 height=7 rx=3.5 fill='url(#cps-kilap)'/>\" +\n" +
  "    \"<rect x=28 y=20 width=24 height=6 rx=2 fill='\" + WARNA.navy + \"'/><rect x=28 y=22 width=24 height=2 fill='\" + WARNA.kuning + \"'/></g>\";\n" +
  "}\n" +
  "// Kepala; gaya: senyum | kacamata | cemas | bungkuk\n" +
  "function kepalaKoki(gaya) {\n" +
  "  var muka = \"<rect x=37 y=41 width=6 height=6 fill='#E2B39A'/><circle cx=40 cy=34 r=10 fill='url(#cps-kulit)'/><ellipse cx=36.5 cy=29.5 rx=3 ry=1.8 fill='#fff' opacity='.5'/>\" +\n" +
  "    \"<circle cx=35 cy=37 r=2 fill='\" + WARNA.pipi + \"' opacity='.7'/><circle cx=45 cy=37 r=2 fill='\" + WARNA.pipi + \"' opacity='.7'/>\";\n" +
  "  if (gaya === \"kacamata\") muka += \"<rect x=32 y=30 width=7 height=4 rx=1.5 fill='#111'/><rect x=41 y=30 width=7 height=4 rx=1.5 fill='#111'/><rect x=38.5 y=31 width=3 height=1 fill='#111'/><path d='M36 39 q4 3 8 0' stroke='#7A3B2E' stroke-width=1.5 fill=none stroke-linecap='round'/>\";\n" +
  "  else if (gaya === \"cemas\") muka += \"<circle cx=36 cy=32 r=1.3 fill='#222'/><circle cx=44 cy=32 r=1.3 fill='#222'/><path d='M33 29 l4 1 M47 29 l-4 1' stroke='#222' stroke-width=1.2 stroke-linecap='round'/><path d='M37 39 q3 -2 6 0' stroke='#7A3B2E' stroke-width=1.5 fill=none stroke-linecap='round'/><path class=keringat d='M51 28 q2 3 0 5 q-2 -2 0 -5z' fill='#7EC8F2'/>\";\n" +
  "  else muka += \"<path d='M34 32 q2 -2 4 0 M42 32 q2 -2 4 0' stroke='#222' stroke-width=1.3 fill=none stroke-linecap='round'/><path d='M35 38 q5 4 10 0' stroke='#7A3B2E' stroke-width=1.6 fill=none stroke-linecap='round'/>\";\n" +
  "  return \"<g class=kepala>\" + muka + topiKoki() + \"</g>\";\n" +
  "}\n" +
  "// Badan: baju koki biru lengan panjang + logo di saku kiri (kanan gambar), celana kuning.\n" +
  "function badanKoki() {\n" +
  "  return \"<g class=kaki-kiri style='transform-origin:35px 84px'><rect x=31 y=82 width=8 height=22 rx=3 fill='url(#cps-celana)'/><rect x=29 y=102 width=11 height=5 rx=2.5 fill='\" + WARNA.sepatu + \"'/><rect x=30 y=102.5 width=6 height=1.5 rx=.75 fill='#fff' opacity='.35'/></g>\" +\n" +
  "    \"<g class=kaki-kanan style='transform-origin:45px 84px'><rect x=41 y=82 width=8 height=22 rx=3 fill='url(#cps-celana)'/><rect x=40 y=102 width=11 height=5 rx=2.5 fill='\" + WARNA.sepatu + \"'/><rect x=41 y=102.5 width=6 height=1.5 rx=.75 fill='#fff' opacity='.35'/></g>\" +\n" +
  "    \"<path d='M27 48 q13 -6 26 0 l2 36 h-30z' fill='url(#cps-baju)'/>\" +\n" +
  "    \"<path d='M29 50 q6 -3 11 -3 l-1 30 h-11z' fill='url(#cps-kilap)' opacity='.6'/>\" +\n" +
  "    \"<path d='M36 45 l4 6 l4 -6' fill='\" + WARNA.putih + \"'/>\" +\n" +
  "    \"<circle cx=37 cy=58 r=1.4 fill='\" + WARNA.putih + \"'/><circle cx=37 cy=66 r=1.4 fill='\" + WARNA.putih + \"'/><circle cx=37 cy=74 r=1.4 fill='\" + WARNA.putih + \"'/>\" +\n" +
  "    \"<rect x=43 y=55 width=9 height=8 rx=1.5 fill='\" + WARNA.navyTua + \"'/>\" +\n" +
  "    \"<path d='M47.5 61.5 c-3 -2 -3.5 -4 -1.8 -4.6 c.8 -.3 1.5 .2 1.8 .8 c.3 -.6 1 -1.1 1.8 -.8 c1.7 .6 1.2 2.6 -1.8 4.6z' fill='\" + WARNA.kuning + \"'/>\";\n" +
  "}\n" +
  "function lengan(kelas, x, rot, tangan) {\n" +
  "  return \"<g class='\" + kelas + \"' style='transform-origin:\" + x + \"px 52px'><g transform='rotate(\" + rot + \" \" + x + \" 52)'>\" +\n" +
  "    \"<rect x=\" + (x - 3.5) + \" y=50 width=7 height=24 rx=3.5 fill='url(#cps-lengan)'/><circle cx=\" + x + \" cy=75 r=3.6 fill='url(#cps-kulit)'/>\" + (tangan || \"\") + \"</g></g>\";\n" +
  "}\n" +
  "function koki(gaya, isi) {\n" +
  "  return \"<g class=koki><ellipse class=bayangan cx=40 cy=107 rx=15 ry=3 fill='#16226A' opacity='.22'/><g class=tubuh>\" + badanKoki() + (isi && isi.belakang || \"\") + lengan(\"lengan-kiri\", 28, isi && isi.rotKiri || 10, isi && isi.tanganKiri) +\n" +
  "    lengan(\"lengan-kanan\", 52, isi && isi.rotKanan || -10, isi && isi.tanganKanan) + kepalaKoki(gaya) + (isi && isi.depan || \"\") + \"</g></g>\";\n" +
  "}\n" +
  "function oyster(x, y, keju) {\n" +
  "  return \"<g transform='translate(\" + x + \" \" + y + \")'><ellipse cx=0 cy=1.5 rx=11 ry=4 fill='#000' opacity='.12'/><ellipse cx=0 cy=0 rx=11 ry=5 fill='url(#cps-cangkang)'/><ellipse cx=0 cy=-1 rx=8.5 ry=3.4 fill='\" + (keju ? \"#FFD66B\" : \"#EDE3D6\") + \"'/>\" +\n" +
  "    (keju ? \"<circle cx=-3 cy=-1.5 r=1.2 fill='#E8962E'/><circle cx=3 cy=-.5 r=1 fill='#E8962E'/>\" : \"\") + \"</g>\";\n" +
  "}\n" +
  "function svg(kelas, isi) { return \"<svg class='adegan \" + kelas + \"' viewBox='0 0 80 120' aria-hidden='true'>\" + DEFS + isi + \"</svg>\"; }\n" +
  "\n" +
  "// ---------- adegan per status ----------\n" +
  "var ADEGAN = {\n" +
  "  MENUNGGU: function () {\n" +
  "    return [\n" +
  "      // kiri: koki membungkuk berterima kasih\n" +
  "      svg(\"a-terimakasih\", \"<g class=gelembung><rect x=2 y=0 width=46 height=15 rx=7 fill='\" + WARNA.putih + \"' stroke='\" + WARNA.navy + \"' stroke-width='1.5'/><path d='M30 14 l4 5 l1 -5z' fill='\" + WARNA.putih + \"' stroke='\" + WARNA.navy + \"' stroke-width='1.2'/><text x=25 y=10.5 text-anchor=middle font-size=8 font-weight=800 fill='\" + WARNA.navy + \"' font-family='Nunito,sans-serif'>Makasih!</text></g>\" +\n" +
  "        \"<g transform='translate(0 8)'>\" + koki(\"senyum\", { rotKiri: 35, rotKanan: -35 }) + \"</g>\"),\n" +
  "      // kanan: koki di perahu menangkap tiram, lalu dibawa ke dapur\n" +
  "      svg(\"a-laut\", \"<g class=dapur><rect x=56 y=12 width=20 height=16 fill='\" + WARNA.putih + \"' stroke='\" + WARNA.navy + \"' stroke-width='1.5'/><path d='M53 13 l13 -9 l13 9z' fill='\" + WARNA.kuning + \"' stroke='\" + WARNA.navy + \"' stroke-width='1.5'/><rect x=63 y=19 width=6 height=9 fill='\" + WARNA.navy + \"'/><path class=asap-dapur d='M72 4 q-3 -3 0 -6' stroke='#9AA0C3' stroke-width=1.5 fill='none'/></g>\" +\n" +
  "        \"<g class=tiram-terbang>\" + oyster(0, 0) + \"</g>\" +\n" +
  "        \"<g class=perahu><g transform='translate(-8 22) scale(.62)'>\" + koki(\"senyum\", { rotKiri: 10, rotKanan: -60, tanganKanan: \"<path d='M52 75 L74 30' stroke='#7A4B2A' stroke-width='2.5'/><path class=tali d='M74 30 L74 92' stroke='#555' stroke-width=1 stroke-dasharray='2 2'/>\" }) + \"</g>\" +\n" +
  "        \"<path d='M8 92 h44 l-6 10 h-32z' fill='#B5642D'/><rect x=8 y=89 width=44 height=4 fill='\" + WARNA.kuning + \"'/></g>\" +\n" +
  "        \"<g class=ombak><path d='M-40 100 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 v20 h-140z' fill='\" + WARNA.laut + \"'/><path d='M-40 106 q10 -5 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 v20 h-140z' fill='\" + WARNA.lautTua + \"'/></g>\")\n" +
  "    ];\n" +
  "  },\n" +
  "  DIBAKAR: function () {\n" +
  "    var keju = \"\";\n" +
  "    for (var i = 0; i < 6; i++) keju += \"<rect class='keju k\" + i + \"' x=\" + (54 + i * 3) + \" y=58 width=2.4 height=2.4 fill='\" + WARNA.kuning + \"'/>\";\n" +
  "    return [\n" +
  "      // kiri: koki berkacamata joget sambil menabur keju\n" +
  "      svg(\"a-joget\", \"<g class=not><text x=6 y=16 font-size=12 fill='\" + WARNA.navy + \"'>♪</text><text x=62 y=10 font-size=10 fill='\" + WARNA.kuning + \"'>♫</text></g>\" +\n" +
  "        \"<g class=penari>\" + koki(\"kacamata\", { rotKiri: 140, rotKanan: -100, tanganKanan: \"<rect x=47 y=74 width=9 height=12 rx=2 fill='\" + WARNA.putih + \"' stroke='\" + WARNA.navy + \"' stroke-width='1.2'/><rect x=47 y=74 width=9 height=4 rx=1 fill='\" + WARNA.kuning + \"'/>\" }) + \"</g>\" + keju + oyster(62, 112, true)),\n" +
  "      // kanan: oyster di pemanggang, api menari, asap naik\n" +
  "      svg(\"a-panggang\", \"<g class=asap-panggang><path d='M28 40 q-6 -8 0 -16 q6 -8 0 -16' stroke='#B9BDD6' stroke-width=3 fill=none stroke-linecap='round'/><path d='M50 44 q-6 -8 0 -16 q6 -8 0 -16' stroke='#B9BDD6' stroke-width=3 fill=none stroke-linecap='round'/></g>\" +\n" +
  "        oyster(26, 70, true) + oyster(52, 70, true) +\n" +
  "        \"<rect x=8 y=74 width=64 height=4 rx=2 fill='#555'/><rect x=8 y=74 width=64 height=1.5 fill='#999'/>\" +\n" +
  "        \"<g class=api><path class='f f1' d='M16 104 q-6 -14 4 -26 q2 10 8 12 q2 -8 0 -14 q12 10 6 28z' fill='url(#cps-api)'/><path class='f f2' d='M38 104 q-6 -16 4 -28 q2 10 8 12 q2 -8 0 -14 q12 12 6 30z' fill='url(#cps-api)'/><path class='f f3' d='M58 104 q-6 -14 4 -26 q2 10 8 12 q2 -8 0 -14 q12 10 6 28z' fill='url(#cps-api)'/></g>\" +\n" +
  "        \"<rect x=4 y=104 width=72 height=12 rx=3 fill='url(#cps-besi)'/><rect x=6 y=105 width=68 height=3 rx=1.5 fill='url(#cps-kilap)'/><rect x=10 y=116 width=5 height=4 fill='\" + WARNA.navyTua + \"'/><rect x=65 y=116 width=5 height=4 fill='\" + WARNA.navyTua + \"'/>\")\n" +
  "    ];\n" +
  "  },\n" +
  "  SIAP: function () {\n" +
  "    var anjing = function (x, y, s, k) {\n" +
  "      return \"<g class='anjing \" + k + \"' transform='translate(\" + x + \" \" + y + \") scale(\" + s + \")'>\" +\n" +
  "        \"<ellipse class=bayang-anjing cx=14 cy=22 rx=12 ry=2 fill='#000' opacity='.15'/><ellipse cx=14 cy=10 rx=12 ry=6 fill='url(#cps-anjing)'/><circle cx=2 cy=4 r=6 fill='url(#cps-anjing)'/><ellipse cx=0 cy=1.5 rx=2.2 ry=1.2 fill='#fff' opacity='.35'/><path d='M-1 0 l-3 -6 l6 3z' fill='#6B4523'/><circle cx=0 cy=3 r=1 fill='#111'/><circle cx=-4 cy=5 r=1.3 fill='#111'/>\" +\n" +
  "        \"<path class=ekor d='M25 7 q6 -6 4 -10' stroke='#A0703F' stroke-width=3 fill=none stroke-linecap='round'/>\" +\n" +
  "        \"<g class=kaki-anjing><rect class=ka x=5 y=14 width=3 height=7 fill='#6B4523'/><rect class=kb x=11 y=14 width=3 height=7 fill='#6B4523'/><rect class=ka x=18 y=14 width=3 height=7 fill='#6B4523'/><rect class=kb x=23 y=14 width=3 height=7 fill='#6B4523'/></g></g>\";\n" +
  "    };\n" +
  "    var kotak = \"<g class=kotak-makanan><rect x=27 y=58 width=26 height=16 rx=3 fill='\" + WARNA.putih + \"' stroke='\" + WARNA.navy + \"' stroke-width='1.5'/><rect x=27 y=58 width=26 height=5 rx=2 fill='\" + WARNA.kuning + \"'/><path d='M36 68 c-2 -1.6 -2.4 -3 -1.2 -3.5 c.6 -.2 1 .1 1.2 .5 c.2 -.4 .7 -.7 1.2 -.5 c1.2 .5 .8 1.9 -1.2 3.5z' fill='\" + WARNA.navy + \"'/></g>\";\n" +
  "    return [\n" +
  "      // kiri: koki memeluk erat makananmu sambil termenung menunggu\n" +
  "      svg(\"a-jaga\", \"<g class=pikir><circle cx=60 cy=16 r=2 fill='#C9CBDB'/><circle cx=66 cy=10 r=3 fill='#C9CBDB'/><rect x=46 y=-2 width=32 height=12 rx=6 fill='#EEEFF5'/><text x=62 y=6.5 text-anchor=middle font-size=7 font-weight=800 fill='\" + WARNA.navy + \"' font-family='Nunito,sans-serif'>kamu mana?</text></g>\" +\n" +
  "        \"<g class=penjaga transform='translate(0 8)'>\" + koki(\"cemas\", { rotKiri: -55, rotKanan: 55, depan: kotak }) + \"</g>\"),\n" +
  "      // kanan: anjing-anjing mengejar\n" +
  "      svg(\"a-anjing\", \"<g class=guk><text x=6 y=40 font-size=8 font-weight=800 fill='\" + WARNA.navy + \"' font-family='Nunito,sans-serif'>Guk!</text><text x=46 y=66 font-size=8 font-weight=800 fill='\" + WARNA.navy + \"' font-family='Nunito,sans-serif'>Guk!</text></g>\" +\n" +
  "        \"<g class=lari>\" + anjing(14, 46, 1.1, \"a1\") + anjing(40, 74, .9, \"a2\") + anjing(8, 96, 1, \"a3\") + \"</g>\" +\n" +
  "        \"<g class=debu><circle cx=70 cy=64 r=3 fill='#E4DCD0'/><circle cx=64 cy=112 r=4 fill='#E4DCD0'/><circle cx=76 cy=88 r=2.5 fill='#E4DCD0'/></g>\")\n" +
  "    ];\n" +
  "  },\n" +
  "  DIAMBIL: function () {\n" +
  "    return [\n" +
  "      svg(\"a-terimakasih\", \"<g class=gelembung><rect x=0 y=0 width=56 height=15 rx=7 fill='\" + WARNA.putih + \"' stroke='\" + WARNA.navy + \"' stroke-width='1.5'/><text x=28 y=10.5 text-anchor=middle font-size=7.5 font-weight=800 fill='\" + WARNA.navy + \"' font-family='Nunito,sans-serif'>Selamat makan!</text></g><g transform='translate(0 8)'>\" + koki(\"senyum\", { rotKiri: 150, rotKanan: -150 }) + \"</g>\"),\n" +
  "      svg(\"a-hati\", \"<g class=hati-hati><text class=h1 x=20 y=90 font-size=18>💛</text><text class=h2 x=44 y=100 font-size=14>💙</text><text class=h3 x=30 y=110 font-size=12>💛</text></g>\")\n" +
  "    ];\n" +
  "  }\n" +
  "};\n" +
  "function adegan(status) { var f = ADEGAN[status]; return f ? f() : [\"\", \"\"]; }\n" +
  "\n" +
  "// Halaman pelanggan (dibuka dari QR di layar kasir). Butuh dari halaman induk: TOKEN, muat(), kirimNilai(b,u,ok,gagal).\n" +
  "// animasi.js dimuat sebelum file ini (fungsi adegan(status)).\n" +
  "var UAP = \"<svg viewBox='0 0 120 50' aria-hidden='true'><g fill='none' stroke='currentColor' stroke-width='7' stroke-linecap='round'><path class=u1 d='M24 46c-12-9 10-15 0-24S16 8 26 3'/><path class=u2 d='M60 46c-12-9 10-15 0-24S52 8 62 3'/><path class=u3 d='M96 46c-12-9 10-15 0-24S88 8 98 3'/></g></svg>\";\n" +
  "var ctx = null, aktif = false, terakhirPanggil = -1, alarm = null, ulang = 0, kunciLayar = null, suaraId = null;\n" +
  "var tandaTiket = \"\", tandaIsi = \"\", tandaNilai = \"\", pilihBintang = 0;\n" +
  "\n" +
  "function el(i) { return document.getElementById(i); }\n" +
  "function aman(s) { return String(s || \"\").replace(/[&<>\"]/g, function (c) { return { \"&\": \"&amp;\", \"<\": \"&lt;\", \">\": \"&gt;\", \"\\\"\": \"&quot;\" }[c]; }); }\n" +
  "\n" +
  "// ---------- suara, getar, layar tetap menyala ----------\n" +
  "function pilihSuara() { if (!window.speechSynthesis) return; var v = speechSynthesis.getVoices(); suaraId = v.filter(function (x) { return /^id|^in/i.test(x.lang); })[0] || null; }\n" +
  "if (window.speechSynthesis) { pilihSuara(); speechSynthesis.onvoiceschanged = pilihSuara; }\n" +
  "function bicara(teks) { if (!window.speechSynthesis) return; var u = new SpeechSynthesisUtterance(teks); u.lang = \"id-ID\"; if (suaraId) u.voice = suaraId; u.rate = 0.92; u.pitch = 1; u.volume = 1; speechSynthesis.speak(u); }\n" +
  "function getar(pola) { try { if (navigator.vibrate) navigator.vibrate(pola); } catch (e) { } }\n" +
  "function jagaLayar() { try { if (navigator.wakeLock && document.visibilityState === \"visible\") navigator.wakeLock.request(\"screen\").then(function (k) { kunciLayar = k; }).catch(function () { }); } catch (e) { } }\n" +
  "document.addEventListener(\"visibilitychange\", function () { if (aktif && document.visibilityState === \"visible\") jagaLayar(); });\n" +
  "function lonceng(f, t, dur, vol) {\n" +
  "  var n = ctx.currentTime + t;\n" +
  "  [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(function (h) {\n" +
  "    var o = ctx.createOscillator(), g = ctx.createGain(); o.type = \"sine\"; o.frequency.value = f * h[0];\n" +
  "    g.gain.setValueAtTime(0.0001, n); g.gain.exponentialRampToValueAtTime(vol * h[1], n + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, n + dur);\n" +
  "    o.connect(g); g.connect(ctx.destination); o.start(n); o.stop(n + dur + 0.05);\n" +
  "  });\n" +
  "}\n" +
  "function nada() { if (!ctx) return; if (ctx.state === \"suspended\") ctx.resume(); lonceng(523.25, 0, 1.6, 0.5); lonceng(659.25, 0.45, 1.6, 0.5); lonceng(783.99, 0.9, 1.6, 0.5); lonceng(1046.5, 1.35, 2.4, 0.45); }\n" +
  "function aktifkan() {\n" +
  "  try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { }\n" +
  "  aktif = true; nada(); getar(200); jagaLayar();\n" +
  "  setTimeout(function () { bicara(\"Bunyi panggilan aktif\"); }, 1600);\n" +
  "  el(\"bunyi\").className = \"ajak aktif\";\n" +
  "  el(\"bunyi\").innerHTML = \"<p style=\\\"margin:0\\\">🔔 <b>Bunyi & getar panggilan aktif.</b> Biarkan halaman ini terbuka, layar tetap menyala.</p>\";\n" +
  "}\n" +
  "function umumkan(d) {\n" +
  "  nada(); getar([700, 250, 700, 250, 1200]);\n" +
  "  setTimeout(function () { if (window.speechSynthesis) speechSynthesis.cancel(); bicara(\"Nomor antrian \" + d.nomor + \", sudah boleh datang ke kasir untuk mengambil pesanan kamu. Terima kasih.\"); }, 2300);\n" +
  "}\n" +
  "function panggil(d) {\n" +
  "  ulang = 0; umumkan(d); clearInterval(alarm);\n" +
  "  alarm = setInterval(function () { ulang++; umumkan(d); }, 11000);\n" +
  "  var a = adegan(\"SIAP\");\n" +
  "  el(\"siap\").innerHTML = \"<div class=siap-besar onclick=\\\"berhenti()\\\"><div class=uap>\" + UAP + \"</div><div class=judul-siap>Oyster kamu sudah siap!</div>\" +\n" +
  "    \"<div class=panggung><div class=sisi>\" + a[0] + \"</div><div class=nomor>\" + d.nomor + \"</div><div class=sisi>\" + a[1] + \"</div></div>\" +\n" +
  "    \"<p>Silakan datang ke kasir untuk mengambil pesanan kamu 🦪</p><small>Ketuk layar untuk mematikan bunyi</small></div>\";\n" +
  "}\n" +
  "function berhenti() { if (!alarm && !el(\"siap\").innerHTML) return; clearInterval(alarm); alarm = null; if (window.speechSynthesis) speechSynthesis.cancel(); getar(0); el(\"siap\").innerHTML = \"\"; }\n" +
  "\n" +
  "// ---------- tampilan ----------\n" +
  "var NAMA = { MENUNGGU: \"⏳ Menunggu dibakar\", DIBAKAR: \"🔥 Sedang dibakar\", SIAP: \"🔔 Siap diambil!\", DIAMBIL: \"🙏 Sudah diambil, selamat menikmati!\", BATAL: \"Pesanan dibatalkan\" };\n" +
  "var CERITA = {\n" +
  "  MENUNGGU: \"Koki kami berterima kasih dan langsung menyiapkan tiram segar dari laut ke dapur.\",\n" +
  "  DIBAKAR: \"Oyster kamu ditaburi keju dan dibakar di atas bara, sambil joget!\",\n" +
  "  SIAP: \"Koki kami menjaga makananmu erat-erat dari kejaran anjing. Cepat ke kasir ya!\",\n" +
  "  DIAMBIL: \"Terima kasih sudah jajan di Cheesy Pen Shells!\"\n" +
  "};\n" +
  "\n" +
  "function tiket(d) {\n" +
  "  var urut = [\"MENUNGGU\", \"DIBAKAR\", \"SIAP\", \"DIAMBIL\"], i = urut.indexOf(d.status);\n" +
  "  var langkah = [[\"⏳\", \"Menunggu\"], [\"🔥\", \"Dibakar\"], [\"🔔\", \"Siap\"]].map(function (x, k) {\n" +
  "    return \"<li class=\\\"\" + (k < i || i === 3 ? \"lewat\" : k === i ? \"kini\" : \"\") + \"\\\"><span>\" + x[0] + \"</span>\" + x[1] + \"</li>\";\n" +
  "  }).join(\"\");\n" +
  "  var a = adegan(d.status);\n" +
  "  return \"<section class=tiket><div class=uap>\" + UAP + \"</div><div class=label>Nomor antrian kamu</div>\" +\n" +
  "    \"<div class=panggung><div class=sisi>\" + a[0] + \"</div><div class=\\\"nomor\" + (String(d.nomor).length > 2 ? \" panjang\" : \"\") + \"\\\">\" + d.nomor + \"</div><div class=sisi>\" + a[1] + \"</div></div>\" +\n" +
  "    \"<p class=cerita>\" + (CERITA[d.status] || \"\") + \"</p>\" +\n" +
  "    \"<span class=\\\"lencana \" + d.status + \"\\\">\" + (NAMA[d.status] || d.status) + \"</span><ol class=langkah>\" + langkah + \"</ol>\" +\n" +
  "    \"<div class=info><div><small>Sedang dipanggil</small><b id=dipanggil>–</b></div><div><small>Antrian di depan kamu</small><b id=didepan>–</b></div></div>\" +\n" +
  "    (d.lokasi ? \"<div class=lokasi>📍 \" + aman(d.lokasi) + \"</div>\" : \"\") + \"</section>\";\n" +
  "}\n" +
  "function rincian(d) {\n" +
  "  return (d.fotoBakar ? \"<section class=kartu><h2 class=judul><span>Lagi dibakar</span></h2><p class=skrip>Ini oyster kamu di atas bara!</p><img class=foto src=\\\"\" + d.fotoBakar + \"\\\" alt=\\\"Foto pesanan kamu saat dibakar\\\"></section>\" : \"\") +\n" +
  "    \"<section class=kartu><h2 class=judul><span>Pesanan kamu</span></h2><div class=menu-pesanan>\" + (aman(d.menu) || \"<span class=redup>Lihat struk di bawah</span>\") + \"</div>\" +\n" +
  "    \"<details><summary>Lihat bukti pembayaran</summary><img class=foto src=\\\"\" + d.fotoStruk + \"\\\" alt=\\\"Struk pembayaran\\\"></details></section>\";\n" +
  "}\n" +
  "\n" +
  "// ---------- penilaian bintang kasir ----------\n" +
  "function kotakNilai(d) {\n" +
  "  if (!d.bolehNilai) return \"\";\n" +
  "  var siapa = d.kasir ? \"kasir kami, <b>\" + aman(d.kasir) + \"</b>\" : \"kasir kami\";\n" +
  "  if (d.rating) {\n" +
  "    return \"<section class=\\\"kartu nilai\\\"><h2 class=judul><span>Terima kasih!</span></h2><p>Kamu memberi \" + siapa + \" <b class=bintang-teks>\" + \"★★★★★\".slice(0, d.rating) + \"<span class=redup>\" + \"★★★★★\".slice(d.rating) + \"</span></b></p>\" +\n" +
  "      (d.ulasan ? \"<p class=redup>“\" + aman(d.ulasan) + \"”</p>\" : \"\") + \"<button class=\\\"kecil abu\\\" onclick=\\\"ubahNilai()\\\">Ubah penilaian</button></section>\";\n" +
  "  }\n" +
  "  var b = \"\";\n" +
  "  for (var i = 1; i <= 5; i++) b += \"<button type=button class=\\\"bintang\" + (i <= pilihBintang ? \" nyala\" : \"\") + \"\\\" aria-label=\\\"\" + i + \" bintang\\\" onclick=\\\"pilih(\" + i + \")\\\">★</button>\";\n" +
  "  var label = [\"\", \"Buruk\", \"Kurang\", \"Cukup\", \"Baik\", \"Sempurna!\"][pilihBintang] || \"Ketuk bintang\";\n" +
  "  return \"<section class=\\\"kartu nilai\\\"><h2 class=judul><span>Nilai pelayanan</span></h2><p>Bagaimana pelayanan \" + siapa + \"?</p>\" +\n" +
  "    \"<div class=baris-bintang>\" + b + \"</div><p class=label-bintang id=labelBintang>\" + label + \"</p>\" +\n" +
  "    \"<label for=ulasan>Ceritakan pengalamanmu (opsional)</label><textarea id=ulasan rows=3 maxlength=300 placeholder=\\\"Contoh: kasirnya ramah dan cepat\\\"></textarea><br><br>\" +\n" +
  "    \"<button class=kuning onclick=\\\"kirimBintang()\\\" \" + (pilihBintang ? \"\" : \"disabled\") + \" id=tombolNilai>Kirim penilaian</button><p class=redup id=infoNilai></p></section>\";\n" +
  "}\n" +
  "var dataTerakhir = null;\n" +
  "function gambarNilai(paksa) {\n" +
  "  var d = dataTerakhir; if (!d) return;\n" +
  "  var tanda = [d.bolehNilai, d.rating, d.ulasan, pilihBintang].join(\"|\");\n" +
  "  if (!paksa && tanda === tandaNilai) return;\n" +
  "  var ulasanLama = el(\"ulasan\") ? el(\"ulasan\").value : \"\";\n" +
  "  tandaNilai = tanda;\n" +
  "  el(\"nilai\").innerHTML = kotakNilai(d);\n" +
  "  if (el(\"ulasan\") && ulasanLama) el(\"ulasan\").value = ulasanLama;\n" +
  "}\n" +
  "function pilih(b) { pilihBintang = b; gambarNilai(true); }\n" +
  "function ubahNilai() { pilihBintang = dataTerakhir.rating || 0; dataTerakhir.rating = 0; gambarNilai(true); if (el(\"ulasan\")) el(\"ulasan\").value = dataTerakhir.ulasan || \"\"; }\n" +
  "function kirimBintang() {\n" +
  "  if (!pilihBintang) return;\n" +
  "  var u = el(\"ulasan\") ? el(\"ulasan\").value : \"\";\n" +
  "  el(\"tombolNilai\").disabled = true; el(\"infoNilai\").textContent = \"Mengirim...\";\n" +
  "  kirimNilai(pilihBintang, u, function () { dataTerakhir.rating = pilihBintang; dataTerakhir.ulasan = u; gambarNilai(true); },\n" +
  "    function (e) { el(\"tombolNilai\").disabled = false; el(\"infoNilai\").textContent = \"Gagal mengirim: \" + ((e && e.message) || e) + \". Coba lagi.\"; });\n" +
  "}\n" +
  "\n" +
  "function tampil(d) {\n" +
  "  if (!d.ada) { el(\"isi\").innerHTML = \"<section class=tiket><h2>Pesanan tidak ditemukan</h2><p>Mohon scan ulang QR dari layar kasir.</p></section>\"; return; }\n" +
  "  dataTerakhir = d;\n" +
  "  // Tiket (dengan animasi) digambar ulang hanya saat status berubah, supaya animasi tidak terulang dari awal.\n" +
  "  var tanda = d.status + \"|\" + d.nomor;\n" +
  "  if (tanda !== tandaTiket) { tandaTiket = tanda; el(\"tiketBox\").innerHTML = tiket(d); }\n" +
  "  var aktifAntri = d.status === \"MENUNGGU\" || d.status === \"DIBAKAR\";\n" +
  "  el(\"dipanggil\").textContent = d.nomorDipanggil ? \"#\" + d.nomorDipanggil : \"–\";\n" +
  "  el(\"didepan\").textContent = aktifAntri ? d.antrianDidepan : \"–\";\n" +
  "  var tIsi = [d.fotoBakar, d.menu, d.fotoStruk].join(\"|\");\n" +
  "  if (tIsi !== tandaIsi) { tandaIsi = tIsi; el(\"isi\").innerHTML = rincian(d); }\n" +
  "  gambarNilai(false);\n" +
  "  if (d.komplain) el(\"komplainLink\").href = d.komplain;\n" +
  "  if (d.status === \"SIAP\" && d.panggilKe !== terakhirPanggil) panggil(d);\n" +
  "  if (d.status !== \"SIAP\") berhenti();\n" +
  "  terakhirPanggil = d.status === \"SIAP\" ? d.panggilKe : terakhirPanggil;\n" +
  "  if (d.status === \"DIAMBIL\" || d.status === \"BATAL\") clearInterval(timer);\n" +
  "}";
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
