// KPI karyawan: skor maksimal 100 poin per bulan, 60% individu + 40% kelompok, ditambah poin plus/minus.
//
// Individu (60, dinilai PIC setelah event, skala 1-5 atau persen):
//   absen 20% (12) · performa kinerja 40% (24) · attitude 20% (12) · karir 20% (12)
// Kelompok (40, dari data event):
//   omzet vs target 15 · ketepatan stok 10 · kebersihan & komplain 10 · kinerja tim (nilai PIC) 5
// Otomatis (kalau datanya ada):
//   absen   = 12 - 2 x telat - 6 x tidak hadir tanpa izin (karyawan tetap), min 0; izin/dispensasi tidak dipotong
//   kinerja = rata-rata bintang pelanggan / 5 x 24 untuk yang pegang kasir (minimal 5 penilaian)
//   laporan = -2 per laporan foto wajib yang terlewat (jobdesk loading in milik penanggung jawab, absen pulang tiap hari)
// Skor bulan = rata-rata skor event (ditimbang hari kerja) + poin plus - poin minus, dibatasi 0-100.
// Bonus diterima = bonus maksimal (dari hitungan event) x skor bulan / 100.

import { PERAN } from './parsers.js';
import { tanggalLokal, tambahHari } from './util.js';
import { komplainAktif } from './komplain.js';

// Semua data yang dipakai KPI, sekali baca (tab yang belum ada dianggap kosong).
export async function bahanKpi(store) {
  const baca = async (tab) => { try { return await store.all(tab); } catch { return []; } };
  const [nilai, absensi, izin, antrian, laporan, jobdesk, tugas, sidak] = await Promise.all(
    ['Nilai KPI', 'Absensi', 'Jadwal Absen', 'Antrian', 'Laporan Foto', 'Jobdesk', 'Tugas Harian', 'Sidak Stok'].map(baca));
  return { nilai, komplain: await komplainAktif(store), absensi, izin, antrian, laporan, jobdesk, tugas, sidak };
}

