// Mengubah pesan WhatsApp menjadi data terstruktur.

import { findMoney, parseMoney, parseRentangTanggal, bersihkan, BULAN, tambahHari } from './util.js';

// ---------- Kategori pengeluaran ----------

// Urutan penting: aturan di atas diperiksa lebih dulu.
// Barang kering non-konsumtif dicek sebelum konsumtif: membelinya di lokasi berarti ada yang lupa dibawa (kelalaian).
export const KATEGORI = {
  OYSTER: 'Oyster',
  GAJI: 'Gaji & Upah',
  IKLAN: 'Iklan & Endorse',
  TAK_TERDUGA: 'Tak Terduga',
  KONSUMSI: 'Konsumsi',
  PENGINAPAN: 'Penginapan',
  TRANSPORT: 'Transport & Ekspedisi',
  RUKO: 'Utilitas Ruko',
  ADMIN: 'Admin & Sewa',
  NON_KONSUMTIF: 'Barang Kering Non-Konsumtif',
  KONSUMTIF: 'Barang Kering Konsumtif',
  BAHAN_LAIN: 'Bahan Baku Lain',
  OPERASIONAL: 'Bahan Operasional',
  LAIN: 'Lain-lain',
};

const ATURAN_KATEGORI = [
  [KATEGORI.OYSTER, ['oyster', 'tiram']],
  [KATEGORI.GAJI, ['gaji', 'upah', 'dw', 'bonus', 'honor', 'kasbon', 'fee']],
  [KATEGORI.IKLAN, ['iklan', 'endorse', 'endorsement', 'influencer', 'selebgram', 'kol', 'ads', 'promosi', 'konten', 'content creator']],
  [KATEGORI.TAK_TERDUGA, ['sakit', 'obat', 'klinik', 'dokter', 'rumah sakit', 'puskesmas', 'ganti rugi', 'tak terduga', 'tidak terduga', 'darurat', 'kecelakaan', 'denda']],
  [KATEGORI.KONSUMSI, ['makan', 'minum', 'minuman', 'makanan', 'air minum', 'nasi', 'kopi', 'snack', 'sarapan', 'aqua', 'gofood', 'grabfood', 'shopeefood', 'konsumsi', 'teh']],
  [KATEGORI.PENGINAPAN, ['hotel', 'kos', 'kost', 'penginapan', 'airbnb', 'homestay', 'oyo', 'reddoorz', 'sewa kamar', 'guest house', 'losmen', 'wisma']],
  [KATEGORI.TRANSPORT, ['lalamove', 'gojek', 'gocar', 'goride', 'gosend', 'grab', 'maxim', 'ojek', 'ojol', 'bensin', 'bbm', 'solar', 'pertalite', 'pertamax', 'tol', 'parkir', 'travel', 'tiket', 'pesawat', 'kereta', 'bus', 'ekspedisi', 'cargo', 'kargo', 'ongkir', 'truk', 'pickup', 'pick up', 'deliveree', 'jne', 'jnt', 'j&t', 'sicepat', 'angkut', 'kirim', 'transport', 'taksi', 'taxi', 'kapal', 'bagasi']],
  [KATEGORI.RUKO, ['listrik', 'pln', 'token', 'pdam', 'air ruko', 'sewa ruko', 'internet', 'wifi', 'indihome', 'iuran']],
  // Sewa alat & biaya admin lapangan (pembukuan lama: tab "admin"), bukan kelalaian.
  [KATEGORI.ADMIN, ['biaya freezer', 'freezer lombok', 'sewa', 'rental', 'kuota', 'pulsa', 'cctv', 'laundry', 'laundrey', 'londri', 'print', 'fotokopi', 'materai', 'biaya admin', 'admin bank']],
  [KATEGORI.NON_KONSUMTIF, ['mr diy', 'mrdiy', 'ace hardware', 'informa', 'botol spray', 'spray', 'sapu', 'pel', 'etalase', 'ember', 'alat', 'gunting', 'pisau', 'terpal', 'kabel', 'lampu', 'stop kontak', 'colokan', 'meja', 'kursi', 'cooler', 'cool box', 'freezer', 'rak', 'obeng', 'tang', 'torch', 'grill', 'baskom', 'nampan', 'talenan', 'tali', 'kompor', 'regulator', 'selang', 'panci', 'wajan', 'capit', 'spatula', 'termos', 'banner', 'spanduk']],
  [KATEGORI.KONSUMTIF, ['sumpit', 'wrap', 'kertas', 'kotak', 'box', 'packaging', 'kemasan', 'kantong', 'plastik', 'kresek', 'sarung tangan', 'tisu', 'tissue', 'mika', 'cup', 'garpu', 'sendok', 'tusuk', 'sedotan', 'lakban', 'label', 'stiker', 'sabun']],
  [KATEGORI.BAHAN_LAIN, ['bumbu', 'keju', 'mozzarella', 'mozza', 'saus', 'saos', 'topping', 'cumi']],
  [KATEGORI.OPERASIONAL, ['es batu', 'gas', 'lpg', 'elpiji', 'arang', 'lemon', 'galon', 'es']],
];

