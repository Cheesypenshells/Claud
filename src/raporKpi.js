// Rapor KPI karyawan per event: skor, rincian, dan saran peningkatan. Dikirim lewat chat pribadi (rahasia).
//   #rapor              (owner)  ringkasan + peringkat tim event ini (di grup event, atau #rapor KODE di chat pribadi)
//   #rapor Dena         (owner)  rapor lengkap satu orang, seperti yang akan diterimanya
//   #rapor kirim        (owner)  kirim rapor ke chat pribadi tiap karyawan yang nomornya dikenal
//   #kpisaya            (karyawan, chat pribadi ke bot)  rapornya sendiri (sementara kalau event masih berjalan)
// Bot memberi tahu owner saat rapor siap (sehari setelah event selesai, jam 12.00); owner yang memutuskan kapan dikirim.
// Karyawan hanya melihat skor sendiri: tanpa catatan rahasia PIC, tanpa nilai orang lain, tanpa nominal bonus.

import { hitungEvent } from './laporan.js';
import { bacaData } from './main.js';
import { skorEventAtauArsip, bahanKpi, BOBOT, ATURAN_OTOMATIS } from './kpi.js';
import { ikutGajian } from './gajian.js';
import { tanggalLokal } from './util.js';

const balas = (text) => [{ text }];
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const nomor62 = (n) => String(n || '').replace(/\D/g, '').replace(/^0/, '62');
const f = (n) => (n === null || n === undefined ? '-' : String(Math.round(n * 10) / 10).replace('.', ','));
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tgl = (t) => `${Number(String(t).slice(8, 10))} ${BULAN[Number(String(t).slice(5, 7)) - 1]}`;
// "#pulang 11-14" -> "#pulang 14 Nov", "11-15 10 mnt" -> "15 Nov 10 mnt"
const tglTeks = (t) => String(t).replace(/\b(\d{2})-(\d{2})\b/g, (_, b, h) => `${Number(h)} ${BULAN[Number(b) - 1]}`).replace(/(\d+)\.(\d) mnt/g, '$1,$2 mnt');
const lampu = (nilai, maks) => (nilai === null || nilai === undefined ? '⚪' : nilai / maks >= 0.85 ? '🟢' : nilai / maks >= 0.6 ? '🟡' : '🔴');

const SARAN = {
  absen: 'Datang sebelum batas absen (1 jam sebelum buka) dan kirim foto absen tepat waktu.',
  kinerja: 'Jalankan semua checklist bagianmu dan kirim laporan foto bagian tepat waktu; layani pelanggan ramah dan cepat.',
  attitude: 'Jaga kerja sama dan sikap ke pelanggan dan rekan, serta ikuti arahan PIC.',
  karir: 'Tunjukkan inisiatif: bantu bagian lain dan pelajari tugas baru.',
  stok: 'Hitung stok closing dengan teliti dan foto buktinya.',
  laporan: 'Kirim #pulang dan laporan bagian setiap hari yang kamu bekerja.',
  lambat: 'Percepat antrian: rata-rata tunggu pelanggan harus di bawah 7 menit.',
};

