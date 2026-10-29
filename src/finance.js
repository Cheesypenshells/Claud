// Perhitungan keuangan: perkiraan transfer IO, rekap event, rekap bulanan.
// Semua fungsi di sini murni (tanpa akses WhatsApp/Sheets) supaya mudah dites.

import { JENIS, STATUS, BUKU } from './schema.js';
import { tambahHari, hariDalamMinggu, rupiah, persen, namaBulan } from './util.js';

const num = (v) => Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0;
const aktif = (r) => (r.status || STATUS.OK) !== STATUS.BATAL;

// Kapan omzet tanggal `ymd` ditransfer IO.
//   HARIAN: H+1, tetapi omzet Jumat, Sabtu, Minggu ditransfer hari Senin.
//   AKHIR : sekali, sehari setelah event selesai.
export function jatuhTempo(ymd, event) {
  if (event.jadwal_trf === 'AKHIR') return tambahHari(event.selesai, 1);
  const hari = hariDalamMinggu(ymd);
  if (hari === 5) return tambahHari(ymd, 3); // Jumat -> Senin
  if (hari === 6) return tambahHari(ymd, 2); // Sabtu -> Senin
  if (hari === 0) return tambahHari(ymd, 1); // Minggu -> Senin
  return tambahHari(ymd, 1);
}

// Omzet terakhir per tanggal (laporan yang lebih baru menggantikan yang lama).
export function omzetPerTanggal(omzetRows, kode) {
  const map = new Map();
  for (const r of omzetRows) {
    if (r.kode_event !== kode || !aktif(r)) continue;
    map.set(r.tanggal, r);
  }
  return [...map.values()].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
}

export function rekapEvent(event, { omzet = [], transaksi = [] }, hariIni) {
  const potong = num(event.bagi_hasil_persen) / 100;
  const hari = omzetPerTanggal(omzet, event.kode).map((r) => {
    const kotor = num(r.omzet) - num(r.refund);
    const bersih = kotor * (1 - potong);
    return { tanggal: r.tanggal, kotor, bersih, jatuhTempo: jatuhTempo(r.tanggal, event) };
  });

  const trx = transaksi.filter((t) => t.kode_event === event.kode && aktif(t));
  const sum = (jenis) => trx.filter((t) => t.jenis === jenis).reduce((s, t) => s + num(t.nominal), 0);

  const omzetKotor = hari.reduce((s, h) => s + h.kotor, 0);
  const bagiHasil = omzetKotor * potong;
  const admin = num(event.admin);
  const potonganIO = sum(JENIS.POTONGAN_IO);
  const perkiraanTransfer = omzetKotor - bagiHasil - admin - potonganIO;
  const diterima = sum(JENIS.MASUK_IO);

  // Yang seharusnya sudah masuk sampai hari ini. Admin & potongan dihitung saat pelunasan akhir.
  const pelunasan = tambahHari(event.selesai, 1);
  let jatuhTempoSdHariIni = hari
    .filter((h) => h.jatuhTempo <= hariIni)
    .reduce((s, h) => s + h.bersih, 0);
  if (hariIni >= pelunasan) jatuhTempoSdHariIni -= admin + potonganIO;
  const telat = Math.max(0, Math.round(jatuhTempoSdHariIni - diterima));

  const pengeluaran = trx.filter((t) => t.jenis === JENIS.KELUAR);
  const perKategori = {};
  for (const t of pengeluaran) perKategori[t.kategori || 'Lain-lain'] = (perKategori[t.kategori || 'Lain-lain'] || 0) + num(t.nominal);
  const totalPengeluaran = pengeluaran.reduce((s, t) => s + num(t.nominal), 0);

  return {
    event,
    hari,
    omzetKotor,
    bagiHasil,
    admin,
    potonganIO,
    perkiraanTransfer,
    diterima,
    sisaPiutang: perkiraanTransfer - diterima,
    telat,
    perKategori,
    totalPengeluaran,
    labaSementara: perkiraanTransfer - totalPengeluaran,
  };
}

export function formatRekapEvent(r, hariIni) {
  const e = r.event;
  const baris = [
    `*REKAP EVENT ${e.kode}*`,
    `${e.kota} | ${e.io} | ${e.mulai} s/d ${e.selesai}`,
    `Per tanggal: ${hariIni}`,
    '',
    '*PEMASUKAN*',
    `Omzet kotor (${r.hari.length} hari): ${rupiah(r.omzetKotor)}`,
    `Bagi hasil IO (${persen(e.bagi_hasil_persen || 0)}): -${rupiah(r.bagiHasil)}`,
  ];
  if (r.admin) baris.push(`Admin IO: -${rupiah(r.admin)}`);
  if (r.potonganIO) baris.push(`Listrik/air/gas/galon: -${rupiah(r.potonganIO)}`);
  baris.push(
    `Perkiraan transfer IO: *${rupiah(r.perkiraanTransfer)}*`,
    `Sudah ditransfer: ${rupiah(r.diterima)}`,
    `Sisa piutang IO: ${rupiah(r.sisaPiutang)}`,
  );
  if (r.telat > 0) baris.push(`⚠️ Transfer yang sudah jatuh tempo tapi belum masuk: *${rupiah(r.telat)}*`);

  baris.push('', '*PENGELUARAN*');
  const kategori = Object.entries(r.perKategori).sort((a, b) => b[1] - a[1]);
  if (!kategori.length) baris.push('(belum ada)');
  for (const [k, v] of kategori) baris.push(`${k}: ${rupiah(v)}`);
  baris.push(`Total pengeluaran: *${rupiah(r.totalPengeluaran)}*`);

  baris.push(
    '',
    `*LABA SEMENTARA: ${rupiah(r.labaSementara)}*`,
    '_Belum termasuk bahan dari gudang dan gaji karyawan tetap (masuk di tahap berikutnya)._',
  );
  return baris.join('\n');
}

