// Aturan struk pengeluaran:
// - >= Rp 100.000 wajib foto struk yang sesuai; tanpa struk harus ACC owner.
// - Struk dicek: nominal, tanggal (masa event), merek/toko vs keterangan, kategori, dan tidak pernah dipakai.
// - < Rp 100.000 tanpa struk (cash) wajib keterangan yang jelas (beli apa / di mana).

import { createHash } from 'node:crypto';
import { KATEGORI, tebakKategori } from './parsers.js';
import { tambahHari } from './util.js';
import { bacaBukti } from './bukti.js';

export const BATAS_STRUK = 100000;

// Aturan struk berlaku untuk event yang mulai sejak tanggal ini. Event yang sudah berjalan sebelumnya
// (contoh Lombok LMB26-09) tidak diubah: tidak ditahan, tanpa kolom Bukti.
export const MULAI_ATURAN_STRUK = '2026-11-08';
export const eventWajibStruk = (event) => !event?.mulai || String(event.mulai) >= MULAI_ATURAN_STRUK;

// Merek yang sering muncul di struk. `merek` = nama yang bisa disebut di keterangan.
// Kategori hanya untuk Konsumsi / Transport / Penginapan (yang jelas bertentangan satu sama lain).
const MEREK = [
  // Makanan & minuman (GrabFood/GoFood dicek lebih dulu dari Grab/Gojek)
  ['GrabFood', /grab\s*food/, KATEGORI.KONSUMSI], ['GoFood', /go\s*food/, KATEGORI.KONSUMSI], ['ShopeeFood', /shopee\s*food/, KATEGORI.KONSUMSI],
  ['KFC', /\bkfc\b/, KATEGORI.KONSUMSI], ['McDonald', /\bmc\s*d|mcdonald/, KATEGORI.KONSUMSI], ['Burger King', /burger\s*king/, KATEGORI.KONSUMSI],
  ['Pizza Hut', /pizza\s*hut/, KATEGORI.KONSUMSI], ['Richeese', /richeese/, KATEGORI.KONSUMSI], ['HokBen', /hokben|hoka\s*hoka/, KATEGORI.KONSUMSI],
  ['Starbucks', /starbucks/, KATEGORI.KONSUMSI], ['Janji Jiwa', /janji\s*jiwa/, KATEGORI.KONSUMSI], ['Kopi Kenangan', /kopi\s*kenangan/, KATEGORI.KONSUMSI],
  ['Mixue', /mixue/, KATEGORI.KONSUMSI], ['Chatime', /chatime/, KATEGORI.KONSUMSI], ['Solaria', /solaria/, KATEGORI.KONSUMSI],
  ['A&W', /\ba\s*&\s*w\b/, KATEGORI.KONSUMSI], ['J.CO', /\bj\.?\s*co\b/, KATEGORI.KONSUMSI], ['Mie Gacoan', /gacoan/, KATEGORI.KONSUMSI],
  ['Bakmi GM', /bakmi\s*gm/, KATEGORI.KONSUMSI], ['Es Teh Indonesia', /es\s*teh\s*indonesia/, KATEGORI.KONSUMSI],
  // Transport
  ['Grab', /\bgrab\b/, KATEGORI.TRANSPORT], ['Gojek', /gojek|\bgo\s*(car|ride|send)\b/, KATEGORI.TRANSPORT], ['Maxim', /\bmaxim\b/, KATEGORI.TRANSPORT],
  ['inDrive', /in\s*drive/, KATEGORI.TRANSPORT], ['Lalamove', /lalamove/, KATEGORI.TRANSPORT], ['Deliveree', /deliveree/, KATEGORI.TRANSPORT],
  ['Bluebird', /blue\s*bird/, KATEGORI.TRANSPORT], ['Pertamina', /pertamina|pertalite|pertamax/, KATEGORI.TRANSPORT], ['Shell', /\bshell\b/, KATEGORI.TRANSPORT],
  ['DAMRI', /damri/, KATEGORI.TRANSPORT], ['KAI', /\bkai\b|kereta\s*api/, KATEGORI.TRANSPORT], ['Lion Air', /lion\s*air/, KATEGORI.TRANSPORT],
  ['Citilink', /citilink/, KATEGORI.TRANSPORT], ['Garuda', /garuda/, KATEGORI.TRANSPORT], ['Batik Air', /batik\s*air/, KATEGORI.TRANSPORT],
  ['AirAsia', /air\s*asia/, KATEGORI.TRANSPORT], ['Super Air Jet', /super\s*air\s*jet/, KATEGORI.TRANSPORT], ['Wings Air', /wings\s*air/, KATEGORI.TRANSPORT],
  ['Pelni', /pelni/, KATEGORI.TRANSPORT], ['ASDP', /\basdp\b/, KATEGORI.TRANSPORT], ['JNE', /\bjne\b/, KATEGORI.TRANSPORT], ['J&T', /j\s*&\s*t/, KATEGORI.TRANSPORT],
  // Penginapan
  ['RedDoorz', /reddoorz/, KATEGORI.PENGINAPAN], ['OYO', /\boyo\b/, KATEGORI.PENGINAPAN], ['Airbnb', /airbnb/, KATEGORI.PENGINAPAN],
  // Toko umum (tidak menentukan kategori)
  ['Indomaret', /indomaret/, ''], ['Alfamart', /alfamart|alfamidi/, ''], ['Hypermart', /hypermart|hyper\s*mart/, ''], ['Superindo', /superindo/, ''],
  ['Transmart', /transmart/, ''], ['Lotte Mart', /lotte\s*mart/, ''], ['Mr DIY', /mr\.?\s*diy/, KATEGORI.NON_KONSUMTIF], ['ACE', /\bace\s*hardware\b/, KATEGORI.NON_KONSUMTIF],
];

