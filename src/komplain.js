// Komplain pelanggan dari QR di depan booth (halaman Google Apps Script, lihat apps-script/Code.gs):
// baris baru di tab "Komplain" (status BARU) diteruskan bot ke WhatsApp owner, lalu ditandai DITERUSKAN.
// Komplain yang tidak dibatalkan owner (Status BATAL di tab) mengurangi nilai KPI kelompok event itu.
// #qr (owner): link halaman kasir antrian & QR komplain (disimpan di Pengaturan: url_antrian).

import { waktuLokal, tanggalLokal } from './util.js';
import { jadwalHari, aturanHari } from './absensi.js';
import { tugasHariIni, buatTugas } from './tugasHarian.js';

const balas = (text) => [{ text }];

export async function tugasKomplain(ctx, sekarang = new Date()) {
  const keluar = [];
  let rows;
  try { rows = await ctx.store.all('Komplain'); } catch { return keluar; }
  const baru = rows.filter((r) => String(r.status).toUpperCase() === 'BARU');
  if (!baru.length) return keluar;
  const owner = [...(ctx.ownerIds || [])];
  for (const r of baru) {
    const teks = [
      `📣 *Komplain pelanggan ${r.kode_event || ''}*${r.lokasi ? ` (${r.lokasi})` : ''}`,
      `🗂️ ${r.kategori}`,
      `💬 ${r.detail}`,
      r.nama || r.kontak ? `👤 ${[r.nama, r.kontak].filter(Boolean).join(' · ')}` : '👤 (anonim)',
      `🕒 ${r.waktu}`,
      '',
      '_Mengurangi nilai KPI kelompok event ini (−2). Kalau komplain tidak valid, ubah Status jadi BATAL di tab Komplain._',
    ].join('\n');
    for (const n of owner) keluar.push({ nomor: n, text: teks });
    await ctx.store.updateWhere('Komplain', (x) => x.id === r.id && String(x.status).toUpperCase() === 'BARU', { status: 'DITERUSKAN', diteruskan: waktuLokal(sekarang) });
  }
  return keluar;
}

// Ringkasan tutup kasir (tab "Sesi Kasir", status TUTUP dari halaman kasir) -> WhatsApp owner, lalu DITERUSKAN.
export async function tugasSesiKasir(ctx, sekarang = new Date()) {
  const keluar = [];
  let rows;
  try { rows = await ctx.store.all('Sesi Kasir'); } catch { return keluar; }
  const owner = [...(ctx.ownerIds || [])];
  for (const r of rows.filter((x) => String(x.status).toUpperCase() === 'TUTUP')) {
    const jam = (w) => String(w || '').slice(11, 16);
    const bintang = Number(r.jumlah_rating) ? `⭐ ${String(r.rating_rata).replace('.', ',')} dari ${r.jumlah_rating} penilaian${r.rating_kasir ? `\n   ${r.rating_kasir}` : ''}` : '⭐ Belum ada penilaian bintang';
    const teks = [
      `🧾 *Kasir ${r.kode_event} ditutup* (${r.tanggal}, ${jam(r.dibuka)}–${jam(r.ditutup)})`,
      `👤 Kasir: ${r.kasir || '-'}`,
      `🧾 *${r.jumlah_struk || 0} struk dilayani* · ${r.diambil || 0} diambil · ${r.batal || 0} batal${Number(r.belum) ? ` · ⚠️ ${r.belum} belum diambil` : ''}`,
      r.rata_tunggu_menit !== '' && r.rata_tunggu_menit !== undefined ? `⏱️ Rata-rata tunggu sampai dipanggil: ${r.rata_tunggu_menit} menit ${Number(r.rata_tunggu_menit) < 7 ? '✅' : '⚠️ (target di bawah 7 menit, hari lambat −2 KPI kelompok)'}` : '',
      bintang,
      r.ulasan_buruk ? `\n*Ulasan bintang rendah:*\n${r.ulasan_buruk}` : '',
    ].filter(Boolean).join('\n');
    for (const n of owner) keluar.push({ nomor: n, text: teks });
    await ctx.store.updateWhere('Sesi Kasir', (x) => x.id === r.id && String(x.status).toUpperCase() === 'TUTUP', { status: 'DITERUSKAN', diteruskan: waktuLokal(sekarang) });
  }
  return keluar;
}