export const DAFTAR_KATEGORI = [...ATURAN_KATEGORI.map(([k]) => k), 'Lain-lain'];

export function tebakKategori(teks) {
  const t = ` ${String(teks).toLowerCase()} `;
  for (const [kategori, kata] of ATURAN_KATEGORI) {
    for (const k of kata) {
      const re = new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')}($|[^a-z])`);
      if (re.test(t)) return kategori;
    }
  }
  return KATEGORI.LAIN;
}

export function tebakMetode(teks, adaFoto = false) {
  const t = String(teks).toLowerCase();
  if (/\b(cash|tunai|kas)\b/.test(t)) return 'CASH';
  if (/\b(trf|tf|transfer|qris|bca|mandiri|bri|bni|dana|ovo|gopay|shopeepay)\b/.test(t)) return 'TRANSFER';
  return adaFoto ? 'TRANSFER' : '';
}

// ---------- Pengeluaran ----------

// Kata-kata yang menandakan obrolan/koreksi, bukan laporan pengeluaran.
const KATA_DISKUSI = ['kamu', 'kok', 'kenapa', 'salah', 'harusnya', 'seharusnya', 'maksud', 'maksudnya', 'dong', 'gimana', 'bagaimana',
  'tolong', 'bot', 'cantumin', 'cantumkan', 'dicantumkan', 'bukan', 'betul', 'benar', 'apakah', 'berarti', 'tadi', 'sih', 'deh',
  'kan', 'emang', 'memang', 'gak', 'nggak', 'ga', 'gimna', 'kayaknya', 'sepertinya', 'bentuknya', 'bentuk'];

// Alasan sebuah baris tidak dicatat, atau null kalau baris itu laporan pengeluaran.
export function alasanBukanLaporan(baris) {
  const t = String(baris).toLowerCase();
  if (t.includes('?')) return 'pertanyaan';
  if (KATA_DISKUSI.some((k) => new RegExp(`(^|[^a-z])${k}($|[^a-z])`).test(t))) return 'obrolan';
  if (t.split(/\s+/).filter(Boolean).length > 12) return 'terlalu panjang';
  if (findMoney(t).length > 1) return 'lebih dari satu harga';
  return null;
}

// Satu pesan bisa berisi beberapa baris pengeluaran:
//   "lalamove 150k"
//   "makan malam 120rb cash\nember 2 unit @30rb"
// Baris tanpa nominal dan baris "total ..." diabaikan.
export function parsePengeluaran(teks, opsi = {}) {
  return parsePengeluaranDetail(teks, opsi).items;
}

