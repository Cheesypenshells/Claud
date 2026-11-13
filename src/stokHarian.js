// Stok bahan baku saat closing, setiap hari event (grup tim / grup pengeluaran). Hanya jumlah, tanpa harga.
//
//   #stok            -> bot mengirim format berisi bahan event ini
//   #stok
//   Garlic = 18 pack
//   Mozzarella = 30 balok      -> dicatat di tab "Stok Harian", bot menghitung berkurang berapa sejak closing kemarin
//
// Terpakai hari ini = stok closing kemarin (atau stok awal di hari pertama) + restock hari itu − stok closing sekarang.
// Format dikirim otomatis ke grup tim saat kasir ditutup (⏹ Tutup kasir), atau jam 23.00 kalau belum ada yang mengisi.
// Catatan closing sebelum jam 05.00 dianggap closing hari sebelumnya.

import { STATUS } from './schema.js';
import { parseBahan } from './parsers.js';
import { cocokkan } from './katalog.js';
import { BAHAN_DIBELI } from './bahan.js';
import { tanggalLokal, waktuLokal, tambahHari } from './util.js';

const balas = (text) => [{ text }];
const num = (v) => (Number.isNaN(Number(v)) || v === '' || v === null || v === undefined ? 0 : Number(v));
const aktif = (r) => r.status !== STATUS.BATAL;
const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString('id-ID');
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tglPendek = (t) => `${Number(t.slice(8, 10))} ${BULAN[Number(t.slice(5, 7)) - 1]}`;

// Tanggal closing: sebelum jam 05.00 masih closing hari sebelumnya.
export function tanggalClosing(waktu) {
  const jam = Number(new Date(waktu).toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).slice(0, 2));
  const t = tanggalLokal(waktu);
  return jam < 5 ? tambahHari(t, -1) : t;
}

// Bahan yang dicek di event ini: yang pernah dibawa/restock/sisa, ditambah oyster (dibeli di lokasi). Kosong = semua bahan.
export function bahanEvent(kode, bahanRows, hargaBahan) {
  const dipakai = new Set(bahanRows.filter((b) => b.kode_event === kode && aktif(b)).map((b) => b.bahan));
  BAHAN_DIBELI.forEach((b) => { if (hargaBahan.some((h) => h.bahan === b)) dipakai.add(b); });
  const daftar = hargaBahan.filter((h) => dipakai.has(h.bahan));
  return daftar.length ? daftar : hargaBahan;
}

export function teksFormatStok(event, daftar, tanggal) {
  return [
    `📦 *Stok closing ${event.kode}* – ${tglPendek(tanggal)}`,
    'Hitung sisa bahan baku setelah tutup. *Salin pesan di bawah, ganti titik-titik dengan jumlahnya, lalu kirim.*',
    '',
    '#stok',
    ...daftar.map((b) => `${b.bahan} = ... ${b.satuan || ''}`.trim()),
  ].join('\n');
}

// Hitung berkurang per bahan untuk tanggal closing `tanggal`.
export function hitungStok({ kode, mulai }, tanggal, item, stokRows, bahanRows) {
  const milikBahan = (r) => r.kode_event === kode && r.bahan === item.bahan && aktif(r);
  const kemarin = stokRows.filter((r) => milikBahan(r) && String(r.tanggal) < tanggal).sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal))).pop();
  const gerak = bahanRows.filter(milikBahan);
  let sebelumnya = null;
  let dari = mulai;
  if (kemarin) { sebelumnya = num(kemarin.jumlah); dari = tambahHari(String(kemarin.tanggal), 1); }
  else {
    const awal = gerak.filter((r) => r.gerak === 'Keluar');
    if (awal.length) sebelumnya = awal.reduce((s, r) => s + num(r.jumlah), 0);
  }
  const restock = gerak.filter((r) => r.gerak === 'Restock' && String(r.tanggal) >= dari && String(r.tanggal) <= tanggal).reduce((s, r) => s + num(r.jumlah), 0);
  const terpakai = sebelumnya === null ? null : sebelumnya + restock - item.jumlah;
  return { ...item, sebelumnya, restock, terpakai, dariKemarin: Boolean(kemarin) };
}

