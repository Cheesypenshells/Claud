// Pengiriman & stok awal event (loading in). Setelah grup tim didaftarkan, atau lewat #kirim / #stokawal,
// bot menanyakan: penanggung jawab pengiriman, moda (truk / kereta-transit / lainnya), jumlah koli bahan
// kering + daftar isinya, jumlah koli bahan baku, dan rincian isi bahan baku.
// Daftar bernomor yang dikirim karyawan ("CPS Barang Dry Semarang\n1. Freezer\n2. Box L ...") dikenali
// kapan saja (di grup tim maupun pengeluaran, sebelum atau saat pertanyaan berjalan) sebagai isi bahan kering.
// Bahan baku dicatat sebagai "Keluar" dari gudang (masuk pembukuan bahan baku event; sisa yang
// dikembalikan di akhir event mengurangi biaya). Di grup tim hanya jumlah barang; nilai rupiah hanya
// dikirim ke grup pengeluaran (owner + PIC).

import { STATUS } from './schema.js';
import { parseBahan } from './parsers.js';
import { cocokkan } from './katalog.js';
import { tanggalLokal, waktuLokal, rupiah, bersihkan, parseMoney } from './util.js';

const BERLAKU_MS = 3 * 60 * 60 * 1000;
const kunci = (groupId) => `kirim:${groupId}`;
const kunciDaftar = (kode) => `daftarkirim:${kode}`;
const DAFTAR_BERLAKU_MS = 4 * 24 * 60 * 60 * 1000;
const balas = (text) => [{ text }];
const RE_JUDUL = /barang|dry|kering|kirim|koli|muat|loading|packing|perlengkapan/i;
const LEWATI = /^(-|0|tidak ada|nggak ada|gak ada|ga ada|kosong|lewati)$/i;

const LANGKAH = [
  { k: 'pj', tanya: 'Siapa *penanggung jawab pengiriman* barang ke lokasi?', contoh: 'Imam' },
  { k: 'moda', tanya: 'Barang dikirim pakai apa?\n1 = Truk\n2 = Kereta (transit)\n3 = Lainnya (tulis, contoh: kapal, ekspedisi, mobil sendiri)', contoh: '1' },
  { k: 'koli_kering', tanya: 'Berapa *koli bahan kering* yang dikirim? (*0* kalau tidak ada)', contoh: '6' },
  { k: 'isi_kering', tanya: 'Apa saja *isi bahan kering*-nya? Kirim daftarnya, satu per baris (boleh bernomor).', contoh: '1. Freezer\n2. Box L\n3. Lampu display depan\n4. Meja besi 2' },
  { k: 'koli_baku', tanya: 'Berapa *koli bahan baku* (frozen/dingin) yang dikirim? (*0* kalau tidak ada)', contoh: '4' },
  { k: 'rincian', tanya: 'Apa saja *isi bahan baku*-nya? Satu per baris atau pisah koma.', contoh: 'keju 5 balok\nbumbu garlic 3 pack\nbumbu merah 1 pack\noyster 100 kg' },
];

function tanya(sesi) {
  const l = LANGKAH[sesi.langkah];
  return `📦 *(${sesi.langkah + 1}/${LANGKAH.length}) ${l.tanya}*\nContoh: ${l.contoh.includes('\n') ? `\n${l.contoh}` : l.contoh}\n_Ketik *batal* untuk berhenti._`;
}

export function mulaiPengiriman(ctx, groupId, event) {
  const sesi = { kode: event.kode, langkah: 0, data: {}, waktu: Date.now() };
  ctx.sesi.set(kunci(groupId), sesi);
  return `🚚 *Data pengiriman & stok awal ${event.kode}* (${event.kota})\nBahan baku yang dikirim akan dicatat ke pembukuan event.\n\n${tanya(sesi)}`;
}

const L = Object.fromEntries(LANGKAH.map((l, i) => [l.k, i]));

// Daftar barang bernomor (minimal 3 baris "1. Freezer"). Baris tanpa nomor di atasnya = judul.
export function bacaDaftar(teks) {
  const baris = String(teks || '').split('\n').map((b) => b.trim()).filter(Boolean);
  const barang = [];
  let judul = '';
  for (const b of baris) {
    const m = b.match(/^\d{1,3}\s*[.)\-]\s*(.+)$/);
    if (m) barang.push(m[1].trim());
    else if (!barang.length && !judul) judul = b;
    else if (barang.length) barang[barang.length - 1] += ` ${b}`; // lanjutan baris panjang
  }
  if (barang.length < 3) return null;
  return { judul, barang, frozen: barang.filter((b) => /frozen|beku|dingin/i.test(b)).length };
}

