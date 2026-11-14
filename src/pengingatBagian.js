// Bot aktif menyuruh & menagih tugas harian per bagian (owner/PIC tinggal memutuskan & menilai).
// Chat pribadi ke orangnya (kalau nomornya dikenal) + ringkasan di grup tim. Sekali per slot per hari.
//   es      09.30 (atau 1 jam sebelum buka kalau lebih awal)  Getok: es batu + #cooler
//   siap    1 jam sebelum buka                                Kasir #depan · Pemanggang #grill · Plating #nampan
//   buka    saat buka                                         Kasir #followers (buka)
//   tagih   10 menit setelah buka                             yang belum mengirim laporan bagiannya
//   tutup   setelah ⏹ Tutup kasir (cadangan 23.30 kalau kasir tidak dipakai)                  Kasir #followers (tutup) · semua #bersih & #pulang
//   pulang  1 jam setelah closing (paling cepat 23.30)         yang belum #pulang

import { STATUS } from './schema.js';
import { jadwalHari, aturanHari, wajibAbsen, saatClosing } from './absensi.js';
import { tanggalClosing } from './stokHarian.js';
import { tugasHariIni, BAGIAN } from './tugasHarian.js';

const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const nomor62 = (n) => String(n || '').replace(/\D/g, '').replace(/^0/, '62');
const LAPORAN = { Kasir: ['depan'], Pemanggang: ['grill'], Getok: ['cooler'], Plating: ['nampan'] };
const NAMA_LAPORAN = { depan: 'dekorasi depan + kulkas + cucian', grill: 'area panggang + pajangan + gas kaleng', cooler: 'cooler box + es batu', nampan: 'nampan di freezer + display oyster fresh + area kulkas' };
const jamDari = (d) => d.toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });

function waktuWIB(tanggal, hhmm) { return new Date(`${tanggal}T${hhmm}:00+07:00`); }

