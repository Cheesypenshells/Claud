// Bot bertanya balik kalau laporan kurang lengkap, lalu mencatat setelah dijawab.
// Sesi disimpan per grup + pengirim, jadi jawaban orang lain tidak tertukar.

import { parseMoney, findMoney, bersihkan } from './util.js';
import { tebakKategori, DAFTAR_KATEGORI, KATEGORI, ambilUangSiapa } from './parsers.js';
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

const PILIHAN_KATEGORI = DAFTAR_KATEGORI.filter((k) => k !== KATEGORI.LAIN && k !== KATEGORI.RUKO);

// Nama kategori yang bisa ditulis dengan kata-kata, contoh "masuk non konsumtif".
export const SEBUTAN_KATEGORI = [
  [/non[\s-]?konsumtif|kelalaian/, KATEGORI.NON_KONSUMTIF], [/konsumtif/, KATEGORI.KONSUMTIF],
  [/transport|ekspedisi/, KATEGORI.TRANSPORT], [/konsumsi|makan/, KATEGORI.KONSUMSI], [/iklan|endorse/, KATEGORI.IKLAN],
  [/tak terduga|tidak terduga/, KATEGORI.TAK_TERDUGA], [/penginapan|hotel/, KATEGORI.PENGINAPAN], [/admin|sewa/, KATEGORI.ADMIN],
  [/gaji|upah/, KATEGORI.GAJI], [/oyster|tiram/, KATEGORI.OYSTER], [/bahan baku/, KATEGORI.BAHAN_LAIN], [/operasional/, KATEGORI.OPERASIONAL],
];

// Pertanyaan kategori disimpan berantrean, jadi beberapa catatan bisa dijawab satu per satu.
export function tanyaKategori(ctx, pesan, idTransaksi, keterangan = '') {
  const k = kunciSesi(pesan);
  const lama = ctx.sesi.get(k);
  const antrean = (lama?.tipe === 'kategori' ? lama.antrean || [] : []).filter((x) => x.id !== idTransaksi).slice(-4);
  antrean.push({ id: idTransaksi, keterangan });
  ctx.sesi.set(k, { tipe: 'kategori', antrean, waktu: Date.now() });
  return `💬 Kategori *${keterangan || idTransaksi}* belum jelas. Balas nomornya (boleh dalam kalimat, contoh *"${keterangan || 'ini'} masuk no 9"*), atau abaikan:\n${PILIHAN_KATEGORI.map((x, i) => `${i + 1} = ${x}`).join('\n')}`;
}

