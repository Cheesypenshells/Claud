// Tanya-jawab bot di grup: setup grup baru, setup event, dan ubah data event lewat chat.
// Sesi disimpan per grup lewat ctx.sesi (get/set/hapus) supaya tetap jalan walau bot dinyalakan ulang.

import { parseRentangTanggal, parseMoney, bersihkan, tanggalLokal } from './util.js';
import { normalisasiWilayah } from './parsers.js';

const LEWATI = /^(-|lewati|skip|tidak ada|ga ada|gak ada|tidak|kosong)$/i;

// Pertanyaan setup event, berurutan. `ambil` mengubah jawaban menjadi nilai, atau null kalau tidak valid.
export const PERTANYAAN_EVENT = [
  {
    kunci: 'kota', tanya: 'Lokasi / kota event di mana?', contoh: 'Jambi',
    // "Lokasi di Lombok" / "di kota Jambi" -> "Lombok" / "Jambi"
    ambil: (t) => {
      const k = bersihkan(t).replace(/^((lokasi|lokasinya|kota|kotanya|event|eventnya|tempat|tempatnya|di|ke)\s+)+/i, '');
      return k ? k.charAt(0).toUpperCase() + k.slice(1) : null;
    },
  },
  { kunci: 'io', tanya: 'Nama Event Organizer (IO)?', contoh: 'Kepo Market', ambil: (t) => bersihkan(t) || null },
  {
    kunci: 'tanggal', tanya: 'Tanggal event?', contoh: '1-14 Nov 2026',
    ambil: (t, tahun) => (parseRentangTanggal(t, tahun) ? bersihkan(t) : null),
    salah: 'Format tanggal belum terbaca. Contoh: *1-14 Nov 2026* atau *28 Nov - 3 Des 2026*',
  },
  {
    kunci: 'wilayah', tanya: 'Wilayah harga?\n1 = Jawa\n2 = Sumatra (+5rb/pcs)\n3 = Kalimantan (+10rb/pcs)', contoh: '2',
    ambil: (t) => ({ 1: 'Jawa', 2: 'Sumatra', 3: 'Kalimantan' }[t.trim()] || normalisasiWilayah(t) || null),
  },
  {
    kunci: 'bagi_hasil', tanya: 'Bagi hasil IO berapa persen? Balas *ok* untuk 30%.', contoh: '30',
    ambil: (t) => {
      if (/^(ok|oke|iya|ya|y)$/i.test(t.trim())) return '30%';
      const n = Number(t.replace(',', '.').replace(/[^\d.]/g, ''));
      return n > 0 && n < 100 ? `${n}%` : null;
    },
    salah: 'Tulis angka persen, contoh *30* atau *27,5*',
  },
  { kunci: 'admin', tanya: 'Biaya admin IO? Balas *0* kalau tidak ada.', contoh: '500rb', ambil: (t) => (/^0$/.test(t.trim()) || LEWATI.test(t.trim()) ? '0' : parseMoney(t) ? String(parseMoney(t)) : null) },
  {
    kunci: 'jadwal_trf', tanya: 'Jadwal transfer omzet dari IO?\n1 = H+1 (omzet Jumat–Minggu dibayar Senin)\n2 = Sekali setelah event selesai', contoh: '1',
    ambil: (t) => ({ 1: 'H+1', 2: 'setelah event selesai' }[t.trim()] || (/akhir|selesai/i.test(t) ? 'setelah event selesai' : /h\+1|harian/i.test(t) ? 'H+1' : null)),
  },
  { kunci: 'jam_buka', tanya: 'Jam buka booth? (absen wajib 1 jam sebelumnya)', contoh: '11.00', ambil: (t) => (/^\d{1,2}([.:]\d{2})?$/.test(t.trim()) ? t.trim() : null) },
  { kunci: 'target', tanya: 'Target omzet event? Balas *-* kalau belum ada.', contoh: '150jt', ambil: (t) => (LEWATI.test(t.trim()) ? '' : parseMoney(t) ? String(parseMoney(t)) : null) },
  { kunci: 'pic', tanya: 'Siapa PIC event ini?', contoh: 'Budi', ambil: (t) => bersihkan(t) || null },
  { kunci: 'senior', tanya: 'Siapa karyawan tetap / senior yang jaga? Pisahkan dengan koma, *-* kalau tidak ada.', contoh: 'Andi, Rudi', ambil: (t) => (LEWATI.test(t.trim()) ? '' : bersihkan(t)) },
  { kunci: 'dw', tanya: 'Siapa saja DW (daily worker)? Tulis upah kalau bukan 100rb. *-* kalau tidak ada.', contoh: 'Joko, Tono 120rb', ambil: (t) => (LEWATI.test(t.trim()) ? '' : bersihkan(t)) },
  { kunci: 'kasir', tanya: 'Siapa kasirnya? *-* kalau PIC sendiri yang jadi kasir.', contoh: 'Sari', ambil: (t) => (LEWATI.test(t.trim()) ? '' : bersihkan(t)) },
];

