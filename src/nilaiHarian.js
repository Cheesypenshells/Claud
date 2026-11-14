// Penilaian harian oleh PIC (chat pribadi; kalau nomor PIC belum dikenal: grup pengeluaran).
// Dikirim setiap hari event jam 22.00, atau lebih cepat setelah ⏹ Tutup kasir. Satu per satu per orang,
// pertanyaannya sesuai bagian tugas orang itu hari itu (tab Tugas Harian).
// Per orang dua langkah: (1) nilai 1–100 + catatan (rahasia), kategori ditentukan bot:
//   Buruk 1–24 · Cukup buruk 25–49 · Sudah cukup 50–74 · Baik sekali 75–100
// (2) pesan PIC untuk karyawan itu -> dikirim langsung ke chat pribadinya ("tidak" kalau tidak ada).
// Lainnya: "lewati" · "batal".
// Tersimpan di tab "Nilai Harian"; rata-ratanya dipakai untuk nilai Kinerja KPI.

import { STATUS } from './schema.js';
import { waktuLokal } from './util.js';
import { tanggalClosing } from './stokHarian.js';
import { saatClosing } from './absensi.js';
import { tambahCatatan } from './catatanHarian.js';

const balas = (text) => [{ text }];
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const nomor62 = (n) => String(n || '').replace(/\D/g, '').replace(/^0/, '62');
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tglPendek = (t) => `${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]}`;

export const KATEGORI = [
  { nama: 'Buruk', min: 1, maks: 24, ikon: '❌' },
  { nama: 'Cukup buruk', min: 25, maks: 49, ikon: '⚠️' },
  { nama: 'Sudah cukup', min: 50, maks: 74, ikon: '👍' },
  { nama: 'Baik sekali', min: 75, maks: 100, ikon: '🌟' },
];
export const kategoriDari = (poin) => KATEGORI.find((k) => poin >= k.min && poin <= k.maks) || KATEGORI[0];

// Pertanyaan per bagian (sesuai tugas hariannya).
export const PERTANYAAN = {
  Kasir: ['Dekorasi depan rapi, kulkas menyala, cucian kemarin bersih?', 'Ramah & cepat melayani, struk difoto, pelanggan dipanggil tepat waktu?', 'Followers & omzet dilaporkan?'],
  Plating: ['Stok nampan cukup (minimal 7) sepanjang hari?', 'Display oyster fresh menarik & bersih?', 'Area kulkas, nampan bersih & kering, air buangan tertampung?'],
  Pemanggang: ['Area panggang & pajangan oyster rapi, pemanggang bersih?', 'Gas kaleng penuh & aman dari sumber panas?', 'Kualitas bakar (matang, keju meleleh) & atraksi tepok 3x?'],
  Getok: ['Es batu dipesan jam 09.30 & cooler box siap?', 'Getok cepat & cukup, supply ke plating lancar?', 'Area getok bersih, cangkang/sampah tertangani?'],
  Umum: ['Datang tepat waktu & menjalankan tugas?', 'Kerja sama & sikap ke pelanggan?', 'Kebersihan area kerjanya?'],
};

const kunci = (pesan) => `nilaiharian:${pesan.pribadi ? pesan.senderId : pesan.groupId}`;

