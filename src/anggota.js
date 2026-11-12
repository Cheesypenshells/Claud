// Mengenali nomor WhatsApp anggota tim. Nama tim sudah diisi di grup pengeluaran (setup event);
// di grup tim, setiap karyawan cukup menyebut namanya sendiri ("saya Dena" atau nomor urutnya) dan
// nomor pengirim langsung tercatat. DW yang belum bernama: "saya Joko DW" (menggantikan "DW 1").
// Hasil: tab Karyawan (nama + nomor WA + peran) dan tab Tim Event. Dipakai untuk KPI, chat ke PIC, absensi.

import { STATUS } from './schema.js';
import { PERAN, UPAH_DEFAULT } from './parsers.js';
import { waktuLokal, bersihkan } from './util.js';

const kunci = (groupId) => `anggota:${groupId}`;
const BERLAKU_MS = 4 * 24 * 60 * 60 * 1000; // karyawan bisa menjawab beberapa hari kemudian
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const nomor62 = (n) => String(n || '').replace(/\D/g, '').replace(/^0/, '62');
const nomor0 = (n) => `0${String(n).replace(/^62/, '')}`;
const placeholder = (o) => new RegExp(`^${o.peran}\\s*\\d+$`, 'i').test(o.nama);

const PERAN_KATA = [
  [/^(pic)$/i, PERAN.PIC], [/^(senior|tetap|karyawan|junior|crew)$/i, PERAN.TETAP],
  [/^(dw|daily|freelance|harian)$/i, PERAN.DW], [/^kasir$/i, PERAN.KASIR],
];
const bacaPeran = (k) => PERAN_KATA.find(([re]) => re.test(k))?.[1] || null;

// Nama WhatsApp yang pernah terlihat (pushName), disimpan per nomor.
export function ingatNama(ctx, pesan) {
  if (!ctx.sesi || !pesan.senderName || !pesan.senderId) return;
  const k = `kenal:${pesan.senderId}`;
  if (ctx.sesi.get(k)?.nama !== pesan.senderName) ctx.sesi.set(k, { nama: pesan.senderName });
}

async function timEvent(ctx, event) {
  return (await ctx.store.all('Tim Event')).filter((o) => o.kode_event === event.kode && o.status !== STATUS.BATAL);
}

async function nomorTerdaftar(ctx) {
  const karyawan = await ctx.store.all('Karyawan');
  return new Map(karyawan.filter((k) => k.nomor_wa).map((k) => [String(k.nama).toLowerCase(), nomor62(k.nomor_wa)]));
}

function daftarTeks(tim, nomor) {
  return tim.map((o, i) => `${i + 1}. ${o.nama} (${o.peran})${nomor.get(o.nama.toLowerCase()) ? ' ✅' : ''}`).join('\n');
}

export async function mulaiAnggota(ctx, groupId, event) {
  const tim = await timEvent(ctx, event);
  if (!tim.length) return null;
  ctx.sesi.set(kunci(groupId), { kode: event.kode, waktu: Date.now() });
  const nomor = await nomorTerdaftar(ctx);
  return [
    `👥 *Tim ${event.kode}* (dari data grup pengeluaran):`,
    daftarTeks(tim, nomor),
    '',
    'Supaya bot kenal nomor WhatsApp kalian (untuk *absensi & KPI*), *setiap orang balas nama sendiri*, contoh: *saya Dena* atau angkanya saja: *2*.',
    'DW yang belum ada namanya: *saya Joko DW*. Nama yang belum ada di daftar: *saya Rina kasir*.',
    '_✅ = nomor sudah tercatat._',
  ].join('\n');
}