// Baris komplain yang dihitung KPI (bukan BATAL).
export async function komplainAktif(store) {
  try { return (await store.all('Komplain')).filter((r) => String(r.status).toUpperCase() !== 'BATAL'); } catch { return []; }
}

export async function perintahQr(ctx, event, { isOwner }) {
  if (!isOwner) return balas('⚠️ Perintah ini khusus owner.');
  const atur = Object.fromEntries((await ctx.store.all('Pengaturan')).map((p) => [p.kunci, p.nilai]));
  const url = atur.url_antrian;
  if (!url) return balas('⚠️ Halaman antrian & komplain belum dipasang. (Pengaturan: url_antrian kosong)');
  const kode = event?.kode ? `&e=${encodeURIComponent(event.kode)}` : '';
  return balas([
    '🦪 *Link sistem antrian & komplain*',
    '',
    `🧾 *Kasir* (buka di HP/tablet kasir, PIN kasir):\n${url}?p=kasir`,
    '',
    `📣 *Komplain pelanggan* (cetak jadi QR di depan booth):\n${url}?p=komplain${kode}`,
    '',
    '_Pelanggan tidak perlu link antrian: QR khusus setiap pesanan muncul di layar kasir setelah struk difoto._',
  ].join('\n'));
}

// ---------- Link kasir (langsung masuk, PIN ikut di link) ----------
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const nomor62 = (n) => String(n || '').replace(/\D/g, '').replace(/^0/, '62');

// Pemegang halaman kasir sebuah event: kolom Event "Kasir Antrian" (nama, pisah koma) + anggota tim berperan Kasir.
export function namaKasir(event, tim = []) {
  const ditunjuk = String(event?.kasir_antrian || '').split(/[,/&]|\bdan\b/i).map((x) => x.trim()).filter(Boolean);
  const berperan = tim.filter((o) => o.kode_event === event?.kode && o.peran === 'Kasir' && o.status !== 'BATAL').map((o) => o.nama);
  return [...ditunjuk, ...berperan];
}

// Event yang sedang/akan berjalan di mana nomor ini kasir antrian atau PIC (untuk #kasir dari chat pribadi / grup).
export async function eventKasirUntuk(ctx, nomor, tanggal) {
  const [events, tim, karyawan] = await Promise.all([ctx.store.all('Event'), ctx.store.all('Tim Event'), ctx.store.all('Karyawan')]);
  const namaSaya = karyawan.filter((k) => nomor62(k.nomor_wa) === String(nomor)).map((k) => k.nama);
  const cocok = (n) => namaSaya.some((x) => sama(x, n)) || (String(n).match(/\((\d+)\)/)?.[1] === String(nomor));
  return events.filter((e) => e.status !== 'BATAL' && e.status !== 'SELESAI' && (!tanggal || String(e.selesai || e.mulai) >= tanggal))
    .filter((e) => namaKasir(e, tim).some(cocok)
      || tim.some((o) => o.kode_event === e.kode && o.peran === 'PIC' && namaSaya.some((s) => sama(s, o.nama))));
}

// #kasirnya Tiara (owner, grup pengeluaran/tim event): tunjuk pemegang halaman kasir untuk event ini.
export async function perintahKasirnya(ctx, event, isi, { isOwner }) {
  if (!isOwner) return balas('⚠️ Penunjukan kasir antrian hanya oleh owner.');
  if (!event) return balas('⚠️ Ketik di grup event, contoh: *#kasirnya Tiara*');
  const nama = String(isi || '').trim();
  if (!nama) return balas(`🧾 Kasir antrian ${event.kode}: *${event.kasir_antrian || '(belum ditunjuk)'}*\nUbah: *#kasirnya Tiara*`);
  await ctx.store.updateWhere('Event', (e) => e.kode === event.kode, { kasir_antrian: nama });
  return balas(teksMintaKasir(event, nama));
}
// Pengaturan: url_antrian (link /exec web app) dan pin_kasir (sama dengan KASIR_PIN di Apps Script).
export function linkKasir(atur, kode = '') {
  if (!atur.url_antrian) return '';
  return `${atur.url_antrian}?p=kasir${atur.pin_kasir ? `&k=${encodeURIComponent(atur.pin_kasir)}` : ''}${kode ? `&e=${encodeURIComponent(kode)}` : ''}`;
}