function teksDaftar(daftar) {
  const f = daftar.frozen ? ` (${daftar.frozen} di antaranya frozen)` : '';
  return `${daftar.barang.length} barang${f}`;
}

const MODA = { 1: 'Truk', 2: 'Kereta (transit)' };
function bacaModa(t) {
  if (MODA[t.trim()]) return MODA[t.trim()];
  if (/truk|truck|tronton|colt|engkel/i.test(t)) return 'Truk';
  if (/kereta|ka\b|kai|transit/i.test(t)) return 'Kereta (transit)';
  const lain = bersihkan(t.replace(/^3\b\s*[-=:]?/, ''));
  return lain && !/^\d+$/.test(lain) ? lain.charAt(0).toUpperCase() + lain.slice(1) : null;
}

// Rincian bahan: yang dikenali katalog (Harga Bahan) dan yang belum ("packaging 886 pcs").
export function bacaRincian(teks, hargaBahan) {
  const bagian = String(teks).split(/\n|,(?=\s*\D)/).map((b) => b.trim()).filter(Boolean);
  const dikenal = [];
  const lain = [];
  for (const b of bagian) {
    const [it] = parseBahan(b, hargaBahan, cocokkan);
    if (it) dikenal.push(it);
    else lain.push(b);
  }
  return { dikenal, lain };
}

function ringkasan(sesi, hargaBahan, { harga = false } = {}) {
  const d = sesi.data;
  const baris = [
    `Penanggung jawab: *${d.pj}*`,
    `Pengiriman: *${d.moda}*`,
    `Bahan kering: *${d.koli_kering} koli*`,
  ];
  if (d.isi_kering?.length) baris.push(...d.isi_kering.map((b, i) => `   ${i + 1}. ${b}`));
  baris.push(`Bahan baku: *${d.koli_baku} koli*`);
  if (d.dikenal?.length || d.lain?.length) {
    baris.push('Isi bahan baku:');
    let total = 0;
    for (const it of d.dikenal || []) {
      const h = Number(hargaBahan.find((x) => x.bahan === it.bahan)?.harga || 0);
      total += h * it.jumlah;
      baris.push(harga ? `• ${it.bahan} ${it.jumlah} ${it.satuan} × ${rupiah(h)} = *${rupiah(h * it.jumlah)}*` : `• ${it.bahan} ${it.jumlah} ${it.satuan}`);
    }
    for (const l of d.lain || []) baris.push(`• ${l}${harga ? ' _(belum ada di tab Harga Bahan, belum dihitung)_' : ''}`);
    if (harga) baris.push(`*Total nilai bahan baku: ${rupiah(total)}*`);
  }
  return baris.join('\n');
}