// Kata jenis makanan/tempat makan: dipakai untuk mencocokkan "pecel ayam" vs struk KFC.
const JENIS_MAKANAN = ['pecel', 'geprek', 'bakso', 'soto', 'sate', 'padang', 'seafood', 'bakmi', 'mie', 'pizza', 'burger', 'sushi', 'ramen',
  'martabak', 'nasi goreng', 'penyetan', 'lalapan', 'rawon', 'gudeg', 'warteg', 'kopi', 'boba'];
const KATA_KONSUMSI = /\b(rumah\s*makan|resto|restoran|restaurant|cafe|kafe|warung|makan|minum|nasi|ayam|ikan|es\s*teh|food|kopi|menu|dine\s*in|take\s*away)\b/;
const KATA_TRANSPORT = /\b(bensin|bbm|pertalite|solar|tol|parkir|tiket|pesawat|penerbangan|flight|boarding|kereta|bus|travel|trip|perjalanan|driver|ongkir|kirim)\b/;
const KATA_PENGINAPAN = /\b(hotel|kamar|room|check\s*-?\s*in|check\s*-?\s*out|homestay|guest\s*house|villa|resort|penginapan|night)\b/;

const kecil = (t) => String(t ?? '').toLowerCase();

export function merekDi(teks) {
  const t = kecil(teks);
  const hasil = [];
  for (const [nama, re, kategori] of MEREK) {
    if (re.test(t) && !hasil.some((h) => h.nama.startsWith(nama) || nama.startsWith(h.nama))) hasil.push({ nama, kategori });
  }
  return hasil;
}

// Kategori yang ditunjukkan struk: dari merek dulu, lalu dari kata-kata di struk. '' = tidak bisa ditentukan.
export function kategoriStruk(teks) {
  const merek = merekDi(teks).find((m) => m.kategori);
  if (merek) return merek.kategori;
  const t = kecil(teks);
  const skor = [[KATEGORI.PENGINAPAN, KATA_PENGINAPAN], [KATEGORI.TRANSPORT, KATA_TRANSPORT], [KATEGORI.KONSUMSI, KATA_KONSUMSI]]
    .map(([k, re]) => [k, (t.match(new RegExp(re.source, 'g')) || []).length]).filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  return skor.length && (skor.length === 1 || skor[0][1] > skor[1][1]) ? skor[0][0] : '';
}

// Nama toko: baris pertama yang berisi huruf (biasanya kop struk).
export function tokoDi(teks) {
  const baris = String(teks ?? '').split(/\n+/).map((b) => b.trim()).filter((b) => /[a-z]{3,}/i.test(b));
  return (merekDi(teks)[0]?.nama || baris[0] || '').slice(0, 40);
}

// Foto tanpa caption: kenali pengeluarannya dari struk (merek / jenis toko). null kalau tidak jelas,
// misalnya bukti transfer bank yang hanya berisi nama penerima: bot perlu bertanya.
export function kenaliStruk(teks) {
  const merek = merekDi(teks)[0];
  const kategori = kategoriStruk(teks);
  if (merek && (merek.kategori || kategori)) return { keterangan: merek.nama, kategori: merek.kategori || kategori };
  // Minimarket dll: kategori ditebak dari barang di struk (aqua -> konsumsi, lakban -> barang kering).
  if (merek) return { keterangan: merek.nama, kategori: tebakKategori(teks) };
  if (kategori) {
    const toko = tokoDi(teks);
    const tokoJelas = toko && !/^(transfer|bukti|struk|receipt|nota|invoice|pembayaran|payment|berhasil|sukses)/i.test(toko);
    return { keterangan: tokoJelas ? toko : kategori, kategori };
  }
  return null;
}

