// Hitungan bahan baku event, dipakai #rekap, balasan bot, dan file event (supaya angkanya selalu sama).
//
// Biaya bahan = (awal + restock) × harga tab Harga Bahan − nilai sisa.
// Nilai sisa memakai harga per satuan yang disebut owner saat bot bertanya ("sisa keju dihargai berapa?").
// Kalau belum dijawab, dipakai harga tab Harga Bahan.
//
// Bahan yang DIBELI di lokasi (oyster dari supplier) bukan barang gudang: tidak dicatat sebagai awal/restock,
// karena pembeliannya sudah tercatat sebagai pengeluaran. Sisanya tetap boleh dicatat (mengurangi biaya).

export const BAHAN_DIBELI = ['Oyster'];

const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? 0 : Number(v));
const adaHarga = (v) => v !== '' && v !== null && v !== undefined && !Number.isNaN(Number(v));

// rows = baris tab "Bahan Event" milik satu event (yang aktif). Mengembalikan per bahan.
export function hitungBahan(rows, hargaBahan) {
  const harga = new Map(hargaBahan.map((b) => [b.bahan, b]));
  const nama = [...new Set(rows.map((r) => r.bahan))];
  return nama.map((n) => {
    const g = rows.filter((r) => r.bahan === n);
    const total = (j) => g.filter((r) => r.gerak === j).reduce((s, r) => s + num(r.jumlah), 0);
    const h = num(harga.get(n)?.harga);
    const awal = total('Keluar');
    const restock = total('Restock');
    const sisaRows = g.filter((r) => r.gerak === 'Kembali');
    const sisa = sisaRows.reduce((s, r) => s + num(r.jumlah), 0);
    // Sisa barang gudang tanpa stok awal/restock belum bisa dihitung (biaya bahannya belum tercatat):
    // nilainya 0 sampai stok awal diinput. Bahan yang dibeli di lokasi (oyster) tetap dihitung.
    const dibeli = BAHAN_DIBELI.includes(n);
    const sisaTanpaAwal = !dibeli && sisa > 0 && awal + restock === 0;
    const nilaiSisa = sisaTanpaAwal ? 0 : sisaRows.reduce((s, r) => s + num(r.jumlah) * (adaHarga(r.harga_satuan) ? num(r.harga_satuan) : h), 0);
    const nilaiBawa = (awal + restock) * h;
    return {
      bahan: n, satuan: harga.get(n)?.satuan || g[0]?.satuan || '', harga: h,
      awal, restock, sisa, terpakai: sisaTanpaAwal ? 0 : awal + restock - sisa,
      nilaiBawa, nilaiSisa, nilaiTerpakai: nilaiBawa - nilaiSisa,
      sisaBelumDihargai: sisaRows.some((r) => !adaHarga(r.harga_satuan)),
      sisaTanpaAwal,
      dibeli,
      // nama lama (laporan.js / pembukuan.js)
      keluar: awal, kembali: sisa, nilaiKembali: nilaiSisa,
    };
  });
}
