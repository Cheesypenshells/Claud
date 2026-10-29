// Helper umum: uang, tanggal (WIB), dan teks.

export const TIMEZONE = process.env.TZ_BISNIS || 'Asia/Jakarta';

const SUFFIX = {
  k: 1e3, rb: 1e3, ribu: 1e3, rbu: 1e3,
  jt: 1e6, juta: 1e6,
};

// Cari semua nominal uang di satu baris teks.
// Contoh yang dikenali: 150k, 150rb, 150 ribu, 1,5jt, 2 juta, Rp 150.000, 150.000, 150000.
// Angka kecil tanpa satuan (mis. "2 unit") tidak dianggap uang.
export function findMoney(text) {
  const re = /(rp\.?\s*)?(\d{1,3}(?:[.,]\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(juta|jt|ribu|rbu|rb|k)?(?![a-z0-9])/gi;
  const hasil = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const [full, rp, angka, suf] = m;
    const satuan = suf ? SUFFIX[suf.toLowerCase()] : 1;
    let nilai;
    if (/^\d{1,3}([.,]\d{3})+(,\d{1,2})?$/.test(angka)) {
      // Pemisah ribuan: 150.000 / 1.500.000 / 150,000
      nilai = Number(angka.replace(/,\d{1,2}$/, '').replace(/[.,]/g, ''));
    } else {
      nilai = Number(angka.replace(',', '.'));
    }
    nilai = Math.round(nilai * satuan);
    if (!Number.isFinite(nilai)) continue;
    if (!rp && !suf && nilai < 1000) continue;
    hasil.push({ nilai, index: m.index, panjang: full.length, teks: full });
  }
  return hasil;
}

export function parseMoney(text) {
  const found = findMoney(String(text ?? ''));
  return found.length ? found[found.length - 1].nilai : null;
}

export function rupiah(n) {
  const v = Math.round(Number(n) || 0);
  const s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 ? '-Rp ' : 'Rp ') + s;
}

export function persen(n) {
  return `${Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`;
}

// ---------- Tanggal ----------

// Tanggal "YYYY-MM-DD" menurut zona waktu bisnis.
export function tanggalLokal(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

export function jamLokal(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

export function waktuLokal(date = new Date()) {
  return `${tanggalLokal(date)} ${jamLokal(date)}`;
}

// Aritmetika tanggal pada string "YYYY-MM-DD" (tanpa jam, aman dari zona waktu).
export function tambahHari(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 0 = Minggu, 1 = Senin, ... 6 = Sabtu
export function hariDalamMinggu(ymd) {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

const BULAN = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2, peb: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, ags: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11, nop: 11, nopember: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

const NAMA_BULAN = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
  'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function namaBulan(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${NAMA_BULAN[m]} ${y}`;
}

function ymd(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Mengurai rentang tanggal event. Format yang dikenali:
//   "1-14 Nov 2026", "28 Okt - 3 Nov 2026", "28 Des 2026 - 3 Jan 2027",
//   "01/11/2026 - 14/11/2026", "1 Nov 2026" (satu hari)
export function parseRentangTanggal(teks, tahunDefault = Number(tanggalLokal().slice(0, 4))) {
  const t = String(teks).toLowerCase().replace(/s\.?d\.?|sampai|hingga|–|—/g, '-').trim();

  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return { mulai: ymd(m[3], m[2], m[1]), selesai: ymd(m[6], m[5], m[4]) };

  m = t.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+([a-z]+)\s*(\d{4})?$/);
  if (m && BULAN[m[3]]) {
    const y = Number(m[4] || tahunDefault);
    return { mulai: ymd(y, BULAN[m[3]], m[1]), selesai: ymd(y, BULAN[m[3]], m[2]) };
  }

  m = t.match(/^(\d{1,2})\s+([a-z]+)\s*(\d{4})?\s*-\s*(\d{1,2})\s+([a-z]+)\s*(\d{4})?$/);
  if (m && BULAN[m[2]] && BULAN[m[5]]) {
    const y2 = Number(m[6] || m[3] || tahunDefault);
    const b1 = BULAN[m[2]];
    const b2 = BULAN[m[5]];
    const y1 = Number(m[3] || (b1 > b2 ? y2 - 1 : y2));
    return { mulai: ymd(y1, b1, m[1]), selesai: ymd(y2, b2, m[4]) };
  }

  m = t.match(/^(\d{1,2})\s+([a-z]+)\s*(\d{4})?$/);
  if (m && BULAN[m[2]]) {
    const d = ymd(Number(m[3] || tahunDefault), BULAN[m[2]], m[1]);
    return { mulai: d, selesai: d };
  }

  return null;
}

// ---------- Teks ----------

export function bersihkan(teks) {
  return String(teks ?? '').replace(/\s+/g, ' ').trim();
}

// Ambil angka dari ID WhatsApp ("62812xxx@s.whatsapp.net" -> "62812xxx").
export function angkaId(jid) {
  return String(jid ?? '').split('@')[0].split(':')[0].replace(/\D/g, '');
}
