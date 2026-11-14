// Jobdesk loading in (alur dari owner):
//   1. Truk datang: SEMUA turunkan barang (minimal 4 orang, cepat: truk gantian dengan tenant lain).
//   2. 1 orang hitung & cek koli (bahan baku + bahan kering) sesuai kiriman Jakarta -> foto #tiba.
//   3. Dibagi 2 tim: 60% TIM BOOTH (bagian bawah #booth, bagian atas #listrik, estetika #display) dan
//      40% TIM BARANG (#gudang: masukkan & data bahan baku, oyster yang datang, freezer).
//   Penghitung koli (pekerjaan ringan) membantu rakit booth setelah selesai.
// Senior disebar merata ke kedua tim dan ke tiap bagian booth. Dibagi H-2 (atau H-1) jam 10.00 di grup tim;
// PIC & owner tidak dibagi (PIC yang mengecek & #acc). Setiap penanggung jawab wajib foto dengan tag-nya.
// #jobdesk: lihat pembagian (kalau belum ada, dibuat sekarang). #jobdesk ulang (owner/PIC): bagi ulang.

import { STATUS } from './schema.js';
import { waktuLokal } from './util.js';
import { teksInfoLoading, mulaiTanyaLoading } from './loadingInfo.js';

export const TUGAS_LOADING_IN = [
  { tag: 'tiba', tim: 'awal', label: 'Hitung & cek koli barang tiba (bahan baku + bahan kering) sesuai kiriman Jakarta, foto & lapor', jam: '±30 menit', bantuKe: 'booth' },
  { tag: 'booth', tim: 'booth', label: 'Rakit booth bagian BAWAH: etalase, meja, kompor, banner', jam: '3–5 jam' },
  { tag: 'listrik', tim: 'booth', label: 'Rakit booth bagian ATAS: lampu gantung, LED 120×60, bendera, hexos, jalur kabel atas & bawah', jam: '2–3 jam' },
  { tag: 'display', tim: 'booth', label: 'ESTETIKA: dekorasi, peralatan masak, cuci semua alat, pastikan siap jualan besok', jam: '2–3 jam' },
  { tag: 'gudang', tim: 'barang', label: 'TIM BARANG: masukkan & data bahan baku, masukkan oyster yang datang, tata freezer', jam: '1–2 jam' },
];
export const PORSI_TIM_BOOTH = 0.6;

