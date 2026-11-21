// Mengenali nomor WhatsApp anggota tim. Nama tim sudah diisi di grup pengeluaran (setup event);
// di grup tim, setiap karyawan cukup menyebut namanya sendiri ("saya Dena" atau nomor urutnya) dan
// nomor pengirim langsung tercatat. DW yang belum bernama: "saya Joko DW" (menggantikan "DW 1").
// Sebelum bertanya, bot mencocokkan sendiri: anggota grup yang nama WhatsApp-nya memuat nama tim
// ("Alam (Karyawan Cheesy Banjarmasin)" -> Alam) langsung tercatat. Owner juga bisa menempel daftar
// "Nama 0812..." dengan #karyawan.
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

// Tulis nomor ke tab Karyawan (perbarui yang bernama/bernomor sama, atau tambah baru).
export async function catatNomor(ctx, nama, peran, nomor) {
  const karyawan = await ctx.store.all('Karyawan');
  const ada = karyawan.find((k) => sama(k.nama, nama)) || karyawan.find((k) => nomor62(k.nomor_wa) === nomor62(nomor));
  if (ada) {
    await ctx.store.updateWhere('Karyawan', (k) => k.kode === ada.kode && sama(k.nama, ada.nama), { nama, nomor_wa: nomor0(nomor62(nomor)), peran: ada.peran || peran, status: 'AKTIF' });
  } else {
    const urut = karyawan.reduce((m, k) => Math.max(m, Number(String(k.kode).replace(/\D/g, '')) || 0), 0) + 1;
    await ctx.store.append('Karyawan', { kode: `K${String(urut).padStart(2, '0')}`, nama, nomor_wa: nomor0(nomor62(nomor)), peran, status: 'AKTIF' });
  }
}

