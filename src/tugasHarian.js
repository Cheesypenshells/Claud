// Pembagian tugas harian (setiap hari event, jam 08.00 di grup tim).
//
// Bagian: Kasir (tetap, dari jawaban "saya" pertanyaan kasir harian / #kasirnya), Pemanggang (tetap, #pemanggang Veri),
// Getok oyster dan Plating (dibagi bot, bergilir tiap hari; PIC boleh menukar dengan #tukar Bima Tiara).
//   3 orang: kasir + plating · pemanggang · getok 1
//   4 orang: kasir + plating · pemanggang · getok 2
//   5 orang: kasir · pemanggang · plating 1 · getok 2      6+: orang tambahan ke getok
// Foto laporan wajib per bagian (dipakai KPI: −2 per laporan yang terlewat):
//   Kasir #depan & #followers · Pemanggang #grill · Getok #cooler · Plating #nampan

import { STATUS } from './schema.js';
import { tanggalLokal, waktuLokal } from './util.js';
import { teksCatatanPagi } from './catatanHarian.js';

const balas = (text) => [{ text }];
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const aktif = (r) => r.status !== STATUS.BATAL;
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tglPendek = (t) => `${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]}`;

export const BAGIAN = {
  Kasir: {
    ikon: '🧾', laporan: ['depan', 'followers'],
    tugas: ['Foto *dekorasi tampak depan*, pastikan rapi', 'Foto *kulkas masih menyala*', 'Pastikan *cucian kemarin malam sudah bersih*', 'Screenshot *followers IG* saat buka & tutup', 'Buka *halaman kasir* (▶ Mulai kasir) sebelum pelanggan pertama'],
    foto: '#depan (dekorasi depan + kulkas + cucian) · #followers',
  },
  Pemanggang: {
    ikon: '🔥', laporan: ['grill'],
    tugas: ['Pastikan *pajangan oyster* ada / hias area pemanggang', 'Pemanggang untuk bakar oyster *bersih*', '*Gas kaleng terisi penuh* di booth', 'Jauhkan gas kaleng dari kompor, peralatan panas, dan sumber panas'],
    foto: '#grill (area panggang, pajangan, gas kaleng)',
  },
  Getok: {
    ikon: '🦪', laporan: ['cooler'],
    tugas: ['Jam *09.30* pesan es batu, tuang ke cooler box (kalau belum ada oyster tetap foto cooler box-nya)', 'Mulai getok oyster', 'Terus supply ke plating sampai *plating bilang stop* (freezer penuh)'],
    foto: '#cooler (cooler box + es batu, kosong pun difoto)',
  },
  Plating: {
    ikon: '🍽️', laporan: ['nampan'],
    tugas: ['Kerjakan *kekurangan stok nampan* (minimal 7 di freezer)', 'Oyster fresh *tampil menarik* dan bersih', 'Air / es batu mencair jangan berantakan, *area kulkas bersih*', 'Peralatan nampan *bersih & kering*', 'Sediakan *wadah air buangan*'],
    foto: '#nampan (nampan di freezer + display oyster fresh + area kulkas)',
  },
};

// Bagi tugas. anggota = nama tim (tanpa PIC); kasir/pemanggang tetap (boleh kosong); hariKe untuk giliran.
export function bagiTugas(anggota, { kasir, pemanggang, hariKe = 0 } = {}) {
  const ada = (n) => n && anggota.some((a) => sama(a, n));
  const k = ada(kasir) ? anggota.find((a) => sama(a, kasir)) : null;
  const p = ada(pemanggang) ? anggota.find((a) => sama(a, pemanggang)) : null;
  const lain = anggota.filter((a) => a !== k && a !== p);
  const total = anggota.length;
  const hasil = [];
  if (k) hasil.push({ bagian: 'Kasir', nama: k });
  if (p) hasil.push({ bagian: 'Pemanggang', nama: p });
  // Giliran: urutan "lain" diputar sesuai hari.
  const putar = lain.length ? lain.map((_, i) => lain[(i + hariKe) % lain.length]) : [];
  if (total >= 5 && putar.length) {
    hasil.push({ bagian: 'Plating', nama: putar[0] });
    putar.slice(1).forEach((n) => hasil.push({ bagian: 'Getok', nama: n }));
  } else {
    if (k) hasil.push({ bagian: 'Plating', nama: k, rangkap: true });
    putar.forEach((n) => hasil.push({ bagian: 'Getok', nama: n }));
  }
  return hasil;
}

