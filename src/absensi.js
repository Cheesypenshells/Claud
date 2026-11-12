// Absensi foto harian tim event.
//
// - 2 jam sebelum booth buka, bot mengumumkan di grup tim: format absen, aturan denda, dan GAYA FOTO hari
//   ini (contoh ✌️ peace). Gaya berganti tiap hari, jadi foto lama / foto orang lain tidak bisa dipakai.
// - Batas absen = 1 jam sebelum buka. Karyawan kirim foto selfie bergaya di booth dengan caption "absen".
// - Denda telat per hari: 1-15 menit Rp 10.000 · 16-30 menit Rp 25.000 · lebih dari 30 menit Rp 50.000
//   per jam (kelipatan: telat 1 jam 10 menit = 2 jam = Rp 100.000).
// - Bot menolak foto yang diteruskan (forward) atau foto yang sama persis dengan foto absen sebelumnya.
//   Gaya di foto dicek manusia: owner/PIC reply foto absen dengan "tolak" (harus kirim ulang) atau
//   "bebas denda" (denda dihapus, misalnya izin).
// - Jam buka diambil dari data event (Jam Buka) dan dihitung di zona waktu kota event (WIB/WITA/WIT).

import { createHash } from 'node:crypto';
import { STATUS } from './schema.js';
import { rupiah, waktuLokal } from './util.js';

export const GAYA = [
  '✌️ tangan *peace* (2 jari) di samping wajah',
  '👍 *jempol* ke atas dengan tangan kanan',
  '👌 tangan *OK* di depan dada',
  '☝️ *telunjuk* menunjuk ke atas',
  '🖐️ *lima jari* terbuka menghadap kamera',
  '✊ *kepalan tangan* diangkat (semangat!)',
  '🤙 tangan *telepon* (jempol & kelingking) di telinga',
  '🫶 *love* dengan dua tangan',
  '🤟 tangan *I love you* (jempol, telunjuk, kelingking)',
  '3️⃣ *tiga jari* diangkat',
  '4️⃣ *empat jari* diangkat',
  '🫡 *hormat* (tangan di dahi)',
  '🤔 tangan di *dagu* (gaya berpikir)',
  '👉 *menunjuk* ke logo / banner booth',
  '✌️✌️ *peace dua tangan*',
  '⌚ menunjuk *jam tangan* / pergelangan tangan',
  '🙏 tangan *salam* (telapak menempel)',
  '👍👍 *jempol dua tangan*',
  '💪 pamer *otot lengan*',
  '🤞 *jari silang* (telunjuk & jari tengah)',
];

export const ATURAN_DENDA = [
  '• Telat 1–15 menit: *Rp 10.000*',
  '• Telat 16–30 menit: *Rp 25.000*',
  '• Telat lebih dari 30 menit: *Rp 50.000 per jam* (kelipatan, contoh telat 1 jam 10 menit = Rp 100.000)',
  '_Denda dihitung per hari._',
].join('\n');

const UMUM_SEBELUM_BUKA = 120; // menit: gaya foto diumumkan 2 jam sebelum buka
const DATANG_SEBELUM_BUKA = 60; // menit: batas absen 1 jam sebelum buka
const LAMA_ABSEN_MENIT = 8 * 60; // foto absen diterima sampai 8 jam setelah booth buka

// Denda telat (menit setelah batas absen).
export function dendaTelat(menit) {
  if (!(menit > 0)) return 0;
  if (menit <= 15) return 10000;
  if (menit <= 30) return 25000;
  return 50000 * Math.ceil(menit / 60);
}

// Zona waktu kota event: WIB (+7), WITA (+8), WIT (+9).
const WITA = /bali|denpasar|badung|gianyar|kuta|lombok|mataram|ntb|sumbawa|bima|kupang|ntt|flores|labuan bajo|makassar|sulawesi|manado|palu|kendari|gorontalo|mamuju|banjarmasin|banjarbaru|balikpapan|samarinda|bontang|tarakan|kalimantan (selatan|timur|utara)|kalsel|kaltim|kaltara/i;
const WIT = /papua|jayapura|sorong|manokwari|merauke|timika|ambon|maluku|ternate|tual/i;
export function zonaKota(kota) {
  if (WIT.test(kota || '')) return { jam: 9, nama: 'WIT' };
  if (WITA.test(kota || '')) return { jam: 8, nama: 'WITA' };
  return { jam: 7, nama: 'WIB' };
}