// Rapor satu orang (teks untuk karyawan itu).
export function teksRapor(s, ev, { sementara = false } = {}) {
  const baris = [
    `📊 *Rapor KPI ${ev.kode}* – ${s.nama}${sementara ? ' _(sementara)_' : ''}`,
    `${ev.kota || ''} · ${tgl(ev.mulai)}–${tgl(ev.selesai || ev.mulai)}`,
    '',
  ];
  if (s.total === null) {
    baris.push('Skor belum bisa dihitung karena belum ada penilaian dari PIC. Rapor dikirim setelah penilaian selesai.');
  } else {
    baris.push(`🏁 *Skor: ${f(s.total)} / 100* → klaim bonus ${f(s.total)}% dari bonus maksimal`);
  }
  const o = s.otomatis || {};
  baris.push('', `👤 *Individu* (${f(s.individu)}/60)`);
  baris.push(`${lampu(s.absen, BOBOT.absen)} Absen ${f(s.absen)}/${BOBOT.absen}${o.absen ? ` – hadir ${o.absen.hadir} hari${o.absen.telat ? `, telat ${o.absen.telat}×` : ''}${o.absen.tidakHadir ? `, tidak hadir tanpa izin ${o.absen.tidakHadir}×` : ''}` : ''}`);
  const bintang = o.bintang && !o.bintang.kurang ? `, ⭐ pelanggan ${f(o.bintang.rata)} dari ${o.bintang.jumlah} penilaian` : '';
  baris.push(`${lampu(s.kinerja, BOBOT.kinerja)} Kinerja ${f(s.kinerja)}/${BOBOT.kinerja}${o.harian ? ` – nilai harian PIC rata-rata ${f(o.harian.rata)} (${o.harian.jumlah} hari)` : ''}${bintang}`);
  baris.push(`${lampu(s.attitude, BOBOT.attitude)} Sikap kerja ${f(s.attitude)}/${BOBOT.attitude}`);
  baris.push(`${lampu(s.karir, BOBOT.karir)} Pengembangan ${f(s.karir)}/${BOBOT.karir}`);
  baris.push('', `👥 *Kelompok* (${f(s.kelompok)}/40, sama untuk seluruh tim)`);
  baris.push(`${lampu(s.omzet, BOBOT.omzet)} Omzet vs target ${f(s.omzet)}/${BOBOT.omzet}`);
  baris.push(`${lampu(s.stok, BOBOT.stok)} Ketepatan stok ${f(s.stok)}/${BOBOT.stok}${s.selisihStok ? ` (${s.selisihStok} selisih saat sidak)` : ''}`);
  baris.push(`${lampu(s.komplain, BOBOT.komplain)} Kebersihan & komplain ${f(s.komplain)}/${BOBOT.komplain}${s.jumlahKomplain ? ` (${s.jumlahKomplain} komplain)` : ''}`);
  baris.push(`${lampu(s.tim, BOBOT.tim)} Kinerja tim ${f(s.tim)}/${BOBOT.tim}`);
  if (s.lambatMinus) baris.push(`🔻 Kecepatan layanan −${s.lambatMinus}: ${tglTeks(s.hariLambat.join(', '))} (target di bawah ${ATURAN_OTOMATIS.targetTungguMenit} menit)`);
  if (s.laporanMinus) baris.push('', `🔻 Laporan terlewat −${s.laporanMinus}: ${tglTeks(s.laporanTerlewat.join(', '))}`);

  // Dua hal yang paling bisa ditingkatkan (rasio terendah, individu lebih dulu).
  const kandidat = [
    ['absen', s.absen, BOBOT.absen], ['kinerja', s.kinerja, BOBOT.kinerja], ['attitude', s.attitude, BOBOT.attitude], ['karir', s.karir, BOBOT.karir],
    ['stok', s.stok, BOBOT.stok],
    ...(s.laporanMinus ? [['laporan', 0, 1]] : []), ...(s.lambatMinus ? [['lambat', 0, 1]] : []),
  ].filter(([, n]) => n !== null && n !== undefined).map(([k, n, m]) => ({ k, r: n / m })).filter((x) => x.r < 0.85).sort((a, b) => a.r - b.r).slice(0, 2);
  if (kandidat.length) baris.push('', '💡 *Yang bisa ditingkatkan:*', ...kandidat.map((x) => `• ${SARAN[x.k]}`));
  else if (s.total !== null) baris.push('', '👏 Pertahankan! Semua bagian sudah baik.');
  baris.push('', '_Rapor ini pribadi. Pertanyaan? Tanya PIC atau owner._');
  return baris.join('\n');
}

async function kumpulData(ctx) {
  const data = await bacaData(ctx.store);
  const bahan = await bahanKpi(ctx.store);
  return { data, bahan };
}

// Skor semua orang di satu event.
export async function dataRapor(ctx, kode) {
  const { data, bahan } = await kumpulData(ctx);
  const ev = data.events.find((e) => sama(e.kode, kode));
  if (!ev) return null;
  const r = hitungEvent(ev, data);
  return { ev, skor: skorEventAtauArsip(r, bahan), karyawan: data.karyawan || [], atur: data.atur, bahan };
}

function nomorDari(karyawan, nama) {
  const k = karyawan.find((x) => sama(x.nama, nama) && x.nomor_wa);
  return k ? nomor62(k.nomor_wa) : null;
}

