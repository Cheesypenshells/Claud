// Membuat docs/antrian/index.html (halaman pelanggan di GitHub Pages) dari apps-script/Code.gs.
// Halaman Apps Script selalu berada di dalam iframe Google, sehingga Chrome menolak getaran (navigator.vibrate)
// dan penahan layar. Halaman ini dibuka langsung (bukan iframe) dan membaca status lewat <url web app>?p=api&t=TOKEN.
//
// Pakai: node scripts/halaman-pelanggan.mjs <url web app /exec>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import vm from 'node:vm';

const akar = new URL('..', import.meta.url).pathname;
export function buatHalaman(api) {
  const c = {};
  vm.createContext(c);
  vm.runInContext(readFileSync(`${akar}apps-script/Code.gs`, 'utf8'), c);
  const isi = `${c.GAYA}</head><body>${c.BADAN_PESANAN}<script>var API=${JSON.stringify(api)};var TOKEN=(new URLSearchParams(location.search).get("t")||"").replace(/[^a-z0-9]/gi,"");${c.JS_PESANAN}function muat(){fetch(API+"?p=api&t="+TOKEN).then(function(r){return r.json()}).then(tampil).catch(function(){})}var timer=setInterval(muat,5000);muat();</script></body></html>\n`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="theme-color" content="#22348C"><title>Pesanan – Cheesy Pen Shells</title><link rel="icon" href="../img/logo.png">` + isi.replace(/__ASET__/g, "../img/");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const api = process.argv[2];
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(api || '')) {
    console.error('Pakai: node scripts/halaman-pelanggan.mjs https://script.google.com/macros/s/<ID>/exec');
    process.exit(1);
  }
  mkdirSync(`${akar}docs/antrian`, { recursive: true });
  writeFileSync(`${akar}docs/antrian/index.html`, buatHalaman(api));
  console.log('docs/antrian/index.html dibuat');
}