// Tanggal & jam lokal kota event untuk sebuah waktu.
export function lokal(waktu, zona) {
  const d = new Date(waktu.getTime() + zona.jam * 3600000);
  const dua = (n) => String(n).padStart(2, '0');
  return { tanggal: `${d.getUTCFullYear()}-${dua(d.getUTCMonth() + 1)}-${dua(d.getUTCDate())}`, jam: `${dua(d.getUTCHours())}:${dua(d.getUTCMinutes())}` };
}

function bacaJam(t) {
  const m = String(t || '').trim().match(/^(\d{1,2})(?:[.:](\d{2}))?$/);
  if (!m || Number(m[1]) > 23) return null;
  return Number(m[1]) * 60 + Number(m[2] || 0);
}

// Jadwal satu hari event: waktu umum (gaya), batas absen, buka. null kalau jam buka belum diisi.
export function jadwalHari(event, tanggal) {
  const menitBuka = bacaJam(event.jam_buka);
  if (menitBuka === null) return null;
  const zona = zonaKota(event.kota);
  const [y, m, d] = tanggal.split('-').map(Number);
  const buka = new Date(Date.UTC(y, m - 1, d, 0, menitBuka) - zona.jam * 3600000);
  const geser = (menit) => new Date(buka.getTime() - menit * 60000);
  return { zona, buka, batas: geser(DATANG_SEBELUM_BUKA), umum: geser(UMUM_SEBELUM_BUKA), tutupAbsen: geser(-LAMA_ABSEN_MENIT) };
}

const jamTeks = (waktu, zona) => `${lokal(waktu, zona).jam} ${zona.nama}`;

// Gaya hari ini: tetap sama walau bot dinyalakan ulang, berbeda tiap hari & tiap event.
export function gayaHari(kode, tanggal) {
  const h = createHash('sha256').update(`${kode}|${tanggal}`).digest();
  return GAYA[h.readUInt32BE(0) % GAYA.length];
}

const hariEvent = (event, tanggal) => tanggal >= event.mulai && (!event.selesai || tanggal <= event.selesai);

export function teksPengumuman(event, tanggal) {
  const j = jadwalHari(event, tanggal);
  return [
    `📸 *ABSENSI ${event.kode} – ${tanggal}*`,
    `Booth buka *${jamTeks(j.buka, j.zona)}* → wajib datang & absen paling lambat *${jamTeks(j.batas, j.zona)}* (1 jam sebelum buka).`,
    '',
    `*Gaya foto hari ini:* ${gayaHari(event.kode, tanggal)}`,
    '',
    '*Format absen:*',
    '1. Selfie di booth dengan gaya di atas (wajah terlihat jelas).',
    '2. Kirim fotonya *langsung dari kamera* di grup ini dengan caption: *absen*',
    '_Foto terusan (forward), foto lama, atau gaya yang salah tidak diterima._',
    '',
    '*Denda keterlambatan:*',
    ATURAN_DENDA,
  ].join('\n');
}

async function timEvent(ctx, kode) {
  return (await ctx.store.all('Tim Event')).filter((o) => o.kode_event === kode && o.status !== STATUS.BATAL && o.status !== 'BERHENTI');
}

const nomor62 = (n) => String(n || '').replace(/\D/g, '').replace(/^0/, '62');
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// Nama anggota tim dari nomor pengirim (tab Karyawan).
async function namaDariNomor(ctx, nomor, tim) {
  const k = (await ctx.store.all('Karyawan')).find((x) => nomor62(x.nomor_wa) === nomor62(nomor));
  if (!k) return null;
  return tim.find((o) => sama(o.nama, k.nama)) || { nama: k.nama, peran: k.peran };
}

async function absenHari(ctx, kode, tanggal) {
  return (await ctx.store.all('Absensi')).filter((a) => a.kode_event === kode && a.tanggal === tanggal && a.status === STATUS.OK);
}