// Jawaban pertanyaan pengiriman. Mengembalikan balasan (boleh berisi pesan untuk grup lain) atau null.
export async function jawabPengiriman(ctx, pesan, { namaPengirim, grupPengeluaran = [], event = null }) {
  if (!ctx.sesi) return null;
  const t = String(pesan.text || '').trim();
  if (!t || t.startsWith('#')) return null;
  const sesi = ctx.sesi.get(kunci(pesan.groupId));
  const aktif = sesi && Date.now() - sesi.waktu <= BERLAKU_MS;
  // Daftar barang: bukan daftar pengeluaran (tanpa nominal). Di luar sesi hanya yang berjudul barang/dry/kering.
  let daftar = parseMoney(t) ? null : bacaDaftar(t);
  if (daftar && !aktif && !RE_JUDUL.test(daftar.judul)) daftar = null;
  if (daftar && (aktif || event)) {
    const kode = aktif ? sesi.kode : event.kode;
    const simpanan = { ...daftar, pengirim: namaPengirim(pesan), waktu: Date.now() };
    if (!aktif || sesi.langkah === L.rincian) {
      // Pertanyaan belum berjalan di grup ini (atau sedang di grup lain): simpan, dipakai saat ditanyakan.
      if (!aktif) {
        ctx.sesi.set(kunciDaftar(kode), simpanan);
        return balas(`📝 Daftar barang dari ${simpanan.pengirim} tercatat: *${teksDaftar(daftar)}*. Dipakai sebagai *isi bahan kering* data pengiriman ${kode}.`);
      }
    } else {
      sesi.data.isi_kering = daftar.barang;
      if (!(sesi.data.koli_kering > 0)) sesi.data.koli_kering = daftar.barang.length;
      ctx.sesi.hapus(kunciDaftar(kode));
      let info = `📝 Isi bahan kering tercatat: *${teksDaftar(daftar)}*.`;
      if (sesi.langkah === L.koli_kering || sesi.langkah === L.isi_kering) {
        sesi.langkah = sesi.ubahSatu ? LANGKAH.length : L.koli_baku;
        info += ` Jumlah koli bahan kering = *${sesi.data.koli_kering}*.`;
      }
      return lanjut(ctx, pesan, sesi, info);
    }
  }
  if (!aktif) return null;
  // Pesan pengeluaran ("lalamove 150k") atau kalimat panjang bukan jawaban: biarkan diproses biasa.
  const bebas = sesi.langkah === L.rincian || sesi.langkah === L.isi_kering; // jawaban berupa daftar
  if (parseMoney(t) || (!bebas && t.split(/\s+/).length > 6)) return null;
  // Obrolan ("oke pak siap", "makasih") bukan jawaban.
  const OBROLAN = /^(oke|ok|okk|okey|siap|sip|iya|ya|yaa|pak|bu|kak|mas|mbak|bos|boss|baik|noted|mantap|makasih|terima|kasih|thanks|nanti|bentar|sebentar|aman|done|hehe|wkwk)$/i;
  if (sesi.langkah !== L.moda && !(sesi.langkah === L.isi_kering && ctx.sesi.get(kunciDaftar(sesi.kode))) && sesi.langkah < LANGKAH.length && t.split(/\s+/).every((w) => OBROLAN.test(w.replace(/[^a-z]/gi, '')))) return null;
  if (/^batal$/i.test(t)) { ctx.sesi.hapus(kunci(pesan.groupId)); return balas('❎ Data pengiriman dibatalkan. Mulai lagi dengan *#kirim*.'); }
  const hargaBahan = await ctx.store.all('Harga Bahan');
  const d = sesi.data;

  if (sesi.langkah >= LANGKAH.length) { // konfirmasi
    if (/^(ya|y|ok|oke|benar|betul|simpan|sudah)$/i.test(t)) {
      ctx.sesi.hapus(kunci(pesan.groupId));
      return simpan(ctx, pesan, sesi, hargaBahan, { namaPengirim, grupPengeluaran });
    }
    const no = Number(t);
    if (no >= 1 && no <= LANGKAH.length) {
      sesi.langkah = no - 1; sesi.ubahSatu = true;
      if (sesi.langkah === L.isi_kering) d.isi_kering = []; // mau diganti: tanya lagi
      sesi.waktu = Date.now(); ctx.sesi.set(kunci(pesan.groupId), sesi);
      return balas(tanya(sesi));
    }
    return balas(`Balas *ya* untuk menyimpan, angka *1–${LANGKAH.length}* untuk mengubah jawaban, atau *batal*.`);
  }

  const l = LANGKAH[sesi.langkah];
  if (l.k === 'pj') {
    d.pj = bersihkan(t);
  } else if (l.k === 'moda') {
    const m = bacaModa(t);
    if (!m) return balas('Balas *1* (truk), *2* (kereta/transit), atau tulis moda lainnya.');
    d.moda = m;
  } else if (l.k === 'isi_kering') {
    const simpanan = ctx.sesi.get(kunciDaftar(sesi.kode));
    if (simpanan && /^(ya|y|iya|pakai|oke|ok|sama|itu)$/i.test(t)) {
      d.isi_kering = simpanan.barang;
    } else if (LEWATI.test(t)) {
      d.isi_kering = [];
    } else {
      d.isi_kering = t.split(/\n|,/).map((b) => b.replace(/^\d{1,3}\s*[.)\-]\s*/, '').trim()).filter(Boolean);
    }
    ctx.sesi.hapus(kunciDaftar(sesi.kode));
  } else if (l.k === 'koli_kering' || l.k === 'koli_baku') {
    const n = LEWATI.test(t) ? 0 : Number((t.match(/\d+/) || [])[0]);
    if (!(n >= 0)) return balas('Balas angka jumlah koli, contoh *4* (atau *0*).');
    d[l.k] = n;
  } else if (l.k === 'rincian') {
    if (LEWATI.test(t)) {
      d.dikenal = []; d.lain = [];
    } else {
      const { dikenal, lain } = bacaRincian(t, hargaBahan);
      if (!dikenal.length && !lain.length) return balas(`Belum terbaca. Tulis bahan dan jumlahnya, contoh:\nkeju 5 balok\nbumbu garlic 3 pack\n\nBahan yang dikenali: ${hargaBahan.map((b) => b.bahan).join(', ')}`);
      d.dikenal = dikenal; d.lain = lain;
    }
  }
  sesi.langkah = sesi.ubahSatu ? LANGKAH.length : sesi.langkah + 1;
  return lanjut(ctx, pesan, sesi);
}

