// Animasi koki Cheesy Pen Shells di kiri & kanan nomor antrian (SVG + CSS, tanpa gambar tambahan).
// Koki: baju koki lengan panjang biru dengan logo Cheesy Pen Shells di saku kiri, celana kuning,
// topi bergaris kuning-biru, kulit putih.
var WARNA = { navy: "#22348C", navyTua: "#16226A", kuning: "#F6B800", kulit: "#FBE3D3", pipi: "#F4A7A0", putih: "#FFFFFF", sepatu: "#2B2B2B", laut: "#5DA9E9", lautTua: "#2F6FB2" };

// Gradien & kilap untuk efek 3D (dipakai semua adegan; id sama di tiap SVG, isinya identik).
var DEFS = "<defs>" +
  "<radialGradient id='cps-kulit' cx='.35' cy='.3' r='.75'><stop offset='0' stop-color='#FFF4EC'/><stop offset='.6' stop-color='#FBE0CF'/><stop offset='1' stop-color='#E9BFA6'/></radialGradient>" +
  "<linearGradient id='cps-baju' x1='0' x2='1'><stop offset='0' stop-color='#3550C2'/><stop offset='.45' stop-color='#22348C'/><stop offset='1' stop-color='#121C58'/></linearGradient>" +
  "<linearGradient id='cps-lengan' x1='0' x2='1'><stop offset='0' stop-color='#3A56C8'/><stop offset='1' stop-color='#17246A'/></linearGradient>" +
  "<linearGradient id='cps-celana' x1='0' x2='1'><stop offset='0' stop-color='#FFE07A'/><stop offset='.5' stop-color='#F6B800'/><stop offset='1' stop-color='#C98E00'/></linearGradient>" +
  "<linearGradient id='cps-kilap' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='.55'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></linearGradient>" +
  "<radialGradient id='cps-cangkang' cx='.4' cy='.35' r='.8'><stop offset='0' stop-color='#B8A897'/><stop offset='1' stop-color='#6E5E4F'/></radialGradient>" +
  "<radialGradient id='cps-anjing' cx='.35' cy='.3' r='.8'><stop offset='0' stop-color='#C99260'/><stop offset='1' stop-color='#7E5328'/></radialGradient>" +
  "<linearGradient id='cps-api' x1='0' y1='1' x2='0' y2='0'><stop offset='0' stop-color='#E2470F'/><stop offset='.6' stop-color='#F6B800'/><stop offset='1' stop-color='#FFE9A0'/></linearGradient>" +
  "<linearGradient id='cps-besi' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#3A4FB8'/><stop offset='1' stop-color='#121C58'/></linearGradient>" +
  "</defs>";

