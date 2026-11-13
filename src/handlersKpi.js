// Perintah KPI: #nilai (penilaian PIC per event), #poin (poin plus/minus), #kpi (skor & peringkat, owner).
// Penilaian bisa di grup pengeluaran atau chat pribadi dengan bot (bot memulai chat ke PIC setelah event selesai).

import { komplainAktif } from './komplain.js';
import { ikutGajian, gajiMulai } from './gajian.js';
import { STATUS } from './schema.js';
import { hitungEvent } from './laporan.js';
import { bacaData } from './main.js';
import { skorEvent, bahanKpi, teksOtomatis, rekapBulanKPI, yangDinilai, bacaNilai, poinDari, BOBOT, NAMA_ASPEK } from './kpi.js';
import { tanggalLokal, waktuLokal, rupiah, namaBulan } from './util.js';

const balas = (text) => [{ text }];
const kunciNilai = (pesan) => `nilaikpi:${pesan.pribadi ? 'dm' : pesan.groupId}:${pesan.senderId}`;
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const fmt = (n) => (n === null || n === undefined ? '-' : String(Math.round(n * 10) / 10).replace('.', ','));
const namaPenilai = (pesan) => (pesan.senderName ? `${pesan.senderName} (${pesan.senderId})` : pesan.senderId);

async function dataEvent(ctx, kode) {
  const data = await bacaData(ctx.store);
  const event = data.events.find((e) => sama(e.kode, kode));
  return event ? { data, event, r: hitungEvent(event, data) } : null;
}

async function simpanNilai(ctx, pesan, kode, nama, isi) {
  const lama = (await ctx.store.all('Nilai KPI')).filter((n) => n.kode_event === kode && sama(n.nama, nama) && n.status !== STATUS.BATAL);
  for (const n of lama) await ctx.store.updateWhere('Nilai KPI', (x) => x.kode_event === n.kode_event && x.nama === n.nama && x.dicatat === n.dicatat && x.status !== STATUS.BATAL, { status: STATUS.BATAL });
  await ctx.store.append('Nilai KPI', { kode_event: kode, nama, ...isi, penilai: namaPenilai(pesan), status: STATUS.OK, dicatat: waktuLokal(pesan.waktu) });
}

function tanyaOrang(sesi) {
  const o = sesi.daftar[sesi.i];
  return [
    `📝 *Penilaian KPI ${sesi.kode}* (${sesi.i + 1}/${sesi.daftar.length})`,
    `*${o.nama}* (${o.peran}, ${o.hari} hari)`,
    ...(o.otomatis ? [`_Otomatis: ${o.otomatis}. Angka PIC untuk bagian itu tidak dipakai._`] : []),
    'Balas *4 angka* skala 1–5:',
    `① ${NAMA_ASPEK.absen} (20%) ② ${NAMA_ASPEK.kinerja} (40%) ③ ${NAMA_ASPEK.attitude} (20%) ④ ${NAMA_ASPEK.karir} (20%)`,
    'Contoh: *5 4 4 3* · boleh tambah catatan: *5 4 4 3 rajin tapi sering hp-an* · *lewati* · *batal*',
  ].join('\n');
}

const TANYA_TIM = (kode) => `👥 *Terakhir: kinerja tim ${kode}* secara keseluruhan (pembagian tugas, kecepatan), skala 1–5?\nContoh: *4*`;

// Memulai penilaian. Dipakai oleh #nilai dan oleh bot setelah event selesai (chat pribadi ke PIC).
export async function mulaiPenilaian(ctx, pesan, kode) {
  const d = await dataEvent(ctx, kode);
  if (!d) return balas(`⚠️ Event ${kode} tidak ditemukan.`);
  const skorOto = skorEvent(d.r, await bahanKpi(ctx.store));
  const daftar = yangDinilai(d.r).map((o) => {
    const x = skorOto.find((y) => sama(y.nama, o.nama));
    const bagian = [x?.otomatis?.absen ? `absen ${x.absen}/12` : '', x?.otomatis?.bintang && !x.otomatis.bintang.kurang ? `kinerja ${x.kinerja}/24 dari ⭐ pelanggan` : ''].filter(Boolean);
    return { nama: o.nama, peran: o.peran, hari: o.hari, otomatis: bagian.join(', ') };
  });
  if (!daftar.length) return balas(`⚠️ Tim event ${kode} belum ada (selain PIC). Isi tim dulu lewat #tim.`);
  const sesi = { kode: d.event.kode, daftar, i: 0, waktu: Date.now() };
  ctx.sesi.set(kunciNilai(pesan), sesi);
  return balas(`Halo! Penilaian kinerja tim *${d.event.kode}* (${d.event.kota}, ${d.event.mulai} s/d ${d.event.selesai}) untuk KPI & bonus. Nilai dirahasiakan dari karyawan lain.\n\n${tanyaOrang(sesi)}`);
}