// Lewati pertanyaan yang tidak perlu, simpan sesi, lalu tanya langkah berikutnya / minta konfirmasi.
async function lanjut(ctx, pesan, sesi, awalan = '') {
  const d = sesi.data;
  // Bahan kering 0 koli atau isinya sudah ada: daftar tidak ditanya.
  if (sesi.langkah === L.isi_kering && (d.koli_kering === 0 || d.isi_kering?.length)) { d.isi_kering = d.isi_kering || []; sesi.langkah = sesi.ubahSatu ? LANGKAH.length : L.koli_baku; }
  // Bahan baku 0 koli: rincian tidak ditanya.
  if (sesi.langkah === L.rincian && d.koli_baku === 0) { d.dikenal = []; d.lain = []; sesi.langkah = LANGKAH.length; }
  sesi.waktu = Date.now();
  ctx.sesi.set(kunci(pesan.groupId), sesi);
  const depan = awalan ? `${awalan}\n\n` : '';
  if (sesi.langkah < LANGKAH.length) {
    let q = tanya(sesi);
    const simpanan = ctx.sesi.get(kunciDaftar(sesi.kode));
    if (sesi.langkah === L.isi_kering && simpanan && Date.now() - simpanan.waktu <= DAFTAR_BERLAKU_MS) {
      q += `\n\n📝 Sudah ada daftar dari *${simpanan.pengirim}*${simpanan.judul ? ` ("${simpanan.judul}")` : ''}: *${teksDaftar(simpanan)}*. Balas *ya* untuk memakai daftar itu.`;
    }
    return balas(depan + q);
  }
  const hargaBahan = await ctx.store.all('Harga Bahan');
  return balas(`${depan}📋 *Cek data pengiriman ${sesi.kode}*\n${ringkasan(sesi, hargaBahan)}\n\nBalas *ya* untuk menyimpan, angka *1–${LANGKAH.length}* untuk mengubah, atau *batal*.`);
}

async function simpan(ctx, pesan, sesi, hargaBahan, { namaPengirim, grupPengeluaran }) {
  const d = sesi.data;
  const pengirim = namaPengirim(pesan);
  await ctx.store.append('Pengiriman', {
    kode_event: sesi.kode, tanggal: tanggalLokal(pesan.waktu), penanggung_jawab: d.pj, moda: d.moda,
    koli_kering: d.koli_kering, isi_kering: (d.isi_kering || []).join('; '), koli_baku: d.koli_baku,
    rincian: [...(d.dikenal || []).map((i) => `${i.bahan} ${i.jumlah} ${i.satuan}`), ...(d.lain || [])].join('; '),
    pengirim, status: STATUS.OK, dicatat: waktuLokal(pesan.waktu),
  });
  for (const it of d.dikenal || []) {
    await ctx.store.append('Bahan Event', {
      tanggal: tanggalLokal(pesan.waktu), kode_event: sesi.kode, bahan: it.bahan, gerak: 'Keluar', jumlah: it.jumlah, satuan: it.satuan,
      pengirim: `${pengirim} (stok awal)`, status: STATUS.OK, dicatat: waktuLokal(pesan.waktu),
    });
  }
  const info = `📦 *Stok awal ${sesi.kode} – bahan baku dari gudang* (dicatat ${pengirim})\n${ringkasan(sesi, hargaBahan, { harga: true })}\n\n_Masuk pembukuan event sebagai *Bahan baku (dari gudang)*. Sisa yang dikembalikan di akhir event mengurangi biaya ini. Harga per satuan bisa diubah di tab *Harga Bahan*._`;
  // Dijawab di grup pengeluaran: cukup satu pesan lengkap dengan harga.
  if (grupPengeluaran.includes(pesan.groupId)) return [{ text: info }];
  // Dijawab di grup tim: tanpa harga di grup tim, nilai rupiah dikirim ke grup pengeluaran.
  const akhir = grupPengeluaran.length ? '' : '\n_(Grup pengeluaran event belum terdaftar, jadi nilai rupiahnya belum dikirim.)_';
  return [
    { text: `✅ *Data pengiriman & stok awal ${sesi.kode} tersimpan.*\n${ringkasan(sesi, hargaBahan)}\n\n_Di akhir event, laporkan sisa bahan, contoh: *sisa keju 2 balok*._${akhir}` },
    ...grupPengeluaran.map((g) => ({ text: info, groupId: g })),
  ];
}
