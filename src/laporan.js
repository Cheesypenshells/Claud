// Perhitungan sheet Main: bedah untung/rugi satu event.
// Murni (tanpa WhatsApp/Sheets) supaya mudah dites. Aturan mengikuti docs/SPEK-MAIN-EVENT.md.

import { JENIS, STATUS, BUKU } from './schema.js';
import { KATEGORI, PERAN } from './parsers.js';
import { omzetPerTanggal, jatuhTempo } from './finance.js';
import { hariDalamMinggu, persen } from './util.js';
import { hitungPenggantian } from './uangSiapa.js';

const num = (v) => Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0;
const aktif = (r) => (r.status || STATUS.OK) !== STATUS.BATAL;
const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export const ATURAN = {
  gajiPokokTetap: 2500000,
  hariPerBulan: 30,
  omzetMinBonusTetap: 50000000,
  bonusTetapPersen: { satu: 1.5, perOrang: 1 }, // 1 orang: 1,5%; 2 orang: masing-masing 1%
  bonusDw: [[30000000, 100000], [15000000, 50000]], // omzet hari itu > batas
  bonusKasir: [[30000000, 200000], [20000000, 150000], [10000000, 100000]], // omzet hari itu >= batas
  budgetMakanKaryawan: 30000,
  budgetMakanPic: 100000,
  budgetPorsiGratis: 500000, // per event, dinilai dengan harga jual
  // Fee PIC: maksimal 25% dari laba bersih, dikurangi menurut kehadiran owner di event.
  feePicMaks: 25,
  potonganFeePic: { tidak: 0, '1 hari': 5, setengah: 10, penuh: 15 },
};

// Kehadiran owner tersimpan di Event.owner_hadir: tidak / 1 hari / setengah / penuh.
export function persenFeePic(ownerHadir) {
  const k = String(ownerHadir || 'tidak').toLowerCase();
  return ATURAN.feePicMaks - (ATURAN.potonganFeePic[k] ?? 0);
}

// Kategori lama (versi awal bot) dibaca sebagai kategori baru.
const KATEGORI_LAMA = { Peralatan: KATEGORI.NON_KONSUMTIF };

// Batas baris tiap bagian di sheet Main (harus sama dengan tata letak di mainSheet.js).
export const BATAS_BARIS = { INFO: 1, GRATIS_INFO: 1, RINGKASAN: 10, OMZET: 31, BIAYA: 16, MAKAN: 1, TIM: 20, IKLAN: 10, GRATIS: 10, BAHAN: 10, UANG: 10, GRAFIK: 10 };

function hariAktif(orang, tanggalJualan, event) {
  const mulai = orang.mulai || event.mulai;
  const selesai = orang.selesai || event.selesai;
  return tanggalJualan.filter((t) => t >= mulai && t <= selesai);
}

function bonusBertingkat(tabel, omzet, inklusif) {
  for (const [batas, bonus] of tabel) if (inklusif ? omzet >= batas : omzet > batas) return bonus;
  return 0;
}

