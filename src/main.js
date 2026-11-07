// Mengisi harga awal dan memperbarui data sheet Main dari semua tab.

import { BAHAN_AWAL, MENU_AWAL } from './katalog.js';
import { hitungEvent, barisDataMain } from './laporan.js';
import { ubahInputManual } from './inputManual.js';

export async function isiHargaAwal(store) {
  if (!(await store.all('Harga Bahan')).length) {
    for (const b of BAHAN_AWAL) await store.append('Harga Bahan', b);
  }
  if (!(await store.all('Harga Menu')).length) {
    for (const m of MENU_AWAL) await store.append('Harga Menu', m);
  }
}

export async function bacaData(store) {
  const [semuaEvent, omzet, transaksi, tim, bahan, gratis, hargaBahan, hargaMenu, pengaturan] = await Promise.all([
    store.all('Event'), store.all('Omzet'), store.all('Transaksi'), store.all('Tim Event'),
    store.all('Bahan Event'), store.all('Porsi Gratis'), store.all('Harga Bahan'), store.all('Harga Menu'),
    store.all('Pengaturan'),
  ]);
  // Event berstatus BATAL (misalnya event tes) tidak ikut direkap.
  const events = semuaEvent.filter((e) => e.status !== 'BATAL');
  const atur = Object.fromEntries(pengaturan.map((r) => [r.kunci, r.nilai]));
  const namaOwner = atur.nama_owner || 'George';
  const data = { events, omzet, transaksi, tim, bahan, gratis, hargaBahan, hargaMenu, namaOwner, atur };

  // Data event lama dari file "INPUT EVENT LAMA" (diisi manual oleh owner).
  if (atur.file_input_manual && store.bacaInputManual) {
    const manual = ubahInputManual(await store.bacaInputManual(atur.file_input_manual), semuaEvent.map((e) => e.kode));
    const kodeGrup = new Set(semuaEvent.map((e) => e.kode));
    const eventManual = manual.events.filter((e) => !kodeGrup.has(e.kode));
    for (const e of eventManual) e.file_event = atur[`file_event_${e.kode}`] || '';
    const kodeManual = new Set(eventManual.map((e) => e.kode));
    const milik = (r) => kodeManual.has(r.kode_event);
    data.events = [...events, ...eventManual];
    data.omzet = [...omzet, ...manual.omzet.filter(milik)];
    data.transaksi = [...transaksi, ...manual.transaksi.filter(milik)];
    data.tim = [...tim, ...manual.tim.filter(milik)];
    data.bahan = [...bahan, ...manual.bahan.filter(milik)];
    data.gratis = [...gratis, ...manual.gratis.filter(milik)];
  }
  return data;
}

export async function perbaruiMain(store) {
  const data = await bacaData(store);
  const baris = data.events.flatMap((e) => barisDataMain(hitungEvent(e, data)));
  await store.tulisDataMain(baris);
  await store.pilihEventDefault(data.events.at(-1)?.kode);
  return baris.length;
}