function teksTanya(s) {
  const o = s.daftar[s.i];
  const bagian = o.bagian.length ? o.bagian : ['Umum'];
  const tanya = [...new Set(bagian.flatMap((b) => PERTANYAAN[b] || PERTANYAAN.Umum))];
  return [
    `📝 *Penilaian harian ${s.kode}* – ${tglPendek(s.tanggal)} (${s.i + 1}/${s.daftar.length})`,
    `*${o.nama}*${o.bagian.length ? ` – ${o.bagian.join(' + ')}` : ''}`,
    ...tanya.map((t) => `• ${t}`),
    '',
    `Kategori: ${KATEGORI.map((k) => `${k.nama} ${k.min}–${k.maks}`).join(' · ')}`,
    '',
    `Balas *nilai 1–100 + catatan*, contoh: *80 cepat & rapi* · *40 sering main hp*`,
    '_Catatan hanya untuk owner/PIC · *lewati* · *batal*_',
  ].join('\n');
}
const teksTanyaPesan = (o, j) => `${kategoriDari(j.poin).ikon} *${o.nama}*: ${j.poin} → *${kategoriDari(j.poin).nama}*\n\n💬 *Pesan untuk ${o.nama}?* (dikirim langsung ke chat pribadinya *tanpa nilai & kategori*, contoh: _bagus, pertahankan ya_ / _besok lebih cepat getoknya_)\nBalas *tidak* kalau tidak ada pesan.`;

// Baca jawaban "80 cepat & rapi" / "45" -> { poin, catatan }.
export function bacaJawaban(teks) {
  const m = String(teks || '').trim().match(/^(\d{1,3})(?![\d.,]*\s*(rb|ribu|k|jt|juta|pcs|pack)\b)\s*(?:poin)?\s*[,.-]?\s*(.*)$/is);
  if (!m) return null;
  const poin = Number(m[1]);
  if (poin < 1 || poin > 100) return { salah: 'Nilai 1–100, contoh: *80 cepat & rapi*' };
  return { poin, catatan: m[3].trim(), kategori: kategoriDari(poin).nama };
}

async function tujuanPic(ctx, event) {
  const [tim, karyawan, grup] = await Promise.all(['Tim Event', 'Karyawan', 'Grup'].map((t) => ctx.store.all(t)));
  const pic = tim.find((o) => o.kode_event === event.kode && o.peran === 'PIC')?.nama || event.pic;
  const k = karyawan.find((x) => sama(x.nama, pic) && x.nomor_wa);
  if (k) return { nomor: nomor62(k.nomor_wa), pic };
  const g = grup.find((x) => x.kode_event === event.kode && x.jenis === 'pengeluaran');
  return g ? { groupId: g.group_id, pic } : null;
}

// Daftar orang yang dinilai hari itu: dari pembagian tugas (gabung bagian rangkap), cadangan: anggota tim.
async function daftarDinilai(ctx, event, tanggal) {
  const baca = async (t) => { try { return await ctx.store.all(t); } catch { return []; } };
  const [tugas, tim] = await Promise.all([baca('Tugas Harian'), baca('Tim Event')]);
  const hari = tugas.filter((r) => r.kode_event === event.kode && String(r.tanggal) === tanggal && r.status !== STATUS.BATAL);
  const nama = hari.length ? [...new Set(hari.map((r) => r.nama))]
    : tim.filter((o) => o.kode_event === event.kode && o.peran !== 'PIC' && o.status !== STATUS.BATAL && o.status !== 'BERHENTI').map((o) => o.nama);
  return nama.map((n) => ({ nama: n, bagian: hari.filter((r) => sama(r.nama, n)).map((r) => r.bagian) }));
}

export async function mulaiNilaiHarian(ctx, event, tanggal, tujuan) {
  const daftar = await daftarDinilai(ctx, event, tanggal);
  if (!daftar.length) return [];
  const s = { kode: event.kode, tanggal, daftar, i: 0, waktu: Date.now() };
  ctx.sesi.set(tujuan.nomor ? `nilaiharian:${tujuan.nomor}` : `nilaiharian:${tujuan.groupId}`, s);
  const teks = `Halo${tujuan.pic ? ` ${tujuan.pic}` : ''}! Saatnya penilaian harian tim *${event.kode}* hari ini (rahasia, untuk KPI).\n\n${teksTanya(s)}`;
  return [tujuan.nomor ? { nomor: tujuan.nomor, text: teks } : { groupId: tujuan.groupId, text: teks }];
}