// Topi bergaris kuning-biru.
function topiKoki() {
  return "<g class=topi><rect x=27 y=8 width=26 height=14 rx=7 fill='" + WARNA.kuning + "'/>" +
    "<rect x=31 y=8 width=4 height=14 fill='" + WARNA.navy + "'/><rect x=39 y=8 width=4 height=14 fill='" + WARNA.navy + "'/><rect x=47 y=8 width=4 height=14 fill='" + WARNA.navy + "'/>" +
    "<rect x=27 y=8 width=26 height=7 rx=3.5 fill='url(#cps-kilap)'/>" +
    "<rect x=28 y=20 width=24 height=6 rx=2 fill='" + WARNA.navy + "'/><rect x=28 y=22 width=24 height=2 fill='" + WARNA.kuning + "'/></g>";
}
// Kepala; gaya: senyum | kacamata | cemas | bungkuk
function kepalaKoki(gaya) {
  var muka = "<rect x=37 y=41 width=6 height=6 fill='#E2B39A'/><circle cx=40 cy=34 r=10 fill='url(#cps-kulit)'/><ellipse cx=36.5 cy=29.5 rx=3 ry=1.8 fill='#fff' opacity='.5'/>" +
    "<circle cx=35 cy=37 r=2 fill='" + WARNA.pipi + "' opacity='.7'/><circle cx=45 cy=37 r=2 fill='" + WARNA.pipi + "' opacity='.7'/>";
  if (gaya === "kacamata") muka += "<rect x=32 y=30 width=7 height=4 rx=1.5 fill='#111'/><rect x=41 y=30 width=7 height=4 rx=1.5 fill='#111'/><rect x=38.5 y=31 width=3 height=1 fill='#111'/><path d='M36 39 q4 3 8 0' stroke='#7A3B2E' stroke-width=1.5 fill=none stroke-linecap='round'/>";
  else if (gaya === "cemas") muka += "<circle cx=36 cy=32 r=1.3 fill='#222'/><circle cx=44 cy=32 r=1.3 fill='#222'/><path d='M33 29 l4 1 M47 29 l-4 1' stroke='#222' stroke-width=1.2 stroke-linecap='round'/><path d='M37 39 q3 -2 6 0' stroke='#7A3B2E' stroke-width=1.5 fill=none stroke-linecap='round'/><path class=keringat d='M51 28 q2 3 0 5 q-2 -2 0 -5z' fill='#7EC8F2'/>";
  else muka += "<path d='M34 32 q2 -2 4 0 M42 32 q2 -2 4 0' stroke='#222' stroke-width=1.3 fill=none stroke-linecap='round'/><path d='M35 38 q5 4 10 0' stroke='#7A3B2E' stroke-width=1.6 fill=none stroke-linecap='round'/>";
  return "<g class=kepala>" + muka + topiKoki() + "</g>";
}
// Badan: baju koki biru lengan panjang + logo di saku kiri (kanan gambar), celana kuning.
function badanKoki() {
  return "<g class=kaki-kiri style='transform-origin:35px 84px'><rect x=31 y=82 width=8 height=22 rx=3 fill='url(#cps-celana)'/><rect x=29 y=102 width=11 height=5 rx=2.5 fill='" + WARNA.sepatu + "'/><rect x=30 y=102.5 width=6 height=1.5 rx=.75 fill='#fff' opacity='.35'/></g>" +
    "<g class=kaki-kanan style='transform-origin:45px 84px'><rect x=41 y=82 width=8 height=22 rx=3 fill='url(#cps-celana)'/><rect x=40 y=102 width=11 height=5 rx=2.5 fill='" + WARNA.sepatu + "'/><rect x=41 y=102.5 width=6 height=1.5 rx=.75 fill='#fff' opacity='.35'/></g>" +
    "<path d='M27 48 q13 -6 26 0 l2 36 h-30z' fill='url(#cps-baju)'/>" +
    "<path d='M29 50 q6 -3 11 -3 l-1 30 h-11z' fill='url(#cps-kilap)' opacity='.6'/>" +
    "<path d='M36 45 l4 6 l4 -6' fill='" + WARNA.putih + "'/>" +
    "<circle cx=37 cy=58 r=1.4 fill='" + WARNA.putih + "'/><circle cx=37 cy=66 r=1.4 fill='" + WARNA.putih + "'/><circle cx=37 cy=74 r=1.4 fill='" + WARNA.putih + "'/>" +
    "<rect x=43 y=55 width=9 height=8 rx=1.5 fill='" + WARNA.navyTua + "'/>" +
    "<path d='M47.5 61.5 c-3 -2 -3.5 -4 -1.8 -4.6 c.8 -.3 1.5 .2 1.8 .8 c.3 -.6 1 -1.1 1.8 -.8 c1.7 .6 1.2 2.6 -1.8 4.6z' fill='" + WARNA.kuning + "'/>";
}
function lengan(kelas, x, rot, tangan) {
  return "<g class='" + kelas + "' style='transform-origin:" + x + "px 52px'><g transform='rotate(" + rot + " " + x + " 52)'>" +
    "<rect x=" + (x - 3.5) + " y=50 width=7 height=24 rx=3.5 fill='url(#cps-lengan)'/><circle cx=" + x + " cy=75 r=3.6 fill='url(#cps-kulit)'/>" + (tangan || "") + "</g></g>";
}
function koki(gaya, isi) {
  return "<g class=koki><ellipse class=bayangan cx=40 cy=107 rx=15 ry=3 fill='#16226A' opacity='.22'/><g class=tubuh>" + badanKoki() + (isi && isi.belakang || "") + lengan("lengan-kiri", 28, isi && isi.rotKiri || 10, isi && isi.tanganKiri) +
    lengan("lengan-kanan", 52, isi && isi.rotKanan || -10, isi && isi.tanganKanan) + kepalaKoki(gaya) + (isi && isi.depan || "") + "</g></g>";
}
function oyster(x, y, keju) {
  return "<g transform='translate(" + x + " " + y + ")'><ellipse cx=0 cy=1.5 rx=11 ry=4 fill='#000' opacity='.12'/><ellipse cx=0 cy=0 rx=11 ry=5 fill='url(#cps-cangkang)'/><ellipse cx=0 cy=-1 rx=8.5 ry=3.4 fill='" + (keju ? "#FFD66B" : "#EDE3D6") + "'/>" +
    (keju ? "<circle cx=-3 cy=-1.5 r=1.2 fill='#E8962E'/><circle cx=3 cy=-.5 r=1 fill='#E8962E'/>" : "") + "</g>";
}
function svg(kelas, isi) { return "<svg class='adegan " + kelas + "' viewBox='0 0 80 120' aria-hidden='true'>" + DEFS + isi + "</svg>"; }