const berjalan = (ev, hariIni) => !ev.selesai || hariIni <= ev.selesai;

// Ringkasan untuk owner: peringkat + peringatan data yang belum lengkap.
export function teksRingkasRapor(d, hariIni) {
  const { ev, skor, bahan } = d;
  const urut = [...skor].sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  const hariHarian = new Set(bahan.harian.filter((x) => x.kode_event === ev.kode && x.status !== 'BATAL').map((x) => String(x.tanggal))).size;
  const baris = [
    `📊 *Rapor KPI ${ev.kode}* (${ev.kota}, ${tgl(ev.mulai)}–${tgl(ev.selesai || ev.mulai)})${berjalan(ev, hariIni) ? ' _(sementara, event masih berjalan)_' : ''}`,
    `Penilaian harian PIC terisi: ${hariHarian} hari`,
    '',
    ...urut.map((s, i) => `${s.total === null ? '–' : `${i + 1}.`} *${s.nama}* (${s.peran}): ${s.total === null ? '_belum dinilai_' : `*${f(s.total)}*`} · individu ${f(s.individu)}/60${s.laporanMinus ? ` · laporan −${s.laporanMinus}` : ''}`),
    '',
    `Kelompok (sama untuk semua): ${f(skor[0]?.kelompok)}/40`,
  ];
  const tanpaNilai = skor.filter((s) => s.total === null).map((s) => s.nama);
  if (tanpaNilai.length) baris.push(`⚠️ Belum ada nilai: ${tanpaNilai.join(', ')} (jawab penilaian harian dari bot, atau *#nilai ${ev.kode}*).`);
  baris.push('', `Lihat satu orang: *#rapor Nama* · kirim ke semua karyawan: *#rapor kirim ${ev.kode}*`);
  return baris.join('\n');
}

// #rapor [kode] [Nama | kirim]
export async function perintahRapor(ctx, pesan, event, cmd, { isOwner }) {
  if (!isOwner) return balas('🔒 Rapor KPI hanya bisa dilihat dan dikirim owner.');
  const arg = cmd.argumen.filter(Boolean);
  const kodeArg = arg.find((a) => /^[A-Z]{3}\d{2}-\d{2}/i.test(a));
  let kode = kodeArg || event?.kode;
  const sisa = arg.filter((a) => a !== kodeArg);
  if (!kode) {
    const semua = (await ctx.store.all('Event')).filter((e) => e.status !== 'BATAL' && ikutGajian(e, {}));
    const terakhir = semua.sort((a, b) => String(b.mulai).localeCompare(String(a.mulai)))[0];
    if (!terakhir) return balas('Sebutkan eventnya: *#rapor SMR26-11*');
    kode = terakhir.kode;
  }
  const d = await dataRapor(ctx, kode);
  if (!d) return balas(`⚠️ Event ${kode} tidak ditemukan.`);
  if (!ikutGajian(d.ev, d.atur)) return balas(`ℹ️ Event ${d.ev.kode} sudah dibayar sebelum penggajian lewat bot, jadi tidak ada rapor KPI.`);
  const hariIni = tanggalLokal(pesan.waktu);
  const sementara = berjalan(d.ev, hariIni);
  const kata = sisa.join(' ').trim();

  if (/^kirim$/i.test(kata)) {
    const keluar = [];
    const terkirim = [];
    const tanpaNomor = [];
    const belumNilai = [];
    for (const s of d.skor) {
      const n = nomorDari(d.karyawan, s.nama);
      if (s.total === null) { belumNilai.push(s.nama); continue; }
      if (!n) { tanpaNomor.push(s.nama); continue; }
      keluar.push({ nomor: n, text: teksRapor(s, d.ev, { sementara }) });
      terkirim.push(s.nama);
    }
    const ket = [
      `📨 *Rapor KPI ${d.ev.kode}* dikirim ke chat pribadi: ${terkirim.length ? terkirim.join(', ') : '–'}.`,
      belumNilai.length ? `⏳ Belum dinilai (tidak dikirim): ${belumNilai.join(', ')}.` : '',
      tanpaNomor.length ? `⚠️ Nomor WA belum dikenal bot: ${tanpaNomor.join(', ')}. Minta mereka balas *saya [nama]* di grup tim.` : '',
      sementara ? '_Rapor bersifat sementara karena event masih berjalan._' : '',
    ].filter(Boolean).join('\n');
    return [{ text: ket }, ...keluar];
  }
  if (kata) {
    const s = d.skor.find((x) => sama(x.nama, kata)) || d.skor.find((x) => String(x.nama).toLowerCase().startsWith(kata.toLowerCase()));
    if (!s) return balas(`⚠️ "${kata}" tidak ada di tim ${d.ev.kode}. Tim: ${d.skor.map((x) => x.nama).join(', ')}.`);
    return balas(`${teksRapor(s, d.ev, { sementara })}\n\n_(Pratinjau untuk owner; belum dikirim ke ${s.nama}.)_`);
  }
  return balas(teksRingkasRapor(d, hariIni));
}

