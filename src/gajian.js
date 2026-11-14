// Penggajian dari bot, mulai event Semarang (14 Nov 2026). Event sebelumnya sudah dibayar owner,
// jadi tidak ikut daftar gaji / KPI (pembukuan event-event itu tetap seperti apa adanya).
//
// #gajian [KODE]  (owner; grup pengeluaran atau chat pribadi)
//   Karyawan tetap: gaji pokok (2,5 jt ÷ jumlah event sebulan) + bonus omzet × skor KPI / 100.
//   DW & kasir: upah sesuai catatan / daftar tim (dibayar PIC lewat grup).
//   PIC (bukan owner): fee PIC + uang PIC yang terpakai -> lihat juga #setor.
// Batas tanggal bisa diubah di tab Pengaturan: kunci "gaji_mulai" (YYYY-MM-DD).

import { rupiah } from './util.js';
import { bacaData } from './main.js';
import { hitungEvent, ATURAN } from './laporan.js';
import { skorEvent, bahanKpi } from './kpi.js';
import { PERAN } from './parsers.js';
import { komplainAktif } from './komplain.js';

export const GAJI_MULAI_BAWAAN = '2026-11-14';
const balas = (text) => [{ text }];
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export function gajiMulai(atur = {}) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(atur.gaji_mulai || '')) ? atur.gaji_mulai : GAJI_MULAI_BAWAAN;
}

// Event yang penggajian/KPI-nya dihitung bot (mulai >= batas).
export const ikutGajian = (event, atur) => String(event?.mulai || '') >= gajiMulai(atur);

// Denda TELAT ABSEN dipotong dari BONUS event saja (gaji pokok / upah tidak dipotong).
// Kalau bonus event itu tidak ada / kurang, sisanya dibawa (diakumulasikan) ke event berikutnya.
// Denda lain (selisih stok, ganti rugi bahan rusak – tab Denda) tetap dipotong dari total transfer.
function dasarGajian(ev, data, kpiBahan, absensi, dendaLain) {
  const r = hitungEvent(ev, data);
  const skor = skorEvent(r, kpiBahan);
  const orang = r.barisTim.filter((o) => !o.owner && !o.catatanGaji && o.peran !== PERAN.PIC).map((o) => {
    const s = skor.find((x) => sama(x.nama, o.nama));
    const total = s?.total ?? null;
    const bonusDiterima = o.peran === PERAN.TETAP
      ? (o.bonus ? (total === null ? null : Math.round((o.bonus * total) / 100)) : 0)
      : (o.bonus || 0);
    const telat = absensi.filter((a) => a.kode_event === ev.kode && sama(a.nama, o.nama) && String(a.status || 'OK').toUpperCase() !== 'DITOLAK').reduce((t, a) => t + (Number(a.denda) || 0), 0);
    const lain = dendaLain.filter((x) => x.kode_event === ev.kode && sama(x.nama, o.nama) && x.status !== 'BATAL').reduce((t, x) => t + (Number(x.jumlah) || 0), 0);
    return { ...o, skor: total, bonusDiterima, telat, lain };
  });
  return { r, orang };
}

export async function rincianGajian(ctx, event) {
  const data = await bacaData(ctx.store);
  const ev = data.events.find((e) => e.kode === event.kode) || event;
  const kpiBahan = await bahanKpi(ctx.store);
  const karyawan = data.karyawan || [];
  const rek = (nama) => {
    const k = karyawan.find((x) => sama(x.nama, nama));
    return k?.no_rekening ? `${k.bank} ${k.no_rekening}${k.atas_nama ? ` a.n. ${k.atas_nama}` : ''}` : '';
  };
  const baca = async (t) => { try { return await ctx.store.all(t); } catch { return []; } };
  const [absensi, dendaLain] = await Promise.all([baca('Absensi'), baca('Denda')]);
  // Sisa denda telat dari event-event sebelumnya (yang ikut gajian bot), dihitung berurutan.
  const bawa = new Map();
  const kunci = (n) => String(n || '').trim().toLowerCase();
  const sebelum = (data.events || []).filter((e) => e.kode !== ev.kode && e.status !== 'BATAL' && ikutGajian(e, data.atur) && String(e.mulai) < String(ev.mulai))
    .sort((a, b) => String(a.mulai).localeCompare(String(b.mulai)));
  for (const e of sebelum) {
    for (const o of dasarGajian(e, data, kpiBahan, absensi, dendaLain).orang) {
      const utang = (bawa.get(kunci(o.nama)) || 0) + o.telat;
      bawa.set(kunci(o.nama), utang - Math.min(utang, Math.max(0, o.bonusDiterima ?? 0)));
    }
  }
  const { r, orang: dasar } = dasarGajian(ev, data, kpiBahan, absensi, dendaLain);
  const orang = dasar.map((o) => {
    const dariLalu = bawa.get(kunci(o.nama)) || 0;
    const telatTotal = dariLalu + o.telat;
    const bonus = o.bonusDiterima ?? 0;
    const potongBonus = Math.min(telatTotal, Math.max(0, bonus));
    const dibawa = telatTotal - potongBonus;
    const transfer = Math.max(0, o.upah + bonus - potongBonus - o.lain);
    return { ...o, denda: { telat: o.telat, dariLalu, potongBonus, dibawa, lain: o.lain }, transfer, rekening: rek(o.nama) };
  });
  return { r, ev, orang, atur: data.atur };
}