// Seperti parsePengeluaran, ditambah daftar baris bernominal yang tidak dicatat beserta alasannya.
// Tanggal yang ditulis di baris pengeluaran: "makan siang 22 sept 53rb", "tgl 22/9 bensin 50rb".
// hariIni = tanggal pesan (YYYY-MM-DD) untuk menentukan tahun. Mengembalikan { tanggal, sisa }.
// Rentang "tanggal2-3 okt" dicatat di tanggal pertama.
const RE_TANGGAL_KATA = new RegExp(`(?:\\b(?:tgl|tanggal)\\.?\\s*)?(?<!\\d)(\\d{1,2})(?:\\s*-\\s*\\d{1,2})?\\s*(${Object.keys(BULAN).sort((a, b) => b.length - a.length).join('|')})\\b\\.?`, 'i');
const RE_TANGGAL_ANGKA = /\b(?:tgl|tanggal)\.?\s*(\d{1,2})[/-](\d{1,2})\b/i;
// Tanpa bulan: "tanggal 25", "tanggal26 sore", "27 pagi" -> bulan dipilih supaya masuk masa event
// (rentang { mulai, selesai }), atau bulan pesan kalau tidak ada event.
const RE_TANGGAL_HARI = /\b(?:tgl|tanggal)\.?\s*(\d{1,2})(?!\d)(?![.,]\d)(?!\s*(?:rb|ribu|k|jt|juta)\b)|(?<![\d.,]|[x×*@]\s{0,2})(\d{1,2})(?=\s+(?:pagi|siang|sore)\b)/i;
function tanggalTanpaBulan(hari, hariIni, rentang) {
  const ymd = (y, b) => `${y}-${String(b).padStart(2, '0')}-${String(hari).padStart(2, '0')}`;
  if (rentang?.mulai && rentang?.selesai) {
    const awal = tambahHari(rentang.mulai, -7);
    for (let d = awal; d <= rentang.selesai; d = tambahHari(d, 1)) if (Number(d.slice(8, 10)) === hari) return d;
  }
  let [y, b] = hariIni.split('-').map(Number);
  if (hari > Number(hariIni.slice(8, 10))) { b -= 1; if (!b) { b = 12; y -= 1; } }
  return ymd(y, b);
}

export function ambilTanggal(baris, hariIni, rentang = null) {
  const teks = String(baris ?? '');
  let m = teks.match(RE_TANGGAL_KATA);
  let hari; let bulan;
  if (m) { hari = Number(m[1]); bulan = BULAN[m[2].toLowerCase()]; } else {
    m = teks.match(RE_TANGGAL_ANGKA);
    if (m) { hari = Number(m[1]); bulan = Number(m[2]); }
  }
  if (!m && hariIni) {
    const h = teks.match(RE_TANGGAL_HARI);
    const n = h ? Number(h[1] || h[2]) : 0;
    if (n >= 1 && n <= 31) {
      return { tanggal: tanggalTanpaBulan(n, hariIni, rentang), sisa: bersihkan(teks.slice(0, h.index) + ' ' + teks.slice(h.index + h[0].length)) };
    }
  }
  if (!m || !hariIni || hari < 1 || hari > 31 || !bulan || bulan > 12) return { tanggal: '', sisa: teks };
  let tahun = Number(hariIni.slice(0, 4));
  const ymd = (y) => `${y}-${String(bulan).padStart(2, '0')}-${String(hari).padStart(2, '0')}`;
  // Tanggal jauh di depan (misal pesan Januari menyebut "28 des") berarti tahun lalu.
  if (ymd(tahun) > tambahHari(hariIni, 7)) tahun -= 1;
  return { tanggal: ymd(tahun), sisa: bersihkan(teks.slice(0, m.index) + ' ' + teks.slice(m.index + m[0].length)) };
}

// Satu baris berisi beberapa pengeluaran dipisah koma/titik koma:
//   "Listrik 353k, minuman 25 sept 11k, lemon dan softex 24k tanggal 25 sept"
// Dipecah hanya kalau bagian pertama berharga, setiap bagian paling banyak satu harga, ada >= 2 harga,
// dan bagian tanpa harga hanya keterangan pendek (tanggal, "uang mama", "cash"). Koma desimal
// ("67,865 ribu") tidak terpecah karena tidak diikuti spasi.
// Dalam satu bagian, dua harga disambung "dan/terus/lalu": "40.11k siang dan malam nya 40.95k".
const RE_SAMBUNG = /\s+(?:dan|terus|trus|lalu|sama|\+)\s+/i;
function pecahSambung(b) {
  if (findMoney(b).length < 2) return [b];
  const p = b.split(RE_SAMBUNG).map((x) => x.trim()).filter(Boolean);
  return p.length > 1 && p.every((x) => findMoney(x).length === 1) ? p : [b];
}