// Nama tim yang termuat di nama WhatsApp (per kata, minimal 3 huruf): "Alam (Karyawan ...)" memuat "Alam".
const kataNama = (t) => String(t || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
function memuatNama(namaWa, namaTim) {
  const wa = kataNama(namaWa);
  const tim = kataNama(namaTim);
  if (!tim.length || tim.join('').length < 3) return false;
  for (let i = 0; i + tim.length <= wa.length; i++) if (tim.every((k, j) => wa[i + j] === k)) return true;
  return false;
}

// Cocokkan anggota grup (nomor + nama WhatsApp yang pernah terlihat) dengan tim yang belum bernomor.
// Hanya kecocokan tunggal yang dicatat. Mengembalikan { cocok: [{nama, nomor}], asing: [nomor] }.
export async function cocokOtomatis(ctx, groupId, event) {
  const hasil = { cocok: [], asing: [] };
  const anggota = ctx.anggotaGrup ? await ctx.anggotaGrup(groupId).catch(() => []) : [];
  if (!anggota.length) return hasil;
  const tim = await timEvent(ctx, event);
  const karyawan = await ctx.store.all('Karyawan');
  const dikenal = new Set(karyawan.filter((k) => k.nomor_wa).map((k) => nomor62(k.nomor_wa)));
  const terdaftar = await nomorTerdaftar(ctx);
  const calon = anggota.filter((a) => !a.tersembunyi && !dikenal.has(a.nomor) && !ctx.ownerIds?.has(a.nomor))
    .map((a) => ({ nomor: a.nomor, namaWa: ctx.sesi.get(`kenal:${a.nomor}`)?.nama || '' }));
  for (const o of tim.filter((x) => !terdaftar.get(x.nama.toLowerCase()) && !placeholder(x))) {
    const cocok = calon.filter((c) => c.namaWa && memuatNama(c.namaWa, o.nama));
    if (cocok.length !== 1) continue;
    const lain = tim.filter((x) => x !== o && memuatNama(cocok[0].namaWa, x.nama));
    if (lain.length) continue; // nama WA memuat dua nama tim: tidak yakin
    await catatNomor(ctx, o.nama, o.peran, cocok[0].nomor);
    hasil.cocok.push({ nama: o.nama, nomor: cocok[0].nomor, namaWa: cocok[0].namaWa });
    calon.splice(calon.indexOf(cocok[0]), 1);
  }
  hasil.asing = calon.map((c) => c.nomor);
  return hasil;
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
  const { cocok, asing } = await cocokOtomatis(ctx, groupId, event);
  const nomor = await nomorTerdaftar(ctx);
  const timBaru = await timEvent(ctx, event);
  const belum = timBaru.filter((o) => !nomor.get(o.nama.toLowerCase()));
  const baris = [
    `👥 *Tim ${event.kode}* (dari data grup pengeluaran):`,
    daftarTeks(timBaru, nomor),
  ];
  if (cocok.length) baris.push('', `🤖 Dicocokkan dari nama WhatsApp: ${cocok.map((c) => `${c.nama} → ${nomor0(c.nomor)}`).join(', ')}. _Kalau salah, orang yang benar cukup balas *saya [nama]*._`);
  if (!belum.length) {
    ctx.sesi.hapus(kunci(groupId));
    baris.push('', '🎉 Semua anggota tim sudah tercatat nomornya.');
    return baris.join('\n');
  }
  baris.push(
    '',
    `Belum tercatat: *${belum.map((o) => o.nama).join(', ')}*.`,
    'Supaya bot kenal nomor WhatsApp kalian (untuk *absensi & KPI*), *setiap orang balas nama sendiri*, contoh: *saya Dena* atau angkanya saja: *2*.',
    'DW yang belum ada namanya: *saya Joko DW*. Nama yang belum ada di daftar: *saya Rina kasir*.',
  );
  if (asing.length) baris.push(`Nomor di grup yang belum dikenal: ${asing.map((n) => `…${n.slice(-4)}`).join(', ')}`);
  baris.push('_✅ = nomor sudah tercatat._');
  return baris.join('\n');
}

// Pengirim menyebut namanya. Mengembalikan { teks, selesai } atau null kalau bukan jawaban.
export async function jawabAnggota(ctx, pesan, event) {
  const r = await jawabAnggotaInti(ctx, pesan, event);
  if (r === null && ctx.sesi && event && ctx.sesi.get(kunci(pesan.groupId))) await cocokPengirim(ctx, pesan, event);
  return r;
}

// Pengirim yang nama WhatsApp-nya memuat tepat satu nama tim yang belum bernomor: dicatat diam-diam.
async function cocokPengirim(ctx, pesan, event) {
  if (!pesan.senderName || !pesan.senderId || ctx.ownerIds?.has(pesan.senderId)) return;
  const karyawan = await ctx.store.all('Karyawan');
  if (karyawan.some((k) => nomor62(k.nomor_wa) === pesan.senderId)) return;
  const terdaftar = await nomorTerdaftar(ctx);
  const tim = await timEvent(ctx, event);
  const cocok = tim.filter((o) => memuatNama(pesan.senderName, o.nama));
  if (cocok.length !== 1 || placeholder(cocok[0]) || terdaftar.get(cocok[0].nama.toLowerCase())) return;
  await catatNomor(ctx, cocok[0].nama, cocok[0].peran, pesan.senderId);
}

async function jawabAnggotaInti(ctx, pesan, event) {
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
  await catatNomor(ctx, nama, peran, nomor);
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

// #karyawan (owner, grup pengeluaran / chat pribadi): tanpa isi = daftar karyawan & nomornya;
// dengan isi "Dena 0812..., Tiar veri 0813..." (satu per baris) = cocokkan nama dengan nomor.
export async function perintahKaryawan(ctx, badan, event) {
  const baris = String(badan || '').split(/\n|;/).map((b) => b.trim()).filter(Boolean);
  const pasang = [];
  const gagal = [];
  for (const b of baris) {
    const m = b.replace(/^\d{1,2}\s*[.)]\s*/, '').match(/^(.*?)[\s:=,\-]*((?:\+?62|0)[\d\s-]{8,16})\s*(.*)$/);
    if (!m || !bersihkan(m[1])) { gagal.push(b); continue; }
    pasang.push({ nama: bersihkan(m[1]).replace(/[:\-]+$/, '').trim(), nomor: nomor62(m[2]), peranKata: bacaPeran(m[3] || '') });
  }
  const tim = event ? await timEvent(ctx, event) : [];
  const karyawan = await ctx.store.all('Karyawan');
  if (!pasang.length) {
    if (baris.length) return `⚠️ Belum terbaca. Tulis satu per baris: *Nama nomor*, contoh:\n#karyawan\nDena 081234567890\nTiar veri 081298765432`;
    const daftar = karyawan.filter((k) => k.status !== 'KELUAR');
    const isi = daftar.length ? daftar.map((k) => `${k.kode} ${k.nama} (${k.peran || '-'}) ${k.nomor_wa || '❓ belum ada nomor'}`).join('\n') : '_(kosong)_';
    const tanpa = tim.filter((o) => !karyawan.some((k) => sama(k.nama, o.nama) && k.nomor_wa)).map((o) => o.nama);
    return `👥 *Data karyawan*\n${isi}${tanpa.length ? `\n\nTim ${event.kode} belum bernomor: *${tanpa.join(', ')}*` : ''}\n\nTambah/cocokkan nomor: *#karyawan* lalu satu per baris *Nama nomor*.`;
  }
  const hasil = [];
  for (const p of pasang) {
    const o = tim.find((x) => sama(x.nama, p.nama)) || tim.find((x) => String(x.nama).toLowerCase().startsWith(p.nama.toLowerCase()) && p.nama.length >= 3);
    const k = karyawan.find((x) => sama(x.nama, p.nama));
    const nama = o?.nama || k?.nama || p.nama.charAt(0).toUpperCase() + p.nama.slice(1);
    const peran = p.peranKata || o?.peran || k?.peran || PERAN.TETAP;
    await catatNomor(ctx, nama, peran, p.nomor);
    hasil.push(`✅ ${nama} (${peran}) → ${nomor0(p.nomor)}${o || k ? '' : ' _(baru)_'}`);
  }
  if (gagal.length) hasil.push(`⚠️ Tidak terbaca: ${gagal.join(' | ')}`);
  return `👥 *Nomor karyawan dicatat*\n${hasil.join('\n')}`;
}
