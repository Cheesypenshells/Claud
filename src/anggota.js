// Mengenali anggota grup tim: nomor WhatsApp -> nama & peran. Dipakai untuk tim event, KPI, dan absensi.
// Setelah grup tim didaftarkan (atau #anggota), bot menampilkan nomor anggota grup dan menanyakan nama & peran:
//   "1 Adit senior" · "2 Dena kasir" · "3 Joko DW" · "4 owner" · "5 lewati"
// Hasil: tab Karyawan (nama + nomor WA + peran) dan tab Tim Event (placeholder "DW 1" diganti nama asli).

import { STATUS } from './schema.js';
import { PERAN, UPAH_DEFAULT } from './parsers.js';
import { waktuLokal, bersihkan } from './util.js';

const kunci = (groupId) => `anggota:${groupId}`;
const BERLAKU_MS = 6 * 60 * 60 * 1000;
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const nomor62 = (n) => String(n || '').replace(/\D/g, '').replace(/^0/, '62');
const tampilNomor = (a) => (a.tersembunyi ? `(nomor tersembunyi ${String(a.nomor).slice(-4)})` : `0${String(a.nomor).replace(/^62/, '')}`);

const PERAN_KATA = [
  [/^(pic|penanggung jawab)$/i, PERAN.PIC],
  [/^(senior|tetap|karyawan tetap|karyawan|junior|crew)$/i, PERAN.TETAP],
  [/^(dw|daily worker|daily|freelance|harian)$/i, PERAN.DW],
  [/^kasir$/i, PERAN.KASIR],
  [/^(owner|bos|boss|pemilik)$/i, 'OWNER'],
  [/^(lewati|skip|-|bukan|lainnya|keluarga|bot)$/i, 'LEWATI'],
];
function bacaPeran(kata) {
  return PERAN_KATA.find(([re]) => re.test(kata))?.[1] || null;
}

// Nama yang pernah terlihat di chat (pushName) disimpan per nomor, untuk membantu menebak nama.
export function ingatNama(ctx, pesan) {
  if (!ctx.sesi || !pesan.senderName || !pesan.senderId) return;
  const k = `kenal:${pesan.senderId}`;
  if (ctx.sesi.get(k)?.nama !== pesan.senderName) ctx.sesi.set(k, { nama: pesan.senderName });
}

export async function mulaiAnggota(ctx, groupId, event) {
  if (!ctx.anggotaGrup) return null;
  const anggota = await ctx.anggotaGrup(groupId);
  if (!anggota.length) return null;
  const karyawan = await ctx.store.all('Karyawan');
  const daftar = anggota.map((a) => {
    const k = karyawan.find((x) => nomor62(x.nomor_wa) === a.nomor);
    return { ...a, nama: k?.nama || '', peran: k?.peran || '', tebakan: ctx.sesi.get(`kenal:${a.nomor}`)?.nama || '', owner: ctx.ownerIds.has(a.nomor) };
  });
  ctx.sesi.set(kunci(groupId), { kode: event.kode, daftar, waktu: Date.now() });
  const baris = daftar.map((a, i) => `${i + 1}. ${tampilNomor(a)}${a.owner ? ' – *owner*' : a.nama ? ` – *${a.nama}* (${a.peran || 'peran?'})` : a.tebakan ? ` – nama WA: ${a.tebakan}` : ''}`);
  return [
    `👥 *Anggota grup ${event.kode}* (${daftar.length} nomor). Bot perlu tahu nama & peran tiap nomor (untuk tim, KPI, dan absensi).`,
    ...baris,
    '',
    'Balas dengan *nomor urut, nama, peran*, boleh beberapa baris sekaligus:',
    '1 Adit senior\n2 Dena kasir\n3 Joko DW',
    'Peran: *PIC / senior / DW / kasir / owner / lewati*. Ketik *selesai* kalau sudah.',
  ].join('\n');
}

