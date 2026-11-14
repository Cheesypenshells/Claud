// Penilaian jobdesk loading in oleh PIC.
// Setiap ada foto laporan pekerjaan jobdesk (#booth, #gudang, #tiba, #listrik, #display), bot bertanya ke PIC
// lewat chat pribadi (kalau nomornya dikenal; kalau tidak, di grup pengeluaran): sudah dicek di lokasi,
// pengerjaannya sesuai atau tidak, dan diberi poin berapa. Jawaban ("sesuai 10" / "kurang 6 kabel berantakan")
// dicatat ke Poin KPI setiap penanggung jawab pekerjaan itu. Satu pekerjaan dinilai sekali per event.

import { STATUS } from './schema.js';
import { tanggalLokal, waktuLokal } from './util.js';
import { pjPerTag, TUGAS_LOADING_IN } from './jobdesk.js';

const balas = (text) => [{ text }];
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const nomor62 = (n) => String(n || '').replace(/\D/g, '').replace(/^0/, '62');
const kunciAntre = (tujuan) => `nilaijob:${tujuan}`;

// Ke mana pertanyaan dikirim: chat pribadi PIC event, atau grup pengeluaran kalau nomornya belum dikenal.
async function tujuanPic(ctx, event) {
  const tim = (await ctx.store.all('Tim Event')).filter((o) => o.kode_event === event.kode && o.peran === 'PIC' && o.status !== STATUS.BATAL);
  const karyawan = await ctx.store.all('Karyawan');
  for (const o of tim) {
    const k = karyawan.find((x) => sama(x.nama, o.nama) && x.nomor_wa);
    if (k) return { nomor: nomor62(k.nomor_wa), nama: o.nama };
  }
  const grup = (await ctx.store.all('Grup')).find((g) => g.kode_event === event.kode && g.jenis === 'pengeluaran');
  return grup ? { groupId: grup.group_id, nama: tim[0]?.nama || 'PIC' } : null;
}

const sudahDinilai = async (ctx, kode, tag) => (await ctx.store.all('Poin KPI'))
  .some((p) => p.kode_event === kode && p.status !== STATUS.BATAL && String(p.alasan).startsWith(`Jobdesk #${tag} `));

function teksTanya(item, sisa) {
  return [
    item.tag === 'bantu' ? `🤝 *Cek jobdesk ${item.kode}: ${item.tugas}* (#bantu)` : `🧐 *Cek jobdesk ${item.kode}: ${item.tugas}* (#${item.tag})`,
    `Foto laporan dari *${item.pengirim}* jam ${item.jam} (${item.lapId}). Penanggung jawab: *${item.pj.join(', ')}*`,
    '',
    'Setelah dicek langsung di lokasi, *pengerjaannya sesuai?* Balas *sesuai/kurang/tidak* + *poin*, contoh:',
    '• *sesuai 10*',
    '• *kurang 6 kabel masih berantakan*',
    '• *tidak 0 booth belum dirakit*',
    sisa ? `_(masih ada ${sisa} pekerjaan lain menunggu dinilai)_` : '',
  ].filter(Boolean).join('\n');
}

export const POIN_BANTU_BAWAAN = 5;

