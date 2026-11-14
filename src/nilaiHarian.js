// Penilaian harian oleh PIC (chat pribadi; kalau nomor PIC belum dikenal: grup pengeluaran).
// Dikirim setiap hari event jam 22.00, atau lebih cepat setelah ⏹ Tutup kasir. Satu per satu per orang,
// pertanyaannya sesuai bagian tugas orang itu hari itu (tab Tugas Harian).
//   1 = Sangat baik (75–100) · 2 = Baik (50–75) · 3 = Kurang (25–50) · 4 = Buruk (1–20)
// Balasan: "1 90 cepat & rapi" · "3 40 sering main hp" · "2" (poin tengah) · "lewati" · "batal".
// Tersimpan di tab "Nilai Harian"; rata-ratanya dipakai untuk nilai Kinerja KPI.

import { STATUS } from './schema.js';
import { waktuLokal } from './util.js';
import { tanggalClosing } from './stokHarian.js';
import { tambahCatatan } from './catatanHarian.js';

const balas = (text) => [{ text }];
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const nomor62 = (n) => String(n || '').replace(/\D/g, '').replace(/^0/, '62');
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tglPendek = (t) => `${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]}`;

export const KATEGORI = {
  1: { nama: 'Sangat baik', min: 75, maks: 100, tengah: 90, ikon: '🌟' },
  2: { nama: 'Baik', min: 50, maks: 75, tengah: 65, ikon: '👍' },
  3: { nama: 'Kurang', min: 25, maks: 50, tengah: 40, ikon: '⚠️' },
  4: { nama: 'Buruk', min: 1, maks: 20, tengah: 15, ikon: '❌' },
};

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
    ...Object.entries(KATEGORI).map(([k, v]) => `${k}️⃣ ${v.nama} (${v.min}–${v.maks})`),
    '',
    'Balas *nomor + poin + catatan*, contoh: *1 90 cepat & rapi* · *3 40 sering main hp*',
    '_Nomor saja = poin tengah · *lewati* · *batal*_',
  ].join('\n');
}

// Baca jawaban "1 90 catatan" / "2" / "3 40".
export function bacaJawaban(teks) {
  const m = String(teks || '').trim().match(/^([1-4])(?=[\s.):-]|$)(?:\s*[.):-]?\s*(\d{1,3})(?!\d))?\s*(?:poin)?\s*[,.-]?\s*(.*)$/is);
  if (!m) return null;
  const k = KATEGORI[m[1]];
  const poin = m[2] !== undefined ? Number(m[2]) : k.tengah;
  if (poin < k.min || poin > k.maks) return { salah: `Pilihan ${m[1]} (${k.nama}) poinnya ${k.min}–${k.maks}. Contoh: *${m[1]} ${k.tengah}*` };
  return { kategori: Number(m[1]), poin, catatan: m[3].trim() };
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

// Jam 22.00 (atau setelah kasir ditutup) setiap hari event: kirim penilaian ke PIC, sekali per hari.
export async function tugasNilaiHarian(ctx, sekarang = new Date()) {
  const keluar = [];
  if (!ctx.sesi) return keluar;
  const baca = async (t) => { try { return await ctx.store.all(t); } catch { return []; } };
  const [events, sesiKasir] = await Promise.all([baca('Event'), baca('Sesi Kasir')]);
  const tanggal = tanggalClosing(sekarang);
  const jam = Number(sekarang.toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).slice(0, 2));
  for (const e of events.filter((x) => x.mulai && x.mulai <= tanggal && (!x.selesai || tanggal <= x.selesai) && x.status !== 'BATAL')) {
    const tanda = `nilaiharian-kirim:${e.kode}:${tanggal}`;
    if (ctx.sesi.get(tanda)) continue;
    const kasirTutup = sesiKasir.some((s) => s.kode_event === e.kode && ['TUTUP', 'DITERUSKAN'].includes(String(s.status).toUpperCase())
      && String(s.ditutup || '').slice(0, 10) >= tanggal);
    if (!kasirTutup && !(jam >= 22 || jam < 5)) continue;
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
  if (!pesan.pribadi && !/Penilaian harian|kejadian atau PR/i.test(pesan.kutipan?.teks || '')) return null;
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
  if (/^lewati$/i.test(teks)) {
    s.i += 1;
  } else {
    const j = bacaJawaban(teks);
    if (!j) return pesan.pribadi ? balas('Balas *nomor 1–4 + poin + catatan*, contoh: *1 90 cepat & rapi*') : null;
    if (j.salah) return balas(j.salah);
    await ctx.store.updateWhere('Nilai Harian', (r) => r.kode_event === s.kode && String(r.tanggal) === s.tanggal && sama(r.nama, o.nama) && r.status !== STATUS.BATAL, { status: STATUS.BATAL });
    await ctx.store.append('Nilai Harian', {
      tanggal: s.tanggal, kode_event: s.kode, nama: o.nama, bagian: o.bagian.join(' + '), kategori: `${j.kategori} ${KATEGORI[j.kategori].nama}`,
      poin: j.poin, catatan: j.catatan, penilai: pesan.senderName || pesan.senderId, status: STATUS.OK, dicatat: waktuLokal(pesan.waktu),
    });
    s.i += 1;
  }
  s.waktu = Date.now();
  if (s.i < s.daftar.length) { ctx.sesi.set(k, s); return balas(teksTanya(s)); }
  ctx.sesi.set(k, { ...s, tahap: 'kejadian', waktu: Date.now() });
  const rows = (await ctx.store.all('Nilai Harian')).filter((r) => r.kode_event === s.kode && String(r.tanggal) === s.tanggal && r.status !== STATUS.BATAL);
  return balas([`✅ *Penilaian harian ${s.kode} – ${tglPendek(s.tanggal)} selesai.* Terima kasih!`,
    ...rows.map((r) => `${KATEGORI[String(r.kategori)[0]]?.ikon || '•'} ${r.nama}: *${r.poin}*${r.catatan ? ` – ${r.catatan}` : ''}`),
    '_Rata-rata nilai harian dipakai untuk nilai Kinerja KPI._',
    '',
    '📌 *Terakhir: ada kejadian atau PR hari ini?* (misalnya kompor bocor, antrian sore lama, gas kaleng hampir habis)',
    'Tulis saja, nanti dibagikan ke tim di pesan tugas besok pagi. Kalau tidak ada, balas *tidak*.'].join('\n'));
}
