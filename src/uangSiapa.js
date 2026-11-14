// Uang siapa yang dipakai untuk pengeluaran, dan penggantiannya oleh owner.

import { JENIS, STATUS, KAS_USAHA, BUKU } from './schema.js';
import { petaUangSiapa } from './parsers.js';
import { rupiah, parseMoney, tanggalLokal, waktuLokal, bersihkan } from './util.js';

const balas = (text) => [{ text }];
const kecil = (s) => String(s || '').trim().toLowerCase();

// Nama di chat ("Vallent") dicocokkan dengan nama di tim ("Valen") lewat 4 huruf pertama.
function cocokNama(nama, tim) {
  const n = kecil(nama).replace(/[^a-z]/g, '');
  if (!n) return null;
  const hit = tim.find((o) => {
    const t = kecil(o.nama).replace(/[^a-z]/g, '');
    return t && (t === n || t.startsWith(n.slice(0, 4)) || n.startsWith(t.slice(0, 4)));
  });
  return hit?.nama || null;
}

export async function namaOwner(store) {
  const atur = await store.all('Pengaturan');
  return atur.find((r) => r.kunci === 'nama_owner')?.nilai || 'George';
}

// '@pengirim' / '@pic' / '@owner' / 'Kas usaha' / nama -> nama yang disimpan.
export async function tentukanUangSiapa(ctx, pesan, kodeEvent, siapa) {
  if (siapa === KAS_USAHA) return KAS_USAHA;
  const owner = await namaOwner(ctx.store);
  const tim = (await ctx.store.all('Tim Event')).filter((o) => o.kode_event === kodeEvent && o.status !== 'BATAL');
  if (siapa === '@owner') return owner;
  if (siapa === '@pic') return tim.find((o) => o.peran === 'PIC')?.nama || 'PIC';
  if (!siapa || siapa === '@pengirim') {
    if (ctx.ownerIds.has(pesan.senderId)) return owner;
    return cocokNama(pesan.senderName, tim) || pesan.senderName || pesan.senderId;
  }
  if (kecil(siapa) === kecil(owner)) return owner;
  return cocokNama(siapa, tim) || siapa;
}

// Ringkasan per orang: total uangnya yang terpakai, sudah diganti, sisa yang harus ditransfer.
export function hitungPenggantian(transaksi, kodeEvent) {
  const per = new Map();
  for (const t of transaksi) {
    if (t.kode_event !== kodeEvent || t.status === STATUS.BATAL) continue;
    const siapa = String(t.dibayar_oleh || '').trim();
    if (!siapa || siapa === KAS_USAHA) continue;
    if (t.jenis !== JENIS.KELUAR && t.jenis !== JENIS.PENGGANTIAN) continue;
    const r = per.get(siapa) || { nama: siapa, dibayar: 0, diganti: 0, catatan: 0 };
    if (t.jenis === JENIS.KELUAR) { r.dibayar += Number(t.nominal) || 0; r.catatan += 1; } else r.diganti += Number(t.nominal) || 0;
    per.set(siapa, r);
  }
  return [...per.values()].map((r) => ({ ...r, sisa: r.dibayar - r.diganti })).sort((a, b) => b.sisa - a.sisa);
}

function ringkasan(daftar) {
  if (!daftar.length) return '(belum ada pengeluaran yang memakai uang pribadi)';
  return daftar.map((r) => `• ${r.nama}: keluar ${rupiah(r.dibayar)} (${r.catatan} catatan), sudah diganti ${rupiah(r.diganti)}, *sisa ${rupiah(r.sisa)}*`).join('\n');
}

// #uang T0012 mama  -> ubah uang siapa
export async function perintahUang(ctx, pesan, event, cmd) {
  const id = String(cmd.argumen[0] || '').toUpperCase();
  const siapaTeks = bersihkan(cmd.argumen.slice(1).join(' ').replace(/^uang\s+/i, ''));
  if (!/^T\d+$/.test(id) || !siapaTeks) return balas('Format: *#uang T0012 mama* (atau valen / saya / pic / kas)');
  const t = (await ctx.store.all('Transaksi')).find((x) => x.id === id);
  if (!t) return balas(`⚠️ Catatan ${id} tidak ditemukan.`);
  const nama = await tentukanUangSiapa(ctx, pesan, event.kode, petaUangSiapa(siapaTeks.split(/\s+/)[0]));
  await ctx.store.update('Transaksi', 'id', id, { dibayar_oleh: nama });
  return balas(`✅ ${id} ${t.keterangan} ${rupiah(t.nominal)} sekarang tercatat *uang ${nama}*.`);
}

// #ganti Valen 500rb -> owner mengganti uang (bukan biaya event)
export async function perintahGanti(ctx, pesan, event, cmd) {
  const nominal = parseMoney(cmd.argumen.join(' '));
  const namaTeks = bersihkan(cmd.argumen.join(' ').replace(/(rp\.?\s*)?[\d.,]+\s*(juta|jt|ribu|rb|k)?/gi, ''));
  if (!nominal || !namaTeks) return balas('Format: *#ganti <nama> <nominal>*, contoh: #ganti Valen 1.250.000');
  const nama = await tentukanUangSiapa(ctx, pesan, event.kode, petaUangSiapa(namaTeks.split(/\s+/)[0]));
  const semua = await ctx.store.all('Transaksi');
  const maks = semua.reduce((m, t) => Math.max(m, Number(String(t.id).replace(/\D/g, '')) || 0), 0);
  await ctx.store.append('Transaksi', {
    id: `T${String(maks + 1).padStart(4, '0')}`, tanggal: tanggalLokal(pesan.waktu), kode_event: event.kode, buku: BUKU.EVENT,
    jenis: JENIS.PENGGANTIAN, kategori: 'Penggantian uang', keterangan: `Penggantian uang ${nama}`, nominal, metode: 'TRANSFER',
    dibayar_oleh: nama, sumber: 'teks', pengirim: pesan.senderName ? `${pesan.senderName} (${pesan.senderId})` : pesan.senderId,
    status: STATUS.OK, dicatat: waktuLokal(pesan.waktu),
  });
  const r = hitungPenggantian(await ctx.store.all('Transaksi'), event.kode).find((x) => x.nama === nama);
  return balas(`💸 Penggantian ke *${nama}* ${rupiah(nominal)} tercatat (bukan biaya event).\nSisa yang masih harus ditransfer ke ${nama}: *${rupiah(r?.sisa ?? 0)}*`);
}

// #penggantian -> daftar siapa harus ditransfer berapa
export async function perintahPenggantian(ctx, event) {
  const daftar = hitungPenggantian(await ctx.store.all('Transaksi'), event.kode);
  const total = daftar.reduce((s, r) => s + Math.max(0, r.sisa), 0);
  return balas(`💰 *Uang siapa – ${event.kode}*\n${ringkasan(daftar)}\n\nTotal yang masih harus diganti: *${rupiah(total)}*\nCatat transfer penggantian: *#ganti Valen 500rb*`);
}
