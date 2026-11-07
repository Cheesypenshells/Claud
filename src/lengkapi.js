// Bot bertanya balik kalau laporan kurang lengkap, lalu mencatat setelah dijawab.
// Sesi disimpan per grup + pengirim, jadi jawaban orang lain tidak tertukar.

import { parseMoney, findMoney, bersihkan } from './util.js';
import { tebakKategori, DAFTAR_KATEGORI, KATEGORI } from './parsers.js';
import { cocokkan } from './katalog.js';

const BERLAKU_MS = 60 * 60 * 1000; // pertanyaan dianggap kedaluwarsa setelah 1 jam
const kunciSesi = (pesan) => `lengkapi:${pesan.groupId}:${pesan.senderId}`;

// Pesan tanpa harga yang jelas-jelas laporan pembelian, contoh "beli sapu", "bayar hotel", "lalamove ke venue".
const KATA_BELI = /(^|\s)(beli|bayar|sewa|isi|ongkos|biaya|belanja|order|pesan)(\s|$)/i;

export function perluTanyaHarga(teks) {
  const t = bersihkan(teks);
  if (!t || t.length > 120 || t.includes('?') || findMoney(t).length) return false;
  // Kata beli/bayar jelas laporan pembelian. Tanpa itu, hanya pesan pendek (≤ 3 kata) yang menyebut
  // barang/kategori, contoh "lalamove ke venue" — obrolan seperti "besok kirim jam 8 ya" tidak ditanya.
  const kata = t.split(/\s+/).length;
  return (KATA_BELI.test(t) && kata <= 8) || (tebakKategori(t) !== KATEGORI.LAIN && kata <= 3);
}

export function tanyaHarga(ctx, pesan, teks) {
  ctx.sesi.set(kunciSesi(pesan), { tipe: 'harga', teks: bersihkan(teks), waktu: Date.now() });
  return `💬 Berapa harga untuk *"${bersihkan(teks)}"*?\nBalas angkanya saja, contoh: *150rb*\n_(balas *batal* kalau ini bukan pengeluaran)_`;
}

// Kalimat bahan yang kurang: ada bahan tanpa jumlah, atau ada jumlah tanpa nama bahan.
export function tanyaBahan(ctx, pesan, teks, gerak, daftarBahan) {
  const bahan = cocokkan(teks, daftarBahan, 'bahan');
  const angka = String(teks).match(/(\d+(?:[.,]\d+)?)/);
  const angkaBersatuan = /(\d+(?:[.,]\d+)?)\s*(pack|pak|kg|kilo|kantong|plastik|pcs|bungkus|dus|karung|box)\b/i.test(teks);
  if (bahan && !angka) {
    ctx.sesi.set(kunciSesi(pesan), { tipe: 'jumlah_bahan', gerak, bahan: bahan.bahan, satuan: bahan.satuan, waktu: Date.now() });
    return `💬 Berapa *${bahan.satuan} ${bahan.bahan}*? Balas angkanya saja, contoh: *10*`;
  }
  if (!bahan && angka && angkaBersatuan) {
    ctx.sesi.set(kunciSesi(pesan), { tipe: 'nama_bahan', gerak, jumlah: Number(angka[1].replace(',', '.')), waktu: Date.now() });
    return `💬 Bahan apa yang ${angka[1]} itu?\n${daftarBahan.map((b, i) => `${i + 1} = ${b.bahan} (${b.satuan})`).join('\n')}\nBalas nomor atau nama bahannya.`;
  }
  return null;
}

// Nominal tanpa keterangan, contoh "300rb".
export function tanyaKeterangan(ctx, pesan, nominal) {
  ctx.sesi.set(kunciSesi(pesan), { tipe: 'keterangan', nominal, waktu: Date.now() });
  return `💬 Pengeluaran *Rp ${nominal.toLocaleString('id-ID')}* ini untuk apa?\nBalas keterangannya, contoh: *lalamove ke venue*\n_(balas *batal* kalau bukan pengeluaran)_`;
}

export function tanyaKategori(ctx, pesan, idTransaksi) {
  ctx.sesi.set(kunciSesi(pesan), { tipe: 'kategori', id: idTransaksi, waktu: Date.now() });
  const pilihan = DAFTAR_KATEGORI.filter((k) => k !== KATEGORI.LAIN && k !== KATEGORI.RUKO);
  return `💬 Kategorinya belum jelas. Balas nomornya supaya rapi (atau abaikan):\n${pilihan.map((k, i) => `${i + 1} = ${k}`).join('\n')}`;
}

// Memproses jawaban. Mengembalikan aksi untuk handler, atau null kalau tidak ada pertanyaan yang menunggu
// (atau jawabannya bukan jawaban, sehingga pesan diproses seperti biasa).
export function jawabLengkapi(ctx, pesan, daftarBahan) {
  const k = kunciSesi(pesan);
  const sesi = ctx.sesi.get(k);
  if (!sesi) return null;
  if (Date.now() - (sesi.waktu || 0) > BERLAKU_MS) { ctx.sesi.hapus(k); return null; }
  const teks = bersihkan(pesan.text);
  if (/^#?batal$/i.test(teks)) { ctx.sesi.hapus(k); return { balasan: '👌 Oke, tidak dicatat.' }; }

  if (sesi.tipe === 'harga') {
    const nominal = parseMoney(teks) ?? (/^\d+$/.test(teks) ? Number(teks) : null);
    if (!nominal) { ctx.sesi.hapus(k); return null; }
    ctx.sesi.hapus(k);
    return { pengeluaran: `${sesi.teks} ${nominal}` };
  }
  if (sesi.tipe === 'keterangan') {
    ctx.sesi.hapus(k);
    if (!teks || findMoney(teks).length || teks.startsWith('#')) return null;
    return { pengeluaran: `${teks} ${sesi.nominal}` };
  }
  if (sesi.tipe === 'jumlah_bahan') {
    const angka = teks.match(/^(\d+(?:[.,]\d+)?)/);
    if (!angka) { ctx.sesi.hapus(k); return null; }
    ctx.sesi.hapus(k);
    return { bahan: { gerak: sesi.gerak, teks: `${sesi.bahan} ${angka[1]} ${sesi.satuan}` } };
  }
  if (sesi.tipe === 'nama_bahan') {
    const no = Number(teks);
    const b = Number.isInteger(no) && no >= 1 ? daftarBahan[no - 1] : cocokkan(teks, daftarBahan, 'bahan');
    ctx.sesi.hapus(k);
    if (!b) return null;
    return { bahan: { gerak: sesi.gerak, teks: `${b.bahan} ${sesi.jumlah} ${b.satuan}` } };
  }
  if (sesi.tipe === 'kategori') {
    const pilihan = DAFTAR_KATEGORI.filter((x) => x !== KATEGORI.LAIN && x !== KATEGORI.RUKO);
    const no = Number(teks);
    ctx.sesi.hapus(k);
    if (!Number.isInteger(no) || !pilihan[no - 1]) return null;
    return { kategori: { id: sesi.id, kategori: pilihan[no - 1] } };
  }
  ctx.sesi.hapus(k);
  return null;
}