// #bantu: poin tetap (Pengaturan "poin_bantu", bawaan 5) langsung ke pengirim + nama tim yang disebut.
// Mengembalikan daftar nama yang mendapat poin.
export async function catatPoinBantu(ctx, event, { lapId, pengirim, isi, waktu }) {
  const tim = (await ctx.store.all('Tim Event')).filter((o) => o.kode_event === event.kode && o.status !== STATUS.BATAL);
  const disebut = tim.filter((o) => new RegExp(`(^|[^a-z])${String(o.nama).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(` ${String(isi).toLowerCase()} `)).map((o) => o.nama);
  const orang = [...new Set([pengirim, ...disebut])];
  const atur = Object.fromEntries((await ctx.store.all('Pengaturan')).map((p) => [p.kunci, p.nilai]));
  const poin = Number(atur.poin_bantu) || POIN_BANTU_BAWAAN;
  let urut = (await ctx.store.all('Poin KPI')).length;
  for (const nama of orang) {
    urut += 1;
    await ctx.store.append('Poin KPI', {
      id: `K${String(urut).padStart(4, '0')}`, tanggal: tanggalLokal(waktu), nama, poin, alasan: `Bantu owner: ${isi} (${lapId})`,
      kode_event: event.kode, dicatat_oleh: 'Bot (#bantu)', status: STATUS.OK, dicatat: waktuLokal(waktu),
    });
  }
  await ctx.store.updateWhere('Laporan Foto', (r) => r.id === lapId, { penilaian: `+${poin} poin otomatis (#bantu)` });
  return orang;
}

// Owner (untuk #bantu: membantu pekerjaan owner): chat pribadi nomor owner pertama.
function tujuanOwner(ctx) {
  const nomor = [...(ctx.ownerIds || [])][0];
  return nomor ? { nomor: String(nomor), nama: 'Owner' } : null;
}

// #bantu: karyawan membantu pekerjaan owner di luar jobdesk -> owner diminta memberi poin.
// pj = pengirim + nama tim lain yang disebut ("#bantu Adit dan Veri angkat freezer").
export async function mintaNilaiBantu(ctx, event, { lapId, pengirim, jam, isi }) {
  if (!ctx.sesi) return [];
  const tim = (await ctx.store.all('Tim Event')).filter((o) => o.kode_event === event.kode && o.status !== STATUS.BATAL);
  const disebut = tim.filter((o) => new RegExp(`(^|[^a-z])${String(o.nama).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(` ${String(isi).toLowerCase()} `)).map((o) => o.nama);
  const pj = [...new Set([pengirim, ...disebut])];
  const tujuan = tujuanOwner(ctx) || await tujuanPic(ctx, event);
  if (!tujuan) return [];
  const k = kunciAntre(tujuan.nomor || tujuan.groupId);
  const antre = ctx.sesi.get(k)?.antre || [];
  const item = { kode: event.kode, tag: 'bantu', tugas: `Bantu owner: ${isi || '(tanpa keterangan)'}`, pj, lapId, pengirim, jam };
  antre.push(item);
  ctx.sesi.set(k, { antre, waktu: Date.now() });
  const text = teksTanya(item, antre.length - 1).replace('Setelah dicek langsung di lokasi, *pengerjaannya sesuai?*', '*Mau diberi poin berapa?*');
  return [tujuan.nomor ? { nomor: tujuan.nomor, text } : { groupId: tujuan.groupId, text }];
}

// Dipanggil setelah foto laporan jobdesk tercatat. Mengembalikan pesan untuk PIC ([] kalau tidak perlu).
export async function mintaNilaiJobdesk(ctx, event, { lapId, tag, pengirim, jam }) {
  if (!ctx.sesi || !TUGAS_LOADING_IN.some((t) => t.tag === tag)) return [];
  const pj = (await pjPerTag(ctx, event.kode, { denganBantu: true }))[tag];
  if (!pj?.length || await sudahDinilai(ctx, event.kode, tag)) return [];
  const tujuan = await tujuanPic(ctx, event);
  if (!tujuan) return [];
  const k = kunciAntre(tujuan.nomor || tujuan.groupId);
  const antre = (ctx.sesi.get(k)?.antre || []).filter((x) => !(x.kode === event.kode && x.tag === tag));
  const item = { kode: event.kode, tag, tugas: TUGAS_LOADING_IN.find((t) => t.tag === tag).label, pj, lapId, pengirim, jam };
  antre.push(item);
  ctx.sesi.set(k, { antre, waktu: Date.now() });
  const text = teksTanya(item, antre.length - 1);
  return [tujuan.nomor ? { nomor: tujuan.nomor, text } : { groupId: tujuan.groupId, text }];
}

// "sesuai 10" / "kurang 6 kabel berantakan" / "8" -> { sesuai, poin, catatan }. null kalau tidak ada angka poin.
export function bacaNilaiJobdesk(teks) {
  const t = String(teks || '').trim();
  const m = t.match(/(^|\s)([+-]?\d{1,3})(?=\s|$|\b)/);
  if (!m) return null;
  const poin = Number(m[2]);
  if (Math.abs(poin) > 100) return null;
  const kecil = t.toLowerCase();
  const sesuai = /\b(tidak|tdk|gak|ga|belum|salah)\b/.test(kecil) ? 'tidak sesuai'
    : /\b(kurang|lumayan|cukup)\b/.test(kecil) ? 'kurang sesuai' : 'sesuai';
  const catatan = t.replace(m[0], ' ').replace(/\b(sesuai|tidak|tdk|gak|ga|kurang|poin|nilai)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return { sesuai, poin, catatan };
}

// Jawaban PIC (chat pribadi, atau grup pengeluaran kalau ditanya di sana). null kalau bukan jawaban.
export async function jawabNilaiJobdesk(ctx, pesan, { boleh = true } = {}) {
  if (!ctx.sesi || !boleh) return null;
  const k = kunciAntre(pesan.pribadi ? pesan.senderId : pesan.groupId);
  const s = ctx.sesi.get(k);
  if (!s?.antre?.length) return null;
  const teks = String(pesan.text || '').trim();
  if (!teks || teks.startsWith('#')) return null;
  const balasTanya = /Cek jobdesk/i.test(pesan.kutipan?.teks || '');
  // Di grup, hanya jawaban yang me-reply pertanyaannya atau berawalan sesuai/kurang/tidak.
  if (!pesan.pribadi && !balasTanya && !/^(sesuai|kurang|tidak|tdk|bagus|ok)\b/i.test(teks)) return null;
  const n = bacaNilaiJobdesk(teks);
  if (!n) return balasTanya || /^(sesuai|kurang|tidak|tdk)\b/i.test(teks) ? balas('Tulis juga poinnya, contoh: *sesuai 10* atau *kurang 6 kabel berantakan*') : null;
  const idDiKutip = (pesan.kutipan?.teks || '').match(/\((L\d{4})\)/)?.[1];
  const item = s.antre.find((x) => x.lapId === idDiKutip) || s.antre[0];
  const semua = await ctx.store.all('Poin KPI');
  let urut = semua.length;
  const penilai = pesan.senderName || pesan.senderId;
  for (const nama of item.pj) {
    urut += 1;
    await ctx.store.append('Poin KPI', {
      id: `K${String(urut).padStart(4, '0')}`, tanggal: tanggalLokal(pesan.waktu), nama, poin: n.poin,
      alasan: item.tag === 'bantu' ? `${item.tugas}${n.catatan ? ` – ${n.catatan}` : ''}` : `Jobdesk #${item.tag} ${item.tugas}: ${n.sesuai}${n.catatan ? ` – ${n.catatan}` : ''}`,
      kode_event: item.kode, dicatat_oleh: `${penilai} (PIC)`, status: STATUS.OK, dicatat: waktuLokal(pesan.waktu),
    });
  }
  await ctx.store.updateWhere('Laporan Foto', (r) => r.id === item.lapId, { penilaian: `${n.sesuai}, ${n.poin} poin${n.catatan ? ` – ${n.catatan}` : ''}` });
  const sisa = s.antre.filter((x) => x !== item);
  if (sisa.length) ctx.sesi.set(k, { antre: sisa, waktu: Date.now() }); else ctx.sesi.hapus(k);
  const ikon = n.sesuai === 'sesuai' ? '✅' : n.sesuai === 'kurang sesuai' ? '⚠️' : '❌';
  return balas([
    `${ikon} *${item.tugas}* (${item.kode}): ${n.sesuai}, *${n.poin >= 0 ? '+' : ''}${n.poin} poin* untuk ${item.pj.join(', ')}${n.catatan ? `\n_Catatan: ${n.catatan}_` : ''}`,
    '_Masuk Poin KPI bulan ini. Salah? *#poinbatal K....* (lihat tab Poin KPI)._',
    sisa.length ? `\n${teksTanya(sisa[0], sisa.length - 1)}` : '',
  ].filter(Boolean).join('\n'));
}