export function pecahBaris(baris) {
  const bagian = String(baris).split(/\s*,\s+|\s*;\s*/).map((b) => b.trim()).filter(Boolean).flatMap(pecahSambung);
  if (bagian.length < 2) return [baris];
  const harga = bagian.map((b) => findMoney(b).length);
  if (harga.some((n) => n > 1) || harga.filter(Boolean).length < 2) return [baris];
  const pendek = (b) => b.split(/\s+/).length <= 4;
  if (bagian.some((b, i) => !harga[i] && !pendek(b))) return [baris];
  return bagian;
}

// Kata waktu makan dll: bagian yang hanya berisi kata ini ("malam nya 40.95k") melanjutkan
// keterangan sebelumnya ("makan karyawan" -> "makan karyawan malam").
const KATA_LANJUTAN = new Set(['pagi', 'siang', 'sore', 'malam', 'nya', 'yang', 'yg', 'untuk', 'buat', 'juga', 'harinya', 'hari']);
const kataSisa = (t) => bersihkan(String(t).toLowerCase()).split(/\s+/).filter(Boolean);
const lanjutan = (ket) => kataSisa(ket).every((w) => KATA_LANJUTAN.has(w));
const subjek = (ket) => bersihkan(String(ket).split(/\s+/).filter((w) => !KATA_LANJUTAN.has(w.toLowerCase())).join(' '));

// "semua uang valen", "semuanya pakai uang mama", "uang valen semua": berlaku untuk seluruh pesan,
// di baris mana pun ditulis.
const RE_UANG_SEMUA = /\b(?:semua(?:nya)?|sekalian)\s+(?:pakai\s+|pake\s+|dari\s+)?uang(?:nya)?\s+([a-z][a-z.]*)|\buang(?:nya)?\s+([a-z][a-z.]*)\s+(?:semua(?:nya)?|sekalian)\b/i;
export function ambilUangSemua(teks) {
  const m = String(teks ?? '').match(RE_UANG_SEMUA);
  const siapa = m ? petaUangSiapa(m[1] || m[2]) : null;
  if (!siapa) return { siapa: null, sisa: String(teks ?? '') };
  return { siapa, sisa: String(teks).replace(m[0], ' ').replace(/[ \t]+/g, ' ').replace(/\s*,\s*(?=\n|$)/g, '') };
}