// Teks potongan satu orang.
function teksPotong(o) {
  const d = o.denda;
  const bagian = [];
  if (d.telat || d.dariLalu) {
    const asal = [d.telat ? `telat event ini ${rupiah(d.telat)}` : '', d.dariLalu ? `sisa event lalu ${rupiah(d.dariLalu)}` : ''].filter(Boolean).join(' + ');
    if (o.bonusDiterima === null) bagian.push(`denda telat ${rupiah(d.telat + d.dariLalu)} (${asal}) → dipotong dari bonus setelah KPI dinilai`);
    else bagian.push(`denda telat ${rupiah(d.telat + d.dariLalu)} (${asal}) → dipotong dari bonus ${rupiah(d.potongBonus)}${d.dibawa ? `, *sisa ${rupiah(d.dibawa)} dibawa ke event berikutnya*` : ''}`);
  }
  if (d.lain) bagian.push(`− denda selisih stok/ganti rugi ${rupiah(d.lain)}`);
  return bagian.length ? `\n   ⏱️ ${bagian.join('\n   ')}` : '';
}

export async function perintahGajian(ctx, pesan, event, { isOwner }) {
  if (!isOwner) return balas('🔒 Daftar gaji hanya untuk owner.');
  if (!event) return balas('⚠️ Event tidak ditemukan. Di chat pribadi tulis kodenya, contoh: *#gajian SMR26-11*');
  const { r, ev, orang, atur } = await rincianGajian(ctx, event);
  if (!ikutGajian(ev, atur)) {
    return balas(`✅ Gaji event ${ev.kode} (${ev.mulai}) *sudah dibayar* di luar bot. Penggajian lewat bot mulai event tanggal ${gajiMulai(atur)}.`);
  }
  const tetap = orang.filter((o) => o.peran === PERAN.TETAP);
  const harian = orang.filter((o) => o.peran !== PERAN.TETAP);
  const omzet = r.omzetBersih;
  const batas = ATURAN.bonusTetap.batasOmzet;
  const baris = [
    `💰 *Gajian ${ev.kode}* (${ev.kota}, ${ev.mulai} s/d ${ev.selesai})`,
    `Omzet kotor: ${rupiah(omzet)} ${omzet > batas ? '✅ di atas 100 jt (ada bonus senior)' : '— belum di atas 100 jt (tanpa bonus senior)'}`,
    '',
    `*Karyawan tetap* (ditransfer owner)`,
  ];
  let totalTetap = 0;
  let adaBelumDinilai = false;
  for (const o of tetap) {
    const bonusTeks = !o.bonus ? 'bonus Rp 0'
      : o.skor === null ? `bonus ${rupiah(o.bonus)} × KPI _(belum dinilai)_`
        : `bonus ${rupiah(o.bonus)} × KPI ${Math.round(o.skor)}% = ${rupiah(o.bonusDiterima)}`;
    if (o.bonus && o.skor === null) adaBelumDinilai = true;
    totalTetap += o.transfer;
    baris.push(`• *${o.nama}*: gaji pokok ${rupiah(o.upah)} + ${bonusTeks} → *${rupiah(o.transfer)}*${teksPotong(o)}${o.rekening ? `\n   🏦 ${o.rekening}` : '\n   🏦 _rekening belum ada_'}`);
  }
  if (!tetap.length) baris.push('_(tidak ada karyawan tetap)_');
  baris.push(`*Total karyawan tetap: ${rupiah(totalTetap)}*`);
  if (harian.length) {
    baris.push('', '*DW & kasir* (upah harian, biasanya dibayar PIC di lokasi)');
    for (const o of harian) baris.push(`• ${o.nama} (${o.peran}): ${o.hari} hari → ${rupiah(o.upah + o.bonus)}${o.bonus ? ` (termasuk bonus ${rupiah(o.bonus)})` : ''}${o.transfer !== o.upah + o.bonus ? ` → *${rupiah(o.transfer)}*` : ''}${teksPotong(o)}`);
  }
  const dwCatatan = r.barisTim.find((o) => o.catatanGaji);
  if (dwCatatan) baris.push('', `*DW & kasir* sesuai catatan gaji: ${rupiah(dwCatatan.upah)}`);
  if (r.setoranPic?.length) baris.push('', `*PIC*: ${r.setoranPic.map((p) => `${p.nama} ${rupiah(p.total)} (fee + uang terpakai, lihat *#setor*)`).join(', ')}`);
  baris.push('', adaBelumDinilai
    ? '_Bonus baru final setelah PIC menilai KPI (*#nilai*). Sehari setelah event selesai bot meminta penilaian otomatis._'
    : '_Bonus = bonus omzet × skor KPI. Gaji pokok 2,5 jt dibagi jumlah event yang dijaga dalam sebulan._');
  baris.push('_Denda telat absen hanya dipotong dari bonus event; kalau bonus tidak ada/kurang, sisanya dibawa ke event berikutnya._');
  return balas(baris.join('\n'));
}
