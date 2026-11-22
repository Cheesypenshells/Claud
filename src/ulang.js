// Mengulang pekerjaan yang gagal sementara (kuota Google Sheets habis / server sibuk) alih-alih membuat bot berhenti.
// Bot yang berhenti lalu menyala ulang membaca ratusan baris sekaligus, jadi malah menghabiskan kuota lagi (lingkaran setan).
export const sementara = (err) => {
  const kode = Number(err?.code ?? err?.status);
  return kode === 429 || (kode >= 500 && kode < 600) || /quota|too many requests|rate.?limit|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(String(err?.message || ''));
};

export async function denganUlang(nama, fn, { maks = 8, jedaMs = 65_000, tidur = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.warn } = {}) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!sementara(err) || i >= maks) throw err;
      log(`[Sheets] ${nama}: kuota/server sibuk (${err.code || err.message}). Menunggu ${Math.round(jedaMs / 1000)} detik lalu mencoba lagi (${i}/${maks})...`);
      await tidur(jedaMs);
    }
  }
}