const balas = (text) => [{ text }];
const tambahHariStr = (tgl, n) => { const d = new Date(`${tgl}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Bagi adil. orang = nama (senior dulu, lalu DW/kasir). 60% tim booth, 40% tim barang; tiap orang masuk ke tim
// yang paling jauh dari targetnya, jadi senior tersebar di kedua tim. Tim booth dibagi bergiliran ke bagian
// bawah / atas / estetika. Penghitung koli = orang pertama tim barang (kalau tidak ada: orang pertama tim booth).
export function bagiJobdesk(orang, tugas = TUGAS_LOADING_IN) {
  const hasil = tugas.map((t) => ({ ...t, nama: [] }));
  const ke = (tag) => hasil.find((t) => t.tag === tag);
  const n = orang.length;
  if (!n) return hasil;
  const targetBooth = n === 1 ? 1 : Math.max(1, Math.round(n * PORSI_TIM_BOOTH));
  const targetBarang = n - targetBooth;
  const booth = [];
  const barang = [];
  for (const nama of orang) {
    const isiBooth = booth.length / targetBooth;
    const isiBarang = targetBarang ? barang.length / targetBarang : Infinity;
    (isiBooth <= isiBarang ? booth : barang).push(nama);
  }
  const bagianBooth = hasil.filter((t) => t.tim === 'booth');
  // Bergiliran ke bagian booth; kalau orangnya kurang dari 3 bagian, satu orang memegang beberapa bagian.
  const putaran = Math.max(booth.length, bagianBooth.length);
  for (let i = 0; i < putaran; i++) bagianBooth[i % bagianBooth.length].nama.push(booth[i % booth.length]);
  for (const t of bagianBooth) t.nama = [...new Set(t.nama)];
  const timBarang = barang.length ? barang : [booth[0]];
  for (const t of hasil.filter((x) => x.tim === 'barang')) t.nama.push(...timBarang);
  ke('tiba')?.nama.push(timBarang[0]);
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

// Pembantu per pekerjaan: penanggung jawab pekerjaan ringan (bantuKe) ikut membantu setelah tugasnya selesai.
export function pembantuDari(petaPj, tugas = TUGAS_LOADING_IN) {
  const bantu = {};
  for (const t of tugas.filter((x) => x.bantuKe)) {
    for (const n of petaPj[t.tag] || []) {
      if ((petaPj[t.bantuKe] || []).includes(n)) continue;
      (bantu[t.bantuKe] = bantu[t.bantuKe] || []).includes(n) || bantu[t.bantuKe].push(n);
    }
  }
  return bantu;
}

// Penanggung jawab per tag. denganBantu: ikut pembantu (untuk poin penilaian PIC).
export async function pjPerTag(ctx, kode, { denganBantu = false } = {}) {
  const peta = {};
  for (const j of await jobdeskEvent(ctx, kode)) (peta[j.tag] = peta[j.tag] || []).push(j.nama);
  if (!denganBantu) return peta;
  const bantu = pembantuDari(peta);
  return Object.fromEntries(Object.keys({ ...peta, ...bantu }).map((t) => [t, [...(peta[t] || []), ...(bantu[t] || [])]]));
}

export async function pembantuPerTag(ctx, kode) {
  return pembantuDari(await pjPerTag(ctx, kode));
}

function teksJobdesk(event, bagian, jumlahOrang) {
  const bantu = pembantuDari(Object.fromEntries(bagian.map((t) => [t.tag, t.nama])));
  const baris = (t) => [
    `• *${t.label}* _(${t.jam})_\n   👷 ${t.nama.join(', ') || '-'} → foto caption *#${t.tag}*`,
    bantu[t.tag]?.length ? `   🤝 Dibantu: ${bantu[t.tag].join(', ')} (setelah hitung koli selesai)` : '',
    t.bantuKe && t.nama.length ? '   ↪️ Setelah selesai, bantu rakit booth' : '',
  ].filter(Boolean).join('\n');
  const timBooth = [...new Set(bagian.filter((t) => t.tim === 'booth').flatMap((t) => t.nama))];
  const timBarang = [...new Set(bagian.filter((t) => t.tim === 'barang').flatMap((t) => t.nama))];
  return [
    `📋 *JOBDESK LOADING IN ${event.kode}* (${event.kota}, mulai ${event.mulai})`,
    '',
    `*1️⃣ Truk datang: SEMUA turunkan barang* (${jumlahOrang || 'semua'} orang, minimal 4). Cepat ya, truk gantian dengan tenant lain.`,
    '',
    '*2️⃣ Hitung & cek koli*',
    ...bagian.filter((t) => t.tim === 'awal').map(baris),
    '',
    `*3️⃣ Bagi 2 tim*`,
    `🏗️ *TIM BOOTH* (${timBooth.join(', ')})`,
    ...bagian.filter((t) => t.tim === 'booth').map(baris),
    `📦 *TIM BARANG* (${timBarang.join(', ')})`,
    ...bagian.filter((t) => t.tim === 'barang').map(baris),
    '',
    '_Setiap penanggung jawab wajib kirim *foto hasil kerjanya* di grup ini dengan tag di atas. PIC mengecek di lokasi & memberi poin. Cek yang belum: *#loadingin*._',
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
  return teksJobdesk(event, bagian, orang.length);
}

export async function teksJobdeskAda(ctx, event) {
  const ada = await jobdeskEvent(ctx, event.kode);
  if (!ada.length) return null;
  const bagian = TUGAS_LOADING_IN.map((t) => ({ ...t, nama: ada.filter((j) => j.tag === t.tag).map((j) => j.nama) }));
  return teksJobdesk(event, bagian, new Set(ada.map((j) => j.nama)).size);
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
    // Sekali per pembagian: tanda "jobdesk_diumumkan" berisi waktu pembagian yang sudah diumumkan.
    const ada = await jobdeskEvent(ctx, e.kode);
    const tanda = `jobdesk_diumumkan:${e.kode}`;
    const versi = ada[0]?.dicatat || '';
    if (ada.length && ctx.sesi?.get(tanda)?.versi === versi) continue;
    let teks = ada.length ? await teksJobdeskAda(ctx, e) : await buatJobdesk(ctx, e, { waktu: sekarang });
    const versiBaru = (await jobdeskEvent(ctx, e.kode))[0]?.dicatat || versi;
    ctx.sesi?.set(tanda, { versi: versiBaru });
    if (e.loading_in || e.lokasi_loading) teks = `${teksInfoLoading(e)}\n\n${teks}`;
    for (const g of grupTim) {
      keluar.push({ groupId: g, text: teks });
      const tanya = mulaiTanyaLoading(ctx, g, e);
      if (tanya) keluar.push({ groupId: g, text: tanya });
    }
  }
  return keluar;
}

