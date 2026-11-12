// Pengiriman & stok awal event (loading in). Setelah grup tim didaftarkan, atau lewat #kirim / #stokawal,
// bot menanyakan: penanggung jawab pengiriman, moda (truk / kereta-transit / lainnya), jumlah koli bahan
// kering, jumlah koli bahan baku, dan rincian isi bahan baku.
// Bahan baku dicatat sebagai "Keluar" dari gudang (masuk pembukuan bahan baku event; sisa yang
// dikembalikan di akhir event mengurangi biaya). Di grup tim hanya jumlah barang; nilai rupiah hanya
// dikirim ke grup pengeluaran (owner + PIC).

import { STATUS } from './schema.js';
import { parseBahan } from './parsers.js';
import { cocokkan } from './katalog.js';
import { tanggalLokal, waktuLokal, rupiah, bersihkan, parseMoney } from './util.js';

const BERLAKU_MS = 3 * 60 * 60 * 1000;
const kunci = (groupId) => `kirim:${groupId}`;
const balas = (text) => [{ text }];
const LEWATI = /^(-|0|tidak ada|nggak ada|gak ada|ga ada|kosong|lewati)$/i;

const LANGKAH = [
  { k: 'pj', tanya: 'Siapa *penanggung jawab pengiriman* barang ke lokasi?', contoh: 'Imam' },
  { k: 'moda', tanya: 'Barang dikirim pakai apa?\n1 = Truk\n2 = Kereta (transit)\n3 = Lainnya (tulis, contoh: kapal, ekspedisi, mobil sendiri)', contoh: '1' },
  { k: 'koli_kering', tanya: 'Berapa *koli bahan kering* yang dikirim? (*0* kalau tidak ada)', contoh: '6' },
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
    `Bahan baku: *${d.koli_baku} koli*`,
  ];
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
export async function jawabPengiriman(ctx, pesan, { namaPengirim, grupPengeluaran = [] }) {
  if (!ctx.sesi) return null;
  const sesi = ctx.sesi.get(kunci(pesan.groupId));
  if (!sesi || Date.now() - sesi.waktu > BERLAKU_MS) return null;
  const t = String(pesan.text || '').trim();
  if (!t || t.startsWith('#')) return null;
  // Pesan pengeluaran ("lalamove 150k") atau kalimat panjang bukan jawaban: biarkan diproses biasa.
  if (parseMoney(t) || (sesi.langkah !== 4 && t.split(/\s+/).length > 6)) return null;
  // Obrolan ("oke pak siap", "makasih") bukan jawaban.
  const OBROLAN = /^(oke|ok|okk|okey|siap|sip|iya|ya|yaa|pak|bu|kak|mas|mbak|bos|boss|baik|noted|mantap|makasih|terima|kasih|thanks|nanti|bentar|sebentar|aman|done|hehe|wkwk)$/i;
  if (sesi.langkah !== 1 && sesi.langkah < LANGKAH.length && t.split(/\s+/).every((w) => OBROLAN.test(w.replace(/[^a-z]/gi, '')))) return null;
  if (/^batal$/i.test(t)) { ctx.sesi.hapus(kunci(pesan.groupId)); return balas('❎ Data pengiriman dibatalkan. Mulai lagi dengan *#kirim*.'); }
  const hargaBahan = await ctx.store.all('Harga Bahan');
  const d = sesi.data;

  if (sesi.langkah >= LANGKAH.length) { // konfirmasi
    if (/^(ya|y|ok|oke|benar|betul|simpan|sudah)$/i.test(t)) {
      ctx.sesi.hapus(kunci(pesan.groupId));
      return simpan(ctx, pesan, sesi, hargaBahan, { namaPengirim, grupPengeluaran });
    }
    const no = Number(t);
    if (no >= 1 && no <= LANGKAH.length) { sesi.langkah = no - 1; sesi.ubahSatu = true; ctx.sesi.set(kunci(pesan.groupId), { ...sesi, waktu: Date.now() }); return balas(tanya(sesi)); }
    return balas('Balas *ya* untuk menyimpan, angka *1–5* untuk mengubah jawaban, atau *batal*.');
  }

  const l = LANGKAH[sesi.langkah];
  if (l.k === 'pj') {
    d.pj = bersihkan(t);
  } else if (l.k === 'moda') {
    const m = bacaModa(t);
    if (!m) return balas('Balas *1* (truk), *2* (kereta/transit), atau tulis moda lainnya.');
    d.moda = m;
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
  // Bahan baku 0 koli: rincian tidak ditanya.
  if (sesi.langkah === 4 && d.koli_baku === 0) { d.dikenal = []; d.lain = []; sesi.langkah = LANGKAH.length; }
  sesi.waktu = Date.now();
  ctx.sesi.set(kunci(pesan.groupId), sesi);
  if (sesi.langkah < LANGKAH.length) return balas(tanya(sesi));
  return balas(`📋 *Cek data pengiriman ${sesi.kode}*\n${ringkasan(sesi, hargaBahan)}\n\nBalas *ya* untuk menyimpan, angka *1–5* untuk mengubah, atau *batal*.`);
}

async function simpan(ctx, pesan, sesi, hargaBahan, { namaPengirim, grupPengeluaran }) {
  const d = sesi.data;
  const pengirim = namaPengirim(pesan);
  await ctx.store.append('Pengiriman', {
    kode_event: sesi.kode, tanggal: tanggalLokal(pesan.waktu), penanggung_jawab: d.pj, moda: d.moda,
    koli_kering: d.koli_kering, koli_baku: d.koli_baku,
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
