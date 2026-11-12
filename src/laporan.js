// Perhitungan sheet Main: bedah untung/rugi satu event.
// Murni (tanpa WhatsApp/Sheets) supaya mudah dites. Aturan mengikuti docs/SPEK-MAIN-EVENT.md.

import { hitungBahan } from './bahan.js';
import { JENIS, STATUS, BUKU } from './schema.js';
import { KATEGORI, PERAN } from './parsers.js';
import { omzetPerTanggal, jatuhTempo } from './finance.js';
import { hariDalamMinggu, persen, tambahHari } from './util.js';
import { hitungPenggantian } from './uangSiapa.js';

const num = (v) => Number(String(v ?? '').replace(/[^\d.-]/g, '')) || 0;
const aktif = (r) => (r.status || STATUS.OK) !== STATUS.BATAL;
const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

export const ATURAN = {
  // Karyawan tetap (senior), dibayar langsung oleh owner:
  // - Gaji pokok Rp 2,5 jt/bulan, dibebankan ke event yang dijaganya dalam rentang sebulan (1 event = penuh,
  //   2 event = masing-masing setengah, dst.).
  // - Bonus kalau omzet kotor event > Rp 100 jt: bulan itu hanya 1 event -> 0,5% dibagi rata ke senior yang
  //   jaga; 2 event atau lebih (jarak mulai < 1 bulan, tempat sama atau berbeda) -> tiap senior 1% (tidak dibagi).
  gajiPokokTetap: 2500000,
  jendelaBulanHari: 30,
  bonusTetap: { batasOmzet: 100000000, satuEventPersen: 0.5, banyakEventPersen: 1 },
  bonusDw: [[30000000, 100000], [15000000, 50000]], // omzet hari itu > batas
  bonusKasir: [[30000000, 200000], [20000000, 150000], [10000000, 100000]], // omzet hari itu >= batas
  budgetMakanKaryawan: 30000,
  budgetMakanPic: 100000,
  budgetPorsiGratis: 500000, // per event, dinilai dengan harga jual
  // Fee PIC: maksimal 25% dari laba bersih, dikurangi menurut kehadiran owner di event.
  feePicMaks: 25,
  seniorBanyak: { jumlah: 3, feeMaks: 20 }, // 3 karyawan tetap atau lebih: fee PIC paling tinggi 20%
  potonganFeePic: { tidak: 0, '1 hari': 5, setengah: 10, penuh: 15 },
};

// Kehadiran owner tersimpan di Event.owner_hadir: tidak / 1 hari / setengah / penuh.
// jumlahSenior: karyawan tetap di tim event. 3 orang atau lebih -> fee PIC paling tinggi 20%.
export function persenFeePic(ownerHadir, jumlahSenior = 0) {
  const k = String(ownerHadir || 'tidak').toLowerCase();
  const menurutOwner = ATURAN.feePicMaks - (ATURAN.potonganFeePic[k] ?? 0);
  return jumlahSenior >= ATURAN.seniorBanyak.jumlah ? Math.min(menurutOwner, ATURAN.seniorBanyak.feeMaks) : menurutOwner;
}

// Kategori lama (versi awal bot) dibaca sebagai kategori baru.
const KATEGORI_LAMA = { Peralatan: KATEGORI.NON_KONSUMTIF };