async function dataTim(ctx, event) {
  const tim = (await ctx.store.all('Tim Event')).filter((o) => o.kode_event === event.kode && o.status !== STATUS.BATAL && o.status !== 'BERHENTI');
  return tim.filter((o) => o.peran !== 'PIC').map((o) => o.nama);
}
const kasirEvent = (event) => String(event.kasir_antrian || '').split(',').map((x) => x.replace(/\s*\(\d+\)\s*$/, '').trim()).filter(Boolean).pop() || '';
const hariKeDari = (event, tanggal) => Math.max(0, Math.round((new Date(tanggal) - new Date(event.mulai)) / 86400000));

export function teksTugas(event, tanggal, daftar, tambahan = '') {
  const per = (b) => daftar.filter((d) => d.bagian === b);
  const blok = Object.keys(BAGIAN).map((b) => {
    const orang = per(b);
    const nama = orang.length ? orang.map((o) => `*${o.nama}*${o.rangkap ? ' (rangkap kasir)' : ''}`).join(', ') : (b === 'Kasir' ? '_belum ada: jawab "saya" di pertanyaan kasir_' : b === 'Pemanggang' ? '_belum ditentukan: owner/PIC ketik #pemanggang Nama_' : '_–_');
    if (b === 'Plating' && orang.length && orang.every((o) => o.rangkap)) {
      return `${BAGIAN[b].ikon} *PLATING*: dirangkap kasir (${orang.map((o) => o.nama).join(', ')})\n${BAGIAN[b].tugas.map((t) => `   • ${t}`).join('\n')}\n   📷 ${BAGIAN[b].foto}`;
    }
    return `${BAGIAN[b].ikon} *${b.toUpperCase()}*: ${nama}\n${BAGIAN[b].tugas.map((t) => `   • ${t}`).join('\n')}\n   📷 ${BAGIAN[b].foto}`;
  });
  return [
    `📋 *TUGAS HARI INI ${event.kode}* – ${tglPendek(tanggal)}`,
    '',
    ...blok.flatMap((x) => [x, '']),
    ...(tambahan ? [tambahan, ''] : []),
    '🧹 Tutup: semua bantu bersih-bersih; foto *#bersih* (regulator gas dilepas, booth bersih, cucian bersih) lalu tiap orang *#pulang*.',
    '_Lapor kejadian: *#kejadian ...* · perlu dibeli: *#beli ...* · PR/evaluasi: *#pr ...*_',
    '_Tukar bagian (PIC/owner): *#tukar Bima Tiara* · lihat lagi: *#tugas*_',
    '_Laporan foto yang tidak dikirim mengurangi KPI −2 untuk bagian yang bertugas._',
  ].join('\n');
}

async function simpanTugas(ctx, event, tanggal, daftar, oleh) {
  await ctx.store.updateWhere('Tugas Harian', (r) => r.kode_event === event.kode && String(r.tanggal) === tanggal && aktif(r), { status: STATUS.BATAL });
  // updateWhere hanya mengubah satu baris: ulangi sampai tidak ada lagi
  for (let i = 0; i < 30; i++) if (!(await ctx.store.updateWhere('Tugas Harian', (r) => r.kode_event === event.kode && String(r.tanggal) === tanggal && aktif(r), { status: STATUS.BATAL }))) break;
  for (const d of daftar) {
    await ctx.store.append('Tugas Harian', { tanggal, kode_event: event.kode, bagian: d.bagian, nama: d.nama, rangkap: d.rangkap ? 'ya' : '', status: STATUS.OK, dicatat: oleh });
  }
}

export async function tugasHariIni(ctx, event, tanggal) {
  let rows = [];
  try { rows = await ctx.store.all('Tugas Harian'); } catch { rows = []; }
  return rows.filter((r) => r.kode_event === event.kode && String(r.tanggal) === tanggal && aktif(r)).map((r) => ({ bagian: r.bagian, nama: r.nama, rangkap: r.rangkap === 'ya' }));
}

export async function buatTugas(ctx, event, tanggal, oleh = 'bot') {
  const anggota = await dataTim(ctx, event);
  const daftar = bagiTugas(anggota, { kasir: kasirEvent(event), pemanggang: event.pemanggang, hariKe: hariKeDari(event, tanggal) });
  await simpanTugas(ctx, event, tanggal, daftar, oleh);
  return daftar;
}