// Sidik struk untuk mendeteksi struk yang dipakai dua kali.
export function sidikStruk(teksOcr, buffer) {
  const bukti = bacaBukti(teksOcr);
  const referensi = (String(teksOcr ?? '').match(/\b\d{10,}\b/g) || []).filter((r) => !/^(19|20)\d{6}$/.test(r)).sort((a, b) => b.length - a.length)[0] || '';
  return {
    ...bukti,
    toko: tokoDi(teksOcr),
    referensi,
    hash: buffer ? createHash('sha256').update(buffer).digest('hex').slice(0, 32) : '',
  };
}

const KATEGORI_TEGAS = new Set([KATEGORI.KONSUMSI, KATEGORI.TRANSPORT, KATEGORI.PENGINAPAN]);

// Memeriksa satu pengeluaran terhadap struk. Mengembalikan { ok, alasan[], tanggal, sidik }.
// daftarStruk = baris tab "Struk" yang masih berlaku (catatan tidak dibatalkan).
export function periksaStruk({ item, teksOcr, buffer, event = null, daftarStruk = [] }) {
  const sidik = sidikStruk(teksOcr, buffer);
  const alasan = [];
  const rp = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;

  // 1. Nominal
  if (!sidik.nominal.includes(Number(item.nominal))) {
    alasan.push(`Nominal ${rp(item.nominal)} tidak ada di struk (terbaca: ${sidik.nominal.length ? sidik.nominal.slice(0, 4).map(rp).join(', ') : 'tidak ada angka'}).`);
  }
  // 2. Tanggal struk harus dalam masa event (seminggu sebelum s/d seminggu sesudah).
  if (sidik.tanggal && event?.mulai && event?.selesai) {
    const awal = tambahHari(event.mulai, -7);
    const akhir = tambahHari(event.selesai, 7);
    if (sidik.tanggal < awal || sidik.tanggal > akhir) alasan.push(`Tanggal struk ${sidik.tanggal} di luar masa event (${event.mulai} s/d ${event.selesai}).`);
  }
  // 3. Merek di keterangan harus ada di struk; jenis makanan di keterangan harus cocok dengan struk bermerek.
  const merekKet = merekDi(item.keterangan);
  const merekStruk = merekDi(teksOcr);
  const namaStruk = merekStruk.map((m) => m.nama).join(', ') || sidik.toko || 'toko lain';
  const tidakAda = merekKet.filter((m) => !merekStruk.some((s) => s.nama === m.nama));
  if (tidakAda.length) alasan.push(`Keterangan menyebut *${tidakAda.map((m) => m.nama).join(', ')}*, tapi struknya dari *${namaStruk}*.`);
  const makanan = JENIS_MAKANAN.filter((w) => new RegExp(`\\b${w}\\b`).test(kecil(item.keterangan)));
  if (!tidakAda.length && makanan.length && merekStruk.length && !makanan.some((w) => kecil(teksOcr).includes(w))) {
    alasan.push(`Keterangan *${makanan.join(' ')}*, tapi struknya dari *${namaStruk}*.`);
  }
  // 4. Kategori struk vs kategori pengeluaran (contoh: transport grab tapi struk KFC).
  const kStruk = kategoriStruk(teksOcr);
  if (kStruk && KATEGORI_TEGAS.has(kStruk) && KATEGORI_TEGAS.has(item.kategori) && kStruk !== item.kategori) {
    alasan.push(`Kategori pengeluaran *${item.kategori}*, tapi struknya *${kStruk}* (${namaStruk}).`);
  }
  // 5. Struk yang sama tidak boleh dipakai dua kali.
  const kembar = daftarStruk.find((s) => (sidik.hash && s.hash === sidik.hash)
    || (sidik.referensi && String(s.referensi) === sidik.referensi)
    || (sidik.tanggal && Number(s.nominal) === Number(item.nominal) && s.tanggal === sidik.tanggal && kecil(s.toko) === kecil(sidik.toko)));
  if (kembar) alasan.push(`Struk ini *sudah pernah dipakai* untuk ${kembar.id_transaksi} (${rp(kembar.nominal)}, ${kembar.tanggal || '-'}).`);

  return { ok: !alasan.length, alasan, tanggal: sidik.tanggal, sidik };
}

// Keterangan pengeluaran cash < 100rb harus jelas: bukan hanya "belanja" / "makan" / "beli".
const KATA_UMUM = new Set(['belanja', 'beli', 'bayar', 'pengeluaran', 'makan', 'minum', 'jajan', 'lain', 'lainnya', 'lain-lain', 'dll',
  'keperluan', 'kebutuhan', 'barang', 'cash', 'tunai', 'uang', 'buat', 'untuk', 'yang', 'dan', 'di', 'ke', 'nya', 'itu', 'ini', 'tadi', 'biaya', 'ongkos']);
export function perluDetail(keterangan) {
  const kata = kecil(keterangan).split(/[^a-z0-9]+/).filter(Boolean);
  return !kata.length || kata.every((w) => KATA_UMUM.has(w));
}