async function simpanOrang(ctx, pesan, event, a, nama, peran) {
  const karyawan = await ctx.store.all('Karyawan');
  const ada = karyawan.find((k) => (a.nomor && nomor62(k.nomor_wa) === a.nomor) || sama(k.nama, nama));
  const nomorWa = a.tersembunyi ? '' : `0${String(a.nomor).replace(/^62/, '')}`;
  if (ada) {
    await ctx.store.updateWhere('Karyawan', (k) => k.kode === ada.kode && sama(k.nama, ada.nama), { nama, peran, ...(nomorWa ? { nomor_wa: nomorWa } : {}), status: 'AKTIF' });
  } else {
    const nomorUrut = karyawan.reduce((m, k) => Math.max(m, Number(String(k.kode).replace(/\D/g, '')) || 0), 0) + 1;
    await ctx.store.append('Karyawan', {
      kode: `K${String(nomorUrut).padStart(2, '0')}`, nama, nomor_wa: nomorWa, peran, status: 'AKTIF',
      catatan: a.tersembunyi ? `ID WhatsApp ${a.nomor} (nomor tersembunyi)` : '',
    });
  }
  // Tim event: pakai baris yang namanya sama, atau ganti placeholder "DW 1" / "Tetap 1" dengan nama asli.
  const tim = (await ctx.store.all('Tim Event')).filter((o) => o.kode_event === event.kode && o.status !== STATUS.BATAL);
  if (tim.some((o) => sama(o.nama, nama))) {
    await ctx.store.updateWhere('Tim Event', (o) => o.kode_event === event.kode && sama(o.nama, nama) && o.status !== STATUS.BATAL, { peran });
    return 'sudah di tim';
  }
  const placeholder = tim.find((o) => o.peran === peran && new RegExp(`^${peran}\\s*\\d+$`, 'i').test(o.nama));
  if (placeholder) {
    await ctx.store.updateWhere('Tim Event', (o) => o.kode_event === event.kode && o.nama === placeholder.nama && o.status !== STATUS.BATAL, { nama });
    return `menggantikan ${placeholder.nama}`;
  }
  await ctx.store.append('Tim Event', {
    kode_event: event.kode, nama, peran, upah_harian: UPAH_DEFAULT[peran] ?? 0, mulai: event.mulai, selesai: '', status: 'AKTIF',
    catatan: 'dari daftar anggota grup', dicatat: waktuLokal(pesan.waktu),
  });
  return 'ditambahkan ke tim';
}

// Jawaban daftar anggota. Mengembalikan { teks, selesai } atau null kalau tidak ada sesi / bukan jawaban.
export async function jawabAnggota(ctx, pesan, event) {
  if (!ctx.sesi || !event) return null;
  const sesi = ctx.sesi.get(kunci(pesan.groupId));
  if (!sesi || Date.now() - sesi.waktu > BERLAKU_MS) return null;
  const teks = String(pesan.text || '').trim();
  if (!teks || teks.startsWith('#')) return null;
  if (/^(selesai|sudah|beres|cukup|batal|lewati semua)$/i.test(teks)) {
    ctx.sesi.hapus(kunci(pesan.groupId));
    const belum = sesi.daftar.filter((a) => !a.nama && !a.owner && !a.lewati);
    return { selesai: true, teks: `👌 Daftar anggota disimpan.${belum.length ? ` ${belum.length} nomor belum diberi nama (bisa diisi nanti dengan *#anggota*).` : ''}` };
  }
  const baris = teks.split(/\n+/).map((b) => b.trim()).filter(Boolean);
  if (!baris.every((b) => /^\d{1,2}[.)]?\s+\S/.test(b))) return null; // bukan format jawaban
  const hasil = [];
  for (const b of baris) {
    const m = b.match(/^(\d{1,2})[.)]?\s+(.+)$/);
    const a = sesi.daftar[Number(m[1]) - 1];
    if (!a) { hasil.push(`• ${m[1]}: nomor urut tidak ada`); continue; }
    const kata = bersihkan(m[2]).split(/\s+/);
    let peran = null;
    let nama = kata;
    for (let n = Math.min(2, kata.length); n >= 1; n -= 1) {
      const p = bacaPeran(kata.slice(-n).join(' '));
      if (p) { peran = p; nama = kata.slice(0, -n); break; }
    }
    nama = nama.join(' ').replace(/^(nama|namanya)\s+/i, '');
    nama = nama ? nama.charAt(0).toUpperCase() + nama.slice(1) : '';
    if (peran === 'OWNER') { a.owner = true; hasil.push(`• ${m[1]}: owner`); continue; }
    if (peran === 'LEWATI') { a.lewati = true; hasil.push(`• ${m[1]}: dilewati`); continue; }
    if (!nama || !peran) { hasil.push(`• ${m[1]}: tulis nama dan peran, contoh *${m[1]} Adit senior*`); continue; }
    const ket = await simpanOrang(ctx, pesan, event, a, nama, peran);
    a.nama = nama; a.peran = peran;
    hasil.push(`• ${m[1]}. ${tampilNomor(a)} → *${nama}* (${peran}) _${ket}_`);
  }
  sesi.waktu = Date.now();
  const belum = sesi.daftar.filter((a) => !a.nama && !a.owner && !a.lewati);
  if (!belum.length) {
    ctx.sesi.hapus(kunci(pesan.groupId));
    return { selesai: true, teks: `✅ *Anggota tim tersimpan:*\n${hasil.join('\n')}` };
  }
  ctx.sesi.set(kunci(pesan.groupId), sesi);
  return { selesai: false, teks: `✅ Tersimpan:\n${hasil.join('\n')}\n\nBelum: ${belum.map((a) => `${sesi.daftar.indexOf(a) + 1}. ${tampilNomor(a)}${a.tebakan ? ` (${a.tebakan})` : ''}`).join(', ')}\n_Lanjutkan, atau ketik *selesai*._` };
}