export async function perintahStok(ctx, pesan, event, cmd) {
  if (!event) return balas('⚠️ Ketik *#stok* di grup tim event.');
  const hargaBahan = await ctx.store.all('Harga Bahan');
  const bahanRows = await ctx.store.all('Bahan Event');
  const tanggal = tanggalClosing(pesan.waktu);
  const daftar = bahanEvent(event.kode, bahanRows, hargaBahan);
  const teks = [cmd.sisaBaris, cmd.badan].filter(Boolean).join('\n');
  const items = parseBahan(teks, hargaBahan, cocokkan);
  if (!items.length) return balas(teksFormatStok(event, daftar, tanggal));

  let stokRows = [];
  try { stokRows = await ctx.store.all('Stok Harian'); } catch { stokRows = []; }
  const hasil = items.map((it) => hitungStok(event, tanggal, it, stokRows, bahanRows));
  const pengirim = pesan.senderName ? `${pesan.senderName} (${pesan.senderId})` : pesan.senderId;
  for (const h of hasil) {
    // Kirim ulang di hari yang sama = koreksi: catatan lama bahan itu dibatalkan.
    await ctx.store.updateWhere('Stok Harian', (r) => r.kode_event === event.kode && r.bahan === h.bahan && String(r.tanggal) === tanggal && aktif(r), { status: STATUS.BATAL });
    await ctx.store.append('Stok Harian', {
      tanggal, kode_event: event.kode, bahan: h.bahan, jumlah: h.jumlah, satuan: h.satuan,
      sebelumnya: h.sebelumnya ?? '', restock: h.restock || '', terpakai: h.terpakai ?? '',
      pengirim, status: STATUS.OK, dicatat: waktuLokal(pesan.waktu),
    });
  }
  const baris = hasil.map((h) => {
    const s = h.satuan || '';
    if (h.terpakai === null) return `• ${h.bahan}: *${fmt(h.jumlah)} ${s}* _(stok awal belum tercatat, jadi pemakaian mulai dihitung besok)_`;
    const asal = `${h.dariKemarin ? 'kemarin' : 'stok awal'} ${fmt(h.sebelumnya)}${h.restock ? ` + restock ${fmt(h.restock)}` : ''}`;
    if (h.terpakai < 0) return `• ${h.bahan}: *${fmt(h.jumlah)} ${s}* (${asal}) ⚠️ *naik ${fmt(-h.terpakai)}*: cek lagi hitungannya atau restock yang belum dicatat`;
    return `• ${h.bahan}: *${fmt(h.jumlah)} ${s}* (${asal}) → berkurang *${fmt(h.terpakai)} ${s}*`;
  });
  const belum = daftar.filter((b) => !hasil.some((h) => h.bahan === b.bahan)).map((b) => b.bahan);
  const sudahHariIni = stokRows.filter((r) => r.kode_event === event.kode && String(r.tanggal) === tanggal && aktif(r)).map((r) => r.bahan);
  const masihBelum = belum.filter((b) => !sudahHariIni.includes(b));
  const terakhir = event.selesai && tanggal >= event.selesai;
  return balas([
    `📦 *Stok closing ${event.kode}* – ${tglPendek(tanggal)} tercatat (oleh ${pesan.senderName || 'tim'})`,
    ...baris,
    masihBelum.length ? `\n_Belum diisi: ${masihBelum.join(', ')}. Kirim lagi dengan *#stok* (boleh sebagian)._` : '',
    terakhir ? '\n_Hari terakhir event: sisa bahan ini juga dicatat owner/PIC sebagai *#sisa* di grup pengeluaran._' : '',
  ].filter(Boolean).join('\n'));
}

// Tanggal closing sebuah sesi kasir dari kolom Ditutup ("2026-11-14 22:10:00"), cadangan: kolom Tanggal.
function tanggalSesi(s) {
  const m = String(s.ditutup || '').match(/(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})/);
  if (m) return Number(m[2]) < 5 ? tambahHari(m[1], -1) : m[1];
  return String(s.tanggal || '').slice(0, 10);
}

// Format stok dikirim ke grup tim setelah kasir ditutup, atau jam 23.00 kalau hari itu belum ada stok closing.
export async function tugasStokHarian(ctx, sekarang = new Date()) {
  const keluar = [];
  if (!ctx.sesi) return keluar;
  const baca = async (t) => { try { return await ctx.store.all(t); } catch { return []; } };
  const [events, grup, sesiKasir, stokRows, hargaBahan, bahanRows] = await Promise.all(
    ['Event', 'Grup', 'Sesi Kasir', 'Stok Harian', 'Harga Bahan', 'Bahan Event'].map(baca));
  const tanggal = tanggalClosing(sekarang);
  const jam = Number(sekarang.toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }).slice(0, 2));
  for (const e of events.filter((x) => x.mulai && x.mulai <= tanggal && (!x.selesai || tanggal <= x.selesai) && x.status !== 'BATAL')) {
    const tanda = `stokharian:${e.kode}:${tanggal}`;
    if (ctx.sesi.get(tanda)) continue;
    if (stokRows.some((r) => r.kode_event === e.kode && String(r.tanggal) === tanggal && aktif(r))) continue;
    const kasirTutup = sesiKasir.some((s) => s.kode_event === e.kode && ['TUTUP', 'DITERUSKAN'].includes(String(s.status).toUpperCase())
      && tanggalSesi(s) === tanggal);
    if (!kasirTutup && !(jam >= 23)) continue;
    ctx.sesi.set(tanda, { kirim: true });
    const teks = teksFormatStok(e, bahanEvent(e.kode, bahanRows, hargaBahan), tanggal);
    const pembuka = kasirTutup ? '🧾 Kasir sudah tutup, saatnya hitung stok bahan baku.' : '🌙 Stok closing hari ini belum diisi.';
    for (const g of grup.filter((x) => x.kode_event === e.kode && x.jenis === 'event')) keluar.push({ groupId: g.group_id, text: `${pembuka}\n\n${teks}` });
  }
  return keluar;
}
