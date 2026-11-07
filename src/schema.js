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
      k('sumber', 'Sumber', 95, { catatan: 'teks = diketik di grup, foto+teks = dikirim dengan foto' }),
      k('pengirim', 'Dicatat Oleh', 200),
      k('status', 'Status', 85, { catatan: 'OK = dihitung, BATAL = tidak dihitung. Jangan hapus baris; ganti saja menjadi BATAL' }),
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
};

// Nilai lama (versi awal bot) yang otomatis dibaca sebagai nilai baru.
export const JENIS_LAMA = { KELUAR: JENIS.KELUAR, MASUK_IO: JENIS.MASUK_IO, POTONGAN_IO: JENIS.POTONGAN_IO };

export const STATUS = { OK: 'OK', BATAL: 'BATAL', CEK: 'CEK' };