const LABEL = {
  kota: 'Kota', io: 'IO', tanggal: 'Tanggal', wilayah: 'Wilayah harga', bagi_hasil: 'Bagi hasil',
  admin: 'Admin', jadwal_trf: 'Jadwal trf', jam_buka: 'Jam buka', target: 'Target omzet',
  pic: 'PIC', senior: 'Senior', dw: 'DW', kasir: 'Kasir',
};

// Kode event otomatis: 3 huruf kota + tahun + bulan mulai, contoh Jambi Nov 2026 -> JMB26-11.
export function buatKodeEvent(kota, mulai, kodeAda = []) {
  const huruf = String(kota).toUpperCase().replace(/[^A-Z]/g, '');
  const konsonan = huruf.slice(1).replace(/[AIUEO]/g, '');
  let singkat = (huruf[0] || 'X') + konsonan.slice(0, 2);
  if (singkat.length < 3) singkat = huruf.slice(0, 3).padEnd(3, 'X');
  const dasar = `${singkat}${mulai.slice(2, 4)}-${mulai.slice(5, 7)}`;
  const ada = new Set(kodeAda.map((k) => String(k).toUpperCase()));
  if (!ada.has(dasar)) return dasar;
  for (let i = 2; ; i += 1) if (!ada.has(`${dasar}-${i}`)) return `${dasar}-${i}`;
}

export function blokEvent(kode, jawaban) {
  const baris = ['#event', `Kode: ${kode}`];
  for (const p of PERTANYAAN_EVENT) {
    const v = jawaban[p.kunci];
    if (v === undefined || v === '') continue;
    const label = { bagi_hasil: 'Bagi hasil', jadwal_trf: 'Jadwal trf', jam_buka: 'Jam buka', target: 'Target omzet', wilayah: 'Wilayah harga' }[p.kunci] || LABEL[p.kunci];
    baris.push(`${label}: ${v}`);
  }
  return baris.join('\n');
}

function ringkasan(jawaban) {
  return PERTANYAAN_EVENT.map((p, i) => `${i + 1}. ${LABEL[p.kunci]}: ${jawaban[p.kunci] === '' ? '-' : jawaban[p.kunci] ?? '-'}`).join('\n');
}

function tanyaKe(i) {
  const p = PERTANYAAN_EVENT[i];
  return `❓ *(${i + 1}/${PERTANYAAN_EVENT.length}) ${p.tanya}*\nContoh: ${p.contoh}\n_Ketik *batal* untuk berhenti._`;
}

export const SAPAAN = `👋 Halo! Saya bot Cheesy Pen Shells.
Grup ini untuk apa? Balas dengan angka (khusus owner):
1 = Grup *pengeluaran* event baru (Owner + PIC)
2 = Grup *tim* event (PIC + karyawan)
3 = Grup *kas ruko*
4 = Grup *gudang*`;

// Mulai sesi sapaan untuk grup baru.
export function mulaiSapaan(ctx, groupId) {
  ctx.sesi.set(groupId, { jenis: 'sapaan' });
  return SAPAAN;
}

export function mulaiEventBaru(ctx, groupId) {
  ctx.sesi.set(groupId, { jenis: 'event', langkah: 0, jawaban: {} });
  return `📝 *Setup event baru.* Saya akan bertanya ${PERTANYAAN_EVENT.length} hal.\n\n${tanyaKe(0)}`;
}

