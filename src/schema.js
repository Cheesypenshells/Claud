// Struktur tab Google Sheets.
// Setiap kolom punya `key` (dipakai kode) dan `label` (judul yang terlihat di Sheets).
// Owner boleh mengubah isi sel langsung di Sheets; jangan mengubah judul kolom.
//
// Format kolom: 'rupiah' | 'persen' | 'angka' | undefined (teks biasa)

const k = (key, label, lebar, opsi = {}) => ({ key, label, lebar, ...opsi });

export const KOLOM = {
  Event: {
    warna: '#E8710A',
    kolom: [
      k('kode', 'Kode Event', 110, { catatan: 'Kode unik event, contoh JMB26-11 (Jambi, November 2026)' }),
      k('kota', 'Kota', 110),
      k('io', 'Event Organizer (IO)', 170),
      k('mulai', 'Tanggal Mulai', 115),
      k('selesai', 'Tanggal Selesai', 120),
      k('wilayah', 'Wilayah Harga', 115, { catatan: 'Jawa / Sumatra (+5rb) / Kalimantan (+10rb)' }),
      k('target_omzet', 'Target Omzet', 140, { format: 'rupiah' }),
      k('bagi_hasil_persen', 'Bagi Hasil IO', 115, { format: 'persen', catatan: 'Potongan omzet oleh IO, biasanya 25–30%' }),
      k('admin', 'Biaya Admin IO', 130, { format: 'rupiah' }),
      k('jadwal_trf', 'Jadwal Transfer', 130, { catatan: 'HARIAN = H+1, omzet Jumat–Minggu dibayar Senin. AKHIR = sekali setelah event selesai' }),
      k('jam_buka', 'Jam Buka', 90),
      k('pic', 'PIC', 110),
      k('senior', 'Senior', 160),
      k('dw', 'Daily Worker', 160),
      k('kasir', 'Kasir', 110),
      k('status', 'Status', 95, { catatan: 'AKTIF atau SELESAI' }),
      k('dibuat', 'Dibuat', 140),
      k('owner_hadir', 'Kehadiran Owner', 130, { catatan: 'tidak / 1 hari / setengah / penuh. Menentukan fee PIC: 25% / 20% / 15% / 10% dari laba bersih. Diubah lewat #owner di grup' }),
      k('file_event', 'ID File Event', 200, { catatan: 'Diisi otomatis oleh bot: spreadsheet event di folder EVENT', sembunyi: true }),
    ],
  },
  Transaksi: {
    warna: '#0B8043',
    kolom: [
      k('id', 'No. Catatan', 105, { catatan: 'Nomor catatan dari bot. Untuk membatalkan: ketik #batal T0001 di grup' }),
      k('tanggal', 'Tanggal', 105),
      k('kode_event', 'Kode Event', 110, { catatan: 'RUKO = biaya ruko (gaji tetap, listrik, air, sewa)' }),
      k('buku', 'Buku', 80, { catatan: 'EVENT = pembukuan event, RUKO = pembukuan ruko' }),
      k('jenis', 'Jenis', 130, { catatan: 'Pengeluaran, Transfer IO (uang masuk dari IO), atau Potongan IO (listrik/air/gas/galon)' }),
      k('kategori', 'Kategori', 170),
      k('keterangan', 'Keterangan', 260),
      k('nominal', 'Nominal', 135, { format: 'rupiah' }),
      k('metode', 'Metode Bayar', 115),
      k('dibayar_oleh', 'Uang Siapa', 130, { catatan: 'Siapa yang mengeluarkan uang: PIC, Mama, karyawan, George, atau Kas usaha. Dipakai untuk menghitung penggantian. Ubah lewat #uang T0012 mama' }),
      k('sumber', 'Sumber', 95, { catatan: 'teks = diketik di grup, foto+teks = dikirim dengan foto' }),
      k('pengirim', 'Dicatat Oleh', 200),
      k('status', 'Status', 85, { catatan: 'OK = dihitung, BATAL = tidak dihitung. Jangan hapus baris; ganti saja menjadi BATAL' }),
      k('dicatat', 'Waktu Dicatat', 140),
      k('bukti', 'Bukti', 170, { catatan: 'Struk ✓ = struk dicek bot (nominal, tanggal, toko). ACC owner = tanpa struk / struk tidak sesuai tapi disetujui owner. Wajib untuk pengeluaran >= Rp 100.000' }),
    ],
  },
  // ---------- KPI karyawan ----------
  // Data karyawan (diisi owner). PIN disimpan dalam bentuk acak (hash), tidak bisa dibaca.
  Karyawan: {
    warna: '#3949AB',
    kolom: [
      k('kode', 'Kode', 80, { catatan: 'Kode kartu, contoh K01' }),
      k('nama', 'Nama', 150, { catatan: 'Sama persis dengan nama di tim event' }),
      k('nomor_wa', 'Nomor WA', 140, { catatan: '0812... atau 62812...' }),
      k('peran', 'Peran', 100, { catatan: 'Tetap / PIC / DW / Kasir' }),
      k('keahlian', 'Keahlian', 240, { catatan: 'Jago di bagian apa, contoh: grill, kasir, closing pembeli' }),
      k('foto', 'Foto (link)', 200),
      k('mulai_kerja', 'Mulai Kerja', 110),
      k('status', 'Status', 90, { catatan: 'AKTIF / KELUAR' }),
      k('pin', 'PIN (terkunci)', 120, { catatan: 'Diisi bot saat karyawan membuat PIN. Jangan diubah.', sembunyi: true }),
      k('catatan', 'Catatan', 200),
    ],
  },
  // Penilaian PIC per event (skala 1-5 atau persen 0-100). Baris bernama TIM = nilai kinerja tim.
  'Nilai KPI': {
    warna: '#3949AB',
    kolom: [
      k('kode_event', 'Kode Event', 110),
      k('nama', 'Nama', 150, { catatan: 'TIM = nilai kinerja tim keseluruhan' }),
      k('absen', 'Absen (20%)', 100, { catatan: '1-5 atau 0-100' }),
      k('kinerja', 'Performa Kinerja (40%)', 140),
      k('attitude', 'Attitude (20%)', 105),
      k('karir', 'Karir (20%)', 100),
      k('tim', 'Kinerja Tim', 100, { catatan: 'Hanya di baris TIM, 1-5' }),
      k('catatan', 'Catatan', 220),
      k('penilai', 'Dinilai Oleh', 160),
      k('status', 'Status', 85),
      k('dicatat', 'Waktu Dicatat', 140),
    ],
  },
  // Poin plus / minus (contoh: SOP tidak dikerjakan -10, bantu masak bumbu +20).
  'Poin KPI': {
    warna: '#3949AB',
    kolom: [
      k('id', 'No.', 80),
      k('tanggal', 'Tanggal', 105),
      k('nama', 'Nama', 150),
      k('poin', 'Poin', 80, { format: 'angka' }),
      k('alasan', 'Alasan', 260),
      k('kode_event', 'Kode Event', 110),
      k('dicatat_oleh', 'Dicatat Oleh', 180),
      k('status', 'Status', 85, { catatan: 'OK / BATAL' }),
      k('dicatat', 'Waktu Dicatat', 140),
    ],
  },
  // Pengiriman & stok awal event (loading in).
  Pengiriman: {
    warna: '#6D4C41',
    kolom: [
      k('kode_event', 'Kode Event', 110),
      k('tanggal', 'Tanggal', 105),
      k('penanggung_jawab', 'Penanggung Jawab', 150),
      k('moda', 'Dikirim Pakai', 140, { catatan: 'Truk / Kereta (transit) / lainnya' }),
      k('koli_kering', 'Koli Bahan Kering', 120, { format: 'angka' }),
      k('isi_kering', 'Isi Bahan Kering', 320),
      k('koli_baku', 'Koli Bahan Baku', 120, { format: 'angka' }),
      k('rincian', 'Isi Bahan Baku', 320),
      k('pengirim', 'Dicatat Oleh', 190),
      k('status', 'Status', 85),
      k('dicatat', 'Waktu Dicatat', 140),
    ],
  },
  // Absensi foto harian tim event (denda telat per hari).
  Absensi: {
    warna: '#00897B',
    kolom: [
      k('tanggal', 'Tanggal', 105),
      k('kode_event', 'Kode Event', 110),
      k('nama', 'Nama', 140),
      k('peran', 'Peran', 90),
      k('nomor_wa', 'Nomor WA', 130),
      k('jam', 'Jam Absen', 100),
      k('batas', 'Batas Absen', 100, { catatan: '1 jam sebelum booth buka' }),
      k('telat_menit', 'Telat (menit)', 100, { format: 'angka' }),
      k('denda', 'Denda', 110, { format: 'rupiah', catatan: '1-15 mnt 10rb · 16-30 mnt 25rb · >30 mnt 50rb per jam (kelipatan). Ubah ke 0 kalau dimaafkan' }),
      k('gaya', 'Gaya Foto', 220),
      k('foto_id', 'ID Foto', 160, { sembunyi: true }),
      k('sidik', 'Sidik Foto', 160, { sembunyi: true }),
      k('status', 'Status', 90, { catatan: 'OK / DITOLAK' }),
      k('catatan', 'Catatan', 200),
      k('dicatat', 'Waktu Dicatat', 140),
    ],
  },
  // Struk yang sudah dipakai: supaya satu struk tidak dipakai dua kali.
  Struk: {
    warna: '#795548',
    kolom: [
      k('id_transaksi', 'No. Catatan', 105),
      k('kode_event', 'Kode Event', 110),
      k('tanggal', 'Tanggal Struk', 115),
      k('nominal', 'Nominal', 130, { format: 'rupiah' }),
      k('toko', 'Toko / Merek', 200),
      k('referensi', 'No. Referensi', 170),
      k('hash', 'Sidik Foto', 150, { catatan: 'Sidik digital foto struk (foto yang sama persis akan terdeteksi)', sembunyi: true }),
      k('dicatat', 'Waktu Dicatat', 140),
    ],
  },
  Omzet: {
    warna: '#1A73E8',
    kolom: [
      k('tanggal', 'Tanggal Jualan', 120),
      k('kode_event', 'Kode Event', 110),
      k('omzet', 'Omzet', 140, { format: 'rupiah' }),
      k('jumlah_transaksi', 'Jumlah Transaksi', 135, { format: 'angka' }),
      k('refund', 'Refund / Koreksi', 135, { format: 'rupiah' }),
      k('catatan', 'Catatan', 260),
      k('pengirim', 'Dilaporkan Oleh', 200),
      k('status', 'Status', 85, { catatan: 'OK = dihitung. BATAL = laporan lama yang sudah diganti laporan baru di tanggal yang sama' }),
      k('dicatat', 'ID Laporan', 160, { sembunyi: true }),
    ],
  },
  'Tim Event': {
    warna: '#8E24AA',
    kolom: [
      k('kode_event', 'Kode Event', 110),
      k('nama', 'Nama', 150),
      k('peran', 'Peran', 100, { catatan: 'PIC / Tetap (karyawan tetap) / DW (daily worker) / Kasir' }),
      k('upah_harian', 'Upah per Hari', 130, { format: 'rupiah', catatan: 'DW & kasir standar Rp 100.000; PIC & karyawan tetap 0 (karyawan tetap digaji bulanan)' }),
      k('mulai', 'Mulai Kerja', 115),
      k('selesai', 'Selesai Kerja', 115, { catatan: 'Kosong = sampai event selesai. Diisi otomatis kalau ada #berhenti' }),
      k('status', 'Status', 95, { catatan: 'AKTIF / BERHENTI' }),
      k('catatan', 'Catatan', 220),
      k('dicatat', 'Waktu Dicatat', 140),
    ],
  },
  'Bahan Event': {
    warna: '#C2185B',
    kolom: [
      k('tanggal', 'Tanggal', 105),
      k('kode_event', 'Kode Event', 110),
      k('bahan', 'Bahan', 140),
      k('gerak', 'Keluar / Restock / Kembali', 150, { catatan: 'Keluar = dibawa dari gudang ke event, Restock = tambahan di tengah event, Kembali = sisa dikembalikan ke gudang' }),
      k('jumlah', 'Jumlah', 90),
      k('satuan', 'Satuan', 85),
      k('pengirim', 'Dicatat Oleh', 200),
      k('status', 'Status', 85),
      k('dicatat', 'Waktu Dicatat', 140),
    ],
  },
  'Porsi Gratis': {
    warna: '#F9AB00',
    kolom: [
      k('tanggal', 'Tanggal', 105),
      k('kode_event', 'Kode Event', 110),
      k('menu', 'Menu', 160),
      k('porsi', 'Porsi', 75, { format: 'angka' }),
      k('isi', 'Isi per Porsi (pcs)', 120, { format: 'angka' }),
      k('pcs', 'Total pcs', 90, { format: 'angka' }),
      k('untuk', 'Diberikan Untuk', 220),
      k('pengirim', 'Dicatat Oleh', 200),
      k('status', 'Status', 85),
      k('dicatat', 'Waktu Dicatat', 140),
    ],
  },
  'Harga Bahan': {
    warna: '#795548',
    kolom: [
      k('bahan', 'Bahan', 150),
      k('satuan', 'Satuan', 90),
      k('harga', 'Harga per Satuan', 140, { format: 'rupiah' }),
      k('alias', 'Kata yang Dikenali Bot', 320, { catatan: 'Kata-kata di chat yang dibaca sebagai bahan ini, dipisah koma' }),
    ],
  },
  'Harga Menu': {
    warna: '#795548',
    kolom: [
      k('menu', 'Menu', 170),
      k('jawa', 'Harga Jual Jawa (per pcs)', 160, { format: 'rupiah' }),
      k('sumatra', 'Harga Jual Sumatra (per pcs)', 170, { format: 'rupiah' }),
      k('kalimantan', 'Harga Jual Kalimantan (per pcs)', 185, { format: 'rupiah' }),
      k('alias', 'Kata yang Dikenali Bot', 320),
    ],
  },
  'Kamus Kategori': {
    warna: '#795548',
    kolom: [
      k('kata', 'Kata / Keterangan', 220, { catatan: 'Kalau keterangan pengeluaran mengandung kata ini, bot memakai kategori di sebelahnya' }),
      k('kategori', 'Kategori', 220),
      k('dicatat', 'Dipelajari Dari', 260),
    ],
  },
  Pengaturan: {
    warna: '#5F6368',
    kolom: [
      k('kunci', 'Pengaturan', 160),
      k('nilai', 'Nilai', 380),
      k('keterangan', 'Keterangan', 360),
    ],
  },
  Grup: {
    warna: '#5F6368',
    kolom: [
      k('group_id', 'ID Grup WA', 220, { sembunyi: true }),
      k('nama_grup', 'Nama Grup WhatsApp', 220),
      k('jenis', 'Jenis Grup', 120, { catatan: 'pengeluaran / event (tim) / ruko / gudang' }),
      k('kode_event', 'Kode Event', 110),
      k('didaftarkan_oleh', 'Didaftarkan Oleh', 200),
      k('tanggal', 'Tanggal Daftar', 140),
    ],
  },
};

