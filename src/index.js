// Titik masuk: menyambungkan WhatsApp, Google Sheets, dan penjadwal.

import { config } from './config.js';
import { SheetsStore } from './store/sheets.js';
import { MemoryStore } from './store/memory.js';
import { handlePesan, handleGrupBaru } from './handlers.js';
import { buatSesi } from './sesi.js';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { buatPenjadwal } from './scheduler.js';
import { mulaiWhatsApp } from './wa.js';
import { isiHargaAwal } from './main.js';
import { perbaruiPembukuan } from './pembukuan.js';
import { tugasPenilaian } from './handlersKpi.js';

async function main() {
  let store;
  if (config.spreadsheetId) {
    store = new SheetsStore({ spreadsheetId: config.spreadsheetId, keyFile: config.googleKeyFile });
    await store.init();
    console.log('[Sheets] Tersambung ke Google Sheets.');
  } else {
    store = new MemoryStore();
    console.warn('[Sheets] SPREADSHEET_ID kosong: data hanya disimpan sementara di memori (hilang saat bot dimatikan).');
  }

  await isiHargaAwal(store);
  await store.hapusTab(store.spreadsheetId, ['Main', 'Data Main']); // diganti file per event di folder EVENT
  const perbarui = async () => {
    const { catatan } = await perbaruiPembukuan(store);
    for (const c of catatan) console.warn(`[Pembukuan] ${c}`);
  };
  await perbarui();
  console.log('[Sheets] PEMBUKUAN & file event siap.');

  if (!config.ownerIds.size) console.warn('[Bot] OWNER_IDS kosong. Ketik #idsaya di grup untuk melihat ID owner.');

  mkdirSync(config.folderLogin, { recursive: true });
  const ctx = { store, ownerIds: config.ownerIds, sesi: buatSesi(path.join(config.folderLogin, 'sesi.json')), terakhir: new Map(), wajibStruk: true };
  // Sheet Main dihitung ulang paling lambat 30 detik setelah ada laporan baru.
  let perluPerbaruiMain = false;

  // Pesan diproses satu per satu supaya nomor catatan (T0001, T0002, ...) tidak bentrok.
  let antrean = Promise.resolve();
  const jalankan = (fn) => {
    antrean = antrean.then(fn).catch((err) => console.error('[Bot] Error:', err));
    return antrean;
  };

  const wa = await mulaiWhatsApp({
    folderLogin: config.folderLogin,
    nomorBot: config.nomorBot,
    kodePairing: config.kodePairing,
    onPesan: (pesan, balasKe) => jalankan(async () => {
      const balasan = await handlePesan(ctx, pesan);
      for (const b of balasan) await balasKe(b.text);
      if (balasan.length) perluPerbaruiMain = true;
    }),
    onGrupBaru: (groupId) => jalankan(async () => {
      for (const b of await handleGrupBaru(ctx, groupId)) await wa.kirim(groupId, b.text);
    }),
  });

  const tugasJatuhTempo = buatPenjadwal({ store, jam: config.jam });
  // Penilaian KPI ke PIC sehari setelah event selesai (dicek tiap 10 menit).
  setInterval(() => jalankan(async () => {
    for (const p of await tugasPenilaian(ctx)) {
      if (p.nomor) await wa.kirimPribadi(p.nomor, p.text);
      else await wa.kirim(p.groupId, p.text);
    }
  }), 10 * 60_000);
  setInterval(() => jalankan(async () => {
    for (const p of await tugasJatuhTempo()) await wa.kirim(p.groupId, p.text);
  }), 60_000);

  // Isian manual di Sheets (INPUT EVENT LAMA, koreksi owner) ikut terbaca setiap 5 menit.
  setInterval(() => { perluPerbaruiMain = true; }, 5 * 60_000);

  setInterval(() => jalankan(async () => {
    if (!perluPerbaruiMain) return;
    perluPerbaruiMain = false;
    await perbarui();
  }), 30_000);
}

main().catch((err) => {
  console.error('Gagal menjalankan bot:', err);
  process.exit(1);
});