// Memproses jawaban owner. Mengembalikan:
//   { balasan: string }                       -> kirim balasan, sesi lanjut/selesai
//   { blok: '#event...', balasan }            -> handler membuat event dari blok ini
//   { daftar: 'event'|'ruko'|'gudang', ... }  -> handler mendaftarkan grup
//   null                                      -> tidak ada sesi untuk grup ini
export function prosesJawaban(ctx, pesan, { events = [] } = {}) {
  const sesi = ctx.sesi.get(pesan.groupId);
  if (!sesi) return null;
  const teks = String(pesan.text || '').trim();
  if (!teks) return null;

  if (/^(#?batal|cancel|stop)$/i.test(teks)) {
    ctx.sesi.hapus(pesan.groupId);
    return { balasan: '❎ Tanya-jawab dibatalkan. Ketik *#eventbaru* untuk mulai lagi.' };
  }

  if (sesi.jenis === 'sapaan') {
    const pilihan = teks.replace(/\D/g, '');
    if (pilihan === '1') return { balasan: mulaiEventBaru(ctx, pesan.groupId) };
    if (pilihan === '2') {
      const aktif = events.filter((e) => e.status !== 'SELESAI');
      if (!aktif.length) {
        ctx.sesi.hapus(pesan.groupId);
        return { balasan: '⚠️ Belum ada event aktif. Buat dulu di grup pengeluaran (masukkan bot ke grup itu dan pilih 1).' };
      }
      ctx.sesi.set(pesan.groupId, { jenis: 'pilih_event', pilihan: aktif.map((e) => e.kode) });
      return { balasan: `Grup tim untuk event yang mana? Balas angkanya:\n${aktif.map((e, i) => `${i + 1} = ${e.kode} (${e.kota}, ${e.mulai} s/d ${e.selesai})`).join('\n')}` };
    }
    if (pilihan === '3') { ctx.sesi.hapus(pesan.groupId); return { daftar: 'ruko' }; }
    if (pilihan === '4') { ctx.sesi.hapus(pesan.groupId); return { daftar: 'gudang' }; }
    return { balasan: 'Balas dengan angka 1, 2, 3, atau 4.' };
  }

  if (sesi.jenis === 'pilih_event') {
    const i = Number(teks.replace(/\D/g, '')) - 1;
    const kode = sesi.pilihan[i];
    if (!kode) return { balasan: `Balas angka 1 sampai ${sesi.pilihan.length}.` };
    ctx.sesi.hapus(pesan.groupId);
    return { daftar: 'event', kode };
  }

  if (sesi.jenis === 'event') {
    const tahun = Number(tanggalLokal(pesan.waktu).slice(0, 4));

    // Tahap konfirmasi: "ya" untuk simpan, atau nomor pertanyaan untuk mengubah jawaban.
    if (sesi.langkah >= PERTANYAAN_EVENT.length) {
      if (/^(ya|iya|ok|oke|simpan|y)$/i.test(teks)) {
        ctx.sesi.hapus(pesan.groupId);
        const mulai = parseRentangTanggal(sesi.jawaban.tanggal, tahun).mulai;
        const kode = sesi.kode || buatKodeEvent(sesi.jawaban.kota, mulai, events.map((e) => e.kode));
        return { blok: blokEvent(kode, sesi.jawaban) };
      }
      const no = Number(teks.replace(/\D/g, ''));
      if (no >= 1 && no <= PERTANYAAN_EVENT.length) {
        ctx.sesi.set(pesan.groupId, { ...sesi, langkah: no - 1, ubahSatu: true });
        return { balasan: tanyaKe(no - 1) };
      }
      return { balasan: 'Balas *ya* untuk menyimpan, atau nomor pertanyaan yang mau diubah (contoh: *5*).' };
    }

    const p = PERTANYAAN_EVENT[sesi.langkah];
    const nilai = p.ambil(teks, tahun);
    if (nilai === null) return { balasan: `⚠️ ${p.salah || 'Jawaban belum terbaca.'}\n\n${tanyaKe(sesi.langkah)}` };
    const jawaban = { ...sesi.jawaban, [p.kunci]: nilai };
    const langkah = sesi.ubahSatu ? PERTANYAAN_EVENT.length : sesi.langkah + 1;
    ctx.sesi.set(pesan.groupId, { ...sesi, jawaban, langkah, ubahSatu: false });
    if (langkah < PERTANYAAN_EVENT.length) return { balasan: `✔️ ${LABEL[p.kunci]}: ${nilai === '' ? '-' : nilai}\n\n${tanyaKe(langkah)}` };
    return { balasan: `📋 *Cek data event:*\n${ringkasan(jawaban)}\n\nBalas *ya* untuk menyimpan, atau nomor yang mau diubah (contoh: *5*).` };
  }

  ctx.sesi.hapus(pesan.groupId);
  return null;
}

// #ubah <data> <nilai>: ubah satu data event lewat chat, contoh "#ubah bagi hasil 27" atau "#ubah tanggal 1-16 Nov 2026".
const KUNCI_UBAH = [
  ['bagi hasil', 'Bagi hasil'], ['potongan', 'Bagi hasil'], ['admin', 'Admin'], ['tanggal', 'Tanggal'], ['kota', 'Kota'],
  ['lokasi', 'Kota'], ['io', 'IO'], ['wilayah', 'Wilayah harga'], ['jadwal', 'Jadwal trf'], ['jam buka', 'Jam buka'],
  ['jam', 'Jam buka'], ['target', 'Target omzet'], ['pic', 'PIC'],
];

export function blokUbah(event, teks) {
  const t = bersihkan(teks);
  const kunci = KUNCI_UBAH.find(([k]) => t.toLowerCase().startsWith(k));
  if (!kunci) return null;
  const nilai = bersihkan(t.slice(kunci[0].length).replace(/^\s*(jadi|menjadi|=|:)\s*/i, ''));
  if (!nilai) return null;
  const sekarang = {
    Kota: event.kota, IO: event.io, Tanggal: `${event.mulai.split('-').reverse().join('/')} - ${event.selesai.split('-').reverse().join('/')}`,
    'Wilayah harga': event.wilayah, 'Bagi hasil': `${event.bagi_hasil_persen}%`, Admin: String(event.admin || 0),
    'Jadwal trf': event.jadwal_trf === 'AKHIR' ? 'setelah event selesai' : 'H+1', 'Jam buka': event.jam_buka,
    'Target omzet': String(event.target_omzet || ''), PIC: event.pic,
  };
  sekarang[kunci[1]] = kunci[1] === 'Bagi hasil' && !/%/.test(nilai) ? `${nilai}%` : nilai;
  return ['#event', `Kode: ${event.kode}`, ...Object.entries(sekarang).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}: ${v}`)].join('\n');
}