// Jawaban penilaian yang sedang berjalan. null kalau tidak ada sesi.
export async function jawabPenilaian(ctx, pesan) {
  if (!ctx.sesi) return null;
  const k = kunciNilai(pesan);
  const sesi = ctx.sesi.get(k);
  if (!sesi || Date.now() - sesi.waktu > 3 * 24 * 60 * 60 * 1000) return null;
  const teks = String(pesan.text || '').trim();
  if (!teks || teks.startsWith('#')) return null;
  if (/^batal$/i.test(teks)) { ctx.sesi.hapus(k); return balas('👌 Penilaian dihentikan. Nilai yang sudah dijawab tetap tersimpan. Lanjutkan kapan saja dengan *#nilai*.'); }

  if (sesi.i >= sesi.daftar.length) { // pertanyaan kinerja tim
    const n = Number((teks.match(/\d+(?:[.,]\d+)?/) || [])[0]?.replace(',', '.'));
    if (!(n >= 0 && n <= 5) && !(n > 5 && n <= 100)) return balas('Balas satu angka 1–5, contoh *4*.');
    await simpanNilai(ctx, pesan, sesi.kode, 'TIM', { tim: n });
    ctx.sesi.hapus(k);
    const d = await dataEvent(ctx, sesi.kode);
    const skor = skorEvent(d.r, await bahanKpi(ctx.store));
    return balas([
      `✅ *Penilaian ${sesi.kode} selesai.* Terima kasih!`,
      ...skor.map((s) => `• ${s.nama}: individu ${fmt(s.individu)}/60 + kelompok ${fmt(s.kelompok)}/40${s.laporanMinus ? ` − laporan ${s.laporanMinus}` : ''} = *${fmt(s.total)}*${teksOtomatis(s) ? `\n   _${teksOtomatis(s)}_` : ''}`),
      '_Skor bulan juga memperhitungkan poin plus/minus. Ringkasan lengkap ada di file KPI KARYAWAN._',
    ].join('\n'));
  }

  const o = sesi.daftar[sesi.i];
  if (/^lewati$/i.test(teks)) {
    sesi.i += 1;
  } else {
    const nilai = bacaNilai(teks.replace(/[a-z].*$/is, ''));
    if (!nilai) return balas(`Belum terbaca. Balas *4 angka* untuk ${o.nama}, contoh *5 4 4 3* (absen, kinerja, attitude, karir).`);
    const catatan = (teks.match(/[a-z].*$/is) || [''])[0].trim();
    await simpanNilai(ctx, pesan, sesi.kode, o.nama, { ...nilai, catatan });
    sesi.i += 1;
  }
  sesi.waktu = Date.now();
  ctx.sesi.set(k, sesi);
  return balas(sesi.i < sesi.daftar.length ? tanyaOrang(sesi) : TANYA_TIM(sesi.kode));
}

// #nilai · #nilai BAL26-09 · #nilai Dena 5 4 4 3 · #nilai tim 4
export async function perintahNilai(ctx, pesan, { event, argumen, isOwner }) {
  const kodeArg = argumen.find((a) => /^[A-Z]{3}\d{2}-\d{2}$/i.test(a));
  const kode = kodeArg ? kodeArg.toUpperCase() : event?.kode;
  if (!kode) return balas('Format: *#nilai KODE-EVENT* (contoh #nilai BAL26-09), atau kirim #nilai di grup pengeluaran event.');
  if (pesan.pribadi && !isOwner && !(await adalahPic(ctx, pesan, kode))) return balas('⚠️ Penilaian hanya untuk owner atau PIC event ini.');
  const sisa = argumen.filter((a) => a !== kodeArg);
  if (!sisa.length) return mulaiPenilaian(ctx, pesan, kode);

  const d = await dataEvent(ctx, kode);
  if (!d) return balas(`⚠️ Event ${kode} tidak ditemukan.`);
  if (sama(sisa[0], 'tim')) {
    const n = Number(String(sisa[1] || '').replace(',', '.'));
    if (!(n >= 0 && n <= 100)) return balas('Format: *#nilai tim 4* (skala 1–5)');
    await simpanNilai(ctx, pesan, kode, 'TIM', { tim: n });
    return balas(`✅ Kinerja tim ${kode}: ${n} → ${fmt(poinDari(n, BOBOT.tim))}/${BOBOT.tim} poin`);
  }
  const angkaAwal = sisa.findIndex((a) => /^\d/.test(a));
  const nama = sisa.slice(0, angkaAwal < 0 ? sisa.length : angkaAwal).join(' ');
  const orang = yangDinilai(d.r).find((o) => sama(o.nama, nama) || String(o.nama).toLowerCase().startsWith(nama.toLowerCase()));
  if (!orang) return balas(`⚠️ "${nama}" tidak ada di tim ${kode}. Anggota: ${yangDinilai(d.r).map((o) => o.nama).join(', ')}`);
  const nilai = bacaNilai(sisa.slice(angkaAwal).join(' '));
  if (angkaAwal < 0 || !nilai) return balas('Format: *#nilai Dena 5 4 4 3* (absen, kinerja, attitude, karir; skala 1–5)');
  await simpanNilai(ctx, pesan, kode, orang.nama, nilai);
  const s = skorEvent(d.r, await bahanKpi(ctx.store)).find((x) => sama(x.nama, orang.nama));
  return balas(`✅ Nilai ${orang.nama} (${kode}): individu *${fmt(s.individu)}/60*${s.tim === null ? '\n_Kinerja tim belum dinilai: *#nilai tim 4*_' : `, total ${fmt(s.total)}`}${teksOtomatis(s) ? `\n_${teksOtomatis(s)}_` : ''}`);
}