// Setelah kasir ditutup (cadangan 23.30 kalau kasir tidak dipakai) setiap hari event: kirim penilaian ke PIC, sekali per hari.
export async function tugasNilaiHarian(ctx, sekarang = new Date()) {
  const keluar = [];
  if (!ctx.sesi) return keluar;
  const baca = async (t) => { try { return await ctx.store.all(t); } catch { return []; } };
  const [events, sesiKasir] = await Promise.all([baca('Event'), baca('Sesi Kasir')]);
  const tanggal = tanggalClosing(sekarang);
  for (const e of events.filter((x) => x.mulai && x.mulai <= tanggal && (!x.selesai || tanggal <= x.selesai) && x.status !== 'BATAL')) {
    const tanda = `nilaiharian-kirim:${e.kode}:${tanggal}`;
    if (ctx.sesi.get(tanda)) continue;
    if (sekarang < saatClosing(e, tanggal, sesiKasir).saat) continue;
    const tujuan = await tujuanPic(ctx, e);
    if (!tujuan) continue;
    ctx.sesi.set(tanda, { kirim: true });
    keluar.push(...(await mulaiNilaiHarian(ctx, e, tanggal, tujuan)));
  }
  return keluar;
}

// #nilaiharian (owner/PIC): mulai penilaian hari ini sekarang juga.
export async function perintahNilaiHarian(ctx, pesan, event) {
  if (!event) return balas('⚠️ Sebutkan eventnya, contoh: *#nilaiharian SMR26-11*');
  const tanggal = tanggalClosing(pesan.waktu);
  const tujuan = pesan.pribadi ? { nomor: pesan.senderId } : { groupId: pesan.groupId };
  const k = await mulaiNilaiHarian(ctx, event, tanggal, tujuan);
  return k.length ? [{ text: k[0].text }] : balas('⚠️ Belum ada tim untuk dinilai.');
}