// ---------- Pengingat laporan jobdesk ----------
// Hari loading in (H-1 sebelum event mulai, dan hari pertama sampai booth buka): jam 10, 12, 14, 16, 18, 20 WIB,
// bot menyebut penanggung jawab yang belum mengirim foto dengan kode laporannya. Berhenti kalau semua sudah lapor.
const JAM_INGAT = [10, 12, 14, 16, 18, 20];

export async function tugasIngatJobdesk(ctx, sekarang = new Date(), { tanggalLokal }) {
  const keluar = [];
  if (!ctx.sesi) return keluar;
  const jam = Number(String(sekarang.toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false })).slice(0, 2));
  const slot = [...JAM_INGAT].reverse().find((j) => jam >= j);
  const hariIni = tanggalLokal(sekarang);
  const [events, grup, laporan] = await Promise.all([ctx.store.all('Event'), ctx.store.all('Grup'), ctx.store.all('Laporan Foto')]);
  for (const e of events.filter((x) => x.status !== 'BATAL' && x.status !== 'SELESAI' && x.mulai)) {
    // Batas: booth buka di hari pertama.
    const bukaJam = e.jam_buka ? Number(String(e.jam_buka).split(/[.:]/)[0]) : 24;
    const sesudahBuka = hariIni > e.mulai || (hariIni === e.mulai && jam >= bukaJam);
    if (sesudahBuka) continue;
    let kunci;
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(e.loading_in || ''))) {
      // Jadwal loading in diketahui: setiap 2 jam setelah loading in dimulai.
      const mulaiLoading = new Date(`${String(e.loading_in).replace(' ', 'T')}:00+07:00`);
      const ke = Math.floor((sekarang - mulaiLoading) / (2 * 3600000));
      if (ke < 1) continue;
      kunci = `ingatjob:${e.kode}:L${ke}`;
    } else {
      const hariLoading = hariIni === tambahHariStr(e.mulai, -1) || hariIni === e.mulai;
      if (!hariLoading || slot === undefined) continue;
      kunci = `ingatjob:${e.kode}:${hariIni}:${slot}`;
    }
    if (ctx.sesi.get(kunci)) continue;
    ctx.sesi.set(kunci, { kirim: true });
    const peta = await pjPerTag(ctx, e.kode);
    if (!Object.keys(peta).length) continue;
    const sudah = new Set(laporan.filter((r) => r.kode_event === e.kode && r.status !== STATUS.BATAL && r.tahap === 'Loading in').map((r) => r.tag));
    const belum = TUGAS_LOADING_IN.filter((t) => peta[t.tag]?.length && !sudah.has(t.tag));
    if (!belum.length) continue;
    const teks = [
      `⏰ *Update loading in ${e.kode}* (jam ${String(sekarang.toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }))})`,
      'Belum ada foto laporan:',
      ...belum.map((t) => `• *${peta[t.tag].join(', ')}* – ${t.label.split(':')[0]} → kirim foto caption *#${t.tag}*`),
      '',
      `_Sudah lapor: ${TUGAS_LOADING_IN.filter((t) => sudah.has(t.tag)).map((t) => `#${t.tag}`).join(', ') || '-'}. Foto progres juga boleh dikirim dengan kode yang sama._`,
    ].join('\n');
    for (const g of grup.filter((x) => x.kode_event === e.kode && x.jenis === 'event')) keluar.push({ groupId: g.group_id, text: teks });
  }
  return keluar;
}
