// Daftar bahan baku dan menu beserta harga awal.
// Harga yang dipakai bot dibaca dari tab "Harga Bahan" dan "Harga Menu" (bisa diubah owner);
// daftar di sini hanya untuk mengisi tab itu pertama kali.

export const BAHAN_AWAL = [
  { bahan: 'Oyster', satuan: 'kg', harga: 15000, alias: 'oyster, tiram' },
  { bahan: 'Mozzarella', satuan: 'pack', harga: 234000, alias: 'mozzarella, mozarella, mozza, keju mozzarella, keju' },
  { bahan: 'Bumbu Garlic', satuan: 'pack', harga: 500000, alias: 'bumbu garlic, garlic, bumbu putih' },
  { bahan: 'Bumbu Merah', satuan: 'pack', harga: 500000, alias: 'bumbu merah, sweet n spicy, sweet spicy, pedas manis' },
  { bahan: 'Topping Cumi', satuan: 'kantong', harga: 150000, alias: 'topping cumi, topping, cumi' },
  { bahan: 'Saus Keju', satuan: 'kg', harga: 38000, alias: 'saus keju, saos keju, saus' },
];

// Harga jual per pcs. Sumatra +5.000, Kalimantan +10.000 dari harga Jawa.
export const MENU_AWAL = [
  { menu: 'Garlic', jawa: 15000, sumatra: 20000, kalimantan: 25000, alias: 'garlic' },
  { menu: 'Sweet n Spicy', jawa: 15000, sumatra: 20000, kalimantan: 25000, alias: 'sweet n spicy, sweet spicy, sweet, spicy, pedas manis' },
  { menu: 'Mozzarella', jawa: 20000, sumatra: 25000, kalimantan: 30000, alias: 'mozzarella, mozarella, mozza, keju' },
  { menu: 'Seafood Mozzarella', jawa: 25000, sumatra: 30000, kalimantan: 35000, alias: 'seafood mozzarella, seafood mozza, seafood, cumi' },
  { menu: 'Fresh Oyster', jawa: 30000, sumatra: 35000, kalimantan: 40000, alias: 'fresh oyster, fresh, mentah' },
];

function daftarAlias(item, nama) {
  return [nama, ...String(item.alias || '').split(',')]
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
}

// Cari item yang alias-nya muncul di teks. Alias terpanjang menang
// (supaya "saus keju" tidak terbaca "keju", "seafood mozzarella" tidak terbaca "mozzarella").
export function cocokkan(teks, daftar, kunciNama) {
  const t = ` ${String(teks).toLowerCase()} `;
  let terbaik = null;
  for (const item of daftar) {
    for (const a of daftarAlias(item, item[kunciNama])) {
      const re = new RegExp(`(^|[^a-z])${a.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')}($|[^a-z])`);
      if (re.test(t) && (!terbaik || a.length > terbaik.panjang)) terbaik = { item, panjang: a.length };
    }
  }
  return terbaik?.item || null;
}

export function hargaJual(menu, wilayah) {
  const w = String(wilayah || 'Jawa').toLowerCase();
  const kolom = w.startsWith('kal') ? 'kalimantan' : w.startsWith('sum') ? 'sumatra' : 'jawa';
  return Number(menu[kolom]) || Number(menu.jawa) || 0;
}