export async function tugasPengingatBagian(ctx, sekarang = new Date()) {
  const keluar = [];
  if (!ctx.sesi) return keluar;
  const baca = async (t) => { try { return await ctx.store.all(t); } catch { return []; } };
  const [events, grup, karyawan, laporan, sesiKasir, tim] = await Promise.all(['Event', 'Grup', 'Karyawan', 'Laporan Foto', 'Sesi Kasir', 'Tim Event'].map(baca));
  const tanggal = tanggalClosing(sekarang); // lewat tengah malam (sebelum 05.00) masih hari kemarin
  const nomorDari = (nama) => { const k = karyawan.find((x) => sama(x.nama, nama) && x.nomor_wa); return k ? nomor62(k.nomor_wa) : null; };
  for (const e of events.filter((x) => x.mulai && x.mulai <= tanggal && (!x.selesai || tanggal <= x.selesai) && x.status !== 'BATAL' && x.status !== 'SELESAI')) {
    const tugas = await tugasHariIni(ctx, e, tanggal);
    if (!tugas.length) continue;
    const grupTim = grup.filter((g) => g.kode_event === e.kode && g.jenis === 'event').map((g) => g.group_id);
    const j = jadwalHari(e.jam_buka ? e : { ...e, jam_buka: '10:00' }, tanggal, await aturanHari(ctx, e.kode, tanggal));
    if (!j) continue;
    const buka = j.buka;
    const lap = laporan.filter((l) => l.kode_event === e.kode && String(l.tanggal) === tanggal && String(l.status || 'OK').toUpperCase() === 'OK');
    const sudah = (tag, nama) => lap.some((l) => l.tag === tag && (!nama || sama(l.nama, nama)));
    const orang = (bagian) => tugas.filter((t) => t.bagian === bagian).map((t) => t.nama);
    const slot = (nama, saat) => {
      const tanda = `ingatbagian:${e.kode}:${tanggal}:${nama}`;
      if (sekarang < saat || ctx.sesi.get(tanda)) return false;
      ctx.sesi.set(tanda, { kirim: true });
      return true;
    };
    const pribadi = (nama, teks) => { const n = nomorDari(nama); if (n) keluar.push({ nomor: n, text: teks }); };
    const keGrup = (teks) => grupTim.forEach((g) => keluar.push({ groupId: g, text: teks }));

    // 1) es batu (getok)
    const es = new Date(Math.min(waktuWIB(tanggal, '09:30').getTime(), buka.getTime() - 60 * 60000));
    if (slot('es', es) && sekarang < buka.getTime() + 3 * 3600e3) {
      const g = orang('Getok');
      if (g.length && !sudah('cooler')) {
        g.forEach((n) => pribadi(n, `🧊 *${n}*, sekarang waktunya *pesan es batu* dan tuang ke cooler box (${e.kode}).\nLalu kirim foto ke grup tim dengan caption *#cooler* (kalau oyster belum ada, foto cooler box-nya tetap dikirim).\nSetelah itu mulai getok, supply terus ke plating sampai plating bilang stop.`));
        keGrup(`🧊 *Getok (${g.join(', ')})*: pesan es batu & tuang ke cooler box sekarang, kirim *#cooler* + foto.`);
      }
    }
    // 2) persiapan sebelum buka
    if (slot('siap', new Date(buka.getTime() - 60 * 60000)) && sekarang < buka.getTime() + 3 * 3600e3) {
      const baris = [];
      for (const bagian of ['Kasir', 'Pemanggang', 'Plating']) {
        for (const n of orang(bagian)) {
          const tag = LAPORAN[bagian].find((t) => !sudah(t));
          if (!tag) continue;
          pribadi(n, `⏰ *${n}* – 1 jam lagi booth ${e.kode} buka (${jamDari(buka)}).\n${BAGIAN[bagian].ikon} Bagian *${bagian}*:\n${BAGIAN[bagian].tugas.map((x) => `• ${x}`).join('\n')}\n📷 Kirim foto ke grup tim dengan caption *#${tag}* (${NAMA_LAPORAN[tag]}).`);
          baris.push(`• ${BAGIAN[bagian].ikon} ${n}: *#${tag}*`);
        }
      }
      if (baris.length) keGrup(`⏰ *1 jam lagi buka (${jamDari(buka)}).* Siapkan bagian masing-masing & kirim foto:\n${baris.join('\n')}`);
    }
    // 3) followers saat buka (kasir)
    if (slot('buka', buka) && sekarang < buka.getTime() + 2 * 3600e3) {
      for (const n of orang('Kasir')) pribadi(n, `📱 *${n}*, booth sudah buka. Screenshot profil Instagram @cheesypenshells (jumlah followers) dan kirim ke grup tim dengan caption *#followers*.`);
    }
    // 4) tagih yang belum lapor (10 menit setelah buka)
    if (slot('tagih', new Date(buka.getTime() + 10 * 60000)) && sekarang < buka.getTime() + 4 * 3600e3) {
      const belum = [];
      for (const t of tugas) {
        for (const tag of LAPORAN[t.bagian] || []) {
          if (t.bagian === 'Plating' && t.rangkap && sudah('nampan')) continue;
          if (sudah(tag)) continue;
          belum.push({ nama: t.nama, tag });
        }
      }
      const unik = belum.filter((b, i) => belum.findIndex((x) => x.nama === b.nama && x.tag === b.tag) === i);
      unik.forEach((b) => pribadi(b.nama, `❗ *${b.nama}*, laporan *#${b.tag}* (${NAMA_LAPORAN[b.tag]}) belum masuk. Kirim fotonya ke grup tim sekarang ya.\n_Laporan yang tidak dikirim mengurangi KPI −2._`));
      if (unik.length) keGrup(`❗ *Laporan bagian yang belum masuk:*\n${unik.map((b) => `• ${b.nama}: *#${b.tag}*`).join('\n')}`);
    }
    // 5) tutup: setelah kasir ditutup hari ini, atau 22.00
    const closing = saatClosing(e, tanggal, sesiKasir);
    if (slot('tutup', closing.saat)) {
      for (const n of orang('Kasir')) pribadi(n, `📱 *${n}*, sebelum pulang: screenshot followers Instagram lagi dan kirim *#followers* (tutup).`);
      keGrup(`🧹 *Waktunya closing ${e.kode}:*\n• Kasir: *#followers* (tutup)\n• Semua: bersih-bersih, lalu foto *#bersih* (regulator gas dilepas, booth bersih, cucian bersih)\n• Hitung stok + foto: *#stok* (getok: oyster di cooler · plating & kasir: gudang + booth)\n• Ada bahan rusak/hilang? *#rusak* + foto\n• Tiap orang: *#pulang* sebelum pulang`);
    }
    // 6) tagih #pulang: 1 jam setelah closing (paling cepat 23.30)
    if (slot('pulang', new Date(Math.max(closing.saat.getTime() + 60 * 60000, waktuWIB(tanggal, '23:30').getTime())))) {
      const wajib = tim.filter((o) => o.kode_event === e.kode && o.status !== STATUS.BATAL && o.status !== 'BERHENTI' && wajibAbsen(o)).map((o) => o.nama);
      const hadir = [...new Set(tugas.map((t) => t.nama))].filter((n) => wajib.some((w) => sama(w, n)));
      const belum = hadir.filter((n) => !sudah('pulang', n));
      belum.forEach((n) => pribadi(n, `🏠 *${n}*, jangan lupa ketik *#pulang* di grup tim sebelum pulang ya.`));
      if (belum.length) keGrup(`🏠 Belum *#pulang*: ${belum.join(', ')}`);
    }
  }
  return keluar;
}
