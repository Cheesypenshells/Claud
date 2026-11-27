// ALARM BOT MATI (proyek Apps Script TERPISAH dari kasir; tidak mengubah kasir sama sekali).
// Bot menulis waktu "hidup" ke tab Pengaturan (kunci bot_hidup) tiap 2 menit. Skrip ini dijalankan Google tiap 5 menit:
// kalau denyutnya terlalu lama tidak ada (saat jam aktif), kirim email ke pemilik akun. Kalau bot hidup lagi, kirim email "pulih".
// Pasang: lihat docs/PANDUAN.md bagian "Alarm bot mati". Jalankan PASANG_ALARM sekali, lalu izinkan akses.

var ID_SPREADSHEET = '1r4ifqOWXqEpIT5f8TdYWa1F74qNFevIveTN5vuC2_Tk';
var BATAS_MENIT = 10;      // lebih lama dari ini tanpa denyut = bot dianggap mati
var JAM_MULAI = 7;         // jam aktif WIB (di luar jam ini alarm diam)
var JAM_SELESAI = 24;

function bacaDenyut_() {
  var sheet = SpreadsheetApp.openById(ID_SPREADSHEET).getSheetByName('Pengaturan');
  var data = sheet.getDataRange().getValues();
  var kunci = data[0].indexOf('kunci');
  var nilai = data[0].indexOf('nilai');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][kunci]) === 'bot_hidup') return new Date(String(data[i][nilai]));
  }
  return null;
}

function jamWib_() {
  return Number(Utilities.formatDate(new Date(), 'Asia/Jakarta', 'H'));
}

function CEK_BOT() {
  var jam = jamWib_();
  if (jam < JAM_MULAI || jam >= JAM_SELESAI) return;
  var props = PropertiesService.getScriptProperties();
  var denyut = bacaDenyut_();
  var penerima = Session.getEffectiveUser().getEmail();
  var menit = denyut && !isNaN(denyut.getTime()) ? Math.round((Date.now() - denyut.getTime()) / 60000) : null;
  var mati = menit === null || menit > BATAS_MENIT;
  var sudahDiberitahu = props.getProperty('mati') === '1';
  var waktu = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'd MMM HH:mm');
  if (mati && !sudahDiberitahu) {
    var lama = menit === null ? 'belum pernah ada denyut' : menit + ' menit tanpa denyut';
    MailApp.sendEmail(penerima, 'BOT CPS MATI (' + waktu + ')',
      'Bot Cheesy Pen Shells tidak mengirim denyut: ' + lama + '.\n\n' +
      'Yang perlu dilakukan:\n1. Buka Termux di HP bot.\n2. Kalau layar kosong / hanya "~ $", ketik: bot\n3. Pastikan muncul "Bot berjalan".\n' +
      '4. Cek WhatsApp HP bot: Perangkat tertaut > CPS bot masih aktif.\n\n' +
      'Pesan yang masuk saat bot mati akan diproses setelah bot hidup lagi.');
    props.setProperty('mati', '1');
  } else if (!mati && sudahDiberitahu) {
    MailApp.sendEmail(penerima, 'Bot CPS hidup lagi (' + waktu + ')', 'Bot kembali mengirim denyut. Semua normal.');
    props.deleteProperty('mati');
  }
}

// Jalankan sekali: memasang pemicu tiap 5 menit (meminta izin akses Spreadsheet & Gmail).
function PASANG_ALARM() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'CEK_BOT') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('CEK_BOT').timeBased().everyMinutes(5).create();
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'Alarm bot CPS terpasang', 'Alarm aktif. Kamu akan menerima email ini kalau bot berhenti lebih dari ' + BATAS_MENIT + ' menit (jam ' + JAM_MULAI + '.00-24.00 WIB).');
}

// Uji manual: kirim email contoh peringatan.
function UJI_EMAIL() {
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), 'UJI alarm bot CPS', 'Ini email uji. Kalau sampai ke inbox/HP, alarm siap.');
}