export async function jawabNilaiHarian(ctx, pesan) {
  if (!ctx.sesi) return null;
  const k = kunci(pesan);
  const s = ctx.sesi.get(k);
  if (!s || Date.now() - s.waktu > 2 * 24 * 3600e3) return null;
  const teks = String(pesan.text || '').trim();
  if (!teks || teks.startsWith('#')) return null;
  // Di grup (pengeluaran) hanya balasan yang me-reply pesan penilaian, supaya catatan pengeluaran tidak tertukar.
  if (!pesan.pribadi && !/Penilaian harian|kejadian atau PR|Pesan untuk/i.test(pesan.kutipan?.teks || '')) return null;
  if (/^batal$/i.test(teks)) { ctx.sesi.hapus(k); return balas('👌 Penilaian harian dihentikan. Yang sudah dijawab tetap tersimpan.'); }
  // Langkah terakhir: kejadian / PR hari ini (dibagikan ke tim di pesan tugas besok pagi).
  if (s.tahap === 'kejadian') {
    ctx.sesi.hapus(k);
    if (/^(tidak|tdk|gak|ga|nggak|tidak ada|aman|nihil|-)$/i.test(teks)) return balas('👌 Oke, tidak ada kejadian/PR. Terima kasih!');
    const event = (await ctx.store.all('Event')).find((e) => e.kode === s.kode) || { kode: s.kode };
    const id = await tambahCatatan(ctx, { event, jenis: 'PR', isi: teks, oleh: `${pesan.senderName || pesan.senderId} (PIC)`, tanggal: s.tanggal, waktu: pesan.waktu });
    return balas(`📌 Dicatat (${id}). Akan muncul di pesan tugas besok pagi untuk tim.
_Barang yang perlu dibeli bisa dicatat terpisah dengan *#beli ...* supaya tetap muncul sampai dibeli._`);
  }
  const o = s.daftar[s.i];
  // Langkah 2: pesan PIC untuk karyawan -> dikirim ke chat pribadinya.
  if (s.langkah === 'pesan') {
    const keluar = [];
    let info = '';
    if (!/^(tidak|tdk|gak|ga|nggak|tidak ada|-|skip)$/i.test(teks)) {
      const k = (await ctx.store.all('Karyawan')).find((x) => sama(x.nama, o.nama) && x.nomor_wa);
      const terkirim = Boolean(k);
      if (k) keluar.push({ nomor: nomor62(k.nomor_wa), text: `💬 *Pesan dari PIC ${s.kode}* (${tglPendek(s.tanggal)}):\n${teks}\n\n_Semangat terus, ${o.nama}! 🦪_` });
      await ctx.store.updateWhere('Nilai Harian', (r) => r.kode_event === s.kode && String(r.tanggal) === s.tanggal && sama(r.nama, o.nama) && r.status !== STATUS.BATAL, { pesan: teks, pesan_terkirim: terkirim ? 'ya' : 'nomor belum dikenal' });
      info = terkirim ? `📨 Pesan terkirim ke ${o.nama}.\n\n` : `⚠️ Nomor ${o.nama} belum dikenal bot, pesan belum terkirim (tersimpan di tab Nilai Harian).\n\n`;
    }
    s.langkah = 'nilai';
    s.i += 1;
    s.waktu = Date.now();
    if (s.i < s.daftar.length) { ctx.sesi.set(k, s); return [{ text: `${info}${teksTanya(s)}` }, ...keluar]; }
    return [...(await selesai(ctx, k, s, info)), ...keluar];
  }
  if (/^lewati$/i.test(teks)) {
    s.i += 1;
  } else {
    const j = bacaJawaban(teks);
    if (!j) return pesan.pribadi ? balas('Balas *nilai 1–100 + catatan*, contoh: *80 cepat & rapi*') : null;
    if (j.salah) return balas(j.salah);
    await ctx.store.updateWhere('Nilai Harian', (r) => r.kode_event === s.kode && String(r.tanggal) === s.tanggal && sama(r.nama, o.nama) && r.status !== STATUS.BATAL, { status: STATUS.BATAL });
    await ctx.store.append('Nilai Harian', {
      tanggal: s.tanggal, kode_event: s.kode, nama: o.nama, bagian: o.bagian.join(' + '), kategori: j.kategori,
      poin: j.poin, catatan: j.catatan, pesan: '', pesan_terkirim: '', penilai: pesan.senderName || pesan.senderId, status: STATUS.OK, dicatat: waktuLokal(pesan.waktu),
    });
    s.langkah = 'pesan';
    s.waktu = Date.now();
    ctx.sesi.set(k, s);
    return balas(teksTanyaPesan(o, j));
  }
  s.waktu = Date.now();
  if (s.i < s.daftar.length) { ctx.sesi.set(k, s); return balas(teksTanya(s)); }
  return selesai(ctx, k, s, '');
}

async function selesai(ctx, k, s, awalan) {
  ctx.sesi.set(k, { ...s, tahap: 'kejadian', waktu: Date.now() });
  const rows = (await ctx.store.all('Nilai Harian')).filter((r) => r.kode_event === s.kode && String(r.tanggal) === s.tanggal && r.status !== STATUS.BATAL);
  return balas([`${awalan}✅ *Penilaian harian ${s.kode} – ${tglPendek(s.tanggal)} selesai.* Terima kasih!`,
    ...rows.map((r) => `${kategoriDari(Number(r.poin)).ikon} ${r.nama}: *${r.poin}* (${r.kategori})${r.catatan ? ` – ${r.catatan}` : ''}${r.pesan ? ' 💬' : ''}`),
    '_Rata-rata nilai harian dipakai untuk nilai Kinerja KPI._',
    '',
    '📌 *Terakhir: ada kejadian atau PR hari ini?* (misalnya kompor bocor, antrian sore lama, gas kaleng hampir habis)',
    'Tulis saja, nanti dibagikan ke tim di pesan tugas besok pagi. Kalau tidak ada, balas *tidak*.'].join('\n'));
}