// Tugas terjadwal (dipanggil tiap menit): pengumuman gaya 2 jam sebelum buka, pengingat saat batas lewat.
export async function tugasAbsensi(ctx, sekarang = new Date()) {
  const keluar = [];
  if (!ctx.sesi) return keluar;
  const [events, grup] = await Promise.all([ctx.store.all('Event'), ctx.store.all('Grup')]);
  for (const ev of events.filter((e) => e.status !== 'SELESAI' && e.jam_buka)) {
    const zona = zonaKota(ev.kota);
    const { tanggal } = lokal(sekarang, zona);
    if (!hariEvent(ev, tanggal)) continue;
    const j = jadwalHari(ev, tanggal);
    if (!j) continue;
    const grupTim = grup.filter((g) => g.kode_event === ev.kode && g.jenis === 'event').map((g) => g.group_id);
    if (!grupTim.length) continue;
    const kunci = `absen:${ev.kode}:${tanggal}`;
    const st = ctx.sesi.get(kunci) || {};
    if (!st.umum && sekarang >= j.umum && sekarang < j.buka) {
      st.umum = true;
      for (const g of grupTim) keluar.push({ groupId: g, text: teksPengumuman(ev, tanggal) });
    }
    if (!st.batas && sekarang >= j.batas && sekarang < j.buka) {
      st.batas = true;
      const sudah = await absenHari(ctx, ev.kode, tanggal);
      const belum = (await timEvent(ctx, ev.kode)).filter((o) => !sudah.some((a) => sama(a.nama, o.nama)));
      if (belum.length) {
        for (const g of grupTim) {
          keluar.push({ groupId: g, text: `⏰ *Batas absen ${jamTeks(j.batas, zona)} sudah lewat.*\nBelum absen: *${belum.map((o) => o.nama).join(', ')}*\nSegera kirim foto absen (gaya: ${gayaHari(ev.kode, tanggal)}). Denda telat mulai berjalan.` });
        }
      }
    }
    ctx.sesi.set(kunci, st);
  }
  return keluar;
}

const RE_ABSEN = /\b(absen|absensi|hadir|check ?in|masuk kerja)\b/i;