// Batas baris tiap bagian di sheet Main (harus sama dengan tata letak di mainSheet.js).
// Kelompok biaya di grafik. Warnanya = urutan warna bawaan Google Sheets untuk pie chart
// (6 warna utama, lalu versi lebih muda dari warna 1-4), jadi potongan pie otomatis sama dengan
// warna di tabel tanpa mengubah tema file (tema khusus tidak bisa dibuka aplikasi Sheets versi lama).
export const KELOMPOK_GRAFIK = [
  { nama: 'Transport', warna: '#4285F4' },
  { nama: 'Bahan baku', warna: '#EA4335' },
  { nama: 'Iklan', warna: '#FBBC04' },
  { nama: 'Makan & minum', warna: '#34A853' },
  { nama: 'Bagi hasil IO', warna: '#FF6D01' },
  { nama: 'Gaji & bonus', warna: '#46BDC6' },
  { nama: 'Penginapan', muda: 0 },
  { nama: 'Barang kering', muda: 1 },
  { nama: 'Tak terduga dll', muda: 2 },
  { nama: 'Sewa & admin', muda: 3 },
];
export const TERANG_GRAFIK = 0.3; // seberapa terang warna muda dibanding aksennya
export function warnaKelompok(k) {
  if (k.warna) return k.warna;
  const n = parseInt(KELOMPOK_GRAFIK[k.muda].warna.slice(1), 16);
  const c = (v) => Math.round(v + (255 - v) * TERANG_GRAFIK).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

export const BATAS_BARIS = { INFO: 1, GRATIS_INFO: 1, RINGKASAN: 10, OMZET: 31, BIAYA: 17, MAKAN: 1, TIM: 20, IKLAN: 10, GRATIS: 10, BAHAN: 10, UANG: 10, GRAFIK: 12, HARIAN: 31, ALOKASI: 31, SETOR: 10 };

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
  const { omzet = [], transaksi = [], tim = [], bahan = [], gratis = [], hargaBahan = [], hargaMenu = [], namaOwner = '', karyawan = [] } = data;
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
  // Omzet diinput sebagai satu angka total (rekap event lama): semua tanggal event dihitung hari kerja.
  const omzetTotal = omzet.some((o) => o.kode_event === kode && aktif(o) && /omzet total event/i.test(String(o.catatan || '')));
  const semuaTanggalEvent = [];
  if (event.mulai && event.selesai) for (let t = event.mulai; t <= event.selesai && semuaTanggalEvent.length < 120; t = tambahHari(t, 1)) semuaTanggalEvent.push(t);
  const tanggalJualan = omzetTotal && semuaTanggalEvent.length ? [...new Set([...semuaTanggalEvent, ...hari.map((h) => h.tanggal)])].sort() : hari.map((h) => h.tanggal);
  const omzetPerHari = new Map(hari.map((h) => [h.tanggal, h.bersih]));

  // ---------- Transaksi per kategori ----------
  const keluar = trx.filter((t) => t.jenis === JENIS.KELUAR).map((t) => ({ ...t, kategori: KATEGORI_LAMA[t.kategori] || t.kategori || KATEGORI.LAIN }));
  const jumlahKategori = (k) => keluar.filter((t) => t.kategori === k).reduce((s, t) => s + num(t.nominal), 0);
  const potonganIO = trx.filter((t) => t.jenis === JENIS.POTONGAN_IO).reduce((s, t) => s + num(t.nominal), 0);

  // ---------- Bahan dari gudang ----------
  const gerak = bahan.filter((b) => b.kode_event === kode && aktif(b));
  const barisBahan = hitungBahan(gerak, hargaBahan).filter((b) => b.keluar || b.restock || b.kembali);
  const nilaiBahanDibawa = barisBahan.reduce((s, b) => s + b.nilaiBawa, 0);
  const nilaiSisaKembali = barisBahan.reduce((s, b) => s + b.nilaiKembali, 0);

  // ---------- Tim, gaji, bonus ----------
  const orang = tim.filter((o) => o.kode_event === kode && aktif(o));
  const jumlahTetap = orang.filter((o) => o.peran === PERAN.TETAP).length;
  // Event lain yang mulainya kurang dari sebulan dari event ini (semua tempat) -> menentukan persen bonus senior.
  const selisihHari = (a, b) => Math.abs((new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 86400000);
  const semuaEvent = (data.events || [event]).filter((e) => e.status !== STATUS.BATAL && e.status !== 'BATAL' && e.mulai);
  const eventDekat = semuaEvent.filter((e) => e.kode === kode || (event.mulai && selisihHari(e.mulai, event.mulai) < ATURAN.jendelaBulanHari));
  if (!eventDekat.some((e) => e.kode === kode)) eventDekat.push(event);
  const jumlahEventBulan = eventDekat.length;
  const persenTetap = jumlahEventBulan >= 2 ? ATURAN.bonusTetap.banyakEventPersen : ATURAN.bonusTetap.satuEventPersen / Math.max(1, jumlahTetap);
  const samaN = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  // Berapa event dalam rentang sebulan yang dijaga senior ini (untuk membagi gaji pokok).
  const eventSenior = (nama) => Math.max(1, eventDekat.filter((e) => e.kode === kode
    || tim.some((t) => t.kode_event === e.kode && aktif(t) && t.peran === PERAN.TETAP && samaN(t.nama, nama))).length);
  // Gaji/upah yang sudah dibayar lewat grup (kategori Gaji & Upah) = angka sebenarnya untuk DW & kasir:
  // dicocokkan per nama di keterangan ("bayar gaji tyos"); yang tidak menyebut nama ditampilkan terpisah.
  // Catatan gaji untuk karyawan tetap ("gaji karyawan tetap buat 2 orang", "gaji senior", "gaji pokok imam")
  // dipisah dari upah DW: dipakai sebagai gaji tetap yang sebenarnya dibayar (menggantikan estimasi + bonus).
  const namaTetap = orang.filter((o) => o.peran === PERAN.TETAP).map((o) => String(o.nama).toLowerCase()).filter((n) => n.length >= 3);
  const untukTetap = (t) => {
    const k = String(t.keterangan || '').toLowerCase();
    if (/\b(dw|daily|harian|kasir)\b/.test(k)) return false;
    return /\b(karyawan tetap|kary tetap|tetap|senior|gaji pokok)\b/.test(k) || namaTetap.some((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(k));
  };
  const trxGajiTetap = keluar.filter((t) => t.kategori === KATEGORI.GAJI && untukTetap(t));
  const gajiTetapTercatat = trxGajiTetap.reduce((s, t) => s + num(t.nominal), 0);
  const trxGaji = keluar.filter((t) => t.kategori === KATEGORI.GAJI && !trxGajiTetap.includes(t));
  const pakaiGajiTercatat = trxGaji.length > 0;
  const kataNama = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const terpakaiTrx = new Set();
  const gajiDari = (nama) => {
    const n = kataNama(nama);
    if (!n.length || n.join('').length < 3) return 0;
    return trxGaji.filter((t) => {
      const k = kataNama(t.keterangan);
      const cocok = n.every((w) => k.includes(w));
      if (cocok && !terpakaiTrx.has(t)) { terpakaiTrx.add(t); return true; }
      return false;
    }).reduce((s, t) => s + num(t.nominal), 0);
  };
  const barisTim = orang.map((o) => {
    const hariKerja = hariAktif(o, tanggalJualan, event);
    let upahHarian = num(o.upah_harian);
    let upah = 0;
    let bonus = 0;
    if (adalahOwner(o)) {
      upahHarian = 0;
    } else if (o.peran === PERAN.TETAP) {
      // Gaji khusus event dari owner (#gaji) menggantikan estimasi gaji pokok ÷ 30 × hari kerja.
      const khusus = num(o.gaji_event);
      upah = khusus || ATURAN.gajiPokokTetap / eventSenior(o.nama);
      upahHarian = upah / Math.max(1, hariKerja.length);
      // Gaji khusus event (#gaji) = total yang diterima (tanpa bonus omzet tambahan).
      if (!khusus && omzetBersih > ATURAN.bonusTetap.batasOmzet) bonus = (omzetBersih * persenTetap) / 100;
    } else if ((o.peran === PERAN.DW || o.peran === PERAN.KASIR) && pakaiGajiTercatat) {
      upah = gajiDari(o.nama);
      upahHarian = hariKerja.length ? upah / hariKerja.length : 0;
    } else if (o.peran === PERAN.DW || o.peran === PERAN.KASIR) {
      upah = upahHarian * hariKerja.length;
      const tabel = o.peran === PERAN.DW ? ATURAN.bonusDw : ATURAN.bonusKasir;
      bonus = hariKerja.reduce((s, t) => s + bonusBertingkat(tabel, omzetPerHari.get(t) || 0, o.peran === PERAN.KASIR), 0);
    }
    return { nama: o.nama, peran: o.peran, hari: hariKerja.length, upahHarian, upah, bonus, status: o.status, owner: adalahOwner(o) };
  });
  if (pakaiGajiTercatat && omzetTotal) {
    // Rekap event lama: hari kerja DW tidak tercatat; upah DW = total catatan gaji dari rekapan PIC, satu baris.
    const dw = barisTim.filter((o) => o.peran === PERAN.DW || o.peran === PERAN.KASIR);
    for (const o of dw) barisTim.splice(barisTim.indexOf(o), 1);
    barisTim.push({
      nama: `DW & kasir${dw.length ? ` (${dw.map((o) => o.nama).join(', ')})` : ''} – sesuai catatan gaji PIC`, peran: 'DW', hari: 0, hariTidakTercatat: true,
      upahHarian: 0, upah: trxGaji.reduce((s, t) => s + num(t.nominal), 0), bonus: 0, status: 'AKTIF', owner: false, catatanGaji: true,
    });
  } else if (pakaiGajiTercatat) {
    const sisaTrx = trxGaji.filter((t) => !terpakaiTrx.has(t));
    const sisa = sisaTrx.reduce((s, t) => s + num(t.nominal), 0);
    if (sisa) barisTim.push({ nama: `Gaji tanpa nama cocok (${sisaTrx.map((t) => t.id).join(', ')})`, peran: 'DW', hari: 0, upahHarian: 0, upah: sisa, bonus: 0, status: 'AKTIF', owner: false, catatanGaji: true });
  }
  // Gaji tetap yang dicatat di grup menggantikan estimasi (dan bonus) karyawan tetap.
  if (gajiTetapTercatat) {
    const tetapBaris = barisTim.filter((o) => o.peran === PERAN.TETAP);
    for (const o of tetapBaris) { o.upah = gajiTetapTercatat / tetapBaris.length; o.bonus = 0; o.upahHarian = o.upah / Math.max(1, o.hari); o.dariCatatan = true; }
    if (!tetapBaris.length) barisTim.push({ nama: 'Karyawan tetap – sesuai catatan gaji', peran: PERAN.TETAP, hari: 0, hariTidakTercatat: true, upahHarian: 0, upah: gajiTetapTercatat, bonus: 0, status: 'AKTIF', owner: false, catatanGaji: true });
  }
  const gajiTetap = barisTim.filter((o) => o.peran === PERAN.TETAP).reduce((s, o) => s + o.upah, 0);
  const upahHarian = barisTim.filter((o) => o.peran === PERAN.DW || o.peran === PERAN.KASIR).reduce((s, o) => s + o.upah, 0);
  const totalBonus = barisTim.reduce((s, o) => s + o.bonus, 0);
  const gajiTercatat = trxGaji.reduce((s, t) => s + num(t.nominal), 0);

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
    ['Gaji karyawan tetap (porsi event)', gajiTetap, gajiTetapTercatat
      ? `Dibayar lewat grup: ${trxGajiTetap.map((t) => `${t.id} ${t.keterangan}`).join(', ')}`
      : orang.some((o) => o.peran === PERAN.TETAP && num(o.gaji_event))
      ? `Gaji khusus event: ${orang.filter((o) => o.peran === PERAN.TETAP).map((o) => `${o.nama} ${num(o.gaji_event) ? num(o.gaji_event).toLocaleString('id-ID') : 'gaji pokok'}`).join(', ')}`
      : `Gaji pokok 2,5 jt/bulan ÷ jumlah event yang dijaga dalam sebulan (${jumlahEventBulan} event dalam sebulan ini)`],
    // Gaji/upah yang sudah dibayar lewat grup (kategori Gaji & Upah) adalah angka sebenarnya, jadi dipakai
    // menggantikan estimasi dari daftar tim; sama dengan #rekap. Estimasi hanya kalau belum ada catatan.
    ['Upah DW + kasir', gajiTercatat || upahHarian, gajiTercatat
      ? `Dibayar lewat grup (${trxGaji.length} catatan), dicocokkan per nama di tabel Tim & Gaji`
      : 'Estimasi dari daftar tim'],
    ['Estimasi bonus (poin KPI 100%)', totalBonus, omzetBersih > ATURAN.bonusTetap.batasOmzet
      ? `Senior: ${jumlahEventBulan >= 2 ? '1% omzet kotor per orang (2+ event dalam sebulan)' : `0,5% omzet kotor dibagi ${Math.max(1, jumlahTetap)} senior (1 event dalam sebulan)`}`
      : 'Senior: omzet kotor belum di atas 100 jt, tidak ada bonus'],
    ['Iklan & endorse', jumlahKategori(KATEGORI.IKLAN), ''],
    ['Tak terduga', jumlahKategori(KATEGORI.TAK_TERDUGA), 'Sakit, ganti rugi, lain-lain'],
    ['Lain-lain', lainnya, ''],
  ];
  const totalBiaya = biaya.reduce((s, b) => s + b[1], 0);
  const labaSebelumFee = omzetBersih - totalBiaya + nilaiSisaKembali;
  // Fee PIC hanya untuk PIC yang bukan owner.
  const picBerhakFee = orang.filter((o) => o.peran === PERAN.PIC && !adalahOwner(o));
  // Fee PIC khusus event (#feepic 20) menimpa aturan kehadiran owner.
  const feeKhusus = event.fee_pic_persen === '' || event.fee_pic_persen == null ? null : num(event.fee_pic_persen);
  const feePicPersen = picBerhakFee.length ? (feeKhusus ?? persenFeePic(event.owner_hadir, jumlahTetap)) : 0;
  const feePic = labaSebelumFee > 0 ? (labaSebelumFee * feePicPersen) / 100 : 0;
  const laba = labaSebelumFee - feePic;
  const namaPic = picBerhakFee.map((o) => o.nama);

  const nilaiGratis = barisGratis.reduce((s, g) => s + g.nilai, 0);

  // Per tanggal: omzet bersih vs pengeluaran yang dicatat di grup (tanggal pengeluaran bisa di luar hari jualan).
  const perTanggal = new Map(hari.map((h) => [h.tanggal, { tanggal: h.tanggal, omzet: h.bersih, pengeluaran: 0 }]));
  for (const t of keluar) {
    const tgl = String(t.tanggal || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tgl)) continue;
    if (!perTanggal.has(tgl)) perTanggal.set(tgl, { tanggal: tgl, omzet: 0, pengeluaran: 0 });
    perTanggal.get(tgl).pengeluaran += num(t.nominal);
  }
  // Pengeluaran yang tanggalnya jauh dari masa event (misalnya baru diketik setelah event selesai)
  // dikumpulkan di satu baris terakhir supaya grafik harian tidak menyesatkan.
  const awal = event.mulai ? tambahHari(event.mulai, -7) : '';
  const akhir = event.selesai ? tambahHari(event.selesai, 1) : '';
  const diLuar = { tanggal: 'Di luar tgl event', omzet: 0, pengeluaran: 0 };
  for (const [tgl, h] of perTanggal) {
    if (awal && akhir && h.omzet === 0 && (tgl < awal || tgl > akhir)) {
      diLuar.pengeluaran += h.pengeluaran;
      perTanggal.delete(tgl);
    }
  }
  const harian = [...perTanggal.values()].sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  if (diLuar.pengeluaran) harian.push(diLuar);

  // ---------- Alokasi harian (grafik garis) ----------
  // Per hari jualan: omzet, potongan IO, bahan baku terpakai, gaji & upah, penginapan, biaya lain, laba.
  // Bahan baku dibagi menurut porsi omzet hari itu (pemakaian ikut penjualan); gaji, penginapan, dan biaya lain
  // dibagi rata. Omzet yang diinput sebagai total juga dibagi rata. Jumlah laba semua hari = laba sebelum fee PIC.
  const nilaiBiaya = (awalan) => biaya.filter((b) => String(b[0]).startsWith(awalan)).reduce((s, b) => s + num(b[1]), 0);
  const alokasi = [];
  if (tanggalJualan.length) {
    const n = tanggalJualan.length;
    const omzetHari = new Map(hari.map((h) => [h.tanggal, h.bersih]));
    const omzetDi = (t) => (omzetTotal ? omzetBersih / n : omzetHari.get(t) || 0);
    const bahanNet = nilaiBiaya('Bahan baku') - nilaiSisaKembali;
    const io = nilaiBiaya('Potongan bagi hasil IO');
    const gajiSemua = nilaiBiaya('Gaji karyawan tetap') + nilaiBiaya('Upah DW') + nilaiBiaya('Estimasi bonus');
    const inap = nilaiBiaya('Penginapan');
    const lain = totalBiaya - nilaiBiaya('Bahan baku') - io - gajiSemua - inap;
    for (const t of tanggalJualan) {
      const o = omzetDi(t);
      const porsi = omzetBersih ? o / omzetBersih : 1 / n;
      const baris = { tanggal: t, omzet: o, io: io * porsi, bahan: bahanNet * porsi, gaji: gajiSemua / n, penginapan: inap / n, lain: lain / n };
      baris.laba = o - baris.io - baris.bahan - baris.gaji - baris.penginapan - baris.lain;
      alokasi.push(baris);
    }
  }

  // ---------- Setoran ke PIC: fee + gaji PIC + uang PIC yang terpakai (belum diganti) ----------
  const penggantian = hitungPenggantian(transaksi, kode);
  const samaNama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const setoranPic = picBerhakFee.map((o) => {
    const uang = penggantian.find((u) => samaNama(u.nama, o.nama));
    const gaji = barisTim.find((b) => b.nama === o.nama);
    const k = karyawan.find((x) => samaNama(x.nama, o.nama));
    const fee = feePic / picBerhakFee.length;
    const terpakai = uang ? uang.sisa : 0;
    const upah = gaji ? gaji.upah + gaji.bonus : 0;
    return {
      nama: o.nama, fee, upah, terpakai, dibayar: uang ? uang.dibayar : 0, diganti: uang ? uang.diganti : 0,
      total: fee + upah + terpakai, bank: k?.bank || '', noRekening: String(k?.no_rekening || ''), atasNama: k?.atas_nama || '',
    };
  });

  return {
    alokasi,
    setoranPic,
    event, hari, harian, omzetBersih, biaya, totalBiaya, nilaiSisaKembali, laba, nilaiGratis, jumlahHariJualan: tanggalJualan.length,
    labaSebelumFee, feePic, feePicPersen, namaPic, bagiHasil, potonganIO,
    penggantian,
    barisBahan, barisTim, barisGratis, budgetMakan, makanTerpakai,
    iklan: keluar.filter((t) => t.kategori === KATEGORI.IKLAN),
  };
}

