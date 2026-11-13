// Jobdesk loading in: H-2 (atau H-1 kalau grup baru didaftarkan) jam 10.00, bot membagi pekerjaan loading in
// rata ke anggota tim (senior, DW, kasir; PIC & owner tidak, PIC yang ACC) dan mengumumkannya di grup tim.
// Setiap penanggung jawab wajib mengirim foto laporan dengan tag pekerjaannya (#tiba, #gudang, #booth,
// #listrik, #display). Checklist #loadingin menampilkan penanggung jawab tiap pekerjaan.
// #jobdesk: lihat pembagian (kalau belum ada, dibuat sekarang). #jobdesk ulang (owner/PIC): bagi ulang.

import { STATUS } from './schema.js';
import { waktuLokal } from './util.js';

export const TUGAS_LOADING_IN = [
  { tag: 'booth', label: 'Rakit booth (rangka, meja, banner)', berat: 2 },
  { tag: 'gudang', label: 'Tata stok bahan baku & freezer di gudang belakang', berat: 2 },
  { tag: 'tiba', label: 'Terima & cek barang tiba (hitung koli, cek kerusakan)', berat: 1 },
  { tag: 'listrik', label: 'Pasang listrik, kabel & lampu booth', berat: 1 },
  { tag: 'display', label: 'Tata display oyster, etalase & alat masak', berat: 1 },
];

const balas = (text) => [{ text }];
const tambahHariStr = (tgl, n) => { const d = new Date(`${tgl}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Bagi rata: setiap pekerjaan minimal 1 orang; sisa orang ditambahkan ke pekerjaan yang lebih berat dulu.
// Kalau orangnya lebih sedikit dari pekerjaan, satu orang memegang beberapa pekerjaan (bergiliran).
export function bagiJobdesk(orang, tugas = TUGAS_LOADING_IN) {
  const hasil = tugas.map((t) => ({ ...t, nama: [] }));
  if (!orang.length) return hasil;
  if (orang.length <= tugas.length) {
    hasil.forEach((t, i) => t.nama.push(orang[i % orang.length]));
    return hasil;
  }
  orang.forEach((n, i) => {
    if (i < hasil.length) { hasil[i].nama.push(n); return; }
    // orang berikutnya: ke pekerjaan dengan (jumlah orang / berat) paling kecil
    const t = [...hasil].sort((a, b) => a.nama.length / a.berat - b.nama.length / b.berat)[0];
    t.nama.push(n);
  });
  return hasil;
}

async function anggotaKerja(ctx, event) {
  const tim = (await ctx.store.all('Tim Event')).filter((o) => o.kode_event === event.kode && o.status !== STATUS.BATAL && o.status !== 'BERHENTI');
  const kerja = tim.filter((o) => ['Tetap', 'DW', 'Kasir'].includes(o.peran));
  // Senior dulu (pegang pekerjaan utama), lalu DW/kasir.
  kerja.sort((a, b) => (a.peran === 'Tetap' ? 0 : 1) - (b.peran === 'Tetap' ? 0 : 1));
  return (kerja.length ? kerja : tim.filter((o) => o.peran === 'PIC')).map((o) => o.nama);
}

export async function jobdeskEvent(ctx, kode) {
  return (await ctx.store.all('Jobdesk')).filter((j) => j.kode_event === kode && j.status !== STATUS.BATAL);
}

// PJ per tag (untuk checklist laporan foto).
export async function pjPerTag(ctx, kode) {
  const peta = {};
  for (const j of await jobdeskEvent(ctx, kode)) (peta[j.tag] = peta[j.tag] || []).push(j.nama);
  return peta;
}

function teksJobdesk(event, bagian) {
  return [
    `📋 *JOBDESK LOADING IN ${event.kode}* (${event.kota}, mulai ${event.mulai})`,
    ...bagian.map((t, i) => `${i + 1}. *${t.label}*\n   👷 ${t.nama.join(', ') || '-'} → kirim foto dengan caption *#${t.tag}*`),
    '',
    '_Setiap penanggung jawab wajib kirim *foto hasil kerjanya* di grup ini dengan tag di atas. Cek yang belum: *#loadingin*. PIC: *#acc* setelah semua dicek._',
  ].join('\n');
}

export async function buatJobdesk(ctx, event, { waktu = new Date(), ulang = false } = {}) {
  if (ulang) {
    await ctx.store.updateWhere('Jobdesk', (j) => j.kode_event === event.kode && j.status !== STATUS.BATAL, { status: STATUS.BATAL });
  }
  const orang = await anggotaKerja(ctx, event);
  const bagian = bagiJobdesk(orang);
  for (const t of bagian) {
    for (const nama of t.nama) {
      await ctx.store.append('Jobdesk', {
        kode_event: event.kode, tahap: 'Loading in', tag: t.tag, tugas: t.label, nama, status: STATUS.OK, dicatat: waktuLokal(waktu),
      });
    }
  }
  return teksJobdesk(event, bagian);
}

export async function teksJobdeskAda(ctx, event) {
  const ada = await jobdeskEvent(ctx, event.kode);
  if (!ada.length) return null;
  const bagian = TUGAS_LOADING_IN.map((t) => ({ ...t, nama: ada.filter((j) => j.tag === t.tag).map((j) => j.nama) })).filter((t) => t.nama.length);
  return teksJobdesk(event, bagian);
}

// #jobdesk / #jobdesk ulang
export async function perintahJobdesk(ctx, pesan, event, argumen, { bolehUbah }) {
  if (!event) return balas('⚠️ Grup ini belum terhubung ke event.');
  const ulang = /^(ulang|bagi ulang|acak|reset)$/i.test(argumen.join(' ').trim());
  if (ulang && !bolehUbah) return balas('⚠️ Bagi ulang jobdesk hanya oleh owner atau PIC.');
  if (!ulang) {
    const ada = await teksJobdeskAda(ctx, event);
    if (ada) return balas(ada);
  }
  return balas(await buatJobdesk(ctx, event, { waktu: pesan.waktu, ulang }));
}

// Terjadwal: H-2 s/d H-1 sebelum event mulai, jam >= 10.00, sekali per event -> grup tim.
export async function tugasJobdesk(ctx, sekarang = new Date(), { tanggalLokal }) {
  const keluar = [];
  const jam = Number(String(sekarang.toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false })).slice(0, 2));
  if (jam < 10) return keluar;
  const hariIni = tanggalLokal(sekarang);
  const [events, grup] = await Promise.all([ctx.store.all('Event'), ctx.store.all('Grup')]);
  for (const e of events.filter((x) => x.status !== 'BATAL' && x.status !== 'SELESAI' && x.mulai)) {
    if (!(hariIni >= tambahHariStr(e.mulai, -2) && hariIni < e.mulai)) continue;
    const grupTim = grup.filter((g) => g.kode_event === e.kode && g.jenis === 'event').map((g) => g.group_id);
    if (!grupTim.length) continue;
    if ((await jobdeskEvent(ctx, e.kode)).length) continue; // sudah dibagi (otomatis atau #jobdesk)
    const teks = await buatJobdesk(ctx, e, { waktu: sekarang });
    for (const g of grupTim) keluar.push({ groupId: g, text: teks });
  }
  return keluar;
}
