// Mengubah pesan WhatsApp menjadi data terstruktur tanpa AI.

import { findMoney, parseMoney, parseRentangTanggal, bersihkan } from './util.js';

// ---------- Kategori pengeluaran ----------

// Urutan penting: aturan di atas diperiksa lebih dulu.
const ATURAN_KATEGORI = [
  ['Oyster', ['oyster', 'tiram']],
  ['Gaji & Upah', ['gaji', 'upah', 'dw', 'bonus', 'honor', 'kasbon', 'fee']],
  ['Konsumsi', ['makan', 'minum', 'air minum', 'nasi', 'kopi', 'snack', 'sarapan', 'aqua', 'gofood', 'grabfood', 'shopeefood', 'konsumsi', 'teh']],
  ['Penginapan', ['hotel', 'kos', 'kost', 'penginapan', 'airbnb', 'homestay', 'oyo', 'reddoorz', 'sewa kamar', 'guest house']],
  ['Transport & Ekspedisi', ['lalamove', 'gojek', 'gocar', 'goride', 'grab', 'maxim', 'ojek', 'ojol', 'bensin', 'bbm', 'solar', 'pertalite', 'pertamax', 'tol', 'parkir', 'travel', 'tiket', 'pesawat', 'kereta', 'bus', 'ekspedisi', 'cargo', 'kargo', 'ongkir', 'truk', 'pickup', 'pick up', 'deliveree', 'jne', 'jnt', 'j&t', 'sicepat', 'angkut', 'kirim', 'transport', 'taksi', 'taxi', 'kapal']],
  ['Utilitas Ruko', ['listrik', 'pln', 'token', 'pdam', 'air ruko', 'sewa ruko', 'internet', 'wifi', 'indihome', 'iuran']],
  ['Bahan Operasional', ['es batu', 'gas', 'lpg', 'elpiji', 'arang', 'tisu', 'tissue', 'plastik', 'kantong', 'sabun', 'lemon', 'sarung tangan', 'mika', 'box', 'cup', 'garpu', 'sendok', 'kemasan', 'packaging', 'galon', 'es', 'bumbu', 'keju', 'mozzarella', 'saus', 'topping', 'cumi']],
  ['Peralatan', ['ember', 'alat', 'gunting', 'pisau', 'terpal', 'kabel', 'lampu', 'stop kontak', 'colokan', 'meja', 'kursi', 'cooler', 'freezer', 'rak', 'obeng', 'tang', 'sapu', 'pel', 'torch', 'grill', 'baskom', 'nampan', 'talenan', 'lakban', 'tali']],
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
  return 'Lain-lain';
}

export function tebakMetode(teks, adaFoto = false) {
  const t = String(teks).toLowerCase();
  if (/\b(cash|tunai|kas)\b/.test(t)) return 'CASH';
  if (/\b(trf|tf|transfer|qris|bca|mandiri|bri|bni|dana|ovo|gopay|shopeepay)\b/.test(t)) return 'TRANSFER';
  return adaFoto ? 'TRANSFER' : '';
}

// ---------- Pengeluaran ----------

// Satu pesan bisa berisi beberapa baris pengeluaran:
//   "lalamove 150k"
//   "makan malam 120rb cash\nember 2 unit @30rb"
// Baris tanpa nominal dan baris "total ..." diabaikan.
export function parsePengeluaran(teks, { adaFoto = false } = {}) {
  // Metode untuk semua baris diambil dari baris tanpa nominal ("cash semua") atau dari foto bukti trf.
  const barisTanpaNominal = String(teks ?? '').split(/\n+/).filter((b) => !findMoney(b).length).join(' ');
  const metodePesan = tebakMetode(barisTanpaNominal, adaFoto);
  const items = [];
  for (const barisMentah of String(teks ?? '').split(/\n+/)) {
    const baris = bersihkan(barisMentah.replace(/^[-*•\d]+[.)]\s+/, ''));
    if (!baris || /^total\b/i.test(baris)) continue;
    const uang = findMoney(baris);
    if (!uang.length) continue;
    const u = uang[uang.length - 1];
    let nominal = u.nilai;

    // "ember 2 unit @30rb" -> 2 x 30.000
    const sebelum = baris.slice(0, u.index);
    if (/@\s*$/.test(sebelum)) {
      const qty = sebelum.match(/(\d+)\s*(unit|pcs|buah|bh|pack|pak|kg|dus|box|botol|karung|ikat|lembar|x)?\s*@\s*$/i);
      if (qty) nominal *= Number(qty[1]);
    }

    let keterangan = bersihkan(
      (baris.slice(0, u.index) + baris.slice(u.index + u.panjang))
        .replace(/@\s*$/, '')
        .replace(/\b(cash|tunai|trf|tf|transfer)\b/gi, '')
        .replace(/[:=]+\s*$/, ''),
    ).replace(/[\s,:;=-]+$/, '');
    if (!keterangan) keterangan = 'Pengeluaran';

    items.push({
      keterangan,
      nominal,
      kategori: tebakKategori(baris),
      metode: tebakMetode(baris, false) || metodePesan,
    });
  }
  return items;
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