// Rekap bulanan: semua event + buku ruko.
// Omzet dihitung berdasarkan tanggal jualan; pengeluaran berdasarkan tanggal dicatat.
export function rekapBulan(bulan, { events = [], omzet = [], transaksi = [] }) {
  const diBulan = (tgl) => String(tgl || '').startsWith(bulan);
  const perEvent = [];
  for (const e of events) {
    const potong = num(e.bagi_hasil_persen) / 100;
    const hari = omzetPerTanggal(omzet, e.kode).filter((h) => diBulan(h.tanggal));
    const kotor = hari.reduce((s, h) => s + num(h.omzet) - num(h.refund), 0);
    const trx = transaksi.filter((t) => t.kode_event === e.kode && aktif(t) && diBulan(t.tanggal));
    const keluar = trx.filter((t) => t.jenis === JENIS.KELUAR).reduce((s, t) => s + num(t.nominal), 0);
    const potonganIO = trx.filter((t) => t.jenis === JENIS.POTONGAN_IO).reduce((s, t) => s + num(t.nominal), 0);
    const diterima = trx.filter((t) => t.jenis === JENIS.MASUK_IO).reduce((s, t) => s + num(t.nominal), 0);
    // Admin dibebankan ke bulan event selesai.
    const admin = diBulan(e.selesai) ? num(e.admin) : 0;
    if (!kotor && !keluar && !diterima && !potonganIO) continue;
    const bersih = kotor * (1 - potong) - admin - potonganIO;
    perEvent.push({ kode: e.kode, kota: e.kota, kotor, bersih, keluar, diterima, laba: bersih - keluar });
  }

  const ruko = transaksi.filter((t) => t.buku === BUKU.RUKO && aktif(t) && diBulan(t.tanggal) && t.jenis === JENIS.KELUAR);
  const rukoPerKategori = {};
  for (const t of ruko) rukoPerKategori[t.kategori || 'Lain-lain'] = (rukoPerKategori[t.kategori || 'Lain-lain'] || 0) + num(t.nominal);
  const totalRuko = ruko.reduce((s, t) => s + num(t.nominal), 0);

  const total = (f) => perEvent.reduce((s, e) => s + e[f], 0);
  return {
    bulan,
    perEvent,
    omzetKotor: total('kotor'),
    pendapatanBersih: total('bersih'),
    pengeluaranEvent: total('keluar'),
    transferDiterima: total('diterima'),
    labaEvent: total('laba'),
    rukoPerKategori,
    totalRuko,
    labaBersih: total('laba') - totalRuko,
  };
}

export function formatRekapBulan(r) {
  const baris = [`*REKAP BULAN ${namaBulan(r.bulan).toUpperCase()}*`, ''];
  baris.push('*PER EVENT*');
  if (!r.perEvent.length) baris.push('(belum ada data)');
  for (const e of r.perEvent) {
    baris.push(`• ${e.kode} (${e.kota}): omzet ${rupiah(e.kotor)}, bersih IO ${rupiah(e.bersih)}, pengeluaran ${rupiah(e.keluar)}, laba ${rupiah(e.laba)}`);
  }
  baris.push(
    '',
    `Omzet kotor: ${rupiah(r.omzetKotor)}`,
    `Pendapatan bersih (setelah potongan IO): ${rupiah(r.pendapatanBersih)}`,
    `Transfer IO diterima: ${rupiah(r.transferDiterima)}`,
    `Pengeluaran event: -${rupiah(r.pengeluaranEvent)}`,
    `*Laba semua event: ${rupiah(r.labaEvent)}*`,
    '',
    '*BIAYA RUKO*',
  );
  const kategori = Object.entries(r.rukoPerKategori).sort((a, b) => b[1] - a[1]);
  if (!kategori.length) baris.push('(belum ada)');
  for (const [k, v] of kategori) baris.push(`${k}: ${rupiah(v)}`);
  baris.push(
    `Total biaya ruko: -${rupiah(r.totalRuko)}`,
    '',
    `*LABA BERSIH BULAN INI: ${rupiah(r.labaBersih)}*`,
    '_Belum termasuk bahan dari gudang (masuk di Tahap 2)._',
  );
  return baris.join('\n');
}