// ---------- panggung bercerita (lapis belakang | nomor | lapis depan) ----------
// Koordinat panggung 320 x 150; kaki karakter di titik (x, y). Lapis belakang ada di balik angka, lapis depan di atasnya,
// jadi koki bisa berlari mengelilingi angka (lewat depan & belakang).
function taruh(isi, s) { return "<g transform='scale(" + s + ") translate(-40 -107)'>" + isi + "</g>"; }
function pose(nama, isi) { return "<g class='pose " + nama + "'>" + isi + "</g>"; }
function bintang(x, y, s) { return "<text x=" + x + " y=" + y + " font-size=" + s + " fill='#F6B800' stroke='#16226A' stroke-width=.6>★</text>"; }
function teksGelembung(x, y, w, teks, kelas) {
  return "<g class='" + (kelas || "") + "'><rect x=" + x + " y=" + y + " width=" + w + " height=16 rx=8 fill='#fff' stroke='#22348C' stroke-width='1.5'/>" +
    "<path d='M" + (x + 14) + " " + (y + 15) + " l3 6 l4 -6z' fill='#fff' stroke='#22348C' stroke-width='1.2'/>" +
    "<text x=" + (x + w / 2) + " y=" + (y + 11.5) + " text-anchor=middle font-size=8.5 font-weight=800 fill='#22348C' font-family='Nunito,sans-serif'>" + teks + "</text></g>";
}
function kantong() {
  return "<g transform='translate(52 76)'><path d='M-8 0 h16 l3 16 q-11 6 -22 0z' fill='#C9A46A' stroke='#7A5A2B' stroke-width='1'/><path d='M-6 0 q6 -6 12 0' stroke='#7A5A2B' stroke-width=1.5 fill='none'/>" +
    "<ellipse cx=-3 cy=6 rx=4 ry=2 fill='url(#cps-cangkang)'/><ellipse cx=3 cy=9 rx=4 ry=2 fill='url(#cps-cangkang)'/><text x=0 y=15 text-anchor=middle font-size=4 font-weight=800 fill='#22348C'>CPS</text></g>";
}
function tiramBuka(kelasTutup) {
  return "<g transform='translate(40 72)'><ellipse cx=0 cy=0 rx=10 ry=4.5 fill='url(#cps-cangkang)'/><ellipse cx=0 cy=-1 rx=7.5 ry=3 fill='#FFD66B'/>" +
    "<g class='" + (kelasTutup || "") + "' style='transform-origin:-10px 0px'><ellipse cx=0 cy=-2 rx=10 ry=4 fill='url(#cps-cangkang)'/></g></g>";
}
function anjingG(kelas) {
  return "<g class='" + kelas + "'><g transform='translate(-14 -21)'><ellipse cx=14 cy=22 rx=12 ry=2 fill='#000' opacity='.15'/>" +
    "<ellipse cx=14 cy=10 rx=12 ry=6 fill='url(#cps-anjing)'/><circle cx=2 cy=4 r=6 fill='url(#cps-anjing)'/><path d='M-1 0 l-3 -6 l6 3z' fill='#6B4523'/><circle cx=0 cy=3 r=1 fill='#111'/><circle cx=-4 cy=5 r=1.3 fill='#111'/>" +
    "<path class=ekor d='M25 7 q6 -6 4 -10' stroke='#A0703F' stroke-width=3 fill='none' stroke-linecap='round'/>" +
    "<rect class=ka x=5 y=14 width=3 height=7 fill='#6B4523'/><rect class=kb x=11 y=14 width=3 height=7 fill='#6B4523'/><rect class=ka x=18 y=14 width=3 height=7 fill='#6B4523'/><rect class=kb x=23 y=14 width=3 height=7 fill='#6B4523'/></g></g>";
}