export function parsePengeluaranDetail(teks, { adaFoto = false, hariIni = '', rentang = null } = {}) {
  const dilewati = [];
  const { siapa: siapaSemua, sisa: teksBersih } = ambilUangSemua(teks);
  const kelompok = teksBersih.split(/\n+/).map((b) => b.trim()).filter(Boolean).map(pecahBaris);
  // Bagian tanpa harga yang berisi keterangan ("makan tanggal 1 oktober") menjadi konteks bagian
  // berikutnya di baris yang sama; yang hanya berisi tanggal/uang siapa/metode berlaku untuk semua.
  const tanpaHarga = kelompok.flat().filter((b) => !findMoney(b).length);
  const intiTeks = (b) => subjek(ambilTanggal(ambilUangSiapa(b).sisa, hariIni, rentang).sisa
    .replace(/\b(cash|tunai|trf|tf|transfer|semua|semuanya|tanggal|tgl)\b/gi, ''));
  // Metode, uang siapa & tanggal untuk semua baris diambil dari baris tanpa nominal
  // ("cash semua", "uang mama", "tanggal 25 sept") atau dari foto bukti trf.
  const barisTanpaNominal = tanpaHarga.filter((b) => !intiTeks(b)).join(' ');
  const metodePesan = tebakMetode(barisTanpaNominal, adaFoto);
  const siapaPesan = ambilUangSiapa(barisTanpaNominal).siapa;
  const tanggalPesan = ambilTanggal(barisTanpaNominal, hariIni, rentang).tanggal;
  const items = [];
  for (const grup of kelompok) {
  let konteks = { subjek: '', tanggal: '' };
  for (const barisMentah of grup) {
    const { siapa, sisa: tanpaSiapa } = ambilUangSiapa(bersihkan(barisMentah.replace(/^[-*•\d]+[.)]\s+/, '')));
    const { tanggal: tanggalBaris, sisa: baris } = ambilTanggal(tanpaSiapa, hariIni, rentang);
    let tanggal = tanggalBaris;
    if (!baris || /^total\b/i.test(baris)) continue;
    const uang = findMoney(baris);
    if (!uang.length) {
      const inti = intiTeks(barisMentah);
      if (inti) konteks = { subjek: inti, tanggal: tanggalBaris || konteks.tanggal };
      continue;
    }
    const alasan = alasanBukanLaporan(baris);
    if (alasan) { dilewati.push({ baris, alasan }); continue; }
    const u = uang[uang.length - 1];
    let nominal = u.nilai;

    // "ember 2 unit @30rb" -> 2 x 30.000; "hotel 350rb x 3 malam" -> 3 x 350.000
    const sebelum = baris.slice(0, u.index);
    const sesudah = baris.slice(u.index + u.panjang);
    if (/@\s*$/.test(sebelum)) {
      const qty = sebelum.match(/(\d+)\s*(unit|pcs|buah|bh|pack|pak|kg|dus|box|botol|karung|ikat|lembar|malam|hari|orang|porsi|kamar|x)?\s*@\s*$/i);
      if (qty) nominal *= Number(qty[1]);
    } else {
      const kali = sesudah.match(/^\s*[x×*]\s*(\d+)/i);
      if (kali) nominal *= Number(kali[1]);
    }

    let keterangan = bersihkan(
      (baris.slice(0, u.index) + baris.slice(u.index + u.panjang))
        .replace(/@\s*$/, '')
        .replace(/\b(cash|tunai|trf|tf|transfer)\b/gi, '')
        .replace(/\b(total|totalnya|semuanya|harga|harganya)\s*$/i, '')
        .replace(/[:=]+\s*$/, ''),
    ).replace(/[\s,:;=-]+$/, '');
    let kategoriDari = baris;
    if (lanjutan(keterangan) && konteks.subjek) {
      // "malam nya 40.95k" setelah "makan karyawan ... siang" -> "makan karyawan malam", tanggal ikut.
      keterangan = bersihkan(`${konteks.subjek} ${subjek(keterangan.replace(/\bnya\b/gi, '')) || kataSisa(keterangan).filter((w) => w !== 'nya').join(' ')}`);
      tanggal = tanggal || konteks.tanggal;
      kategoriDari = keterangan;
    } else {
      keterangan = keterangan.replace(/\s+nya\b/gi, '');
      konteks = { subjek: subjek(keterangan) || keterangan, tanggal: tanggal || konteks.tanggal };
    }
    if (!keterangan) keterangan = 'Pengeluaran';

    items.push({
      keterangan,
      nominal,
      kategori: tebakKategori(kategoriDari),
      metode: tebakMetode(baris, false) || metodePesan,
      dibayar_oleh: siapaSemua || siapa || siapaPesan || '',
      ...(tanggal || tanggalPesan ? { tanggal: tanggal || tanggalPesan } : {}),
    });
  }
  }
  return { items, dilewati };
}

// ---------- Setup event ----------

const KUNCI_EVENT = {
  kode: 'kode', 'kode event': 'kode',
  kota: 'kota', lokasi: 'kota',
  io: 'io', eo: 'io', organizer: 'io',
  tanggal: 'tanggal', tgl: 'tanggal',
  'wilayah harga': 'wilayah', wilayah: 'wilayah', harga: 'wilayah', pulau: 'wilayah',
  'target omzet': 'target_omzet', target: 'target_omzet', 'target omset': 'target_omzet',
  'bagi hasil': 'bagi_hasil_persen', potongan: 'bagi_hasil_persen', 'sharing': 'bagi_hasil_persen',
  admin: 'admin', 'biaya admin': 'admin',
  'jadwal trf': 'jadwal_trf', 'jadwal transfer': 'jadwal_trf', trf: 'jadwal_trf', transfer: 'jadwal_trf',
  'jam buka': 'jam_buka', buka: 'jam_buka',
  pic: 'pic',
  senior: 'senior',
  dw: 'dw', 'daily worker': 'dw',
  kasir: 'kasir',
  'listrik/air/gas/galon': 'catatan_utilitas', utilitas: 'catatan_utilitas',
};