export function hitungEvent(event, data) {
  const { omzet = [], transaksi = [], tim = [], bahan = [], gratis = [], hargaBahan = [], hargaMenu = [], namaOwner = '' } = data;
  // Owner yang ikut bekerja di event tidak digaji (tanpa upah, bonus, maupun fee PIC).
  const adalahOwner = (o) => Boolean(namaOwner) && String(o.nama).trim().toLowerCase() === String(namaOwner).trim().toLowerCase();
  const kode = event.kode;
  const potong = num(event.bagi_hasil_persen) / 100;

  // ---------- Omzet harian ----------
  const hari = omzetPerTanggal(omzet, kode).map((r) => {
    const bersihHari = num(r.omzet) - num(r.refund);
    return {
      tanggal: r.tanggal,
      omzet: num(r.omzet),
      transaksi: r.jumlah_transaksi === '' ? '' : num(r.jumlah_transaksi),
      refund: num(r.refund),
      bersih: bersihHari,
      potongan: bersihHari * potong,
      perkiraan: bersihHari * (1 - potong),
      jatuhTempo: jatuhTempo(r.tanggal, event),
    };
  });
  const trx = transaksi.filter((t) => t.kode_event === kode && aktif(t) && t.buku !== BUKU.RUKO);
  // Transfer IO dialokasikan ke hari-hari jualan berurutan (yang paling dulu jatuh tempo dilunasi dulu).
  let sisaTransfer = trx.filter((t) => t.jenis === JENIS.MASUK_IO).reduce((s, t) => s + num(t.nominal), 0);
  for (const h of [...hari].sort((a, b) => a.jatuhTempo.localeCompare(b.jatuhTempo))) {
    h.diterima = Math.min(h.perkiraan, Math.max(0, sisaTransfer));
    sisaTransfer -= h.diterima;
  }
  const omzetBersih = hari.reduce((s, h) => s + h.bersih, 0);
  const tanggalJualan = hari.map((h) => h.tanggal);
  const omzetPerHari = new Map(hari.map((h) => [h.tanggal, h.bersih]));

  // ---------- Transaksi per kategori ----------
  const keluar = trx.filter((t) => t.jenis === JENIS.KELUAR).map((t) => ({ ...t, kategori: KATEGORI_LAMA[t.kategori] || t.kategori || KATEGORI.LAIN }));
  const jumlahKategori = (k) => keluar.filter((t) => t.kategori === k).reduce((s, t) => s + num(t.nominal), 0);
  const potonganIO = trx.filter((t) => t.jenis === JENIS.POTONGAN_IO).reduce((s, t) => s + num(t.nominal), 0);

  // ---------- Bahan dari gudang ----------
  const harga = new Map(hargaBahan.map((b) => [b.bahan, b]));
  const gerak = bahan.filter((b) => b.kode_event === kode && aktif(b));
  const namaBahan = [...new Set([...hargaBahan.map((b) => b.bahan), ...gerak.map((g) => g.bahan)])];
  const barisBahan = namaBahan.map((nama) => {
    const g = gerak.filter((x) => x.bahan === nama);
    const total = (jenis) => g.filter((x) => x.gerak === jenis).reduce((s, x) => s + num(x.jumlah), 0);
    const k = total('Keluar');
    const r = total('Restock');
    const kembali = total('Kembali');
    const h = num(harga.get(nama)?.harga);
    return {
      bahan: nama, satuan: harga.get(nama)?.satuan || g[0]?.satuan || '',
      keluar: k, restock: r, kembali, terpakai: k + r - kembali, harga: h,
      nilaiBawa: (k + r) * h, nilaiTerpakai: (k + r - kembali) * h, nilaiKembali: kembali * h,
    };
  }).filter((b) => b.keluar || b.restock || b.kembali);
  const nilaiBahanDibawa = barisBahan.reduce((s, b) => s + b.nilaiBawa, 0);
  const nilaiSisaKembali = barisBahan.reduce((s, b) => s + b.nilaiKembali, 0);

  // ---------- Tim, gaji, bonus ----------
  const orang = tim.filter((o) => o.kode_event === kode);
  const jumlahTetap = orang.filter((o) => o.peran === PERAN.TETAP).length;
  const persenTetap = jumlahTetap === 1 ? ATURAN.bonusTetapPersen.satu : ATURAN.bonusTetapPersen.perOrang;
  const barisTim = orang.map((o) => {
    const hariKerja = hariAktif(o, tanggalJualan, event);
    let upahHarian = num(o.upah_harian);
    let upah = 0;
    let bonus = 0;
    if (adalahOwner(o)) {
      upahHarian = 0;
    } else if (o.peran === PERAN.TETAP) {
      upahHarian = ATURAN.gajiPokokTetap / ATURAN.hariPerBulan;
      upah = upahHarian * hariKerja.length;
      if (omzetBersih >= ATURAN.omzetMinBonusTetap) bonus = (omzetBersih * persenTetap) / 100;
    } else if (o.peran === PERAN.DW || o.peran === PERAN.KASIR) {
      upah = upahHarian * hariKerja.length;
      const tabel = o.peran === PERAN.DW ? ATURAN.bonusDw : ATURAN.bonusKasir;
      bonus = hariKerja.reduce((s, t) => s + bonusBertingkat(tabel, omzetPerHari.get(t) || 0, o.peran === PERAN.KASIR), 0);
    }
    return { nama: o.nama, peran: o.peran, hari: hariKerja.length, upahHarian, upah, bonus, status: o.status, owner: adalahOwner(o) };
  });
  const gajiTetap = barisTim.filter((o) => o.peran === PERAN.TETAP).reduce((s, o) => s + o.upah, 0);
  const upahHarian = barisTim.filter((o) => o.peran === PERAN.DW || o.peran === PERAN.KASIR).reduce((s, o) => s + o.upah, 0);
  const totalBonus = barisTim.reduce((s, o) => s + o.bonus, 0);
  const gajiTercatat = jumlahKategori(KATEGORI.GAJI);

  // ---------- Budget makan ----------
  const budgetMakan = tanggalJualan.reduce((s, t) => {
    const hadir = orang.filter((o) => hariAktif(o, [t], event).length);
    return s + hadir.reduce((x, o) => x + (o.peran === PERAN.PIC ? ATURAN.budgetMakanPic : ATURAN.budgetMakanKaryawan), 0);
  }, 0);
  const makanTerpakai = jumlahKategori(KATEGORI.KONSUMSI);

  // ---------- Porsi gratis ----------
  const menu = new Map(hargaMenu.map((m) => [m.menu, m]));
  const wilayah = String(event.wilayah || 'Jawa').toLowerCase();
  const kolomHarga = wilayah.startsWith('kal') ? 'kalimantan' : wilayah.startsWith('sum') ? 'sumatra' : 'jawa';
  const barisGratis = gratis.filter((g) => g.kode_event === kode && aktif(g)).map((g) => {
    const h = num(menu.get(g.menu)?.[kolomHarga]);
    return { tanggal: g.tanggal, menu: g.menu, porsi: g.porsi, pcs: num(g.pcs), harga: h, nilai: num(g.pcs) * h, untuk: g.untuk };
  });

  // ---------- Rincian biaya ----------
  const nonKonsumtif = keluar.filter((t) => t.kategori === KATEGORI.NON_KONSUMTIF);
  const kategoriTerpakai = new Set([
    KATEGORI.OYSTER, KATEGORI.BAHAN_LAIN, KATEGORI.OPERASIONAL, KATEGORI.KONSUMTIF, KATEGORI.NON_KONSUMTIF,
    KATEGORI.TRANSPORT, KATEGORI.PENGINAPAN, KATEGORI.KONSUMSI, KATEGORI.GAJI, KATEGORI.IKLAN, KATEGORI.TAK_TERDUGA,
    KATEGORI.ADMIN,
  ]);
  const lainnya = keluar.filter((t) => !kategoriTerpakai.has(t.kategori)).reduce((s, t) => s + num(t.nominal), 0);
  const bagiHasil = omzetBersih * potong;
  const biaya = [
    ['Potongan bagi hasil IO', bagiHasil, `${persen(num(event.bagi_hasil_persen))} dari omzet`],
    ['Admin IO + listrik/air/gas/galon', num(event.admin) + potonganIO, `Admin ${num(event.admin).toLocaleString('id-ID')}, potongan lain ${potonganIO.toLocaleString('id-ID')}`],
    ['Bahan baku', nilaiBahanDibawa + jumlahKategori(KATEGORI.OYSTER) + jumlahKategori(KATEGORI.BAHAN_LAIN), 'Bahan dari gudang (keluar + restock) + beli oyster/bahan di lokasi'],
    ['Bahan operasional (es, gas, lemon)', jumlahKategori(KATEGORI.OPERASIONAL), ''],
    ['Admin & sewa (freezer, kuota, cctv, laundry)', jumlahKategori(KATEGORI.ADMIN), ''],
    ['Barang kering konsumtif', jumlahKategori(KATEGORI.KONSUMTIF), 'Sumpit, wrap, kotak, plastik, sarung tangan'],
    ['Barang kering non-konsumtif ⚠️ kelalaian', jumlahKategori(KATEGORI.NON_KONSUMTIF), nonKonsumtif.length ? `${nonKonsumtif.length} pembelian: ${nonKonsumtif.map((t) => t.keterangan).join(', ')}` : 'Tidak ada'],
    ['Transport & ekspedisi', jumlahKategori(KATEGORI.TRANSPORT), ''],
    ['Penginapan', jumlahKategori(KATEGORI.PENGINAPAN), ''],
    ['Konsumsi', makanTerpakai, `Budget ${budgetMakan.toLocaleString('id-ID')}`],
    ['Gaji karyawan tetap (porsi event)', gajiTetap, 'Estimasi: gaji pokok ÷ 30 × hari kerja'],
    ['Upah DW + kasir', upahHarian, gajiTercatat ? `Tercatat dibayar di grup: ${gajiTercatat.toLocaleString('id-ID')}` : 'Estimasi dari daftar tim'],
    ['Estimasi bonus (poin KPI 100%)', totalBonus, 'Bonus omzet; bonus absensi & followers menyusul'],
    ['Iklan & endorse', jumlahKategori(KATEGORI.IKLAN), ''],
    ['Tak terduga', jumlahKategori(KATEGORI.TAK_TERDUGA), 'Sakit, ganti rugi, lain-lain'],
    ['Lain-lain', lainnya, ''],
  ];
  const totalBiaya = biaya.reduce((s, b) => s + b[1], 0);
  const labaSebelumFee = omzetBersih - totalBiaya + nilaiSisaKembali;
  // Fee PIC hanya untuk PIC yang bukan owner.
  const picBerhakFee = orang.filter((o) => o.peran === PERAN.PIC && !adalahOwner(o));
  const feePicPersen = picBerhakFee.length ? persenFeePic(event.owner_hadir) : 0;
  const feePic = labaSebelumFee > 0 ? (labaSebelumFee * feePicPersen) / 100 : 0;
  const laba = labaSebelumFee - feePic;
  const namaPic = picBerhakFee.map((o) => o.nama);

  const nilaiGratis = barisGratis.reduce((s, g) => s + g.nilai, 0);

  return {
    event, hari, omzetBersih, biaya, totalBiaya, nilaiSisaKembali, laba, nilaiGratis,
    labaSebelumFee, feePic, feePicPersen, namaPic, bagiHasil, potonganIO,
    penggantian: hitungPenggantian(transaksi, kode),
    barisBahan, barisTim, barisGratis, budgetMakan, makanTerpakai,
    iklan: keluar.filter((t) => t.kategori === KATEGORI.IKLAN),
  };
}