// Tab hasil hitungan bot untuk sheet Main (disembunyikan). Kolom c1..c9 isinya berbeda per bagian.
export const TAB_DATA_MAIN = 'Data Main';
export const KOLOM_DATA_MAIN = ['kode', 'bagian', 'urut', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'];

// Daftar key per tab (dipakai MemoryStore dan untuk urutan kolom).
export const TABS = Object.fromEntries(
  Object.entries(KOLOM).map(([tab, def]) => [tab, def.kolom.map((c) => c.key)]),
);

// Jenis grup WhatsApp yang bisa didaftarkan.
export const JENIS_GRUP = ['pengeluaran', 'event', 'gudang', 'ruko'];

// Buku pembukuan: event (per kota) atau ruko (gaji tetap, listrik, air, sewa).
export const BUKU = { EVENT: 'EVENT', RUKO: 'RUKO' };

// Jenis transaksi (nilai ini yang terlihat di Sheets).
export const JENIS = {
  KELUAR: 'Pengeluaran',
  MASUK_IO: 'Transfer IO',
  POTONGAN_IO: 'Potongan IO',
  PENGGANTIAN: 'Penggantian', // owner mengganti uang yang dipakai PIC/keluarga/karyawan (bukan biaya)
};

export const KAS_USAHA = 'Kas usaha';

// Nilai lama (versi awal bot) yang otomatis dibaca sebagai nilai baru.
export const JENIS_LAMA = { KELUAR: JENIS.KELUAR, MASUK_IO: JENIS.MASUK_IO, POTONGAN_IO: JENIS.POTONGAN_IO };

export const STATUS = { OK: 'OK', BATAL: 'BATAL', CEK: 'CEK' };
