// Deteksi wajah ringan (pure JavaScript, jalan di HP/Termux tanpa internet) untuk foto absen.
// Algoritma pico (Markus dkk., "Object Detection with Pixel Intensity Comparisons Organized in Decision Trees"),
// cascade "facefinder" dari github.com/nenadmarkus/pico (lisensi MIT) disimpan di data/facefinder.
// Hanya mendeteksi ADA/TIDAK wajah (bukan mengenali siapa orangnya).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Jimp } from 'jimp';

let klasifikasi = null;
function muatCascade() {
  if (klasifikasi) return klasifikasi;
  const bytes = readFileSync(fileURLToPath(new URL('../data/facefinder', import.meta.url)));
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 8;
  const tdepth = dv.getInt32(p, true); p += 4;
  const ntrees = dv.getInt32(p, true); p += 4;
  const pow2 = 2 ** tdepth;
  const tcodes = new Int8Array(ntrees * 4 * pow2);
  const tpreds = new Float32Array(ntrees * pow2);
  const thresh = new Float32Array(ntrees);
  for (let t = 0; t < ntrees; t++) {
    // 4 kode pertama tiap pohon = 0 (simpul akar dimulai dari indeks 1)
    for (let i = 0; i < 4 * pow2 - 4; i++) tcodes[t * 4 * pow2 + 4 + i] = dv.getInt8(p + i);
    p += 4 * pow2 - 4;
    for (let i = 0; i < pow2; i++) { tpreds[t * pow2 + i] = dv.getFloat32(p, true); p += 4; }
    thresh[t] = dv.getFloat32(p, true); p += 4;
  }
  klasifikasi = (r, c, s, px, ldim) => {
    r *= 256; c *= 256;
    let root = 0, o = 0;
    for (let i = 0; i < ntrees; i++) {
      let idx = 1;
      for (let j = 0; j < tdepth; j++) {
        const a = px[((r + tcodes[root + 4 * idx] * s) >> 8) * ldim + ((c + tcodes[root + 4 * idx + 1] * s) >> 8)];
        const b = px[((r + tcodes[root + 4 * idx + 2] * s) >> 8) * ldim + ((c + tcodes[root + 4 * idx + 3] * s) >> 8)];
        idx = 2 * idx + (a <= b ? 1 : 0);
      }
      o += tpreds[pow2 * i + idx - pow2];
      if (o <= thresh[i]) return -1;
      root += 4 * pow2;
    }
    return o - thresh[ntrees - 1];
  };
  return klasifikasi;
}

function jalankan(px, nrows, ncols, { minsize, maxsize, shift = 0.1, skala = 1.1 }) {
  const cls = muatCascade();
  const hasil = [];
  for (let s = minsize; s <= maxsize; s *= skala) {
    const step = Math.max(shift * s, 1) | 0;
    const off = (s / 2 + 1) | 0;
    for (let r = off; r <= nrows - off; r += step) {
      for (let c = off; c <= ncols - off; c += step) {
        const q = cls(r, c, s, px, ncols);
        if (q > 0) hasil.push([r, c, s, q]);
      }
    }
  }
  return hasil;
}

const iou = (a, b) => {
  const ov = Math.max(0, Math.min(a[0] + a[2] / 2, b[0] + b[2] / 2) - Math.max(a[0] - a[2] / 2, b[0] - b[2] / 2))
    * Math.max(0, Math.min(a[1] + a[2] / 2, b[1] + b[2] / 2) - Math.max(a[1] - a[2] / 2, b[1] - b[2] / 2));
  return ov / (a[2] * a[2] + b[2] * b[2] - ov);
};
function gabung(dets) {
  dets.sort((a, b) => b[3] - a[3]);
  const pakai = new Array(dets.length).fill(false);
  const out = [];
  for (let i = 0; i < dets.length; i++) {
    if (pakai[i]) continue;
    let r = 0, c = 0, s = 0, q = 0, n = 0;
    for (let j = i; j < dets.length; j++) {
      if (!pakai[j] && iou(dets[i], dets[j]) > 0.2) { pakai[j] = true; r += dets[j][0]; c += dets[j][1]; s += dets[j][2]; q += dets[j][3]; n++; }
    }
    out.push({ r: r / n, c: c / n, ukuran: s / n, skor: q });
  }
  return out;
}

export const SKOR_WAJAH = 20; // ambang skor (gabungan) supaya dianggap wajah

// buffer foto (JPEG/PNG) -> { ada, skor, wajah: [...] }. Gambar dikecilkan ke sisi terpanjang 480 px.
export async function deteksiWajah(buffer, { ambang = SKOR_WAJAH } = {}) {
  const img = await Jimp.read(buffer);
  const maks = 480;
  if (Math.max(img.bitmap.width, img.bitmap.height) > maks) {
    img.scaleToFit({ w: maks, h: maks });
  }
  const { width: w, height: h, data } = img.bitmap;
  const px = new Uint8Array(w * h);
  for (let i = 0, k = 0; i < px.length; i++, k += 4) px[i] = (2 * data[k] + 7 * data[k + 1] + data[k + 2]) / 10;
  const kecil = Math.min(w, h);
  const wajah = gabung(jalankan(px, h, w, { minsize: Math.max(24, kecil * 0.08), maxsize: kecil * 0.95 }))
    .filter((d) => d.skor >= ambang);
  return { ada: wajah.length > 0, skor: wajah.length ? Math.round(wajah[0].skor) : 0, wajah };
}