const teksKasir = (event, link) => `🧾 *Link kasir antrian ${event.kode}* (${event.kota})\n${link}\n\nBuka di HP/tablet kasir, langsung masuk (tanpa ketik PIN).\n1. *📷 Pesanan baru – foto struk* → nomor antrian & QR muncul, minta pelanggan scan QR-nya\n2. *📷 Foto & mulai bakar* saat pesanan dibakar\n3. *🔔 Panggil* saat siap → HP pelanggan berbunyi\n_Link ini khusus tim, jangan dibagikan ke pelanggan._`;

// #kasir (owner/PIC): link kasir dibalas di grup tempat perintah diketik.
export async function perintahKasir(ctx, event, { bolehLihat }) {
  if (!bolehLihat) return balas('⚠️ Link kasir hanya bisa diminta owner atau PIC.');
  const atur = Object.fromEntries((await ctx.store.all('Pengaturan')).map((p) => [p.kunci, p.nilai]));
  const link = linkKasir(atur, event?.kode);
  if (!link) return balas('⚠️ Halaman kasir antrian belum dipasang (Pengaturan: url_antrian kosong).');
  return balas(event ? teksKasir(event, link) : `🧾 *Link kasir antrian*\n${link}`);
}

// Setiap hari event, 2 jam sebelum booth buka (ikut jadwal khusus hari itu; jam buka kosong = 10.00), sekali per hari:
// bot bertanya di grup tim "siapa yang pegang kasir hari ini?". Jawaban pertama "saya" menggantikan kasir kemarin,
// jawaban berikutnya (kasir pengganti setengah hari) ditambahkan. Kasir lalu mengirim #kasir lewat chat pribadi.
// Bot tidak mengirim chat pribadi duluan dan PIN tidak pernah dikirim ke grup.
const kunciTanya = (groupId) => `tanyakasir:${groupId}`;
const tglPendek = (t) => { const [, b, h] = String(t).split('-'); return `${Number(h)} ${['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][Number(b) - 1]}`; };
const teksTanyaKasir = (e, tanggal, kemarin) => [
  `🧾 *Siapa yang pegang kasir antrian hari ini?* (${e.kode}, ${tglPendek(tanggal)})`,
  kemarin ? `Sebelumnya: ${kemarin}` : '',
  'Yang pegang kasir hari ini, *balas (reply) pesan ini dengan "saya"*.',
  'Kalau ganti kasir di tengah hari, kasir pengganti juga cukup balas "saya".',
].filter(Boolean).join('\n');
const teksMintaKasir = (e, nama) => `🧾 Kasir antrian ${e.kode}: *${nama}*\n${nama}, kirim *#kasir* lewat *chat pribadi* ke nomor bot ini untuk dapat link halaman kasir (PIN sudah ada di dalam link-nya). Kalau link-nya sudah tersimpan di HP, langsung buka saja.`;

export async function tugasLinkKasir(ctx, sekarang = new Date(), { tanggalLokal }) {
  const keluar = [];
  if (!ctx.sesi) return keluar;
  const [pengaturan, events, tim, grup] = await Promise.all([
    ctx.store.all('Pengaturan'), ctx.store.all('Event'), ctx.store.all('Tim Event'), ctx.store.all('Grup'),
  ]);
  const atur = Object.fromEntries(pengaturan.map((p) => [p.kunci, p.nilai]));
  if (!atur.url_antrian) return keluar;
  const hariIni = tanggalLokal(sekarang);
  for (const e of events.filter((x) => x.mulai && x.mulai <= hariIni && (!x.selesai || hariIni <= x.selesai) && x.status !== 'BATAL' && x.status !== 'SELESAI')) {
    const tanda = `tanyakasirharian:${e.kode}:${hariIni}`;
    if (ctx.sesi.get(tanda)) continue;
    const j = jadwalHari(e.jam_buka ? e : { ...e, jam_buka: '10:00' }, hariIni, await aturanHari(ctx, e.kode, hariIni));
    if (!j || sekarang.getTime() < j.buka.getTime() - 2 * 3600e3) continue;
    ctx.sesi.set(tanda, { kirim: true });
    const kemarin = namaKasir(e, tim).map((n) => n.replace(/\s*\(\d+\)\s*$/, '')).join(', ');
    for (const g of grup.filter((x) => x.kode_event === e.kode && x.jenis === 'event')) {
      ctx.sesi.set(kunciTanya(g.group_id), { kode: e.kode, waktu: Date.now(), tanggal: hariIni, dijawab: false });
      keluar.push({ groupId: g.group_id, text: teksTanyaKasir(e, hariIni, kemarin) });
    }
  }
  return keluar;
}