// Menit dari teks waktu "YYYY-MM-DD HH:MM[:SS]" (WIB).
function waktuMenit(v) {
  const m = String(v || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000 : null;
}

// Rata-rata menit tunggu (struk difoto -> dipanggil) per tanggal untuk satu event.
export function tungguPerHari(antrian, kode) {
  const per = {};
  for (const q of antrian.filter((x) => x.kode_event === kode && x.status !== 'BATAL')) {
    const a = waktuMenit(q.dibuat), b = waktuMenit(q.dipanggil);
    if (a === null || b === null || b < a) continue;
    const t = String(q.tanggal || q.dibuat).slice(0, 10);
    (per[t] = per[t] || []).push(b - a);
  }
  return Object.fromEntries(Object.entries(per).map(([t, v]) => [t, Math.round((v.reduce((x, y) => x + y, 0) / v.length) * 10) / 10]));
}

// Tanggal-tanggal dari a sampai b (YYYY-MM-DD).
function rentangTanggal(a, b) {
  const hasil = [];
  for (let t = a; t && t <= b && hasil.length < 60; t = tambahHari(t, 1)) hasil.push(t);
  return hasil;
}

export const BOBOT = { absen: 12, kinerja: 24, attitude: 12, karir: 12, omzet: 15, stok: 10, komplain: 10, tim: 5 };
export const ASPEK = ['absen', 'kinerja', 'attitude', 'karir'];
export const NAMA_ASPEK = { absen: 'Absen', kinerja: 'Performa kinerja', attitude: 'Attitude', karir: 'Karir' };
export const POIN_KOMPLAIN = 2; // tiap komplain pelanggan mengurangi 2 dari 10 poin kebersihan & komplain
export const ATURAN_OTOMATIS = { telat: 2, tidakHadir: 6, minBintang: 5, laporan: 2, selisihStok: 2, targetTungguMenit: 7, lambat: 2 };
// Foto laporan wajib per bagian tugas harian (lihat tugasHarian.js).
export const LAPORAN_BAGIAN = { Kasir: ['depan', 'followers'], Pemanggang: ['grill'], Getok: ['cooler'], Plating: ['nampan'] };

const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const bulat = (n) => Math.round(n * 100) / 100;
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const aktif = (r) => r.status !== 'BATAL';

// Nilai 1-5 -> porsi dari bobot; nilai > 5 dianggap persen (0-100).
export function poinDari(nilai, bobot) {
  const n = num(nilai);
  if (n === null || n < 0) return null;
  const porsi = n <= 5 ? n / 5 : Math.min(n, 100) / 100;
  return bulat(porsi * bobot);
}

// Orang yang dinilai KPI di sebuah event: semua anggota tim kecuali PIC dan owner.
export function yangDinilai(r) {
  return r.barisTim.filter((o) => o.peran !== PERAN.PIC && !o.owner && !o.catatanGaji);
}

// Skor KPI tiap orang di satu event. r = hasil hitungEvent; nilai = baris tab "Nilai KPI".
export function skorEvent(r, { nilai = [], komplain = [], absensi = [], izin = [], antrian = [], laporan = [], jobdesk = [], tugas = [], sidak = [], hariIni = tanggalLokal(new Date()) } = {}) {
  const kode = r.event.kode;
  const milik = nilai.filter((n) => n.kode_event === kode && aktif(n));
  const target = num(r.event.target_omzet);
  const omzet = target ? bulat(Math.min(1, r.omzetBersih / target) * BOBOT.omzet) : BOBOT.omzet;
  // Ketepatan stok: tiap bahan yang selisih saat sidak mengurangi 2 poin, rata untuk seluruh tim.
  const selisihStok = sidak.filter((x) => x.kode_event === kode && x.selisih !== '' && x.selisih !== undefined && Number(x.selisih) !== 0).length;
  const stok = Math.max(0, BOBOT.stok - selisihStok * ATURAN_OTOMATIS.selisihStok);
  // Kecepatan layanan: tiap hari dengan rata-rata tunggu di atas 7 menit mengurangi 2 poin kelompok.
  const tunggu = tungguPerHari(antrian, kode);
  const hariLambat = Object.entries(tunggu).filter(([, m]) => m > ATURAN_OTOMATIS.targetTungguMenit);
  const lambatMinus = hariLambat.length * ATURAN_OTOMATIS.lambat;
  const jumlahKomplain = komplain.filter((k) => k.kode_event === kode && aktif(k)).length;
  const komplainPoin = Math.max(0, BOBOT.komplain - jumlahKomplain * POIN_KOMPLAIN);
  const baris = milik.filter((n) => sama(n.nama, 'TIM')).pop();
  const tim = baris ? poinDari(baris.tim, BOBOT.tim) : null;
  const kelompok = Math.max(0, bulat(omzet + stok + komplainPoin + (tim ?? 0) - lambatMinus));

  // Data otomatis event ini
  const absenEv = absensi.filter((a) => a.kode_event === kode && String(a.status || 'OK').toUpperCase() !== 'DITOLAK');
  const absenOtomatis = absenEv.length > 0;
  const hariLewat = rentangTanggal(r.event.mulai, r.event.selesai || r.event.mulai).filter((t) => t < hariIni);
  const hariAktif = hariLewat.filter((t) => absenEv.some((a) => String(a.tanggal) === t));
  const izinEv = izin.filter((z) => z.kode_event === kode && aktif(z) && z.nama);
  const lapEv = laporan.filter((l) => l.kode_event === kode && String(l.status || 'OK').toUpperCase() === 'OK');
  const loadingSelesai = hariIni > r.event.mulai;

  return yangDinilai(r).map((o) => {
    const n = milik.filter((x) => sama(x.nama, o.nama)).pop();
    const rinci = Object.fromEntries(ASPEK.map((a) => [a, n ? poinDari(n[a], BOBOT[a]) : null]));
    const otomatis = {};

    // Absen dari absensi foto
    if (absenOtomatis) {
      const milikAbsen = absenEv.filter((a) => sama(a.nama, o.nama));
      const telat = milikAbsen.filter((a) => Number(a.telat_menit) > 0).length;
      const hadir = new Set(milikAbsen.map((a) => String(a.tanggal)));
      const tidakHadir = o.peran === PERAN.TETAP
        ? hariAktif.filter((t) => !hadir.has(t) && !izinEv.some((z) => String(z.tanggal) === t && sama(z.nama, o.nama))).length : 0;
      rinci.absen = Math.max(0, BOBOT.absen - telat * ATURAN_OTOMATIS.telat - tidakHadir * ATURAN_OTOMATIS.tidakHadir);
      otomatis.absen = { telat, tidakHadir, hadir: hadir.size };
    }
    // Kinerja kasir dari bintang pelanggan
    const bintang = antrian.filter((q) => q.kode_event === kode && sama(q.kasir, o.nama) && Number(q.rating) > 0).map((q) => Number(q.rating));
    if (bintang.length >= ATURAN_OTOMATIS.minBintang) {
      const rata = bintang.reduce((a, b) => a + b, 0) / bintang.length;
      rinci.kinerja = bulat((rata / 5) * BOBOT.kinerja);
      otomatis.bintang = { rata: bulat(rata), jumlah: bintang.length };
    } else if (bintang.length) otomatis.bintang = { rata: bulat(bintang.reduce((a, b) => a + b, 0) / bintang.length), jumlah: bintang.length, kurang: true };

    // Laporan foto wajib yang terlewat
    const terlewat = [];
    if (loadingSelesai) {
      for (const j of jobdesk.filter((x) => x.kode_event === kode && aktif(x) && sama(x.nama, o.nama))) {
        if (!lapEv.some((l) => l.tag === j.tag)) terlewat.push(`#${j.tag}`);
      }
    }
    // Laporan wajib bagian tugas harian (kasir #depan #followers, pemanggang #grill, getok #cooler, plating #nampan).
    for (const t of hariLewat) {
      for (const tg of tugas.filter((x) => x.kode_event === kode && aktif(x) && String(x.tanggal) === t && sama(x.nama, o.nama))) {
        for (const tag of LAPORAN_BAGIAN[tg.bagian] || []) {
          if (!lapEv.some((l) => l.tag === tag && String(l.tanggal) === t)) terlewat.push(`#${tag} ${t.slice(5)}`);
        }
      }
    }
    if (absenOtomatis) {
      for (const t of hariLewat) {
        const hadirHari = absenEv.some((a) => sama(a.nama, o.nama) && String(a.tanggal) === t);
        if (hadirHari && !lapEv.some((l) => l.tag === 'pulang' && String(l.tanggal) === t && sama(l.nama, o.nama))) terlewat.push(`#pulang ${t.slice(5)}`);
      }
    }
    const laporanMinus = [...new Set(terlewat)].length * ATURAN_OTOMATIS.laporan;

    const adaIndividu = ASPEK.some((a) => rinci[a] !== null);
    const lengkap = ASPEK.every((a) => rinci[a] !== null) && tim !== null;
    const individu = adaIndividu ? bulat(ASPEK.reduce((s, a) => s + (rinci[a] ?? 0), 0)) : null;
    return {
      kode, nama: o.nama, peran: o.peran, hari: o.hari, ...rinci, individu,
      omzet, stok, selisihStok, komplain: komplainPoin, jumlahKomplain, tim, kelompok, tunggu, hariLambat: hariLambat.map(([t, m]) => `${t.slice(5)} ${m} mnt`), lambatMinus,
      otomatis, laporanMinus, laporanTerlewat: [...new Set(terlewat)],
      total: individu === null || !n ? null : Math.max(0, bulat(individu + kelompok - laporanMinus)),
      lengkap, bonusMaks: o.bonus || 0,
      catatanTarget: target ? '' : 'event tanpa target omzet (poin omzet penuh)',
    };
  });
}

// Ringkasan sumber nilai otomatis, untuk ditampilkan ke owner/PIC.
export function teksOtomatis(s) {
  const b = [];
  const a = s.otomatis?.absen;
  if (a) b.push(`absen otomatis ${s.absen}/12 (${a.hadir} hari hadir${a.telat ? `, telat ${a.telat}×` : ''}${a.tidakHadir ? `, tidak hadir tanpa izin ${a.tidakHadir}×` : ''})`);
  const t = s.otomatis?.bintang;
  if (t) b.push(t.kurang ? `⭐ ${String(t.rata).replace('.', ',')} dari ${t.jumlah} penilaian (belum ${ATURAN_OTOMATIS.minBintang}, kinerja dari PIC)` : `⭐ ${String(t.rata).replace('.', ',')} dari ${t.jumlah} penilaian → kinerja ${s.kinerja}/24`);
  if (s.laporanMinus) b.push(`laporan terlewat ${s.laporanTerlewat.join(', ')} (−${s.laporanMinus})`);
  if (s.selisihStok) b.push(`stok ${s.stok}/10 (${s.selisihStok} selisih saat sidak)`);
  if (s.lambatMinus) b.push(`layanan lambat (> ${ATURAN_OTOMATIS.targetTungguMenit} mnt): ${s.hariLambat.join(', ')} (−${s.lambatMinus})`);
  return b.join(' · ');
}

// Rekap per bulan per orang. hasilEvent = [hitungEvent...]; poin = baris tab "Poin KPI".
export function rekapBulanKPI(hasilEvent, { poin = [], ...bahan } = {}) {
  const peta = new Map(); // `${bulan}|${nama}` -> data
  const ambil = (bulan, nama, peran) => {
    const kunci = `${bulan}|${String(nama).trim().toLowerCase()}`;
    if (!peta.has(kunci)) peta.set(kunci, { bulan, nama, peran: peran || '', events: [], plus: 0, minus: 0, riwayatPoin: [] });
    return peta.get(kunci);
  };
  for (const r of hasilEvent) {
    const bulan = String(r.event.mulai || '').slice(0, 7);
    if (!bulan) continue;
    for (const s of skorEvent(r, bahan)) ambil(bulan, s.nama, s.peran).events.push(s);
  }
  for (const p of poin.filter(aktif)) {
    const bulan = String(p.tanggal || '').slice(0, 7);
    if (!bulan || !p.nama) continue;
    const d = ambil(bulan, p.nama, '');
    const n = num(p.poin) || 0;
    if (n >= 0) d.plus += n; else d.minus += -n;
    d.riwayatPoin.push(p);
  }
  const hasil = [...peta.values()].map((d) => {
    const dinilai = d.events.filter((e) => e.total !== null);
    const hariDinilai = dinilai.reduce((s, e) => s + (e.hari || 0), 0);
    const rata = (f) => (dinilai.length
      ? bulat(hariDinilai ? dinilai.reduce((s, e) => s + e[f] * (e.hari || 0), 0) / hariDinilai : dinilai.reduce((s, e) => s + e[f], 0) / dinilai.length)
      : null);
    const skorKomponen = rata('total');
    const skor = skorKomponen === null ? null : bulat(Math.max(0, Math.min(100, skorKomponen + d.plus - d.minus)));
    const bonusMaks = d.events.reduce((s, e) => s + (e.bonusMaks || 0), 0);
    const belum = d.events.length - dinilai.length;
    return {
      bulan: d.bulan, nama: d.nama, peran: d.peran || d.events[0]?.peran || '', jumlahEvent: d.events.length,
      hari: d.events.reduce((s, e) => s + (e.hari || 0), 0),
      individu: rata('individu'), kelompok: rata('kelompok'), skorKomponen, plus: d.plus, minus: d.minus, skor,
      bonusMaks, bonusDiterima: skor === null ? null : Math.round(bonusMaks * skor / 100),
      belumDinilai: belum, events: d.events, riwayatPoin: d.riwayatPoin,
    };
  });
  // Peringkat per bulan (yang sudah punya skor).
  const perBulan = new Map();
  for (const h of hasil) {
    if (!perBulan.has(h.bulan)) perBulan.set(h.bulan, []);
    perBulan.get(h.bulan).push(h);
  }
  for (const daftar of perBulan.values()) {
    daftar.filter((h) => h.skor !== null).sort((a, b) => b.skor - a.skor).forEach((h, i) => { h.peringkat = i + 1; });
  }
  return hasil.sort((a, b) => b.bulan.localeCompare(a.bulan) || (a.peringkat || 99) - (b.peringkat || 99) || a.nama.localeCompare(b.nama));
}

// Nilai jawaban PIC: "5 4 4 3" (absen kinerja attitude karir) atau "90 80 80 70".
export function bacaNilai(teks) {
  const angka = String(teks || '').match(/\d+(?:[.,]\d+)?/g)?.map((x) => Number(x.replace(',', '.'))) || [];
  if (angka.length !== 4 || angka.some((n) => n < 0 || n > 100)) return null;
  return Object.fromEntries(ASPEK.map((a, i) => [a, angka[i]]));
}
