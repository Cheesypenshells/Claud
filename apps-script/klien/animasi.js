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

// ---------- adegan per status ----------
var ADEGAN = {
  MENUNGGU: function () {
    return [
      // kiri: koki membungkuk berterima kasih
      svg("a-terimakasih", "<g class=gelembung><rect x=2 y=0 width=46 height=15 rx=7 fill='" + WARNA.putih + "' stroke='" + WARNA.navy + "' stroke-width='1.5'/><path d='M30 14 l4 5 l1 -5z' fill='" + WARNA.putih + "' stroke='" + WARNA.navy + "' stroke-width='1.2'/><text x=25 y=10.5 text-anchor=middle font-size=8 font-weight=800 fill='" + WARNA.navy + "' font-family='Nunito,sans-serif'>Makasih!</text></g>" +
        "<g transform='translate(0 8)'>" + koki("senyum", { rotKiri: 35, rotKanan: -35 }) + "</g>"),
      // kanan: koki di perahu menangkap tiram, lalu dibawa ke dapur
      svg("a-laut", "<g class=dapur><rect x=56 y=12 width=20 height=16 fill='" + WARNA.putih + "' stroke='" + WARNA.navy + "' stroke-width='1.5'/><path d='M53 13 l13 -9 l13 9z' fill='" + WARNA.kuning + "' stroke='" + WARNA.navy + "' stroke-width='1.5'/><rect x=63 y=19 width=6 height=9 fill='" + WARNA.navy + "'/><path class=asap-dapur d='M72 4 q-3 -3 0 -6' stroke='#9AA0C3' stroke-width=1.5 fill='none'/></g>" +
        "<g class=tiram-terbang>" + oyster(0, 0) + "</g>" +
        "<g class=perahu><g transform='translate(-8 22) scale(.62)'>" + koki("senyum", { rotKiri: 10, rotKanan: -60, tanganKanan: "<path d='M52 75 L74 30' stroke='#7A4B2A' stroke-width='2.5'/><path class=tali d='M74 30 L74 92' stroke='#555' stroke-width=1 stroke-dasharray='2 2'/>" }) + "</g>" +
        "<path d='M8 92 h44 l-6 10 h-32z' fill='#B5642D'/><rect x=8 y=89 width=44 height=4 fill='" + WARNA.kuning + "'/></g>" +
        "<g class=ombak><path d='M-40 100 q10 -6 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 v20 h-140z' fill='" + WARNA.laut + "'/><path d='M-40 106 q10 -5 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 v20 h-140z' fill='" + WARNA.lautTua + "'/></g>")
    ];
  },
  DIBAKAR: function () {
    var keju = "";
    for (var i = 0; i < 6; i++) keju += "<rect class='keju k" + i + "' x=" + (54 + i * 3) + " y=58 width=2.4 height=2.4 fill='" + WARNA.kuning + "'/>";
    return [
      // kiri: koki berkacamata joget sambil menabur keju
      svg("a-joget", "<g class=not><text x=6 y=16 font-size=12 fill='" + WARNA.navy + "'>♪</text><text x=62 y=10 font-size=10 fill='" + WARNA.kuning + "'>♫</text></g>" +
        "<g class=penari>" + koki("kacamata", { rotKiri: 140, rotKanan: -100, tanganKanan: "<rect x=47 y=74 width=9 height=12 rx=2 fill='" + WARNA.putih + "' stroke='" + WARNA.navy + "' stroke-width='1.2'/><rect x=47 y=74 width=9 height=4 rx=1 fill='" + WARNA.kuning + "'/>" }) + "</g>" + keju + oyster(62, 112, true)),
      // kanan: oyster di pemanggang, api menari, asap naik
      svg("a-panggang", "<g class=asap-panggang><path d='M28 40 q-6 -8 0 -16 q6 -8 0 -16' stroke='#B9BDD6' stroke-width=3 fill=none stroke-linecap='round'/><path d='M50 44 q-6 -8 0 -16 q6 -8 0 -16' stroke='#B9BDD6' stroke-width=3 fill=none stroke-linecap='round'/></g>" +
        oyster(26, 70, true) + oyster(52, 70, true) +
        "<rect x=8 y=74 width=64 height=4 rx=2 fill='#555'/><rect x=8 y=74 width=64 height=1.5 fill='#999'/>" +
        "<g class=api><path class='f f1' d='M16 104 q-6 -14 4 -26 q2 10 8 12 q2 -8 0 -14 q12 10 6 28z' fill='url(#cps-api)'/><path class='f f2' d='M38 104 q-6 -16 4 -28 q2 10 8 12 q2 -8 0 -14 q12 12 6 30z' fill='url(#cps-api)'/><path class='f f3' d='M58 104 q-6 -14 4 -26 q2 10 8 12 q2 -8 0 -14 q12 10 6 28z' fill='url(#cps-api)'/></g>" +
        "<rect x=4 y=104 width=72 height=12 rx=3 fill='url(#cps-besi)'/><rect x=6 y=105 width=68 height=3 rx=1.5 fill='url(#cps-kilap)'/><rect x=10 y=116 width=5 height=4 fill='" + WARNA.navyTua + "'/><rect x=65 y=116 width=5 height=4 fill='" + WARNA.navyTua + "'/>")
    ];
  },
  SIAP: function () {
    var anjing = function (x, y, s, k) {
      return "<g class='anjing " + k + "' transform='translate(" + x + " " + y + ") scale(" + s + ")'>" +
        "<ellipse class=bayang-anjing cx=14 cy=22 rx=12 ry=2 fill='#000' opacity='.15'/><ellipse cx=14 cy=10 rx=12 ry=6 fill='url(#cps-anjing)'/><circle cx=2 cy=4 r=6 fill='url(#cps-anjing)'/><ellipse cx=0 cy=1.5 rx=2.2 ry=1.2 fill='#fff' opacity='.35'/><path d='M-1 0 l-3 -6 l6 3z' fill='#6B4523'/><circle cx=0 cy=3 r=1 fill='#111'/><circle cx=-4 cy=5 r=1.3 fill='#111'/>" +
        "<path class=ekor d='M25 7 q6 -6 4 -10' stroke='#A0703F' stroke-width=3 fill=none stroke-linecap='round'/>" +
        "<g class=kaki-anjing><rect class=ka x=5 y=14 width=3 height=7 fill='#6B4523'/><rect class=kb x=11 y=14 width=3 height=7 fill='#6B4523'/><rect class=ka x=18 y=14 width=3 height=7 fill='#6B4523'/><rect class=kb x=23 y=14 width=3 height=7 fill='#6B4523'/></g></g>";
    };
    var kotak = "<g class=kotak-makanan><rect x=27 y=58 width=26 height=16 rx=3 fill='" + WARNA.putih + "' stroke='" + WARNA.navy + "' stroke-width='1.5'/><rect x=27 y=58 width=26 height=5 rx=2 fill='" + WARNA.kuning + "'/><path d='M36 68 c-2 -1.6 -2.4 -3 -1.2 -3.5 c.6 -.2 1 .1 1.2 .5 c.2 -.4 .7 -.7 1.2 -.5 c1.2 .5 .8 1.9 -1.2 3.5z' fill='" + WARNA.navy + "'/></g>";
    return [
      // kiri: koki memeluk erat makananmu sambil termenung menunggu
      svg("a-jaga", "<g class=pikir><circle cx=60 cy=16 r=2 fill='#C9CBDB'/><circle cx=66 cy=10 r=3 fill='#C9CBDB'/><rect x=46 y=-2 width=32 height=12 rx=6 fill='#EEEFF5'/><text x=62 y=6.5 text-anchor=middle font-size=7 font-weight=800 fill='" + WARNA.navy + "' font-family='Nunito,sans-serif'>kamu mana?</text></g>" +
        "<g class=penjaga transform='translate(0 8)'>" + koki("cemas", { rotKiri: -55, rotKanan: 55, depan: kotak }) + "</g>"),
      // kanan: anjing-anjing mengejar
      svg("a-anjing", "<g class=guk><text x=6 y=40 font-size=8 font-weight=800 fill='" + WARNA.navy + "' font-family='Nunito,sans-serif'>Guk!</text><text x=46 y=66 font-size=8 font-weight=800 fill='" + WARNA.navy + "' font-family='Nunito,sans-serif'>Guk!</text></g>" +
        "<g class=lari>" + anjing(14, 46, 1.1, "a1") + anjing(40, 74, .9, "a2") + anjing(8, 96, 1, "a3") + "</g>" +
        "<g class=debu><circle cx=70 cy=64 r=3 fill='#E4DCD0'/><circle cx=64 cy=112 r=4 fill='#E4DCD0'/><circle cx=76 cy=88 r=2.5 fill='#E4DCD0'/></g>")
    ];
  },
  DIAMBIL: function () {
    return [
      svg("a-terimakasih", "<g class=gelembung><rect x=0 y=0 width=56 height=15 rx=7 fill='" + WARNA.putih + "' stroke='" + WARNA.navy + "' stroke-width='1.5'/><text x=28 y=10.5 text-anchor=middle font-size=7.5 font-weight=800 fill='" + WARNA.navy + "' font-family='Nunito,sans-serif'>Selamat makan!</text></g><g transform='translate(0 8)'>" + koki("senyum", { rotKiri: 150, rotKanan: -150 }) + "</g>"),
      svg("a-hati", "<g class=hati-hati><text class=h1 x=20 y=90 font-size=18>💛</text><text class=h2 x=44 y=100 font-size=14>💙</text><text class=h3 x=30 y=110 font-size=12>💛</text></g>")
    ];
  }
};
function adegan(status) { var f = ADEGAN[status]; return f ? f() : ["", ""]; }