// Baris untuk tab "Data Main": [kode, bagian, urut, c1..c9]. Nilai bukan uang ditulis sebagai teks.
export function barisDataMain(r) {
  const kode = r.event.kode;
  const baris = [];
  const tambah = (bagian, data) => {
    const batas = BATAS_BARIS[bagian];
    data.slice(0, batas).forEach((isi, i) => baris.push([kode, bagian, i + 1, ...isi]));
  };
  const jumlahHari = r.hari.length;
  const margin = r.omzetBersih ? (r.laba / r.omzetBersih) * 100 : 0;

  tambah('INFO', [[`${r.event.kota} | ${r.event.io} | ${r.event.mulai} s/d ${r.event.selesai} | Wilayah ${r.event.wilayah || 'Jawa'} | Bagi hasil ${persen(num(r.event.bagi_hasil_persen))}`]]);
  tambah('RINGKASAN', [
    ['Omzet (setelah refund)', r.omzetBersih],
    ['Total biaya', r.totalBiaya],
    ['Sisa bahan dikembalikan ke gudang', r.nilaiSisaKembali],
    ['Laba sebelum fee PIC', r.labaSebelumFee],
    [`Fee PIC ${r.feePicPersen}%${r.namaPic.length ? ` (${r.namaPic.join(', ')})` : ''}`, r.feePic],
    ['LABA BERSIH', r.laba],
    ['Status', r.laba >= 0 ? '✅ UNTUNG' : '❌ RUGI'],
    ['Margin', persen(Number(margin.toFixed(1)))],
    ['Hari jualan', `${jumlahHari} hari`],
    ['Laba per hari', jumlahHari ? r.laba / jumlahHari : 0],
  ]);
  tambah('OMZET', r.hari.map((h) => [
    h.tanggal, NAMA_HARI[hariDalamMinggu(h.tanggal)], h.omzet, h.transaksi, h.refund, h.potongan, h.perkiraan, h.diterima, h.perkiraan - h.diterima,
  ]));
  tambah('BIAYA', r.biaya.map(([nama, nilai, ket], i) => [String(i + 1), nama, nilai, ket]));
  tambah('MAKAN', [[r.budgetMakan, r.makanTerpakai, r.budgetMakan - r.makanTerpakai,
    r.budgetMakan - r.makanTerpakai >= 0 ? 'Sisa untuk makan bersama di akhir event' : '⚠️ Melebihi budget']]);
  tambah('TIM', r.barisTim.map((o) => [o.nama, o.peran + (o.owner ? ' (owner, tidak digaji)' : '') + (o.status === 'BERHENTI' ? ' (berhenti)' : ''), `${o.hari} hari`, o.upahHarian, o.upah, o.bonus, o.upah + o.bonus]));
  tambah('IKLAN', r.iklan.map((t) => [t.tanggal, t.keterangan, Number(t.nominal) || 0]));
  const sisaGratis = ATURAN.budgetPorsiGratis - r.nilaiGratis;
  tambah('GRATIS_INFO', [[`Budget ${ATURAN.budgetPorsiGratis.toLocaleString('id-ID')} | terpakai ${r.nilaiGratis.toLocaleString('id-ID')} | ${sisaGratis >= 0 ? `sisa ${sisaGratis.toLocaleString('id-ID')}` : `⚠️ lebih ${(-sisaGratis).toLocaleString('id-ID')}`}`]]);
  tambah('GRATIS', r.barisGratis.map((g) => [g.tanggal, g.menu, g.porsi === '' ? '' : String(g.porsi), `${g.pcs} pcs`, g.harga, g.nilai, g.untuk]));
  // Komposisi untuk grafik batang & pie (urutan tetap: omzet, 8 kelompok biaya, laba bersih).
  const b = Object.fromEntries(r.biaya.map(([nama, nilai]) => [nama, nilai]));
  const kelompok = [
    ['Bahan baku', b['Bahan baku'] + b['Bahan operasional (es, gas, lemon)']],
    ['Transport', b['Transport & ekspedisi']],
    ['Makan & minum', b.Konsumsi],
    ['Gaji, upah & bonus', b['Gaji karyawan tetap (porsi event)'] + b['Upah DW + kasir'] + b['Estimasi bonus (poin KPI 100%)'] + r.feePic],
    ['Penginapan', b.Penginapan],
    ['Bagi hasil & admin IO', b['Potongan bagi hasil IO'] + b['Admin IO + listrik/air/gas/galon']],
    ['Iklan', b['Iklan & endorse']],
  ];
  const dipakai = kelompok.reduce((s, [, v]) => s + v, 0) - r.feePic;
  kelompok.push(['Lain-lain (barang kering, sewa, tak terduga, dll.)', Math.max(0, r.totalBiaya - dipakai)]);
  tambah('GRAFIK', [['Omzet', r.omzetBersih], ...kelompok, ['Laba bersih', r.laba]]);
  tambah('UANG', r.penggantian.map((u) => [u.nama, u.dibayar, u.diganti, u.sisa, `${u.catatan} catatan`]));
  tambah('BAHAN', r.barisBahan.map((b) => [b.bahan, b.satuan, String(b.keluar), String(b.restock), String(b.kembali), String(b.terpakai), b.harga, b.nilaiTerpakai, b.nilaiKembali]));
  return baris;
}