// Foto absen / perintah terkait absen di grup tim. Mengembalikan teks balasan atau null.
export async function tanganiAbsen(ctx, pesan, event, { isOwner = false } = {}) {
  if (!event?.jam_buka || !ctx.store) return null;
  const teks = String(pesan.text || '').trim();
  const tim = await timEvent(ctx, event.kode);

  // Owner/PIC reply foto absen: "tolak" / "bebas denda".
  if (pesan.kutipan?.id && !pesan.adaFoto && /^(tolak|ditolak|gaya salah|salah gaya|tidak valid|bebas denda|hapus denda|tanpa denda|maafkan)\b/i.test(teks)) {
    const baris = (await ctx.store.all('Absensi')).find((a) => a.foto_id === pesan.kutipan.id && a.status === STATUS.OK);
    if (!baris) return null;
    const pengirim = await namaDariNomor(ctx, pesan.senderId, tim);
    if (!isOwner && pengirim?.peran !== 'PIC') return '⚠️ Hanya owner atau PIC yang bisa menolak absen / menghapus denda.';
    if (/bebas|hapus|tanpa|maaf/i.test(teks)) {
      await ctx.store.updateWhere('Absensi', (a) => a.foto_id === baris.foto_id, { denda: 0, catatan: `denda dihapus (${teks})` });
      return `👌 Denda absen *${baris.nama}* ${baris.tanggal} dihapus.`;
    }
    await ctx.store.updateWhere('Absensi', (a) => a.foto_id === baris.foto_id, { status: 'DITOLAK', catatan: teks });
    return `❌ Absen *${baris.nama}* ${baris.tanggal} *ditolak* (${teks}). Kirim ulang foto absen dengan gaya yang benar: ${gayaHari(event.kode, baris.tanggal)}\n_Denda dihitung dari jam foto ulang._`;
  }

  const balasPengumuman = /ABSENSI/.test(pesan.kutipan?.teks || '');
  if (!RE_ABSEN.test(teks) && !(pesan.adaFoto && balasPengumuman)) return null;
  if (teks.startsWith('#')) return null;
  const zona = zonaKota(event.kota);
  const { tanggal, jam } = lokal(pesan.waktu, zona);
  if (!hariEvent(event, tanggal)) return null;
  const j = jadwalHari(event, tanggal);
  const gaya = gayaHari(event.kode, tanggal);

  if (!pesan.adaFoto) {
    // Kalimat biasa yang menyebut "absen" ("sudah absen belum?") tidak dibalas; hanya "absen" pendek.
    if (teks.split(/\s+/).length > 3) return null;
    return `📸 Absen wajib pakai *foto*: selfie di booth dengan gaya hari ini ${gaya}, kirim langsung dari kamera dengan caption *absen*.`;
  }
  if (pesan.waktu < j.umum) return `⏳ Gaya foto absen hari ini belum dibagikan. Tunggu pengumuman jam *${jamTeks(j.umum, zona)}*, lalu kirim foto dengan gaya itu.`;
  if (pesan.waktu > j.tutupAbsen) return null;

  const orang = await namaDariNomor(ctx, pesan.senderId, tim);
  if (!orang) return '🤔 Nomor kamu belum dikenal bot. Balas *saya [nama kamu]* dulu (contoh: saya Dena), lalu kirim ulang foto absen.';
  if (pesan.diteruskan) return `❌ Foto terusan (forward) tidak diterima, *${orang.nama}*. Ambil selfie baru dengan gaya ${gaya} dan kirim langsung dari kamera.`;
  const sudah = (await absenHari(ctx, event.kode, tanggal)).find((a) => sama(a.nama, orang.nama));
  if (sudah) return `👌 *${orang.nama}* sudah absen hari ini jam ${sudah.jam}.`;

  let sidik = '';
  if (pesan.ambilFoto) {
    const buffer = await pesan.ambilFoto().catch(() => null);
    if (buffer) sidik = createHash('sha256').update(buffer).digest('hex').slice(0, 24);
  }
  if (sidik && (await ctx.store.all('Absensi')).some((a) => a.sidik === sidik)) {
    return `❌ Foto ini *sama persis* dengan foto absen sebelumnya, *${orang.nama}*. Ambil selfie baru dengan gaya ${gaya}.`;
  }
  const menit = pesan.waktu > j.batas ? Math.ceil((pesan.waktu - j.batas) / 60000) : 0;
  const denda = dendaTelat(menit);
  await ctx.store.append('Absensi', {
    tanggal, kode_event: event.kode, nama: orang.nama, peran: orang.peran || '', nomor_wa: `0${nomor62(pesan.senderId).replace(/^62/, '')}`,
    jam: `${jam} ${zona.nama}`, batas: jamTeks(j.batas, zona), telat_menit: menit, denda, gaya: gaya.replace(/\*/g, ''),
    foto_id: pesan.id, sidik, status: STATUS.OK, catatan: '', dicatat: waktuLokal(pesan.waktu),
  });
  const telat = menit
    ? `⏰ Telat *${menit} menit* → denda *${rupiah(denda)}*`
    : '✅ Tepat waktu';
  return `📸 Absen *${orang.nama}* jam ${jam} ${zona.nama} tercatat. ${telat}\n_Gaya hari ini: ${gaya}. Owner/PIC bisa reply foto ini dengan *tolak* kalau gayanya salah._`;
}