async function adalahPic(ctx, pesan, kode) {
  const ev = (await ctx.store.all('Event')).find((e) => sama(e.kode, kode));
  const k = (await ctx.store.all('Karyawan')).find((x) => String(x.nomor_wa).replace(/\D/g, '').replace(/^0/, '62') === pesan.senderId);
  return Boolean(ev && k && sama(k.nama, ev.pic));
}

// #poin Dena +20 bantu masak bumbu · #poin Dena -10 SOP closing tidak dikerjakan
export async function perintahPoin(ctx, pesan, { event, argumen, isOwner }) {
  if (!isOwner) return balas('⚠️ Poin plus/minus hanya bisa dicatat owner.');
  const i = argumen.findIndex((a) => /^[+-]?\d+$/.test(a));
  if (i < 1) return balas('Format: *#poin Dena +20 bantu masak bumbu* atau *#poin Dena -10 SOP tidak dikerjakan*');
  const nama = argumen.slice(0, i).join(' ');
  const poin = Number(argumen[i]);
  const alasan = argumen.slice(i + 1).join(' ');
  if (!alasan) return balas('Tulis alasannya juga, contoh: *#poin Dena +20 bantu masak bumbu*');
  const kenal = [...(await ctx.store.all('Karyawan')).map((k) => k.nama), ...(await ctx.store.all('Tim Event')).map((t) => t.nama)];
  const cocok = kenal.find((n) => sama(n, nama)) || kenal.find((n) => String(n).toLowerCase().startsWith(nama.toLowerCase()));
  if (!cocok) return balas(`⚠️ "${nama}" belum terdaftar di tab Karyawan / tim event.`);
  const semua = await ctx.store.all('Poin KPI');
  const id = `P${String(semua.length + 1).padStart(4, '0')}`.replace(/^P/, 'K');
  await ctx.store.append('Poin KPI', {
    id, tanggal: tanggalLokal(pesan.waktu), nama: cocok, poin, alasan, kode_event: event?.kode || '',
    dicatat_oleh: namaPenilai(pesan), status: STATUS.OK, dicatat: waktuLokal(pesan.waktu),
  });
  return balas(`${poin >= 0 ? '⭐' : '🔻'} *${cocok}* ${poin >= 0 ? '+' : ''}${poin} poin: ${alasan} (${id})\n_Batalkan: *#poinbatal ${id}*_`);
}

export async function perintahPoinBatal(ctx, pesan, { argumen, isOwner }) {
  if (!isOwner) return balas('⚠️ Khusus owner.');
  const id = String(argumen[0] || '').toUpperCase();
  const hasil = await ctx.store.update('Poin KPI', 'id', id, { status: STATUS.BATAL });
  return balas(hasil ? `🗑️ Poin ${id} dibatalkan.` : `⚠️ ${id} tidak ditemukan.`);
}