// "Botol spray masuk nya no9" -> kategori no. 9 untuk catatan "botol spray".
function jawabKategori(sesi, teks) {
  const t = teks.toLowerCase();
  let kategori = null;
  const no = t.match(/(?:^|no\.?|nomor|nomer|#|\s)\s*(\d{1,2})(?!\d)/);
  if (no && PILIHAN_KATEGORI[Number(no[1]) - 1]) kategori = PILIHAN_KATEGORI[Number(no[1]) - 1];
  if (!kategori) kategori = SEBUTAN_KATEGORI.find(([re]) => re.test(t))?.[1] || null;
  if (!kategori) return null;
  const antrean = sesi.antrean || [];
  const kata = (s) => String(s).toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  const cocok = antrean.filter((x) => kata(x.keterangan).some((w) => t.includes(w)));
  const target = cocok.length ? cocok[cocok.length - 1] : antrean[antrean.length - 1];
  return target ? { target, kategori } : null;
}

// Penyesuaian nominal selagi bot menunggu keterangan:
//   "jadi total nya 2120k" -> 2.120.000; "dikurangi 500k" / "deposit 500k" -> nominal lama - 500.000.
// Mengembalikan { nominal, potong, sisa } (sisa = teks tanpa kata/angka penyesuaian), atau null.
const KATA_SESUAI = /\b(\w*kurang\w*|\w*potong\w*|bukan|tapi|minus|deposit|jaminan|jadi|jadinya|hadi|total|totalnya|nya|biaya|biayanya|harga|harganya|seharusnya|harusnya|yang|benar|termasuk|dikembalikan|nanti|kembali|sebenarnya)\b/gi;
export function sesuaikanNominal(teks, nominalLama) {
  const t = String(teks).replace(/([a-z])(\d)/gi, '$1 $2');
  const uang = findMoney(t);
  if (!uang.length) return null;
  const kecil = t.toLowerCase();
  let nominal = null;
  let potong = 0;
  const jadi = uang.find((u) => /(jadi|jadinya|hadi|total\s*nya|totalnya|harusnya|seharusnya|yang benar)\s*$/.test(kecil.slice(0, u.index).trim()));
  const kurang = uang.find((u) => /(\w*kurang\w*|\w*potong\w*|minus|deposit|jaminan)\s*$/.test(kecil.slice(0, u.index).trim()));
  if (jadi) nominal = jadi.nilai;
  if (kurang) potong = kurang.nilai;
  if (nominal === null && potong) nominal = nominalLama - potong;
  if (nominal === null && uang.length === 1 && /\b(bukan|harusnya|seharusnya|jadi)\b/.test(kecil)) nominal = uang[0].nilai;
  if (nominal === null || nominal <= 0) return null;
  if (!potong && nominal < nominalLama) potong = nominalLama - nominal;
  let sisa = t;
  for (const u of [...uang].sort((a, b) => b.index - a.index)) sisa = sisa.slice(0, u.index) + ' ' + sisa.slice(u.index + u.panjang);
  sisa = bersihkan(sisa.replace(KATA_SESUAI, ' ').replace(/[,.]+/g, ' '));
  return { nominal, potong, sisa };
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
    if (!teks || teks.startsWith('#')) { ctx.sesi.hapus(k); return null; }
    const uangSiapa = sesi.uangSiapa ? ` uang ${sesi.uangSiapa}` : '';
    if (findMoney(teks).length) {
      // "bukan 2620k tapi dikurangi 500k jadi total nya 2120k uang melia": sesuaikan nominal, lalu tanya lagi untuk apa.
      const ubah = sesuaikanNominal(teks, sesi.nominal);
      if (!ubah) { ctx.sesi.hapus(k); return null; }
      const { siapa, sisa } = ambilUangSiapa(ubah.sisa);
      const siapaBaru = siapa ? siapa.replace(/^@/, '') : sesi.uangSiapa;
      if (sisa) { // keterangan sudah ada di kalimat yang sama
        ctx.sesi.hapus(k);
        return { pengeluaran: `${sisa} ${ubah.nominal}${siapaBaru ? ` uang ${siapaBaru}` : ''}`, nominalLama: sesi.nominal, nominalBaru: ubah.nominal };
      }
      ctx.sesi.set(k, { ...sesi, nominal: ubah.nominal, uangSiapa: siapaBaru, waktu: Date.now() });
      return {
        nominalBaru: ubah.nominal,
        nominalLama: sesi.nominal,
        balasan: `👌 Oke, nominal jadi *Rp ${ubah.nominal.toLocaleString('id-ID')}*${ubah.potong ? ` (Rp ${sesi.nominal.toLocaleString('id-ID')} dikurangi Rp ${ubah.potong.toLocaleString('id-ID')})` : ''}${siapaBaru ? `, uang ${siapaBaru}` : ''}.\n💬 Pengeluaran *Rp ${ubah.nominal.toLocaleString('id-ID')}* ini untuk apa?\nBalas keterangannya, contoh: *hotel*`,
      };
    }
    ctx.sesi.hapus(k);
    return { pengeluaran: `${teks} ${sesi.nominal}${uangSiapa}` };
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
    // Pesan bernominal adalah pengeluaran baru, bukan jawaban: pertanyaan tetap menunggu.
    if (findMoney(teks).length) return null;
    const hasil = jawabKategori(sesi, teks);
    if (!hasil) return null;
    const sisa = (sesi.antrean || []).filter((x) => x.id !== hasil.target.id);
    if (sisa.length) ctx.sesi.set(k, { ...sesi, antrean: sisa, waktu: Date.now() });
    else ctx.sesi.hapus(k);
    return { kategori: { id: hasil.target.id, kategori: hasil.kategori, keterangan: hasil.target.keterangan } };
  }
  ctx.sesi.hapus(k);
  return null;
}