// Pengirim menyebut namanya. Mengembalikan { teks, selesai } atau null kalau bukan jawaban.
export async function jawabAnggota(ctx, pesan, event) {
  if (!ctx.sesi || !event) return null;
  const sesi = ctx.sesi.get(kunci(pesan.groupId));
  if (!sesi || Date.now() - sesi.waktu > BERLAKU_MS || sesi.kode !== event.kode) return null;
  const teks = bersihkan(String(pesan.text || '').replace(/[.!]+$/, ''));
  if (!teks || teks.startsWith('#')) return null;
  if (/^(selesai|sudah semua|cukup)$/i.test(teks)) {
    ctx.sesi.hapus(kunci(pesan.groupId));
    return { selesai: true, teks: '👌 Pendataan nomor tim ditutup. Yang belum bisa menyusul dengan *#anggota*.' };
  }
  const tim = await timEvent(ctx, event);
  let target = null;
  let peranBaru = null;
  let namaBaru = '';
  const angka = teks.match(/^(\d{1,2})$/);
  const saya = teks.match(/^(?:saya|aku|sy|gue|gw|nama saya|namaku|nama aku)\s+(.+)$/i);
  if (angka) {
    target = tim[Number(angka[1]) - 1];
    if (!target) return null;
  } else {
    const isi = saya ? saya[1] : teks;
    if (!saya && isi.split(/\s+/).length > 3) return null; // kalimat biasa, bukan menyebut nama
    const kata = isi.split(/\s+/);
    const p = bacaPeran(kata[kata.length - 1]);
    if (p && kata.length > 1) { peranBaru = p; kata.pop(); }
    namaBaru = kata.join(' ');
    target = tim.find((o) => sama(o.nama, namaBaru)) || tim.find((o) => String(o.nama).toLowerCase().startsWith(namaBaru.toLowerCase()) && namaBaru.length >= 3);
    if (!target && !saya) return null; // tanpa "saya" dan nama tidak ada di tim: bukan jawaban
  }
  const nomor = pesan.senderId;
  let nama;
  let peran;
  let ket = '';
  if (target && !(placeholder(target) && namaBaru)) {
    nama = target.nama; peran = target.peran;
  } else {
    // Nama baru: ganti placeholder sesuai peran ("DW 1"), atau tambah ke tim.
    peran = peranBaru || target?.peran;
    if (!peran) return { selesai: false, teks: `🤔 "${namaBaru}" belum ada di tim. Tulis dengan perannya, contoh: *saya ${namaBaru} DW* atau *saya ${namaBaru} senior*.` };
    nama = namaBaru.charAt(0).toUpperCase() + namaBaru.slice(1);
    const ph = (target && placeholder(target)) ? target : tim.find((o) => o.peran === peran && placeholder(o));
    if (ph) {
      await ctx.store.updateWhere('Tim Event', (o) => o.kode_event === event.kode && o.nama === ph.nama && o.status !== STATUS.BATAL, { nama });
      ket = ` (menggantikan ${ph.nama})`;
    } else {
      await ctx.store.append('Tim Event', {
        kode_event: event.kode, nama, peran, upah_harian: UPAH_DEFAULT[peran] ?? 0, mulai: event.mulai, selesai: '', status: 'AKTIF',
        catatan: 'menyebut nama di grup tim', dicatat: waktuLokal(pesan.waktu),
      });
      ket = ' (ditambahkan ke tim)';
    }
  }
  // Tab Karyawan: perbarui nomor (yang bernama sama atau bernomor sama), atau tambah baru.
  const karyawan = await ctx.store.all('Karyawan');
  const ada = karyawan.find((k) => sama(k.nama, nama)) || karyawan.find((k) => nomor62(k.nomor_wa) === nomor);
  if (ada) {
    await ctx.store.updateWhere('Karyawan', (k) => k.kode === ada.kode && sama(k.nama, ada.nama), { nama, nomor_wa: nomor0(nomor), peran: ada.peran || peran, status: 'AKTIF' });
  } else {
    const urut = karyawan.reduce((m, k) => Math.max(m, Number(String(k.kode).replace(/\D/g, '')) || 0), 0) + 1;
    await ctx.store.append('Karyawan', { kode: `K${String(urut).padStart(2, '0')}`, nama, nomor_wa: nomor0(nomor), peran, status: 'AKTIF' });
  }
  const timBaru = await timEvent(ctx, event);
  const terdaftar = await nomorTerdaftar(ctx);
  const belum = timBaru.filter((o) => !terdaftar.get(o.nama.toLowerCase()));
  sesi.waktu = Date.now();
  if (!belum.length) {
    ctx.sesi.hapus(kunci(pesan.groupId));
    return { selesai: true, teks: `✅ *${nama}* (${peran}) → ${nomor0(nomor)}${ket}\n🎉 Semua anggota tim ${event.kode} sudah tercatat nomornya.` };
  }
  ctx.sesi.set(kunci(pesan.groupId), sesi);
  return { selesai: false, teks: `✅ *${nama}* (${peran}) → ${nomor0(nomor)}${ket}\nBelum: ${belum.map((o) => o.nama).join(', ')}` };
}
