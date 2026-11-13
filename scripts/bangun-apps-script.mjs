// Menyusun bagian tampilan apps-script/Code.gs dari file biasa di apps-script/klien/ (gaya, kasir, pesanan, komplain),
// lalu membuat ulang halaman pelanggan GitHub Pages (docs/antrian). Edit file klien, lalu jalankan:
//   node scripts/bangun-apps-script.mjs
// Code.gs tetap satu file untuk ditempel di editor Apps Script.
import { readFileSync, writeFileSync } from 'node:fs';

const akar = new URL('..', import.meta.url).pathname;
const baca = (f) => readFileSync(`${akar}apps-script/klien/${f}`, 'utf8');
const MULAI = '// ==== TAMPILAN (dibuat otomatis oleh scripts/bangun-apps-script.mjs dari apps-script/klien/, jangan diedit di sini) ====';
const AKHIR = '// ==== AKHIR TAMPILAN ====';
export const ASET = 'https://raw.githubusercontent.com/cheesypenshells/Claud/claude/cheesy-pen-shells-management-nq92xx/docs/img/';

// Teks menjadi deretan string JavaScript, satu baris sumber per baris kode.
const literal = (teks) => {
  const baris = teks.replace(/\n+$/, '').split('\n');
  return baris.map((b, i) => `  ${JSON.stringify(i < baris.length - 1 ? `${b}\n` : b)}`).join(' +\n');
};

export function blokTampilan() {
  return [
    MULAI,
    `var ASET = ${JSON.stringify(ASET)};`,
    `var GAYA =\n${literal(baca('gaya.html'))};`,
    `var HTML_KASIR =\n${literal(baca('kasir.html'))};`,
    '// Halaman pelanggan: dipakai juga untuk GitHub Pages (docs/antrian, lihat scripts/halaman-pelanggan.mjs).',
    `var BADAN_PESANAN =\n${literal(baca('pesanan.html'))};`,
    `var JS_PESANAN =\n${literal(`${baca('animasi.js')}\n${baca('pesanan.js')}`)};`,
    "var HTML_PESANAN = BADAN_PESANAN + '<script>var TOKEN=\"__TOKEN__\";' + JS_PESANAN +",
    "  'function muat(){google.script.run.withSuccessHandler(tampil).statusPesanan(TOKEN)}' +",
    "  'function kirimNilai(b,u,ok,gagal){google.script.run.withSuccessHandler(ok).withFailureHandler(gagal).nilaiPesanan(TOKEN,b,u)}' +",
    "  'var timer=setInterval(muat,5000);muat();</script>';",
    `var HTML_KOMPLAIN =\n${literal(baca('komplain.html'))};`,
    AKHIR,
  ].join('\n');
}

export function susunCodeGs(src) {
  const i = src.includes(MULAI) ? src.indexOf(MULAI) : src.indexOf('// Gaya Cheesy Pen Shells');
  if (i < 0) throw new Error('Penanda bagian tampilan tidak ditemukan di Code.gs');
  const j = src.includes(AKHIR) ? src.indexOf(AKHIR) + AKHIR.length : src.length;
  return `${src.slice(0, i)}${blokTampilan()}${src.slice(j).replace(/^\s*$/, '')}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const p = `${akar}apps-script/Code.gs`;
  writeFileSync(p, susunCodeGs(readFileSync(p, 'utf8')));
  const { buatHalaman } = await import('./halaman-pelanggan.mjs');
  const lama = readFileSync(`${akar}docs/antrian/index.html`, 'utf8');
  const api = lama.match(/var API="([^"]+)"/)[1];
  writeFileSync(`${akar}docs/antrian/index.html`, buatHalaman(api));
  console.log('apps-script/Code.gs & docs/antrian/index.html diperbarui');
}