// #kpisaya (chat pribadi): karyawan melihat rapornya sendiri di event terakhir yang ia ikuti.
export async function perintahKpiSaya(ctx, pesan) {
  const baca = async (t) => { try { return await ctx.store.all(t); } catch { return []; } };
  const [karyawan, tim, events, pengaturan] = await Promise.all(['Karyawan', 'Tim Event', 'Event', 'Pengaturan'].map(baca));
  const atur = Object.fromEntries(pengaturan.map((r) => [r.kunci, r.nilai]));
  const aku = karyawan.find((k) => nomor62(k.nomor_wa) === String(pesan.senderId));
  if (!aku) return balas('🤔 Nomor ini belum dikenal bot. Balas *saya [nama kamu]* di grup tim dulu, lalu ketik *#kpisaya* lagi di sini.');
  const milik = events.filter((e) => e.status !== 'BATAL' && ikutGajian(e, atur) && tim.some((o) => o.kode_event === e.kode && sama(o.nama, aku.nama) && o.status !== 'BATAL'))
    .sort((a, b) => String(b.mulai).localeCompare(String(a.mulai)));
  if (!milik.length) return balas(`Belum ada rapor KPI untuk *${aku.nama}*. Rapor muncul setelah ada event yang dinilai.`);
  const d = await dataRapor(ctx, milik[0].kode);
  const s = d?.skor.find((x) => sama(x.nama, aku.nama));
  if (!s) return balas(`Belum ada rapor KPI untuk *${aku.nama}* di ${milik[0].kode}.`);
  return balas(teksRapor(s, d.ev, { sementara: berjalan(d.ev, tanggalLokal(pesan.waktu)) }));
}

// Sehari setelah event selesai, jam 12.00: beri tahu owner bahwa rapor siap (owner yang memutuskan kapan dikirim).
export async function tugasRapor(ctx, sekarang = new Date()) {
  const keluar = [];
  const jam = Number(sekarang.toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).slice(0, 2));
  if (jam < 12) return keluar;
  const hariIni = tanggalLokal(sekarang);
  const baca = async (t) => { try { return await ctx.store.all(t); } catch { return []; } };
  const [events, pengaturan] = await Promise.all([baca('Event'), baca('Pengaturan')]);
  const atur = Object.fromEntries(pengaturan.map((r) => [r.kunci, r.nilai]));
  for (const e of events.filter((x) => x.selesai && x.selesai < hariIni && x.status !== 'BATAL' && ikutGajian(x, atur))) {
    const kunci = `rapor_siap_${e.kode}`;
    if (pengaturan.some((p) => p.kunci === kunci)) continue;
    // Hanya event yang pernah dinilai (harian atau #nilai); tanpa penilaian tidak ada yang dilaporkan.
    const bahan = await bahanKpi(ctx.store);
    if (!bahan.harian.some((x) => x.kode_event === e.kode) && !bahan.nilai.some((x) => x.kode_event === e.kode)) continue;
    await ctx.store.append('Pengaturan', { kunci, nilai: hariIni, keterangan: 'Bot sudah memberi tahu owner bahwa rapor KPI siap' });
    const d = await dataRapor(ctx, e.kode);
    if (!d) continue;
    for (const o of ctx.ownerIds || []) keluar.push({ nomor: o, text: `✅ *Rapor KPI ${e.kode} siap.*\n\n${teksRingkasRapor(d, hariIni)}` });
  }
  return keluar;
}
