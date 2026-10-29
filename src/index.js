// Titik masuk: menyambungkan WhatsApp, Google Sheets, dan penjadwal.

import { config } from './config.js';
import { SheetsStore } from './store/sheets.js';
import { MemoryStore } from './store/memory.js';
import { handlePesan } from './handlers.js';
import { buatPenjadwal } from './scheduler.js';
import { mulaiWhatsApp } from './wa.js';

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

  if (!config.ownerIds.size) console.warn('[Bot] OWNER_IDS kosong. Ketik #idsaya di grup untuk melihat ID owner.');

  const ctx = { store, ownerIds: config.ownerIds };

  // Pesan diproses satu per satu supaya nomor catatan (T0001, T0002, ...) tidak bentrok.
  let antrean = Promise.resolve();
  const jalankan = (fn) => {
    antrean = antrean.then(fn).catch((err) => console.error('[Bot] Error:', err));
    return antrean;
  };

  const wa = await mulaiWhatsApp({
    folderLogin: config.folderLogin,
    nomorBot: config.nomorBot,
    onPesan: (pesan, balasKe) => jalankan(async () => {
      const balasan = await handlePesan(ctx, pesan);
      for (const b of balasan) await balasKe(b.text);
    }),
  });

  const tugasJatuhTempo = buatPenjadwal({ store, jam: config.jam });
  setInterval(() => jalankan(async () => {
    for (const p of await tugasJatuhTempo()) await wa.kirim(p.groupId, p.text);
  }), 60_000);
}

main().catch((err) => {
  console.error('Gagal menjalankan bot:', err);
  process.exit(1);
});