// #tanyakasir (owner/PIC, grup event): tanyakan lagi siapa yang pegang kasir (misalnya kasir ganti).
export function perintahTanyaKasir(ctx, pesan, event, { boleh }) {
  if (!boleh) return balas('⚠️ Hanya owner atau PIC.');
  if (!event) return balas('⚠️ Ketik di grup event.');
  const tgl = tanggalLokal(pesan.waktu || new Date());
  ctx.sesi?.set(kunciTanya(pesan.groupId), { kode: event.kode, waktu: Date.now(), tanggal: tgl, dijawab: false });
  return balas(teksTanyaKasir(event, tgl, String(event.kasir_antrian || '').replace(/\s*\(\d+\)/g, '')));
}

// Jawaban "saya" di grup tim (reply ke pesan kasir dari bot, atau di hari yang sama setelah ditanya): catat sebagai kasir antrian.
// Jawaban pertama setelah pertanyaan harian menggantikan kasir sebelumnya; berikutnya ditambahkan (ganti kasir setengah hari).
export async function tanganiJawabKasir(ctx, pesan, event) {
  if (!ctx.sesi || !event || pesan.adaFoto) return null;
  const t = String(pesan.text || '').trim();
  if (!t || t.startsWith('#') || t.split(/\s+/).length > 6) return null;
  if (!/\b(saya|aku|aq|sy|ak|gue|gw|gua)\b/i.test(t)) return null;
  const s = ctx.sesi.get(kunciTanya(pesan.groupId));
  const aktif = s && s.kode === event.kode && s.tanggal === tanggalLokal(pesan.waktu || new Date());
  const balasTanya = /kasir antrian/i.test(pesan.kutipan?.teks || '');
  if (!aktif && !balasTanya) return null;
  const karyawan = await ctx.store.all('Karyawan');
  const k = karyawan.find((x) => nomor62(x.nomor_wa) === String(pesan.senderId));
  const nama = k?.nama || String(pesan.senderName || '').trim() || pesan.senderId;
  const entri = k ? k.nama : `${nama} (${pesan.senderId})`;
  const ganti = aktif && !s.dijawab;
  const lama = ganti ? [] : String(event.kasir_antrian || '').split(',').map((x) => x.trim()).filter(Boolean);
  const daftar = [...lama.filter((x) => !sama(x, entri)), entri];
  await ctx.store.updateWhere('Event', (e) => e.kode === event.kode, { kasir_antrian: daftar.join(', ') });
  if (aktif) ctx.sesi.set(kunciTanya(pesan.groupId), { ...s, dijawab: true });
  // Pembagian tugas hari ini ikut kasir terbaru (kalau sudah dibuat).
  try {
    const tgl = tanggalLokal(pesan.waktu || new Date());
    if ((await tugasHariIni(ctx, event, tgl)).length) await buatTugas(ctx, { ...event, kasir_antrian: daftar.join(', ') }, tgl, 'kasir');
  } catch { /* tab belum ada */ }
  return balas(`✅ Siap, *${nama}* pegang kasir antrian hari ini (${event.kode}).\nKalau link kasir sudah tersimpan di HP-mu, langsung buka saja. Kalau belum, kirim *#kasir* lewat *chat pribadi* ke nomor bot ini (PIN sudah ada di link-nya).`);
}
