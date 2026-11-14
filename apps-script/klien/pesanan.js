// Halaman pelanggan (dibuka dari QR di layar kasir). Butuh dari halaman induk: TOKEN, muat(), kirimNilai(b,u,ok,gagal).
// animasi.js dimuat sebelum file ini (fungsi panggung(status, nomor)).
var UAP = "<svg viewBox='0 0 120 50' aria-hidden='true'><g fill='none' stroke='currentColor' stroke-width='7' stroke-linecap='round'><path class=u1 d='M24 46c-12-9 10-15 0-24S16 8 26 3'/><path class=u2 d='M60 46c-12-9 10-15 0-24S52 8 62 3'/><path class=u3 d='M96 46c-12-9 10-15 0-24S88 8 98 3'/></g></svg>";
var ctx = null, aktif = false, terakhirPanggil = -1, alarm = null, ulang = 0, kunciLayar = null, suaraId = null;
var tandaTiket = "", tandaIsi = "", tandaNilai = "", pilihBintang = 0;

function el(i) { return document.getElementById(i); }
function aman(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]; }); }

// ---------- suara, getar, layar tetap menyala ----------
function pilihSuara() { if (!window.speechSynthesis) return; var v = speechSynthesis.getVoices(); suaraId = v.filter(function (x) { return /^id|^in/i.test(x.lang); })[0] || null; }
if (window.speechSynthesis) { pilihSuara(); speechSynthesis.onvoiceschanged = pilihSuara; }
function bicara(teks) { if (!window.speechSynthesis) return; var u = new SpeechSynthesisUtterance(teks); u.lang = "id-ID"; if (suaraId) u.voice = suaraId; u.rate = 0.92; u.pitch = 1; u.volume = 1; speechSynthesis.speak(u); }
function getar(pola) { try { if (navigator.vibrate) navigator.vibrate(pola); } catch (e) { } }
function jagaLayar() { try { if (navigator.wakeLock && document.visibilityState === "visible") navigator.wakeLock.request("screen").then(function (k) { kunciLayar = k; }).catch(function () { }); } catch (e) { } }
document.addEventListener("visibilitychange", function () { if (aktif && document.visibilityState === "visible") jagaLayar(); });
function lonceng(f, t, dur, vol) {
  var n = ctx.currentTime + t;
  [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(function (h) {
    var o = ctx.createOscillator(), g = ctx.createGain(); o.type = "sine"; o.frequency.value = f * h[0];
    g.gain.setValueAtTime(0.0001, n); g.gain.exponentialRampToValueAtTime(vol * h[1], n + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, n + dur);
    o.connect(g); g.connect(ctx.destination); o.start(n); o.stop(n + dur + 0.05);
  });
}
function nada() { if (!ctx) return; if (ctx.state === "suspended") ctx.resume(); lonceng(523.25, 0, 1.6, 0.5); lonceng(659.25, 0.45, 1.6, 0.5); lonceng(783.99, 0.9, 1.6, 0.5); lonceng(1046.5, 1.35, 2.4, 0.45); }
function aktifkan() {
  try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { }
  aktif = true; nada(); getar(200); jagaLayar();
  setTimeout(function () { bicara("Bunyi panggilan aktif"); }, 1600);
  el("bunyi").className = "ajak aktif";
  el("bunyi").innerHTML = "<p style=\"margin:0\">🔔 <b>Bunyi & getar panggilan aktif.</b> Biarkan halaman ini terbuka, layar tetap menyala.</p>";
}
function umumkan(d) {
  nada(); getar([700, 250, 700, 250, 1200]);
  setTimeout(function () { if (window.speechSynthesis) speechSynthesis.cancel(); bicara("Nomor antrian " + d.nomor + ", sudah boleh datang ke kasir untuk mengambil pesanan kamu. Terima kasih."); }, 2300);
}
function panggil(d) {
  ulang = 0; umumkan(d); clearInterval(alarm);
  alarm = setInterval(function () { ulang++; umumkan(d); }, 11000);
  el("siap").innerHTML = "<div class=siap-besar onclick=\"berhenti()\"><div class=uap>" + UAP + "</div><div class=judul-siap>Oyster kamu sudah siap!</div>" +
    "<div class=seru>📱 Kamu di mana? Ayo ambil!</div><div class=papan>" + panggung("SIAP", d.nomor) + "</div>" +
    "<p>Silakan datang ke kasir untuk mengambil pesanan kamu 🦪</p><small>Ketuk layar untuk mematikan bunyi</small></div>";
}
function berhenti() { if (!alarm && !el("siap").innerHTML) return; clearInterval(alarm); alarm = null; if (window.speechSynthesis) speechSynthesis.cancel(); getar(0); el("siap").innerHTML = ""; }

// ---------- tampilan ----------
var NAMA = { MENUNGGU: "⏳ Menunggu dibakar", DIBAKAR: "🔥 Sedang dibakar", SIAP: "🔔 Siap diambil!", DIAMBIL: "🙏 Sudah diambil, selamat menikmati!", BATAL: "Pesanan dibatalkan" };
var CERITA = {
  MENUNGGU: "Koki kami berterima kasih, lalu lari ke laut mengambil tiram segar untukmu!",
  DIBAKAR: "Koki profesional kami membumbui, menabur keju, dan membakar oyster kamu dengan torch!",
  SIAP: "Wangi oyster kamu tercium anjing! Koki kami lari dikejar. Cepat ambil di kasir ya!",
  DIAMBIL: "Terima kasih sudah jajan di Cheesy Pen Shells!"
};

function tiket(d) {
  var urut = ["MENUNGGU", "DIBAKAR", "SIAP", "DIAMBIL"], i = urut.indexOf(d.status);
  var langkah = [["⏳", "Menunggu"], ["🔥", "Dibakar"], ["🔔", "Siap"]].map(function (x, k) {
    return "<li class=\"" + (k < i || i === 3 ? "lewat" : k === i ? "kini" : "") + "\"><span>" + x[0] + "</span>" + x[1] + "</li>";
  }).join("");
  return "<section class=tiket><div class=uap>" + UAP + "</div><div class=label>Nomor antrian kamu</div>" +
    (d.status === "SIAP" ? "<div class=seru>📱 Kamu di mana? Ayo ambil!</div>" : "") + panggung(d.status, d.nomor) +
    "<p class=cerita>" + (CERITA[d.status] || "") + "</p>" +
    "<span class=\"lencana " + d.status + "\">" + (NAMA[d.status] || d.status) + "</span><ol class=langkah>" + langkah + "</ol>" +
    "<div class=info><div><small>Sedang dipanggil</small><b id=dipanggil>–</b></div><div><small>Antrian di depan kamu</small><b id=didepan>–</b></div></div>" +
    (d.lokasi ? "<div class=lokasi>📍 " + aman(d.lokasi) + "</div>" : "") + "</section>";
}
function rincian(d) {
  return (d.fotoBakar ? "<section class=kartu><h2 class=judul><span>Lagi dibakar</span></h2><p class=skrip>Ini oyster kamu di atas bara!</p><img class=foto src=\"" + d.fotoBakar + "\" alt=\"Foto pesanan kamu saat dibakar\"></section>" : "") +
    "<section class=kartu><h2 class=judul><span>Pesanan kamu</span></h2><div class=menu-pesanan>" + (aman(d.menu) || "<span class=redup>Lihat struk di bawah</span>") + "</div>" +
    "<details><summary>Lihat bukti pembayaran</summary><img class=foto src=\"" + d.fotoStruk + "\" alt=\"Struk pembayaran\"></details></section>";
}

// ---------- penilaian bintang kasir ----------
function kotakNilai(d) {
  if (!d.bolehNilai) return "";
  var siapa = d.kasir ? "kasir kami, <b>" + aman(d.kasir) + "</b>" : "kasir kami";
  if (d.rating) {
    return "<section class=\"kartu nilai\"><h2 class=judul><span>Terima kasih!</span></h2><p>Kamu memberi " + siapa + " <b class=bintang-teks>" + "★★★★★".slice(0, d.rating) + "<span class=redup>" + "★★★★★".slice(d.rating) + "</span></b></p>" +
      (d.ulasan ? "<p class=redup>“" + aman(d.ulasan) + "”</p>" : "") + "<button class=\"kecil abu\" onclick=\"ubahNilai()\">Ubah penilaian</button></section>";
  }
  var b = "";
  for (var i = 1; i <= 5; i++) b += "<button type=button class=\"bintang" + (i <= pilihBintang ? " nyala" : "") + "\" aria-label=\"" + i + " bintang\" onclick=\"pilih(" + i + ")\">★</button>";
  var label = ["", "Buruk", "Kurang", "Cukup", "Baik", "Sempurna!"][pilihBintang] || "Ketuk bintang";
  return "<section class=\"kartu nilai\"><h2 class=judul><span>Nilai pelayanan</span></h2><p>Bagaimana pelayanan " + siapa + "?</p>" +
    "<div class=baris-bintang>" + b + "</div><p class=label-bintang id=labelBintang>" + label + "</p>" +
    "<label for=ulasan>Ceritakan pengalamanmu (opsional)</label><textarea id=ulasan rows=3 maxlength=300 placeholder=\"Contoh: kasirnya ramah dan cepat\"></textarea><br><br>" +
    "<button class=kuning onclick=\"kirimBintang()\" " + (pilihBintang ? "" : "disabled") + " id=tombolNilai>Kirim penilaian</button><p class=redup id=infoNilai></p></section>";
}
var dataTerakhir = null;
function gambarNilai(paksa) {
  var d = dataTerakhir; if (!d) return;
  var tanda = [d.bolehNilai, d.rating, d.ulasan, pilihBintang].join("|");
  if (!paksa && tanda === tandaNilai) return;
  var ulasanLama = el("ulasan") ? el("ulasan").value : "";
  tandaNilai = tanda;
  el("nilai").innerHTML = kotakNilai(d);
  if (el("ulasan") && ulasanLama) el("ulasan").value = ulasanLama;
}
function pilih(b) { pilihBintang = b; gambarNilai(true); }
function ubahNilai() { pilihBintang = dataTerakhir.rating || 0; dataTerakhir.rating = 0; gambarNilai(true); if (el("ulasan")) el("ulasan").value = dataTerakhir.ulasan || ""; }
function kirimBintang() {
  if (!pilihBintang) return;
  var u = el("ulasan") ? el("ulasan").value : "";
  el("tombolNilai").disabled = true; el("infoNilai").textContent = "Mengirim...";
  kirimNilai(pilihBintang, u, function () { dataTerakhir.rating = pilihBintang; dataTerakhir.ulasan = u; gambarNilai(true); },
    function (e) { el("tombolNilai").disabled = false; el("infoNilai").textContent = "Gagal mengirim: " + ((e && e.message) || e) + ". Coba lagi."; });
}

function tampil(d) {
  if (!d.ada) { el("isi").innerHTML = "<section class=tiket><h2>Pesanan tidak ditemukan</h2><p>Mohon scan ulang QR dari layar kasir.</p></section>"; return; }
  dataTerakhir = d;
  // Tiket (dengan animasi) digambar ulang hanya saat status berubah, supaya animasi tidak terulang dari awal.
  var tanda = d.status + "|" + d.nomor;
  if (tanda !== tandaTiket) { tandaTiket = tanda; el("tiketBox").innerHTML = tiket(d); }
  var aktifAntri = d.status === "MENUNGGU" || d.status === "DIBAKAR";
  el("dipanggil").textContent = d.nomorDipanggil ? "#" + d.nomorDipanggil : "–";
  el("didepan").textContent = aktifAntri ? d.antrianDidepan : "–";
  var tIsi = [d.fotoBakar, d.menu, d.fotoStruk].join("|");
  if (tIsi !== tandaIsi) { tandaIsi = tIsi; el("isi").innerHTML = rincian(d); }
  gambarNilai(false);
  if (d.komplain) el("komplainLink").href = d.komplain;
  if (d.status === "SIAP" && d.panggilKe !== terakhirPanggil) panggil(d);
  if (d.status !== "SIAP") berhenti();
  terakhirPanggil = d.status === "SIAP" ? d.panggilKe : terakhirPanggil;
  if (d.status === "DIAMBIL" || d.status === "BATAL") clearInterval(timer);
}