// Baris untuk tab "Data Main": [kode, bagian, urut, c1..c9]. Nilai bukan uang ditulis sebagai teks.
export function barisDataMain(r) {
  const kode = r.event.kode;
  const baris = [];
  // jumlah = indeks kolom yang dijumlahkan di baris TOTAL (paling bawah tabel); total dihitung dari semua data.
  const tambah = (bagian, data, { jumlah = null, label = 0 } = {}) => {
    const batas = BATAS_BARIS[bagian];
    let isiTabel = data.slice(0, batas);
    if (jumlah && data.length) {
      const total = new Array(Math.max(...data.map((d) => d.length))).fill('');
      total[label] = 'TOTAL';
      for (const k of jumlah) total[k] = data.reduce((s, d) => s + (Number(d[k]) || 0), 0);
      isiTabel = [...data.slice(0, batas - 1), total];
    }
    isiTabel.forEach((isi, i) => baris.push([kode, bagian, i + 1, ...isi]));
  };
  // Omzet total (rekap event lama): hari jualan = semua tanggal event.
  const jumlahHari = r.jumlahHariJualan || r.hari.length;
  const margin = r.omzetBersih ? (r.laba / r.omzetBersih) * 100 : 0;

  tambah('INFO', [[`${r.event.kota} | ${r.event.io} | ${r.event.mulai} s/d ${r.event.selesai} | Wilayah ${r.event.wilayah || 'Jawa'} | Bagi hasil ${persen(num(r.event.bagi_hasil_persen))}`]]);
  // Urutan: omzet kotor -> potongan IO -> omzet bersih -> biaya operasional -> laba. 10 baris (batas tabel di sheet).
  const potIO = r.biaya.find((b) => /bagi hasil IO/i.test(b[0]))?.[1] || 0;
  const pBagi = persen(num(r.event.bagi_hasil_persen));
  tambah('RINGKASAN', [
    ['Omzet kotor (setelah refund)', r.omzetBersih],
    [`Potongan bagi hasil IO ${pBagi}`, -potIO],
    [`Omzet bersih (setelah dipotong IO ${pBagi})`, r.omzetBersih - potIO],
    ['Biaya operasional (bahan, gaji, transport, dll. – di luar potongan IO)', -(r.totalBiaya - potIO)],
    ['Sisa bahan dikembalikan ke gudang (mengurangi biaya)', r.nilaiSisaKembali],
    ['Laba sebelum fee PIC', r.labaSebelumFee],
    [`Fee PIC ${r.feePicPersen}%${r.namaPic.length ? ` (${r.namaPic.join(', ')})` : ''}`, -r.feePic],
    ['LABA BERSIH', r.laba],
    ['Status', `${r.laba >= 0 ? '✅ UNTUNG' : '❌ RUGI'} · margin ${persen(Number(margin.toFixed(1)))}`],
    ['Hari jualan', `${jumlahHari} hari · laba per hari Rp ${Math.round(jumlahHari ? r.laba / jumlahHari : 0).toLocaleString('id-ID')}`],
  ]);
  tambah('OMZET', r.hari.map((h) => [
    h.tanggal, NAMA_HARI[hariDalamMinggu(h.tanggal)], h.omzet, h.transaksi, h.refund, h.potongan, h.perkiraan, h.diterima, h.perkiraan - h.diterima,
  ]), { jumlah: [2, 3, 4, 5, 6, 7, 8] });
  tambah('BIAYA', r.biaya.map(([nama, nilai, ket], i) => [String(i + 1), nama, nilai, ket]), { jumlah: [2], label: 1 });
  tambah('MAKAN', [[r.budgetMakan, r.makanTerpakai, r.budgetMakan - r.makanTerpakai,
    r.budgetMakan - r.makanTerpakai >= 0 ? 'Sisa untuk makan bersama di akhir event' : '⚠️ Melebihi budget']]);
  tambah('TIM', r.barisTim.map((o) => [o.nama, o.peran + (o.owner ? ' (owner, tidak digaji)' : '') + (o.status === 'BERHENTI' ? ' (berhenti)' : ''), o.hariTidakTercatat ? '-' : `${o.hari} hari`, o.hariTidakTercatat ? '' : o.upahHarian, o.upah, o.bonus, o.upah + o.bonus]), { jumlah: [4, 5, 6] });
  tambah('IKLAN', r.iklan.map((t) => [t.tanggal, t.keterangan, Number(t.nominal) || 0]), { jumlah: [2] });
  const sisaGratis = ATURAN.budgetPorsiGratis - r.nilaiGratis;
  tambah('GRATIS_INFO', [[`Budget ${ATURAN.budgetPorsiGratis.toLocaleString('id-ID')} | terpakai ${r.nilaiGratis.toLocaleString('id-ID')} | ${sisaGratis >= 0 ? `sisa ${sisaGratis.toLocaleString('id-ID')}` : `⚠️ lebih ${(-sisaGratis).toLocaleString('id-ID')}`}`]]);
  tambah('GRATIS', r.barisGratis.map((g) => [g.tanggal, g.menu, g.porsi === '' ? '' : String(g.porsi), `${g.pcs} pcs`, g.harga, g.nilai, g.untuk]), { jumlah: [5] });
  // Komposisi untuk grafik batang & pie (urutan tetap, lihat KELOMPOK_GRAFIK): [nama, nilai, porsi].
  // Porsi = pecahan dari total biaya (ditampilkan sebagai %); untuk laba bersih = margin.
  const b = Object.fromEntries(r.biaya.map(([nama, nilai]) => [nama, nilai]));
  const nilaiKelompok = {
    'Bahan baku': b['Bahan baku'] + b['Bahan operasional (es, gas, lemon)'],
    Transport: b['Transport & ekspedisi'],
    'Makan & minum': b.Konsumsi,
    'Gaji & bonus': b['Gaji karyawan tetap (porsi event)'] + b['Upah DW + kasir'] + b['Estimasi bonus (poin KPI 100%)'] + r.feePic,
    'Bagi hasil IO': b['Potongan bagi hasil IO'] + b['Admin IO + listrik/air/gas/galon'],
    Iklan: b['Iklan & endorse'],
    'Barang kering': b['Barang kering konsumtif'] + b['Barang kering non-konsumtif ⚠️ kelalaian'],
    Penginapan: b.Penginapan,
    'Sewa & admin': b['Admin & sewa (freezer, kuota, cctv, laundry)'],
  };
  const dipakai = Object.values(nilaiKelompok).reduce((s, v) => s + v, 0) - r.feePic;
  nilaiKelompok['Tak terduga dll'] = Math.max(0, r.totalBiaya - dipakai);
  const semuaBiaya = r.totalBiaya + r.feePic;
  tambah('GRAFIK', [
    ['Omzet', r.omzetBersih, ''],
    ...KELOMPOK_GRAFIK.map(({ nama }) => [nama, nilaiKelompok[nama], semuaBiaya ? nilaiKelompok[nama] / semuaBiaya : 0]),
    ['Laba bersih (margin)', r.laba, r.omzetBersih ? r.laba / r.omzetBersih : 0],
  ]);
  tambah('HARIAN', r.harian.map((h) => [h.tanggal, h.omzet, h.pengeluaran, h.omzet - h.pengeluaran]));
  const bulat = (x) => Math.round(x);
  tambah('ALOKASI', (r.alokasi || []).map((a) => [a.tanggal, bulat(a.omzet), bulat(a.io), bulat(a.bahan), bulat(a.gaji), bulat(a.penginapan), bulat(a.lain), bulat(a.laba)]));
  tambah('UANG', r.penggantian.map((u) => [u.nama, u.dibayar, u.diganti, u.sisa, `${u.catatan} catatan`]), { jumlah: [1, 2, 3] });
  // Tabel setoran ke PIC (kanan ringkasan): [keterangan, nilai].
  const setor = [];
  for (const p of r.setoranPic || []) {
    setor.push([`PIC: ${p.nama}`, '']);
    setor.push([`Fee PIC ${r.feePicPersen}% dari laba sebelum fee`, Math.round(p.fee)]);
    if (p.upah) setor.push(['Gaji / bonus PIC', Math.round(p.upah)]);
    setor.push([`Uang PIC yang terpakai (keluar ${Math.round(p.dibayar).toLocaleString('id-ID')}${p.diganti ? `, sudah diganti ${Math.round(p.diganti).toLocaleString('id-ID')}` : ''})`, Math.round(p.terpakai)]);
    setor.push(['TOTAL DITRANSFER KE PIC', Math.round(p.total)]);
    setor.push(['Rekening', p.noRekening ? `${p.bank} ${p.noRekening}`.trim() : 'Belum ada – bot menanyakan ke PIC (#rekening)']);
    if (p.noRekening) setor.push(['Atas nama', p.atasNama || p.nama]);
  }
  tambah('SETOR', setor);
  tambah('BAHAN', r.barisBahan.map((b) => [b.bahan, b.satuan, String(b.keluar), String(b.restock), String(b.kembali), String(b.terpakai), b.harga, b.nilaiTerpakai, b.nilaiKembali]), { jumlah: [7, 8] });
  return baris;
}