// Gerak & kemunculan dibuat sebagai @keyframes sekali saat halaman dimuat.
function jendela(nama, rentang) {
  // opacity 1 hanya di dalam rentang [a,b] (persen)
  var k = ["0%{opacity:0}"];
  rentang.forEach(function (r) { k.push((r[0] ? (r[0] - 0.01) + "%{opacity:0}" : "") + r[0] + "%{opacity:1}" + r[1] + "%{opacity:1}" + (r[1] < 100 ? (r[1] + 0.01) + "%{opacity:0}" : "")); });
  if (rentang[rentang.length - 1][1] < 100) k.push("100%{opacity:0}");
  return "@keyframes " + nama + "{" + k.join("") + "}";
}
var ELIPS = { cx: 160, cy: 124, rx: 142, ry: 18 };
function titikElips(t) { return { x: ELIPS.cx + ELIPS.rx * Math.cos(t), y: ELIPS.cy + ELIPS.ry * Math.sin(t), depan: Math.sin(t) >= -0.05 }; }
// Lari mengelilingi angka dari persen a sampai 100, putaran kali; lapis: "depan" / "belakang".
function kelilingKf(nama, lapis, mulaiDiam, a, putaran, tunda, skala, kanan) {
  var k = [];
  var kf = function (p, x, y, s, hadap, op) { k.push(p.toFixed(2) + "%{transform:translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) scale(" + (s * hadap).toFixed(3) + "," + s.toFixed(3) + ");opacity:" + op + "}"); };
  var dalam = function (d) { return lapis === "depan" ? (d ? 1 : 0) : (d ? 0 : 1); };
  mulaiDiam.forEach(function (m) { kf(m.p, m.x, m.y, skala, m.hadap || 1, lapis === "depan" ? 1 : 0); });
  var N = 70;
  for (var i = 0; i <= N; i++) {
    var p = a + (100 - a) * i / N;
    var t = Math.PI + putaran * 2 * Math.PI * i / N - tunda;
    var q = titikElips(t), arahX = -Math.sin(t);
    var s = skala * (0.72 + 0.28 * (Math.sin(t) + 1) / 2);
    kf(p, q.x, q.y, s, kanan ? (arahX > 0 ? 1 : -1) : (arahX > 0 ? -1 : 1), dalam(q.depan));
  }
  return "@keyframes " + nama + "{" + k.join("") + "}";
}
function cssAnimasi() {
  var css = [];
  // 1) MENUNGGU — terima kasih, lari ke laut, ambil tiram, terhempas ombak, berdiri bangga dengan sekantong tiram (10 detik)
  css.push("@keyframes m-jalan{0%,11%{transform:translate(48px,128px) rotate(0)}33%{transform:translate(246px,128px) rotate(0)}37%,46%{transform:translate(266px,134px) rotate(0)}50%{transform:translate(262px,128px) rotate(0)}55%{transform:translate(196px,46px) rotate(-200deg)}61%{transform:translate(84px,128px) rotate(-360deg)}62%,100%{transform:translate(84px,128px) rotate(-360deg)}}");
  css.push(jendela("m-bungkuk", [[0, 11.9]]), jendela("m-lari", [[12, 36.9], [49, 61.9]]), jendela("m-ambil", [[37, 48.9]]), jendela("m-pusing", [[62, 74.9]]), jendela("m-bangga", [[75, 100]]));
  css.push(jendela("m-makasih", [[0, 11.9]]), jendela("m-dapat", [[77, 100]]), jendela("m-cipratan", [[50, 60]]));
  css.push("@keyframes m-tiram{0%,44%{opacity:1}45%,100%{opacity:0}}");
  css.push("@keyframes m-ombak{0%,42%{transform:scaleY(.05);opacity:0}48%{transform:scaleY(1);opacity:1}54%{transform:translateX(-30px) scaleY(.95);opacity:1}60%,100%{transform:translateX(-70px) scaleY(.15);opacity:0}}");
  // 2) DIBAKAR — bumbu spesial, tabur keju bergaya, bawa ke pemanggang, torch berputar seperti dansa (10 detik)
  css.push("@keyframes b-jalan{0%,40%{transform:translate(250px,128px)}44%{transform:translate(200px,112px)}48%{transform:translate(140px,128px)}52%,100%{transform:translate(78px,128px)}}");
  css.push(jendela("b-bumbu", [[0, 27.9]]), jendela("b-keju", [[28, 41.9]]), jendela("b-bawa", [[42, 51.9]]), jendela("b-torch", [[52, 100]]));
  css.push(jendela("b-nampan", [[0, 41.9]]), jendela("b-butir-bumbu", [[3, 27]]), jendela("b-butir-keju", [[29, 41]]), jendela("b-tiram-panggang", [[50, 100]]));
  css.push("@keyframes b-matang{0%,55%{opacity:0}100%{opacity:1}}");
  // 3) SIAP — buka oyster, baunya tercium anjing, lari mengelilingi angka sambil dikejar (9 detik)
  var mulai = 30, putar = 2;
  var diamKoki = [{ p: 0, x: 22, y: 126 }, { p: mulai, x: 22, y: 126 }];
  css.push(kelilingKf("s-koki-depan", "depan", diamKoki, mulai, putar, 0, 0.82, false), kelilingKf("s-koki-belakang", "belakang", diamKoki, mulai, putar, 0, 0.82, false));
  [[0.6, 282, 122], [1.0, 302, 132], [1.4, 262, 134]].forEach(function (d, i) {
    var t0 = Math.PI - d[0], q = titikElips(t0);
    var diam = [{ p: 0, x: d[1], y: d[2] }, { p: 22, x: d[1], y: d[2] }, { p: mulai, x: q.x, y: q.y }];
    css.push(kelilingKf("s-anjing" + i + "-depan", "depan", diam, mulai, putar, d[0], 1.35, true), kelilingKf("s-anjing" + i + "-belakang", "belakang", diam, mulai, putar, d[0], 1.35, true));
  });
  css.push(jendela("s-buka", [[0, 29.9]]), jendela("s-lari", [[30, 100]]), jendela("s-bau", [[8, 30]]), jendela("s-kaget", [[22, 32]]));
  css.push("@keyframes s-tutup{0%,6%{transform:rotate(0)}14%,100%{transform:rotate(-70deg)}}");
  css.push("@keyframes s-bau-geser{0%,8%{transform:translateX(0)}30%,100%{transform:translateX(200px)}}");
  // Ikatan kelas -> animasi (durasi cerita: menunggu 10 dtk, dibakar 10 dtk, siap 9 dtk)
  var ikat = function (adegan, kelas, nama, dur, gaya) { css.push(".s-" + adegan + " ." + kelas + "{animation:" + nama + " " + dur + "s " + (gaya || "linear") + " infinite}"); };
  ["m-jalan", "m-bungkuk", "m-lari", "m-ambil", "m-pusing", "m-bangga", "m-makasih", "m-dapat", "m-cipratan"].forEach(function (k) { ikat("MENUNGGU", k, k, 10); });
  ikat("MENUNGGU", "m-tiram-laut", "m-tiram", 10); ikat("MENUNGGU", "m-ombak-besar", "m-ombak", 10, "ease-in-out");
  ["b-jalan", "b-bumbu", "b-keju", "b-bawa", "b-torch", "b-nampan", "b-butir-bumbu", "b-butir-keju", "b-tiram-panggang", "b-matang"].forEach(function (k) { ikat("DIBAKAR", k, k, 10); });
  ikat("DIBAKAR", "b-torch-pos", "b-torch", 10);
  ["s-koki-depan", "s-koki-belakang", "s-anjing0-depan", "s-anjing0-belakang", "s-anjing1-depan", "s-anjing1-belakang", "s-anjing2-depan", "s-anjing2-belakang", "s-buka", "s-lari", "s-bau", "s-kaget", "s-bau-geser"].forEach(function (k) { ikat("SIAP", k, k, 9); });
  ikat("SIAP", "s-tutup-tiram", "s-tutup", 9, "ease-out");
  return css.join("\n");
}
(function () {
  if (typeof document === "undefined" || document.getElementById("cps-anim")) return;
  var st = document.createElement("style"); st.id = "cps-anim"; st.textContent = cssAnimasi(); document.head.appendChild(st);
})();

