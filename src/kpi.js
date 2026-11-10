// KPI karyawan: skor maksimal 100 poin per bulan, 60% individu + 40% kelompok, ditambah poin plus/minus.
//
// Individu (60, dinilai PIC setelah event, skala 1-5 atau persen):
//   absen 20% (12) · performa kinerja 40% (24) · attitude 20% (12) · karir 20% (12)
// Kelompok (40, dari data event):
//   omzet vs target 15 · ketepatan stok 10 · kebersihan & komplain 10 · kinerja tim (nilai PIC) 5
// Skor bulan = rata-rata skor event (ditimbang hari kerja) + poin plus - poin minus, dibatasi 0-100.
// Bonus diterima = bonus maksimal (dari hitungan event) x skor bulan / 100.

import { PERAN } from './parsers.js';

export const BOBOT = { absen: 12, kinerja: 24, attitude: 12, karir: 12, omzet: 15, stok: 10, komplain: 10, tim: 5 };
export const ASPEK = ['absen', 'kinerja', 'attitude', 'karir'];
export const NAMA_ASPEK = { absen: 'Absen', kinerja: 'Performa kinerja', attitude: 'Attitude', karir: 'Karir' };
export const POIN_KOMPLAIN = 2; // tiap komplain pelanggan mengurangi 2 dari 10 poin kebersihan & komplain

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
  return r.barisTim.filter((o) => o.peran !== PERAN.PIC && !o.owner);
}

// Skor KPI tiap orang di satu event. r = hasil hitungEvent; nilai = baris tab "Nilai KPI".
export function skorEvent(r, { nilai = [], komplain = [] } = {}) {
  const kode = r.event.kode;
  const milik = nilai.filter((n) => n.kode_event === kode && aktif(n));
  const target = num(r.event.target_omzet);
  const omzet = target ? bulat(Math.min(1, r.omzetBersih / target) * BOBOT.omzet) : BOBOT.omzet;
  const stok = BOBOT.stok; // deteksi selisih stok belum aktif: dianggap tepat
  const jumlahKomplain = komplain.filter((k) => k.kode_event === kode && aktif(k)).length;
  const komplainPoin = Math.max(0, BOBOT.komplain - jumlahKomplain * POIN_KOMPLAIN);
  const baris = milik.filter((n) => sama(n.nama, 'TIM')).pop();
  const tim = baris ? poinDari(baris.tim, BOBOT.tim) : null;
  const kelompok = bulat(omzet + stok + komplainPoin + (tim ?? 0));

  return yangDinilai(r).map((o) => {
    const n = milik.filter((x) => sama(x.nama, o.nama)).pop();
    const rinci = Object.fromEntries(ASPEK.map((a) => [a, n ? poinDari(n[a], BOBOT[a]) : null]));
    const lengkap = Boolean(n) && ASPEK.every((a) => rinci[a] !== null) && tim !== null;
    const individu = n ? bulat(ASPEK.reduce((s, a) => s + (rinci[a] ?? 0), 0)) : null;
    return {
      kode, nama: o.nama, peran: o.peran, hari: o.hari, ...rinci, individu,
      omzet, stok, komplain: komplainPoin, jumlahKomplain, tim, kelompok,
      total: individu === null ? null : bulat(individu + kelompok),
      lengkap, bonusMaks: o.bonus || 0,
      catatanTarget: target ? '' : 'event tanpa target omzet (poin omzet penuh)',
    };
  });
}

// Rekap per bulan per orang. hasilEvent = [hitungEvent...]; poin = baris tab "Poin KPI".
export function rekapBulanKPI(hasilEvent, { nilai = [], poin = [], komplain = [] } = {}) {
  const peta = new Map(); // `${bulan}|${nama}` -> data
  const ambil = (bulan, nama, peran) => {
    const kunci = `${bulan}|${String(nama).trim().toLowerCase()}`;
    if (!peta.has(kunci)) peta.set(kunci, { bulan, nama, peran: peran || '', events: [], plus: 0, minus: 0, riwayatPoin: [] });
    return peta.get(kunci);
  };
  for (const r of hasilEvent) {
    const bulan = String(r.event.mulai || '').slice(0, 7);
    if (!bulan) continue;
    for (const s of skorEvent(r, { nilai, komplain })) ambil(bulan, s.nama, s.peran).events.push(s);
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