// Jam 08.00 tiap hari event: umumkan pembagian tugas di grup tim (sekali per hari).
export async function tugasPembagianHarian(ctx, sekarang = new Date()) {
  const keluar = [];
  if (!ctx.sesi) return keluar;
  const jam = Number(sekarang.toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).slice(0, 2));
  if (jam < 8) return keluar;
  const tanggal = tanggalLokal(sekarang);
  const [events, grup] = await Promise.all([ctx.store.all('Event'), ctx.store.all('Grup')]);
  for (const e of events.filter((x) => x.mulai && x.mulai <= tanggal && (!x.selesai || tanggal <= x.selesai) && x.status !== 'BATAL' && x.status !== 'SELESAI')) {
    const tanda = `tugasharian:${e.kode}:${tanggal}`;
    if (ctx.sesi.get(tanda)) continue;
    ctx.sesi.set(tanda, { kirim: true });
    const ada = await tugasHariIni(ctx, e, tanggal);
    const daftar = ada.length ? ada : await buatTugas(ctx, e, tanggal);
    const tambahan = await teksCatatanPagi(ctx, e, tanggal);
    for (const g of grup.filter((x) => x.kode_event === e.kode && x.jenis === 'event')) keluar.push({ groupId: g.group_id, text: teksTugas(e, tanggal, daftar, tambahan) });
  }
  return keluar;
}

// #tugas: tampilkan pembagian hari ini (dibuat kalau belum ada).
export async function perintahTugas(ctx, pesan, event) {
  if (!event) return balas('⚠️ Ketik di grup event.');
  const tanggal = tanggalLokal(pesan.waktu);
  const ada = await tugasHariIni(ctx, event, tanggal);
  return balas(teksTugas(event, tanggal, ada.length ? ada : await buatTugas(ctx, event, tanggal, waktuLokal(pesan.waktu)), await teksCatatanPagi(ctx, event, tanggal)));
}

// #pemanggang Veri (owner/PIC): pemanggang tetap event ini; pembagian hari ini diperbarui.
export async function perintahPemanggang(ctx, pesan, event, isi, { boleh }) {
  if (!boleh) return balas('⚠️ Pemanggang ditentukan owner atau PIC.');
  if (!event) return balas('⚠️ Ketik di grup event.');
  const nama = String(isi || '').trim();
  const anggota = await dataTim(ctx, event);
  const cocok = anggota.find((a) => sama(a, nama)) || anggota.find((a) => a.toLowerCase().startsWith(nama.toLowerCase()));
  if (!nama || !cocok) return balas(`Format: *#pemanggang Veri*\nTim: ${anggota.join(', ')}${event.pemanggang ? `\nPemanggang sekarang: *${event.pemanggang}*` : ''}`);
  await ctx.store.updateWhere('Event', (e) => e.kode === event.kode, { pemanggang: cocok });
  const tanggal = tanggalLokal(pesan.waktu);
  const daftar = await buatTugas(ctx, { ...event, pemanggang: cocok }, tanggal, waktuLokal(pesan.waktu));
  return balas(`✅ Pemanggang tetap ${event.kode}: *${cocok}*\n\n${teksTugas(event, tanggal, daftar)}`);
}

// #tukar Bima Tiara (owner/PIC): tukar bagian dua orang hari ini.
export async function perintahTukar(ctx, pesan, event, argumen, { boleh }) {
  if (!boleh) return balas('⚠️ Tukar bagian hanya oleh owner atau PIC.');
  if (!event) return balas('⚠️ Ketik di grup event.');
  const tanggal = tanggalLokal(pesan.waktu);
  let daftar = await tugasHariIni(ctx, event, tanggal);
  if (!daftar.length) daftar = await buatTugas(ctx, event, tanggal);
  const nama = [...new Set(daftar.map((d) => d.nama))];
  const cari = (n) => nama.find((x) => sama(x, n)) || nama.find((x) => x.toLowerCase().startsWith(String(n || '').toLowerCase()));
  const a = cari(argumen[0]);
  const b = cari(argumen[1]);
  if (!a || !b || a === b) return balas(`Format: *#tukar Bima Tiara*\nTim hari ini: ${nama.join(', ')}`);
  daftar = daftar.map((d) => ({ ...d, nama: d.nama === a ? b : d.nama === b ? a : d.nama }));
  await simpanTugas(ctx, event, tanggal, daftar, `tukar ${waktuLokal(pesan.waktu)}`);
  return balas(`🔄 *${a}* ⇄ *${b}* ditukar untuk hari ini.\n\n${teksTugas(event, tanggal, daftar)}`);
}