var PANGGUNG = {
  MENUNGGU: function () {
    var koki9 = function (gaya, isi) { return taruh(koki(gaya, isi), 0.9); };
    return {
      belakang:
        // kios Cheesy Pen Shells kecil di kiri, pasir, laut di kanan
        "<g><rect x=4 y=96 width=30 height=30 fill='#fff' stroke='#22348C' stroke-width='1.5'/><path d='M0 98 h38 l-4 -10 h-30z' fill='#F6B800' stroke='#22348C' stroke-width='1.5'/><path d='M7 88 v10 M15 88 v10 M23 88 v10 M31 88 v10' stroke='#22348C' stroke-width='2'/><text x=19 y=114 text-anchor=middle font-size=6 font-weight=800 fill='#22348C'>CPS</text></g>" +
        "<path d='M0 126 h232 q14 -4 28 0 v24 h-260z' fill='#F3DFAE'/><path d='M0 126 h232' stroke='#E2C98A' stroke-width='1.5'/>" +
        "<g class=laut><path d='M214 122 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 v40 h-160z' fill='#5DA9E9'/><path d='M214 130 q10 -5 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 v40 h-160z' fill='#2F6FB2'/></g>" +
        "<g class=m-tiram-laut>" + oyster(286, 131) + "</g>",
      depan:
        teksGelembung(8, 44, 72, "Makasih! 🙏", "m-makasih") +
        "<g class=m-jalan>" +
          pose("m-bungkuk", koki9("senyum", { rotKiri: 35, rotKanan: -35 })) +
          pose("m-lari", koki9("senyum", { rotKiri: -45, rotKanan: 45 })) +
          pose("m-ambil", koki9("senyum", { rotKiri: 20, rotKanan: -20, tanganKanan: "<g transform='translate(52 80)'><ellipse cx=0 cy=0 rx=6 ry=3 fill='url(#cps-cangkang)'/></g>" })) +
          pose("m-pusing", koki9("cemas", { rotKiri: 60, rotKanan: -60 }) + "<g class=bintang-pusing>" + bintang(-14, -96, 10) + bintang(4, -102, 9) + bintang(-4, -90, 8) + "</g>") +
          pose("m-bangga", koki9("senyum", { rotKiri: 150, rotKanan: -20, tanganKanan: kantong() })) +
        "</g>" +
        "<g class=m-ombak-besar><path d='M232 150 q-8 -60 34 -96 q36 -24 54 0 q-26 -6 -32 18 q22 -6 24 16 q-20 -10 -30 8 q-6 20 6 54z' fill='#5DA9E9' stroke='#2F6FB2' stroke-width='2'/><path d='M262 64 q16 -14 34 -6' stroke='#fff' stroke-width=3 fill='none' stroke-linecap='round'/></g>" +
        "<g class=m-cipratan><circle cx=240 cy=96 r=3 fill='#9CD3F7'/><circle cx=226 cy=84 r=2 fill='#9CD3F7'/><circle cx=252 cy=80 r=2.5 fill='#9CD3F7'/></g>" +
        teksGelembung(58, 24, 70, "Dapat 1 kantong!", "m-dapat")
    };
  },
  DIBAKAR: function () {
    var koki9 = function (gaya, isi) { return taruh(koki(gaya, isi), 0.9); };
    var botol = "<g class=botol transform='translate(52 70)'><rect x=-3 y=-10 width=6 height=11 rx=1.5 fill='#C0392B'/><rect x=-3.5 y=-12 width=7 height=3 rx=1 fill='#7A1F15'/><text x=0 y=-2 text-anchor=middle font-size=3.2 fill='#fff' font-weight=800>CPS</text></g>";
    var parutan = "<g class=parut transform='translate(52 66)'><rect x=-4 y=-10 width=8 height=12 rx=1.5 fill='#C9CBDB' stroke='#5F6690' stroke-width='.6'/><rect x=-3 y=-6 width=6 height=6 fill='#F6B800'/></g>";
    var torch = "<g class=torch-putar><g transform='translate(10 0) rotate(35)'><rect x=-3 y=-3 width=6 height=14 rx=2 fill='#C0392B'/><rect x=-2 y=-7 width=4 height=5 fill='#999'/>" +
      "<path class=api-torch d='M0 -7 q-4 -8 0 -16 q4 8 0 16z' fill='#4FA3FF'/><path class=api-torch d='M0 -9 q-2.5 -5 0 -10 q2.5 5 0 10z' fill='#BFE3FF'/></g></g>";
    var butir = function (kelas, warna, x0) { var r = "<g class=" + kelas + ">"; for (var i = 0; i < 7; i++) r += "<rect class='butir j" + (i % 4) + "' x=" + (x0 + i * 3) + " y=84 width=2.2 height=2.2 fill='" + warna + "'/>"; return r + "</g>"; };
    return {
      belakang:
        // meja persiapan di kanan dengan nampan oyster
        "<rect x=262 y=112 width=54 height=6 rx=2 fill='#B5642D'/><rect x=266 y=118 width=4 height=20 fill='#7A4B2A'/><rect x=308 y=118 width=4 height=20 fill='#7A4B2A'/>" +
        "<g class=b-nampan><rect x=268 y=106 width=42 height=6 rx=2 fill='#C9CBDB'/>" + oyster(279, 106) + oyster(299, 106) + "</g>" +
        butir("b-butir-bumbu", "#C0392B", 280) + butir("b-butir-keju", "#F6B800", 278) +
        "<g class=not-musik><text x=170 y=20 font-size=12 fill='#22348C'>♪</text><text x=140 y=14 font-size=10 fill='#F6B800'>♫</text></g>",
      depan:
        "<g class=b-jalan>" +
          pose("b-bumbu", koki9("kacamata", { rotKiri: 30, rotKanan: -150, tanganKanan: botol })) +
          pose("b-keju", "<g class=putar-gaya>" + koki9("kacamata", { rotKiri: 150, rotKanan: -160, tanganKanan: parutan }) + "</g>") +
          pose("b-bawa", koki9("senyum", { rotKiri: -70, rotKanan: 70, depan: "<rect x=26 y=66 width=28 height=4 rx=2 fill='#C9CBDB'/>" + oyster(34, 66) + oyster(46, 66) })) +
          pose("b-torch", koki9("kacamata", { rotKiri: 150, rotKanan: -80 })) +
        "</g>" +
        // pemanggang di kiri (di depan kaki koki)
        "<g class=b-panggang><g class=api-kecil><path class='f f1' d='M22 116 q-5 -12 3 -20 q2 7 6 9 q1 -6 0 -10 q10 8 5 21z' fill='url(#cps-api)'/><path class='f f2' d='M50 116 q-5 -14 3 -22 q2 7 6 9 q1 -6 0 -10 q10 9 5 23z' fill='url(#cps-api)'/><path class='f f3' d='M78 116 q-5 -12 3 -20 q2 7 6 9 q1 -6 0 -10 q10 8 5 21z' fill='url(#cps-api)'/></g>" +
          "<rect x=12 y=104 width=88 height=4 rx=2 fill='#555'/><rect x=12 y=104 width=88 height=1.5 fill='#aaa'/>" +
          "<g class=b-tiram-panggang>" + oyster(36, 102, true) + oyster(60, 102, true) + oyster(84, 102, true) + "<g class=b-matang><ellipse cx=60 cy=100 rx=34 ry=6 fill='#FFB347' opacity='.35'/></g></g>" +
          "<rect x=8 y=116 width=96 height=14 rx=3 fill='url(#cps-besi)'/><rect x=10 y=117 width=92 height=3 rx=1.5 fill='url(#cps-kilap)'/><rect x=16 y=130 width=6 height=6 fill='#121C58'/><rect x=90 y=130 width=6 height=6 fill='#121C58'/></g>" +
        "<g class=b-torch-pos><g transform='translate(60 84)'>" + torch + "</g></g>"
    };
  },
  SIAP: function () {
    var koki8 = function (gaya, isi) { return taruh(koki(gaya, isi), 1); };
    var lariKoki = koki8("cemas", { rotKiri: -50, rotKanan: -150, tanganKanan: "<g transform='translate(52 74)'><ellipse cx=0 cy=0 rx=7 ry=3 fill='url(#cps-cangkang)'/><ellipse cx=0 cy=-1 rx=5 ry=2 fill='#FFD66B'/></g>" });
    var buka = koki8("senyum", { rotKiri: -40, rotKanan: 40, depan: tiramBuka("s-tutup-tiram") });
    var kokiLapis = function (lapis) {
      return "<g class='s-koki-" + lapis + "'>" + (lapis === "depan" ? pose("s-buka", buka) : "") + pose("s-lari", lariKoki) + "</g>";
    };
    var anjingLapis = function (lapis) { var r = ""; for (var i = 0; i < 3; i++) r += "<g class='s-anjing" + i + "-" + lapis + "'>" + anjingG("anjing-lari") + "</g>"; return r; };
    return {
      belakang: anjingLapis("belakang") + kokiLapis("belakang"),
      depan:
        "<g class=s-bau><g class=s-bau-geser><path d='M44 92 q6 -6 0 -12 q-6 -6 0 -12' stroke='#8BC34A' stroke-width=2.5 fill='none' stroke-linecap='round'/><path d='M56 96 q6 -6 0 -12 q-6 -6 0 -12' stroke='#8BC34A' stroke-width=2.5 fill='none' stroke-linecap='round'/></g></g>" +
        "<g class=s-kaget><text x=270 y=96 font-size=16 font-weight=900 fill='#D93025'>!</text><text x=294 y=104 font-size=14 font-weight=900 fill='#D93025'>!</text></g>" +
        anjingLapis("depan") + kokiLapis("depan")
    };
  },
  DIAMBIL: function () {
    return {
      belakang: "<g class=hati-naik><text x=230 y=120 font-size=18>💛</text><text x=262 y=130 font-size=14>💙</text><text x=246 y=140 font-size=12>💛</text></g>",
      depan: teksGelembung(18, 30, 80, "Selamat menikmati!", "") + "<g transform='translate(60 128)'><g class=lompat-senang>" + taruh(koki("senyum", { rotKiri: 150, rotKanan: -150 }), 0.9) + "</g></g>"
    };
  }
};
function panggung(status, nomor) {
  var a = PANGGUNG[status] ? PANGGUNG[status]() : { belakang: "", depan: "" };
  var lapis = function (k, isi) { return "<svg class='lapis " + k + "' viewBox='0 0 320 150' preserveAspectRatio='xMidYMid meet' aria-hidden='true'>" + DEFS + isi + "</svg>"; };
  return "<div class='panggung2 s-" + status + "'>" + lapis("belakang", a.belakang) +
    "<div class='nomor" + (String(nomor).length > 2 ? " panjang" : "") + "'>" + nomor + "</div>" + lapis("depan", a.depan) + "</div>";
}
