// Struktur tab Google Sheets. Baris pertama tiap tab adalah judul kolom ini.
// Owner boleh mengubah isi sel langsung di Sheets; jangan mengubah judul kolom.

export const TABS = {
  Grup: ['group_id', 'nama_grup', 'jenis', 'kode_event', 'didaftarkan_oleh', 'tanggal'],
  Event: [
    'kode', 'kota', 'io', 'mulai', 'selesai', 'wilayah', 'target_omzet',
    'bagi_hasil_persen', 'admin', 'jadwal_trf', 'jam_buka', 'pic', 'senior', 'dw', 'kasir',
    'status', 'dibuat',
  ],
  Transaksi: [
    'id', 'tanggal', 'kode_event', 'buku', 'jenis', 'kategori', 'keterangan', 'nominal',
    'metode', 'sumber', 'pengirim', 'status', 'dicatat',
  ],
  Omzet: [
    'tanggal', 'kode_event', 'omzet', 'jumlah_transaksi', 'refund', 'catatan', 'pengirim',
    'status', 'dicatat',
  ],
};

// Jenis grup WhatsApp yang bisa didaftarkan.
export const JENIS_GRUP = ['pengeluaran', 'event', 'gudang', 'ruko'];

// Buku pembukuan: event (per kota) atau ruko (gaji tetap, listrik, air, sewa).
export const BUKU = { EVENT: 'EVENT', RUKO: 'RUKO' };

// Jenis transaksi.
export const JENIS = {
  KELUAR: 'KELUAR',           // pengeluaran
  MASUK_IO: 'MASUK_IO',       // transfer omzet dari IO
  POTONGAN_IO: 'POTONGAN_IO', // listrik/air/gas/galon yang dipotong IO
};

export const STATUS = { OK: 'OK', BATAL: 'BATAL', CEK: 'CEK' };
