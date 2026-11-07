// Mengisi harga awal dan memperbarui data sheet Main dari semua tab.

import { BAHAN_AWAL, MENU_AWAL } from './katalog.js';
import { hitungEvent, barisDataMain } from './laporan.js';

export async function isiHargaAwal(store) {
  if (!(await store.all('Harga Bahan')).length) {
    for (const b of BAHAN_AWAL) await store.append('Harga Bahan', b);
  }
  if (!(await store.all('Harga Menu')).length) {
    for (const m of MENU_AWAL) await store.append('Harga Menu', m);
  }
}

export async function bacaData(store) {
  const [events, omzet, transaksi, tim, bahan, gratis, hargaBahan, hargaMenu] = await Promise.all([
    store.all('Event'), store.all('Omzet'), store.all('Transaksi'), store.all('Tim Event'),
    store.all('Bahan Event'), store.all('Porsi Gratis'), store.all('Harga Bahan'), store.all('Harga Menu'),
  ]);
  return { events, omzet, transaksi, tim, bahan, gratis, hargaBahan, hargaMenu };
}

export async function perbaruiMain(store) {
  const data = await bacaData(store);
  const baris = data.events.flatMap((e) => barisDataMain(hitungEvent(e, data)));
  await store.tulisDataMain(baris);
  await store.pilihEventDefault(data.events.at(-1)?.kode);
  return baris.length;
}
