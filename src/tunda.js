// Pengeluaran yang ditahan (belum masuk spreadsheet) sampai syaratnya dipenuhi:
//   struk  = >= Rp 100.000 tanpa struk: kirim foto struk, atau owner reply "acc"
//   cek    = struk ada tapi tidak sesuai: kirim struk yang benar / beri penjelasan, owner reply "acc"
//   detail = cash < Rp 100.000 dengan keterangan terlalu umum: reply detailnya
// Disimpan di sesi (file di HP bot) supaya tidak hilang saat bot dinyalakan ulang. Nomor: P0001, P0002, ...

const KUNCI_NOMOR = 'tunda|nomor';
const kunciGrup = (groupId) => `tunda|${groupId}`;

export function daftarTunda(ctx, groupId) {
  return ctx.sesi?.get(kunciGrup(groupId))?.daftar || [];
}

function simpanDaftar(ctx, groupId, daftar) {
  if (daftar.length) ctx.sesi.set(kunciGrup(groupId), { daftar });
  else ctx.sesi.hapus(kunciGrup(groupId));
}

export function tambahTunda(ctx, pesan, data) {
  const nomor = (ctx.sesi.get(KUNCI_NOMOR)?.n || 0) + 1;
  ctx.sesi.set(KUNCI_NOMOR, { n: nomor });
  const p = {
    id: `P${String(nomor).padStart(4, '0')}`,
    ...data,
    senderId: pesan.senderId,
    senderName: pesan.senderName || '',
    waktu: Date.now(),
  };
  simpanDaftar(ctx, pesan.groupId, [...daftarTunda(ctx, pesan.groupId), p]);
  return p;
}

export function ubahTunda(ctx, groupId, id, patch) {
  simpanDaftar(ctx, groupId, daftarTunda(ctx, groupId).map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

export function hapusTunda(ctx, groupId, ids) {
  simpanDaftar(ctx, groupId, daftarTunda(ctx, groupId).filter((p) => !ids.includes(p.id)));
}

export function idTundaDariTeks(teks) {
  return [...new Set(String(teks ?? '').toUpperCase().match(/\bP\d{4,}\b/g) || [])];
}