export function normalisasiWilayah(teks) {
  const t = String(teks).toLowerCase();
  if (t.includes('kalimantan') || t.includes('kalim')) return 'Kalimantan';
  if (t.includes('sumatra') || t.includes('sumatera')) return 'Sumatra';
  if (t.includes('jawa') || t.includes('java')) return 'Jawa';
  return '';
}

// Mengurai blok "#event". Mengembalikan { data, error }.
export function parseEvent(teks) {
  const data = {};
  for (const baris of String(teks).split('\n').slice(1)) {
    const m = baris.match(/^\s*([^:]+?)\s*:\s*(.*)$/);
    if (!m) continue;
    const kunci = KUNCI_EVENT[m[1].toLowerCase().trim()];
    if (!kunci) continue;
    data[kunci] = bersihkan(m[2].replace(/\(.*?\)/g, ''));
  }

  const wajib = ['kode', 'kota', 'io', 'tanggal'];
  const kurang = wajib.filter((k) => !data[k]);
  if (kurang.length) return { error: `Data belum lengkap: ${kurang.join(', ')}` };

  const rentang = parseRentangTanggal(data.tanggal);
  if (!rentang) return { error: `Format tanggal tidak dikenali: "${data.tanggal}". Contoh: 1-14 Nov 2026` };

  const persen = data.bagi_hasil_persen ? Number(String(data.bagi_hasil_persen).replace(',', '.').replace(/[^\d.]/g, '')) : 0;
  if (data.bagi_hasil_persen && (!Number.isFinite(persen) || persen <= 0 || persen >= 100)) {
    return { error: `Bagi hasil tidak valid: "${data.bagi_hasil_persen}". Contoh: 27%` };
  }

  const jadwal = String(data.jadwal_trf || '').toLowerCase();
  return {
    data: {
      kode: data.kode.toUpperCase().replace(/\s+/g, ''),
      kota: data.kota,
      io: data.io,
      mulai: rentang.mulai,
      selesai: rentang.selesai,
      wilayah: normalisasiWilayah(data.wilayah || '') || 'Jawa',
      target_omzet: parseMoney(data.target_omzet || '') || 0,
      bagi_hasil_persen: persen,
      admin: parseMoney(data.admin || '') || 0,
      jadwal_trf: /akhir|selesai|setelah event|sekali/.test(jadwal) ? 'AKHIR' : 'HARIAN',
      jam_buka: (data.jam_buka || '').replace('.', ':'),
      pic: data.pic || '',
      senior: data.senior || '',
      dw: data.dw || '',
      kasir: data.kasir || '',
    },
  };
}

