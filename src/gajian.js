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

export async function rincianGajian(ctx, event) {
  const data = await bacaData(ctx.store);
  const ev = data.events.find((e) => e.kode === event.kode) || event;
  const r = hitungEvent(ev, data);
  const skor = skorEvent(r, await bahanKpi(ctx.store));
  const karyawan = data.karyawan || [];
  const rek = (nama) => {
    const k = karyawan.find((x) => sama(x.nama, nama));
    return k?.no_rekening ? `${k.bank} ${k.no_rekening}${k.atas_nama ? ` a.n. ${k.atas_nama}` : ''}` : '';
  };
  const orang = r.barisTim.filter((o) => !o.owner && !o.catatanGaji && o.peran !== PERAN.PIC).map((o) => {
    const s = skor.find((x) => sama(x.nama, o.nama));
    const total = s?.total ?? null;
    const bonusDiterima = o.bonus ? (total === null ? null : Math.round((o.bonus * total) / 100)) : 0;
    return { ...o, skor: total, bonusDiterima, transfer: o.upah + (bonusDiterima ?? 0), rekening: rek(o.nama) };
  });
  return { r, ev, orang, atur: data.atur };
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
    baris.push(`• *${o.nama}*: gaji pokok ${rupiah(o.upah)} + ${bonusTeks} → *${rupiah(o.transfer)}*${o.rekening ? `\n   🏦 ${o.rekening}` : '\n   🏦 _rekening belum ada_'}`);
  }
  if (!tetap.length) baris.push('_(tidak ada karyawan tetap)_');
  baris.push(`*Total karyawan tetap: ${rupiah(totalTetap)}*`);
  if (harian.length) {
    baris.push('', '*DW & kasir* (upah harian, biasanya dibayar PIC di lokasi)');
    for (const o of harian) baris.push(`• ${o.nama} (${o.peran}): ${o.hari} hari → ${rupiah(o.upah + o.bonus)}${o.bonus ? ` (termasuk bonus ${rupiah(o.bonus)})` : ''}`);
  }
  const dwCatatan = r.barisTim.find((o) => o.catatanGaji);
  if (dwCatatan) baris.push('', `*DW & kasir* sesuai catatan gaji: ${rupiah(dwCatatan.upah)}`);
  if (r.setoranPic?.length) baris.push('', `*PIC*: ${r.setoranPic.map((p) => `${p.nama} ${rupiah(p.total)} (fee + uang terpakai, lihat *#setor*)`).join(', ')}`);
  baris.push('', adaBelumDinilai
    ? '_Bonus baru final setelah PIC menilai KPI (*#nilai*). Sehari setelah event selesai bot meminta penilaian otomatis._'
    : '_Bonus = bonus omzet × skor KPI. Gaji pokok 2,5 jt dibagi jumlah event yang dijaga dalam sebulan._');
  return balas(baris.join('\n'));
}