// #absen: rekap hari ini (atau tanggal tertentu). #absen Dena 10.05 (owner/PIC): catat manual.
export async function perintahAbsen(ctx, pesan, event, argumen = [], { isOwner = false } = {}) {
  if (!event) return '⚠️ Grup ini belum terhubung ke event.';
  if (!event.jam_buka) return `⚠️ Jam buka ${event.kode} belum diisi. Owner: *#ubah jam buka 11.00*`;
  const zona = zonaKota(event.kota);
  const tim = await timEvent(ctx, event.kode);
  const arg = argumen.join(' ').trim();
  const manual = arg.match(/^(.+?)\s+(\d{1,2}[.:]\d{2})$/);
  if (manual) {
    const pengirim = await namaDariNomor(ctx, pesan.senderId, tim);
    if (!isOwner && pengirim?.peran !== 'PIC') return '⚠️ Absen manual hanya oleh owner atau PIC.';
    const o = tim.find((x) => sama(x.nama, manual[1])) || tim.find((x) => String(x.nama).toLowerCase().startsWith(manual[1].toLowerCase()));
    if (!o) return `⚠️ "${manual[1]}" tidak ada di tim ${event.kode}.`;
    const { tanggal } = lokal(pesan.waktu, zona);
    const j = jadwalHari(event, tanggal);
    const [hh, mm] = manual[2].split(/[.:]/).map(Number);
    const [y, mo, d] = tanggal.split('-').map(Number);
    const waktuDatang = new Date(Date.UTC(y, mo - 1, d, hh, mm) - zona.jam * 3600000);
    const menit = waktuDatang > j.batas ? Math.ceil((waktuDatang - j.batas) / 60000) : 0;
    const sudah = (await absenHari(ctx, event.kode, tanggal)).find((a) => sama(a.nama, o.nama));
    if (sudah) return `👌 *${o.nama}* sudah absen hari ini jam ${sudah.jam}.`;
    const denda = dendaTelat(menit);
    await ctx.store.append('Absensi', {
      tanggal, kode_event: event.kode, nama: o.nama, peran: o.peran, nomor_wa: '', jam: `${manual[2].replace('.', ':')} ${zona.nama}`, batas: jamTeks(j.batas, zona),
      telat_menit: menit, denda, gaya: '-', foto_id: '', sidik: '', status: STATUS.OK, catatan: `manual oleh ${pesan.senderName || pesan.senderId}`, dicatat: waktuLokal(pesan.waktu),
    });
    return `📝 Absen manual *${o.nama}* jam ${manual[2]} ${zona.nama} tercatat. ${menit ? `Telat ${menit} menit → denda *${rupiah(denda)}*` : 'Tepat waktu'}`;
  }
  const semua = (await ctx.store.all('Absensi')).filter((a) => a.kode_event === event.kode && a.status === STATUS.OK);
  if (/^(denda|total|rekap)$/i.test(arg)) {
    const per = new Map();
    for (const a of semua) {
      const d = per.get(a.nama) || { hari: 0, telat: 0, denda: 0 };
      d.hari += 1; if (Number(a.telat_menit) > 0) d.telat += 1; d.denda += Number(a.denda) || 0;
      per.set(a.nama, d);
    }
    if (!per.size) return `Belum ada absen di ${event.kode}.`;
    const total = [...per.values()].reduce((s, d) => s + d.denda, 0);
    return `📊 *Rekap absen & denda ${event.kode}*\n${[...per.entries()].map(([n, d]) => `• ${n}: ${d.hari} hari, telat ${d.telat}× → *${rupiah(d.denda)}*`).join('\n')}\n*Total denda: ${rupiah(total)}*`;
  }
  const tanggal = /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : lokal(pesan.waktu, zona).tanggal;
  const j = jadwalHari(event, tanggal);
  const hari = semua.filter((a) => a.tanggal === tanggal);
  const belum = tim.filter((o) => !hari.some((a) => sama(a.nama, o.nama)));
  return [
    `📸 *Absen ${event.kode} – ${tanggal}*`,
    `Buka ${jamTeks(j.buka, zona)} · batas absen ${jamTeks(j.batas, zona)} · gaya: ${gayaHari(event.kode, tanggal)}`,
    hari.length ? hari.map((a) => `✅ ${a.nama} ${a.jam}${Number(a.telat_menit) > 0 ? ` – telat ${a.telat_menit} mnt, denda ${rupiah(Number(a.denda))}` : ''}`).join('\n') : '_Belum ada yang absen._',
    belum.length ? `❌ Belum absen: *${belum.map((o) => o.nama).join(', ')}*` : '🎉 Semua sudah absen.',
    '',
    '_#absen denda = rekap denda event · #absen Dena 10.05 = absen manual (owner/PIC)_',
  ].join('\n');
}