// #kpi (bulan terakhir yang ada datanya) · #kpi 2026-09 · #kpi Dena
export async function perintahKpi(ctx, pesan, { argumen, isOwner }) {
  if (!isOwner) return balas('🔒 Nilai KPI bersifat pribadi. Karyawan bisa melihat nilainya sendiri lewat QR kartu (dengan PIN).');
  const data = await bacaData(ctx.store);
  // Event sebelum batas penggajian (sudah dibayar owner) tidak ikut KPI & bonus.
  const hasil = data.events.filter((e) => ikutGajian(e, data.atur)).map((e) => hitungEvent(e, data));
  const poin = (await ctx.store.all('Poin KPI')).filter((p) => String(p.tanggal || '') >= gajiMulai(data.atur));
  const rekap = rekapBulanKPI(hasil, { ...(await bahanKpi(ctx.store)), poin });
  if (!rekap.length) return balas('Belum ada data KPI. Mulai dengan *#nilai* di grup pengeluaran event.');
  const bulanArg = argumen.find((a) => /^\d{4}-\d{2}$/.test(a));
  const nama = argumen.filter((a) => a !== bulanArg).join(' ');
  if (nama) {
    const milik = rekap.filter((h) => String(h.nama).toLowerCase().startsWith(nama.toLowerCase()));
    if (!milik.length) return balas(`⚠️ Tidak ada data KPI untuk "${nama}".`);
    return balas(milik.slice(0, 3).map((h) => [
      `📊 *${h.nama}* – ${namaBulan(h.bulan)}${h.peringkat ? ` (peringkat ${h.peringkat})` : ''}`,
      `Skor akhir: *${fmt(h.skor)}/100* = komponen ${fmt(h.skorKomponen)} + plus ${h.plus} − minus ${h.minus}`,
      ...h.events.map((e) => `• ${e.kode} (${e.hari} hari): individu ${fmt(e.individu)} + kelompok ${fmt(e.kelompok)} = ${fmt(e.total)}${e.total === null ? ' _(belum dinilai)_' : ''}`),
      ...h.riwayatPoin.map((p) => `• ${p.poin > 0 ? '+' : ''}${p.poin} ${p.alasan}`),
      `Estimasi bonus: ${rupiah(h.bonusMaks)} × ${fmt(h.skor)}% = *${h.bonusDiterima === null ? '-' : rupiah(h.bonusDiterima)}*`,
    ].join('\n')).join('\n\n'));
  }
  const bulan = bulanArg || rekap[0].bulan;
  const bln = rekap.filter((h) => h.bulan === bulan);
  return balas([
    `🏆 *KPI ${namaBulan(bulan)}*`,
    ...bln.map((h) => `${h.peringkat ? `${h.peringkat}.` : '–'} ${h.nama} (${h.peran}): *${fmt(h.skor)}*${h.belumDinilai ? ` _(${h.belumDinilai} event belum dinilai)_` : ''} · bonus ${h.bonusDiterima === null ? '-' : rupiah(h.bonusDiterima)}`),
    '',
    'Detail: *#kpi Dena* · bulan lain: *#kpi 2026-09*',
  ].join('\n'));
}

// Sehari setelah event selesai (jam 10.00): minta penilaian ke PIC lewat chat pribadi, sekali per event.
// Kalau nomor PIC belum ada di tab Karyawan, pengingat dikirim ke grup pengeluaran.
export async function tugasPenilaian(ctx, sekarang = new Date()) {
  const keluar = [];
  if (Number(String(sekarang.toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false })).slice(0, 2)) < 10) return keluar;
  const hariIni = tanggalLokal(sekarang);
  const kemarin = tanggalLokal(new Date(sekarang.getTime() - 24 * 60 * 60 * 1000));
  const [events, nilai, karyawan, grup, pengaturan] = await Promise.all([
    ctx.store.all('Event'), ctx.store.all('Nilai KPI'), ctx.store.all('Karyawan'), ctx.store.all('Grup'), ctx.store.all('Pengaturan'),
  ]);
  for (const e of events.filter((x) => x.selesai === kemarin && x.status !== 'BATAL')) {
    const kunci = `kpi_ditanya_${e.kode}`;
    if (pengaturan.some((p) => p.kunci === kunci) || nilai.some((n) => n.kode_event === e.kode)) continue;
    await ctx.store.append('Pengaturan', { kunci, nilai: hariIni, keterangan: 'Bot sudah meminta penilaian KPI ke PIC' });
    const pic = karyawan.find((k) => sama(k.nama, e.pic) && k.nomor_wa);
    if (pic) {
      const nomor = String(pic.nomor_wa).replace(/\D/g, '').replace(/^0/, '62');
      const pesan = { pribadi: true, groupId: 'dm', senderId: nomor, senderName: pic.nama, waktu: sekarang };
      const [awal] = await mulaiPenilaian(ctx, pesan, e.kode);
      keluar.push({ nomor, text: awal.text });
    } else {
      for (const g of grup.filter((x) => x.kode_event === e.kode && x.jenis === 'pengeluaran')) {
        keluar.push({ groupId: g.group_id, text: `🏁 Event *${e.kode}* sudah selesai. Waktunya *penilaian KPI tim*: ketik *#nilai* di sini.\n_(Nomor WA PIC ${e.pic || ''} belum ada di tab Karyawan, jadi bot belum bisa bertanya lewat chat pribadi.)_` });
      }
    }
  }
  return keluar;
}
