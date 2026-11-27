// Denyut bot: tiap beberapa menit bot menulis waktu "hidup" ke Pengaturan (kunci bot_hidup).
// Skrip alarm di Apps Script (apps-script/alarm/Alarm.gs) membacanya dan mengirim email kalau berhenti terlalu lama.
export const KUNCI_DENYUT = 'bot_hidup';
export const TIAP_MS = 2 * 60_000;

export async function catatDenyut(ctx, sekarang = new Date(), { tiap = TIAP_MS } = {}) {
  if (ctx.denyutTerakhir && sekarang - ctx.denyutTerakhir < tiap) return false;
  try {
    const nilai = sekarang.toISOString();
    const ada = (await ctx.store.all('Pengaturan')).some((r) => r.kunci === KUNCI_DENYUT);
    if (ada) await ctx.store.update('Pengaturan', 'kunci', KUNCI_DENYUT, { nilai });
    else await ctx.store.append('Pengaturan', { kunci: KUNCI_DENYUT, nilai, keterangan: 'Diisi bot tiap 2 menit (penanda bot hidup). Jangan diubah; dipakai alarm email.' });
    ctx.denyutTerakhir = sekarang;
    return true;
  } catch {
    return false; // gagal sementara (kuota/jaringan): coba lagi di putaran berikutnya
  }
}