// ---------- Omzet harian (format SOP BAB 6 bagian H) ----------
//   #omzet
//   TANGGAL: 1 Nov 2026            (opsional, default hari ini)
//   OMZET TERVERIFIKASI: Rp 12.500.000
//   JUMLAH TRANSAKSI: 85
//   SELISIH / REFUND / KOREKSI: 0
// Bentuk singkat juga diterima: "#omzet 12,5jt"
export function parseOmzet(teks, tahunDefault) {
  const baris = String(teks).split('\n');
  const hasil = { omzet: null, jumlah_transaksi: '', refund: 0, tanggal: null, catatan: '' };

  const pertama = baris[0].replace(/^#omzet\b/i, '');
  if (parseMoney(pertama)) hasil.omzet = parseMoney(pertama);

  const catatan = [];
  for (const b of baris.slice(1)) {
    const m = b.match(/^\s*([^:]+?)\s*:\s*(.*)$/);
    if (!m) continue;
    const kunci = m[1].toLowerCase();
    const nilai = m[2];
    if (/omzet|omset/.test(kunci)) hasil.omzet = parseMoney(nilai) ?? hasil.omzet;
    else if (/jumlah transaksi|transaksi/.test(kunci)) hasil.jumlah_transaksi = (nilai.match(/\d+/) || [''])[0];
    else if (/refund|selisih|koreksi/.test(kunci)) hasil.refund = parseMoney(nilai) || 0;
    else if (/tanggal|tgl/.test(kunci)) hasil.tanggal = parseRentangTanggal(nilai, tahunDefault)?.mulai || null;
    else if (nilai.trim()) catatan.push(`${m[1].trim()}: ${bersihkan(nilai)}`);
  }
  hasil.catatan = catatan.join(' | ');
  return hasil;
}

// ---------- Perintah ----------

// "#rekap bulan 2026-11" -> { perintah: 'rekap', argumen: ['bulan', '2026-11'], badan: '...' }
export function parsePerintah(teks) {
  const t = String(teks ?? '').trim();
  const m = t.match(/^#([a-z]+)\b(.*)$/is);
  if (!m) return null;
  const [barisPertama, ...sisa] = (m[1] + m[2]).split('\n');
  const kata = barisPertama.trim().split(/\s+/);
  return {
    perintah: kata[0].toLowerCase(),
    argumen: kata.slice(1),
    sisaBaris: bersihkan(barisPertama.slice(kata[0].length)),
    badan: sisa.join('\n'),
  };
}

// ---------- Tim event ----------
//   PIC: Budi
//   Tetap: Andi, Rudi        (boleh juga "Senior:")
//   DW: Joko 120rb, Tono     (upah default 100.000)
//   Kasir: Sari
export const PERAN = { PIC: 'PIC', TETAP: 'Tetap', DW: 'DW', KASIR: 'Kasir' };
export const UPAH_DEFAULT = { PIC: 0, Tetap: 0, DW: 100000, Kasir: 100000 };

const KUNCI_PERAN = {
  pic: PERAN.PIC,
  tetap: PERAN.TETAP, senior: PERAN.TETAP, 'karyawan tetap': PERAN.TETAP, junior: PERAN.TETAP,
  dw: PERAN.DW, 'daily worker': PERAN.DW, freelance: PERAN.DW,
  kasir: PERAN.KASIR,
};

// Kata pengisi yang bukan nama: "karyawan senior nya imam" -> "imam".
const KATA_PENGISI = /^((karyawan|senior|junior|tetap|nya|namanya|yaitu|adalah|yang|jaga|si|pak|bu|mas|mbak|dw|daily|worker|freelance|kasir|kasirnya|pic|picnya|orang|org)\s+)+/i;
const HANYA_PERAN = /^(karyawan|senior|junior|tetap|dw|daily worker|freelance|kasir|pic|orang|org)$/i;

export function parseOrang(teks, peran) {
  const t = bersihkan(teks);
  // "4 orang" / "3 dw" -> orang tanpa nama: DW 1, DW 2, ...
  const jumlah = t.match(/^(\d+)\s*(orang|org|dw|daily worker|freelance|kasir|senior|karyawan)?(\s+(@|upah)?\s*(.*))?$/i);
  if (jumlah && Number(jumlah[1]) > 0 && Number(jumlah[1]) <= 20) {
    const upah = parseMoney(jumlah[5] || '');
    return Array.from({ length: Number(jumlah[1]) }, (_, i) => ({ nama: `${peran} ${i + 1}`, peran, upah_harian: upah ?? UPAH_DEFAULT[peran] }));
  }
  let tanpaNama = 0;
  return t
    .split(/[,;]|\bdan\b/i)
    .map((x) => bersihkan(x))
    .filter((x) => x && x !== '-')
    .map((x) => {
      const upah = parseMoney(x);
      let nama = bersihkan(x.replace(/(rp\.?\s*)?[\d.,]+\s*(juta|jt|ribu|rb|k)?/gi, '').replace(/[()]/g, ''));
      if (!HANYA_PERAN.test(nama)) nama = bersihkan(nama.replace(KATA_PENGISI, ''));
      if (!nama || HANYA_PERAN.test(nama)) nama = `${peran} ${++tanpaNama}`;
      else nama = nama.charAt(0).toUpperCase() + nama.slice(1);
      return { nama, peran, upah_harian: upah ?? UPAH_DEFAULT[peran] };
    });
}

export function parseTim(teks) {
  const hasil = [];
  for (const baris of String(teks).split('\n')) {
    const m = baris.match(/^\s*([^:]+?)\s*:\s*(.*)$/);
    if (!m) continue;
    const peran = KUNCI_PERAN[m[1].toLowerCase().trim()];
    if (peran) hasil.push(...parseOrang(m[2].replace(/\(.*?\)/g, ''), peran));
  }
  return hasil;
}

// ---------- Bahan baku ----------
// Satu bahan per baris: "mozzarella 20 pack", "oyster 100 kg", "12,5 kg oyster".
export function parseBahan(teks, daftarBahan, cocokkan) {
  const items = [];
  for (const baris of String(teks).split(/\n|,(?=\s*\D)/)) {
    const angka = baris.match(/(\d+(?:[.,]\d+)?)/);
    if (!angka) continue;
    const item = cocokkan(baris, daftarBahan, 'bahan');
    if (!item) continue;
    items.push({ bahan: item.bahan, jumlah: Number(angka[1].replace(',', '.')), satuan: item.satuan });
  }
  return items;
}

// ---------- Porsi gratis ----------
// "#gratis 3 porsi mozzarella isi 4 untuk @rina_food"
// "#gratis 12 pcs garlic untuk tester"
export function parseGratis(teks, daftarMenu, cocokkan) {
  const items = [];
  for (const baris of String(teks).split('\n')) {
    const menu = cocokkan(baris, daftarMenu, 'menu');
    if (!menu) continue;
    const t = baris.toLowerCase();
    const porsi = Number((t.match(/(\d+)\s*porsi/) || [])[1] || 0);
    const isi = Number((t.match(/isi\s*(\d+)/) || [])[1] || 0);
    const pcsLangsung = Number((t.match(/(\d+)\s*(pcs|biji|bji|buah)/) || [])[1] || 0);
    const isiDefault = menu.menu === 'Fresh Oyster' ? 2 : 5;
    const p = porsi || (pcsLangsung ? 0 : 1);
    const i = isi || (porsi ? isiDefault : 0);
    const pcs = pcsLangsung && !porsi ? pcsLangsung : p * i;
    if (!pcs) continue;
    const untuk = bersihkan((baris.match(/untuk\s+(.*)$/i) || [])[1] || '');
    items.push({ menu: menu.menu, porsi: p || '', isi: i || '', pcs, untuk });
  }
  return items;
}

// ---------- Uang siapa ----------
// "lalamove 150k uang mama" / "pakai uang valen" / "(uang saya)" / "uang kas".
// Hasil: '@pengirim', '@pic', '@owner', 'Kas usaha', atau nama orang. Pemetaan '@...' dilakukan handler.
const RE_UANG = /\(?\s*(?:pakai|pake|pk|dari|dibayar(?:in)?(?:\s+(?:pakai|pake))?|talangan)?\s*uang(?:nya)?\s+([a-z][a-z.]*)\s*\)?/i;

// "uang transport", "uang makan", "uang muka" adalah jenis pengeluaran, bukan pemilik uang.
const BUKAN_PEMILIK = ['muka', 'saku', 'harian', 'jajan', 'rokok', 'tip', 'ongkos', 'cash', 'tunai', 'kembalian', 'lebih', 'kurang', 'tambahan', 'bulanan', 'mingguan', 'lembur'];

export function petaUangSiapa(kata) {
  const k = String(kata || '').toLowerCase().replace(/\.$/, '');
  if (!k || BUKAN_PEMILIK.includes(k) || tebakKategori(k) !== KATEGORI.LAIN) return null;
  if (['saya', 'sendiri', 'aku', 'gue', 'gw', 'ku', 'pribadi'].includes(k)) return '@pengirim';
  if (['pic', 'picnya'].includes(k)) return '@pic';
  if (['owner', 'bos', 'boss', 'bapak', 'pak'].includes(k)) return '@owner';
  if (['kas', 'usaha', 'perusahaan', 'kantor', 'toko', 'cps', 'event'].includes(k)) return 'Kas usaha';
  return k.charAt(0).toUpperCase() + k.slice(1);
}

export function ambilUangSiapa(baris) {
  const re = new RegExp(RE_UANG.source, 'gi');
  let m;
  while ((m = re.exec(String(baris))) !== null) {
    const siapa = petaUangSiapa(m[1]);
    if (siapa) return { siapa, sisa: bersihkan(String(baris).replace(m[0], ' ')) };
  }
  return { siapa: null, sisa: baris };
}
