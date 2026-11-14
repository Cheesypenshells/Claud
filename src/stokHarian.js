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
import { tanggalLokal, waktuLokal, tambahHari, parseMoney, rupiah } from './util.js';
import { waktuTutup, zonaKota, lokal, saatClosing } from './absensi.js';

const balas = (text) => [{ text }];

// Nampan oyster siap bakar di freezer (hasil tim plating). Minimal 7 nampan (Pengaturan: min_nampan).
export const NAMPAN = [
  { bahan: 'Nampan Garlic', satuan: 'nampan', isi: 'oyster + bumbu garlic' },
  { bahan: 'Nampan Garlic Mozza', satuan: 'nampan', isi: 'garlic + keju mozzarella' },
  { bahan: 'Nampan Garlic Mozza Topping', satuan: 'nampan', isi: 'garlic + mozzarella + topping' },
];
export const MIN_NAMPAN = 7;
const adalahNampan = (nama) => NAMPAN.some((n) => n.bahan === nama);

// Baris berisi kata "nampan" dibaca sebagai nampan (bukan bahan baku), jenisnya dari kata topping / mozza.
export function pisahNampan(teks) {
  const nampan = [];
  const sisa = [];
  for (const baris of String(teks).split('\n')) {
    if (!/nampan|tray/i.test(baris)) { sisa.push(baris); continue; }
    const angka = baris.replace(/mozza(rella)?/ig, '').match(/(\d+(?:[.,]\d+)?)/);
    if (!angka) continue;
    const jenis = /topping|seafood|cumi|udang/i.test(baris) ? NAMPAN[2] : /mozza|keju|cheese/i.test(baris) ? NAMPAN[1] : NAMPAN[0];
    nampan.push({ bahan: jenis.bahan, jumlah: Number(angka[1].replace(',', '.')), satuan: 'nampan' });
  }
  return { nampan, sisa: sisa.join('\n') };
}

// Ringkasan total nampan hari itu dibanding minimal.
function teksTotalNampan(total, minimal) {
  if (total >= minimal) return `🧊 Total nampan di freezer: *${total}* ✅ (minimal ${minimal})`;
  return `🧊 Total nampan di freezer: *${total}* ⚠️ *kurang ${minimal - total} dari minimal ${minimal}*. Tim plating siapkan lagi sebelum buka.`;
}
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
  if (!dipakai.size) return hargaBahan; // belum ada #keluar: tampilkan semua bahan
  BAHAN_DIBELI.forEach((b) => { if (hargaBahan.some((h) => h.bahan === b)) dipakai.add(b); });
  const daftar = hargaBahan.filter((h) => dipakai.has(h.bahan));
  return daftar.length ? daftar : hargaBahan;
}

// Lokasi stok: oyster di cooler (tim getok); bahan baku & nampan di gudang / booth (tim plating & kasir).
export const LOKASI = ['Gudang', 'Booth', 'Cooler'];
const lokasiBawaan = (bahan) => (BAHAN_DIBELI.includes(bahan) ? 'Cooler' : 'Booth');
const tugasOyster = (bahan) => BAHAN_DIBELI.includes(bahan);

// Penanggung jawab bahan hari itu: oyster = tim getok; bahan lain & nampan = plating + kasir. Cadangan: pelapor.
export function penjagaBahan(bahan, tugasHari, pelapor) {
  const bagian = tugasOyster(bahan) ? ['Getok'] : ['Plating', 'Kasir'];
  const nama = [...new Set(tugasHari.filter((t) => bagian.includes(t.bagian)).map((t) => t.nama))];
  return nama.length ? nama : [pelapor].filter(Boolean);
}

// Baca isi #stok: judul [Gudang] / [Booth] / [Cooler] (atau kata gudang/booth di baris) menentukan lokasi.
export function bacaIsiStok(teks, hargaBahan) {
  const items = [];
  let lokasi = null;
  for (const baris of String(teks).split('\n')) {
    const judul = baris.match(/^\s*\[?\s*(gudang|booth|cooler|freezer)\s*\]?\s*:?\s*$/i);
    if (judul) { lokasi = /freezer/i.test(judul[1]) ? 'Booth' : judul[1][0].toUpperCase() + judul[1].slice(1).toLowerCase(); continue; }
    const diBaris = (baris.match(/\b(gudang|booth|cooler)\b/i) || [])[1];
    const bersih = baris.replace(/\b(gudang|booth|cooler)\b/ig, '');
    const { nampan, sisa } = pisahNampan(bersih);
    const bahan = [...parseBahan(sisa, hargaBahan, cocokkan), ...nampan];
    for (const it of bahan) {
      const lok = diBaris ? diBaris[0].toUpperCase() + diBaris.slice(1).toLowerCase() : lokasi || (adalahNampan(it.bahan) ? 'Booth' : lokasiBawaan(it.bahan));
      items.push({ ...it, lokasi: lok });
    }
  }
  return items;
}

const baris = (b) => `${b.bahan} = ... ${b.satuan || ''}`.trim();
export function teksFormatStok(event, daftar, tanggal, { getok = [], plating = [] } = {}) {
  const oyster = daftar.filter((b) => tugasOyster(b.bahan));
  const lain = daftar.filter((b) => !tugasOyster(b.bahan));
  return [
    `📦 *Stok closing ${event.kode}* – ${tglPendek(tanggal)}`,
    'Hitung sisa bahan baku, *foto stoknya*, lalu kirim foto dengan caption pesan di bawah (ganti titik-titik dengan jumlahnya).',
    '_Penanggung jawab bahan hari ini menanggung kalau ada bahan rusak / hilang._',
    '',
    `🦪 *Tim getok${getok.length ? ` (${getok.join(', ')})` : ''}* – oyster sisa:`,
    '#stok', '[Cooler]', ...(oyster.length ? oyster : [{ bahan: 'Oyster', satuan: 'kg' }]).map(baris),
    '',
    `🍽️ *Plating & kasir${plating.length ? ` (${plating.join(', ')})` : ''}* – bahan baku di gudang & booth:`,
    '#stok', '[Gudang]', ...lain.map(baris), '[Booth]', ...lain.map(baris),
    `(nampan di freezer, minimal ${MIN_NAMPAN})`, ...NAMPAN.map((n) => `${n.bahan} = ... nampan`),
  ].join('\n');
}

// Total stok per bahan pada satu tanggal (semua lokasi).
function totalTanggal(stokRows, kode, bahan, tanggal) {
  const rows = stokRows.filter((r) => r.kode_event === kode && r.bahan === bahan && aktif(r) && String(r.tanggal) === tanggal);
  return rows.length ? rows.reduce((t, r) => t + num(r.jumlah), 0) : null;
}

// Hitung berkurang per bahan (total semua lokasi) untuk tanggal closing `tanggal`.
export function hitungStok({ kode, mulai }, tanggal, item, stokRows, bahanRows) {
  const milikBahan = (r) => r.kode_event === kode && r.bahan === item.bahan && aktif(r);
  const tglKemarin = [...new Set(stokRows.filter((r) => milikBahan(r) && String(r.tanggal) < tanggal).map((r) => String(r.tanggal)))].sort().pop();
  const kemarin = tglKemarin ? totalTanggal(stokRows, kode, item.bahan, tglKemarin) : null;
  const gerak = bahanRows.filter(milikBahan);
  const total = item.total ?? item.jumlah;
  if (adalahNampan(item.bahan)) return { ...item, total, sebelumnya: kemarin, restock: 0, terpakai: null, dariKemarin: kemarin !== null, nampan: true };
  let sebelumnya = kemarin;
  let dari = mulai;
  if (kemarin !== null) dari = tambahHari(tglKemarin, 1);
  else {
    const awal = gerak.filter((r) => r.gerak === 'Keluar');
    if (awal.length) sebelumnya = awal.reduce((t, r) => t + num(r.jumlah), 0);
  }
  const restock = gerak.filter((r) => r.gerak === 'Restock' && String(r.tanggal) >= dari && String(r.tanggal) <= tanggal).reduce((t, r) => t + num(r.jumlah), 0);
  const terpakai = sebelumnya === null ? null : sebelumnya + restock - total;
  return { ...item, total, sebelumnya, restock, terpakai, dariKemarin: kemarin !== null };
}

export async function perintahStok(ctx, pesan, event, cmd) {
  if (!event) return balas('⚠️ Ketik *#stok* di grup tim event.');
  const hargaBahan = await ctx.store.all('Harga Bahan');
  const bahanRows = await ctx.store.all('Bahan Event');
  const tanggal = tanggalClosing(pesan.waktu);
  const daftar = bahanEvent(event.kode, bahanRows, hargaBahan);
  let tugasHari = [];
  try { tugasHari = (await ctx.store.all('Tugas Harian')).filter((r) => r.kode_event === event.kode && String(r.tanggal) === tanggal && aktif(r)); } catch { tugasHari = []; }
  const nama = (bg) => [...new Set(tugasHari.filter((t) => bg.includes(t.bagian)).map((t) => t.nama))];
  const teks = [cmd.sisaBaris, cmd.badan].filter(Boolean).join('\n');
  const items = bacaIsiStok(teks, hargaBahan);
  if (!items.length) return balas(teksFormatStok(event, daftar, tanggal, { getok: nama(['Getok']), plating: nama(['Plating', 'Kasir']) }));
  if (!pesan.adaFoto) return balas('📷 *Laporan stok wajib pakai foto bukti.* Foto stoknya (cooler / gudang / booth), lalu kirim foto itu dengan caption *#stok ...* yang sama.');

  let stokRows = [];
  try { stokRows = await ctx.store.all('Stok Harian'); } catch { stokRows = []; }
  const pengirim = pesan.senderName ? `${pesan.senderName} (${pesan.senderId})` : pesan.senderId;
  // Kirim ulang bahan + lokasi yang sama di hari yang sama = koreksi. Hitung dulu di memori, lalu simpan.
  const samaBaris = (r, it) => r.kode_event === event.kode && r.bahan === it.bahan && (r.lokasi || 'Booth') === it.lokasi && String(r.tanggal) === tanggal && aktif(r);
  let karyawanRows = []; try { karyawanRows = await ctx.store.all('Karyawan'); } catch { karyawanRows = []; }
  const pelaporNama = namaPelapor(pengirim, karyawanRows);
  const baruRows = items.map((it) => ({
    tanggal, kode_event: event.kode, bahan: it.bahan, lokasi: it.lokasi, jumlah: it.jumlah, satuan: it.satuan,
    penanggung_jawab: penjagaBahan(it.bahan, tugasHari, pelaporNama).join(', '),
    foto: pesan.id || 'ada', pengirim, status: STATUS.OK, dicatat: waktuLokal(pesan.waktu),
  }));
  stokRows = [...stokRows.map((r) => (items.some((it) => samaBaris(r, it)) ? { ...r, status: STATUS.BATAL } : r)), ...baruRows];
  // Ringkasan per bahan (total semua lokasi hari ini)
  const bahanDilapor = [...new Set(items.map((i) => i.bahan))];
  const hasil = bahanDilapor.map((b) => {
    const rows = stokRows.filter((r) => r.kode_event === event.kode && r.bahan === b && aktif(r) && String(r.tanggal) === tanggal);
    const it = items.find((x) => x.bahan === b);
    return { ...hitungStok(event, tanggal, { bahan: b, satuan: it.satuan, total: rows.reduce((t, r) => t + num(r.jumlah), 0) }, stokRows, bahanRows), rows };
  });
  for (const it of items) {
    for (let i = 0; i < 10; i++) if (!(await ctx.store.updateWhere('Stok Harian', (r) => samaBaris(r, it), { status: STATUS.BATAL }))) break;
  }
  for (const r of baruRows) {
    const h = hasil.find((x) => x.bahan === r.bahan);
    await ctx.store.append('Stok Harian', { ...r, total: h.total, sebelumnya: h.sebelumnya ?? '', restock: h.restock || '', terpakai: h.terpakai ?? '' });
  }
  const rincian = (h) => h.rows.map((r) => `${r.lokasi || 'Booth'} ${fmt(num(r.jumlah))}`).join(' + ');
  const baris = hasil.filter((h) => !h.nampan).map((h) => {
    const s = h.satuan || '';
    const pj = h.rows[0]?.penanggung_jawab ? ` · PJ: ${h.rows[0].penanggung_jawab}` : '';
    const lok = h.rows.length > 1 ? `${rincian(h)} = ` : `${h.rows[0]?.lokasi || ''} `;
    if (h.terpakai === null) return `• ${h.bahan}: ${lok}*${fmt(h.total)} ${s}*${pj} _(stok awal belum tercatat, pemakaian mulai dihitung besok)_`;
    const asal = `${h.dariKemarin ? 'kemarin' : 'stok awal'} ${fmt(h.sebelumnya)}${h.restock ? ` + restock ${fmt(h.restock)}` : ''}`;
    if (h.terpakai < 0) return `• ${h.bahan}: ${lok}*${fmt(h.total)} ${s}* (${asal}) ⚠️ *naik ${fmt(-h.terpakai)}*: cek lagi hitungannya atau restock yang belum dicatat${pj}`;
    return `• ${h.bahan}: ${lok}*${fmt(h.total)} ${s}* (${asal}) → berkurang *${fmt(h.terpakai)} ${s}*${pj}`;
  });
  const sudahHariIni = new Set(stokRows.filter((r) => r.kode_event === event.kode && String(r.tanggal) === tanggal && aktif(r)).map((r) => r.bahan));
  const masihBelum = [...daftar, ...NAMPAN].map((b) => b.bahan).filter((b) => !sudahHariIni.has(b));
  const barisNampan = hasil.filter((h) => h.nampan).map((h) => `• ${h.bahan}: *${fmt(h.total)}*${h.sebelumnya !== null ? ` (kemarin ${fmt(h.sebelumnya)})` : ''}`);
  const totalNampan = stokRows.filter((r) => r.kode_event === event.kode && String(r.tanggal) === tanggal && aktif(r) && adalahNampan(r.bahan)).reduce((t, r) => t + num(r.jumlah), 0);
  let minimal = MIN_NAMPAN;
  try { minimal = Number((await ctx.store.all('Pengaturan')).find((x) => x.kunci === 'min_nampan')?.nilai) || MIN_NAMPAN; } catch { /* bawaan */ }
  const terakhir = event.selesai && tanggal >= event.selesai;
  return balas([
    `📦 *Stok closing ${event.kode}* – ${tglPendek(tanggal)} tercatat (oleh ${pesan.senderName || 'tim'}, 📷 foto bukti ✅)`,
    ...baris,
    ...(barisNampan.length ? ['', '🧊 *Nampan siap bakar di freezer*', ...barisNampan, teksTotalNampan(totalNampan, minimal)] : []),
    masihBelum.length ? `\n_Belum diisi: ${masihBelum.join(', ')}. Kirim lagi dengan foto + *#stok* (boleh sebagian)._` : '',
    terakhir ? '\n_Hari terakhir event: sisa bahan ini juga dicatat owner/PIC sebagai *#sisa* di grup pengeluaran._' : '',
  ].filter(Boolean).join('\n'));
}

// Tanggal closing sebuah sesi kasir dari kolom Ditutup ("2026-11-14 22:10:00"), cadangan: kolom Tanggal.

// Format stok dikirim ke grup tim setelah kasir ditutup, atau jam 23.00 kalau hari itu belum ada stok closing.
// Format stok closing dikirim 15 MENIT SEBELUM JAM TUTUP (22.00 → 21.45) (kolom Jam Tutup event, default 22.00) supaya tim
// sempat membereskan & menghitung lebih dulu. Kalau sampai kasir ditutup / jam tutup belum ada yang mengisi,
// bot menagih sekali lagi (format dikirim ulang).
export const STOK_SEBELUM_TUTUP = 15; // menit
export async function tugasStokHarian(ctx, sekarang = new Date()) {
  const keluar = [];
  if (!ctx.sesi) return keluar;
  const baca = async (t) => { try { return await ctx.store.all(t); } catch { return []; } };
  const [events, grup, sesiKasir, stokRows, hargaBahan, bahanRows] = await Promise.all(
    ['Event', 'Grup', 'Sesi Kasir', 'Stok Harian', 'Harga Bahan', 'Bahan Event'].map(baca));
  const tanggal = tanggalClosing(sekarang);
  for (const e of events.filter((x) => x.mulai && x.mulai <= tanggal && (!x.selesai || tanggal <= x.selesai) && x.status !== 'BATAL')) {
    const tutup = waktuTutup(e, tanggal);
    const siap = new Date(tutup.getTime() - STOK_SEBELUM_TUTUP * 60000);
    const sudahIsi = stokRows.some((r) => r.kode_event === e.kode && String(r.tanggal) === tanggal && aktif(r));
    const closing = saatClosing(e, tanggal, sesiKasir);
    const sudahClosing = sekarang >= closing.saat;
    const tSiap = `stokharian:${e.kode}:${tanggal}`;
    const tTagih = `stoktagih:${e.kode}:${tanggal}`;
    let pembuka = null;
    if (!ctx.sesi.get(tSiap) && (sekarang >= siap || sudahClosing)) {
      ctx.sesi.set(tSiap, { kirim: true });
      if (sudahIsi) continue;
      pembuka = sudahClosing && closing.kasir
        ? '🧾 *Kasir sudah tutup*, saatnya hitung stok bahan baku, foto, lalu kirim.'
        : `⏰ *${STOK_SEBELUM_TUTUP} menit lagi jam closing (${jamTampil(tutup, e)}).* Mulai siap-siap: bereskan dulu yang sudah tidak dipakai, lalu hitung stok bahan baku dan foto. Kirim setelah kasir tutup.`;
      if (sudahClosing) ctx.sesi.set(tTagih, { kirim: true });
    } else if (ctx.sesi.get(tSiap) && !ctx.sesi.get(tTagih) && sudahClosing) {
      ctx.sesi.set(tTagih, { kirim: true });
      if (sudahIsi) continue;
      pembuka = closing.kasir
        ? '🧾 *Kasir sudah tutup.* Stok closing hari ini belum diisi: hitung, foto, lalu kirim dengan format di bawah.'
        : '🌙 *Stok closing hari ini belum diisi.* Hitung, foto, lalu kirim dengan format di bawah.';
    }
    if (!pembuka) continue;
    let tugasHari = [];
    try { tugasHari = (await ctx.store.all('Tugas Harian')).filter((r) => r.kode_event === e.kode && String(r.tanggal) === tanggal && aktif(r)); } catch { tugasHari = []; }
    const nama = (bg) => [...new Set(tugasHari.filter((t) => bg.includes(t.bagian)).map((t) => t.nama))];
    const teks = teksFormatStok(e, bahanEvent(e.kode, bahanRows, hargaBahan), tanggal, { getok: nama(['Getok']), plating: nama(['Plating', 'Kasir']) });
    for (const g of grup.filter((x) => x.kode_event === e.kode && x.jenis === 'event')) keluar.push({ groupId: g.group_id, text: `${pembuka}\n\n${teks}` });
  }
  return keluar;
}

const jamTampil = (d, e) => { const z = zonaKota(e.kota); return `${lokal(d, z).jam.replace(':', '.')} ${z.nama}`; };

// ---------------------------------------------------------------- sidak stok (PIC/owner, dadakan)
// #sidak (chat pribadi ke bot atau grup pengeluaran; TIDAK di grup tim supaya tetap dadakan)
//   #sidak              -> format hitungan
//   #sidak
//   Mozzarella = 12 pack -> dibandingkan dengan laporan closing terakhir (+ restock setelahnya).
// Kalau berbeda, bot bertanya: minus berapa poin untuk penanggung jawab bahan itu ("minus 5", "minus 5 Bima", "tidak").

const kunciSidak = (pesan) => `sidak:${pesan.pribadi ? pesan.senderId : pesan.groupId}`;
const nomor62 = (n) => String(n || '').replace(/\D/g, '').replace(/^0/, '62');
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

// Event yang boleh disidak oleh pengirim: owner = semua event berjalan; PIC = event yang ia pegang.
export async function eventSidak(ctx, pesan, isOwner) {
  const hari = tanggalClosing(pesan.waktu);
  const [events, tim, karyawan] = await Promise.all(['Event', 'Tim Event', 'Karyawan'].map((t) => ctx.store.all(t)));
  const berjalan = events.filter((e) => e.status !== 'BATAL' && e.status !== 'SELESAI' && e.mulai && e.mulai <= tambahHari(hari, 1) && (!e.selesai || hari <= e.selesai));
  if (isOwner) return berjalan;
  const namaSaya = karyawan.filter((k) => nomor62(k.nomor_wa) === String(pesan.senderId)).map((k) => k.nama);
  return berjalan.filter((e) => sama(e.pic, namaSaya[0]) || tim.some((o) => o.kode_event === e.kode && o.peran === 'PIC' && namaSaya.some((n) => sama(n, o.nama))));
}

function namaPelapor(pengirim, karyawan) {
  const no = (String(pengirim || '').match(/\((\d+)\)/) || [])[1];
  const k = no && karyawan.find((x) => nomor62(x.nomor_wa) === no);
  return k ? k.nama : String(pengirim || '').replace(/\s*\(\d+\)\s*$/, '') || 'pelapor';
}

export async function perintahSidak(ctx, pesan, event, cmd) {
  const hargaBahan = await ctx.store.all('Harga Bahan');
  const bahanRows = await ctx.store.all('Bahan Event');
  const teks = [cmd.sisaBaris, cmd.badan].filter(Boolean).join('\n').replace(/\b[A-Z]{3}\d{2}-\d{2}(-\d+)?\b/g, '');
  // Boleh per lokasi ([Gudang] / [Booth] / [Cooler]); dibandingkan per bahan (total semua lokasi).
  const perLokasi = bacaIsiStok(teks, hargaBahan);
  const items = [...new Set(perLokasi.map((x) => x.bahan))].map((b) => {
    const r = perLokasi.filter((x) => x.bahan === b);
    return { bahan: b, satuan: r[0].satuan, jumlah: r.reduce((t, x) => t + x.jumlah, 0) };
  });
  const daftar = bahanEvent(event.kode, bahanRows, hargaBahan);
  if (!items.length) {
    return balas([`🕵️ *Sidak stok ${event.kode}* (dadakan, tim tidak diberi tahu)`, 'Hitung stok sekarang, ganti titik-titik, lalu kirim:', '', `#sidak ${event.kode}`,
      ...daftar.map((b) => `${b.bahan} = ... ${b.satuan || ''}`.trim()),
      ...NAMPAN.map((n) => `${n.bahan} = ... nampan`),
      '', '_Paling tepat dilakukan sebelum booth buka atau setelah tim melapor stok closing._'].join('\n'));
  }
  let stokRows = [];
  try { stokRows = await ctx.store.all('Stok Harian'); } catch { stokRows = []; }
  const karyawan = await ctx.store.all('Karyawan');
  const hasil = items.map((it) => {
    const milik = stokRows.filter((r) => r.kode_event === event.kode && r.bahan === it.bahan && aktif(r));
    const tgl = [...new Set(milik.map((r) => String(r.tanggal)))].sort().pop();
    if (!tgl) return { ...it, laporan: null };
    const rows = milik.filter((r) => String(r.tanggal) === tgl);
    const totalLap = rows.reduce((t, r) => t + num(r.jumlah), 0);
    const restock = bahanRows.filter((r) => r.kode_event === event.kode && r.bahan === it.bahan && aktif(r) && r.gerak === 'Restock' && String(r.tanggal) > tgl)
      .reduce((t, r) => t + num(r.jumlah), 0);
    const seharusnya = totalLap + restock;
    // Yang ditanya minus/denda: penanggung jawab bahan itu; cadangan: pelapor.
    const pj = [...new Set(rows.flatMap((r) => String(r.penanggung_jawab || '').split(',').map((x) => x.trim()).filter(Boolean)))];
    const pelapor = pj.length ? pj.join(', ') : [...new Set(rows.map((r) => namaPelapor(r.pengirim, karyawan)))].join(', ');
    return { ...it, laporan: { tanggal: tgl, jumlah: totalLap }, restock, seharusnya, selisih: it.jumlah - seharusnya, pelapor, pjList: pj.length ? pj : pelapor.split(', ') };
  });
  const tanggal = tanggalLokal(pesan.waktu);
  const oleh = pesan.senderName || pesan.senderId;
  for (const h of hasil) {
    await ctx.store.append('Sidak Stok', {
      tanggal, kode_event: event.kode, bahan: h.bahan, hitung_sidak: h.jumlah, satuan: h.satuan,
      menurut_laporan: h.laporan ? h.seharusnya : '', selisih: h.laporan ? h.selisih : '',
      laporan_tanggal: h.laporan ? String(h.laporan.tanggal) : '', pelapor: h.pelapor || '', oleh, dicatat: waktuLokal(pesan.waktu),
    });
  }
  const baris = hasil.map((h) => {
    const s = h.satuan || '';
    if (!h.laporan) return `• ${h.bahan}: sidak ${fmt(h.jumlah)} ${s} _(belum ada laporan closing untuk dibandingkan)_`;
    const dasar = `laporan closing ${tglPendek(String(h.laporan.tanggal))} oleh ${h.pelapor}: ${fmt(num(h.laporan.jumlah))}${h.restock ? ` + restock ${fmt(h.restock)}` : ''} = ${fmt(h.seharusnya)}`;
    if (h.selisih === 0) return `✅ ${h.bahan}: sidak *${fmt(h.jumlah)} ${s}* = sesuai (${dasar})`;
    return `❌ ${h.bahan}: sidak *${fmt(h.jumlah)} ${s}*, ${dasar} → selisih *${h.selisih > 0 ? '+' : ''}${fmt(h.selisih)} ${s}*`;
  });
  const beda = hasil.filter((h) => h.laporan && h.selisih !== 0);
  const pelapor = [...new Set(beda.flatMap((h) => h.pjList))];
  if (beda.length && ctx.sesi) {
    ctx.sesi.set(kunciSidak(pesan), { kode: event.kode, pelapor, ringkas: beda.map((h) => `${h.bahan} ${h.selisih > 0 ? '+' : ''}${fmt(h.selisih)} ${h.satuan || ''}`.trim()).join(', '), tanggal: String(beda[0].laporan.tanggal), waktu: Date.now() });
  }
  return balas([
    `🕵️ *Hasil sidak stok ${event.kode}* (${oleh})`,
    ...baris,
    beda.length
      ? `\n⚠️ *${beda.length} bahan berbeda dengan laporan.* Mau beri minus poin KPI untuk penanggung jawab bahan (${pelapor.join(', ')})?\nBalas: *minus 5* · *minus 5 ${pelapor[0]}* · *tidak*\n_Selisih tidak wajar (owner): *denda 200rb ${pelapor[0]}* untuk yang lalai, atau *denda 200rb rata* dibagi rata ke senior event ini._`
      : (hasil.some((h) => h.laporan) ? '\n✅ Semua sesuai dengan laporan closing.' : ''),
    '_Hasil sidak tercatat di tab Sidak Stok. Tim tidak diberi tahu._',
  ].filter(Boolean).join('\n'));
}

// Jawaban PIC/owner setelah sidak: "minus 5", "minus 5 Bima", "-3 Tiara", "tidak".
export async function jawabSidak(ctx, pesan) {
  if (!ctx.sesi) return null;
  const k = kunciSidak(pesan);
  const s = ctx.sesi.get(k);
  if (!s || Date.now() - s.waktu > 24 * 3600e3) return null;
  const teks = String(pesan.text || '').trim();
  if (/^(tidak|tdk|gak|nggak|ga|batal|skip|lewati|selesai|cukup)\b/i.test(teks)) { ctx.sesi.hapus(k); return balas('👌 Sidak selesai. Hasilnya tetap tercatat di tab Sidak Stok.'); }
  const tim = (await ctx.store.all('Tim Event')).filter((t) => t.kode_event === s.kode && t.status !== STATUS.BATAL);
  const kenal = [...(await ctx.store.all('Karyawan')).map((x) => x.nama), ...tim.map((t) => t.nama)];
  const cariNama = (teksNama) => teksNama.split(/[,&]|\s+dan\s+|\s+/).map((x) => x.trim()).filter(Boolean)
    .map((n) => kenal.find((x) => sama(x, n)) || kenal.find((x) => String(x).toLowerCase().startsWith(n.toLowerCase()))).filter(Boolean);
  const alasan = `Sidak stok ${s.kode}: berbeda dengan laporan closing ${tglPendek(s.tanggal)} (${s.ringkas})`;
  const oleh = `${pesan.senderName || pesan.senderId} (sidak)`;

  // Denda uang (owner): "denda 200rb Bima" / "denda 200rb rata" (dibagi rata ke senior event ini)
  const d = teks.match(/^denda\s+(.+)$/i);
  if (d) {
    if (!ctx.ownerIds?.has(pesan.senderId)) return balas('⚠️ Denda uang hanya diputuskan owner.');
    const jumlah = parseMoney(d[1]);
    if (!jumlah) return balas('Format: *denda 200rb Bima* atau *denda 200rb rata*');
    const rata = /\brata\b/i.test(d[1]);
    const senior = tim.filter((t) => t.peran === 'Tetap').map((t) => t.nama);
    const kena = rata ? (senior.length ? senior : tim.filter((t) => t.peran !== 'PIC').map((t) => t.nama)) : [...new Set(cariNama(d[1].replace(/[\d.,]+\s*(rb|ribu|k|jt|juta)?/ig, '')))];
    if (!kena.length) return balas(`Sebutkan namanya, contoh: *denda ${rupiah(jumlah).replace('Rp ', '')} ${s.pelapor[0] || 'Bima'}*, atau *denda ... rata*.`);
    const per = rata ? Math.round(jumlah / kena.length / 100) * 100 : jumlah;
    for (const n of kena) {
      await ctx.store.append('Denda', {
        tanggal: tanggalLokal(pesan.waktu), kode_event: s.kode, nama: n, jumlah: per, jenis: 'Selisih stok',
        alasan: `${alasan}${rata ? ` – dibagi rata ${kena.length} orang dari ${rupiah(jumlah)}` : ''}`, oleh, status: STATUS.OK, dicatat: waktuLokal(pesan.waktu),
      });
    }
    ctx.sesi.hapus(k);
    return balas(`💸 *Denda selisih stok ${s.kode}*: ${kena.map((n) => `${n} ${rupiah(per)}`).join(', ')}${rata ? ` (dibagi rata dari ${rupiah(jumlah)})` : ''}.\n_Dipotong dari gaji di *#gajian*. Tercatat di tab Denda (ubah Status jadi BATAL kalau dibatalkan)._`);
  }

  // Minus poin KPI: "minus 5" (pelapor) / "minus 5 Bima"
  const m = teks.match(/^(?:minus|min|kurang|potong|-)\s*(\d+)\s*(?:poin)?\s*(.*)$/i);
  if (!m) return null;
  if (s.minusSudah) return balas('👌 Minus poin sidak ini sudah dicatat. Lanjut *denda ...* (owner) atau *selesai*.');
  const poin = -Number(m[1]);
  const disebut = cariNama(m[2]);
  const nama = [...new Set(disebut.length ? disebut : s.pelapor)];
  let urut = (await ctx.store.all('Poin KPI')).length;
  for (const n of nama) {
    urut += 1;
    await ctx.store.append('Poin KPI', {
      id: `K${String(urut).padStart(4, '0')}`, tanggal: tanggalLokal(pesan.waktu), nama: n, poin,
      alasan, kode_event: s.kode, dicatat_oleh: oleh, status: STATUS.OK, dicatat: waktuLokal(pesan.waktu),
    });
  }
  ctx.sesi.set(k, { ...s, minusSudah: true });
  return balas(`🔻 *${poin} poin KPI* untuk ${nama.join(', ')}: sidak stok ${s.kode} berbeda dengan laporan (${s.ringkas}).\n_Masuk Poin KPI. Salah? *#poinbatal K....*_\n_Selisih tidak wajar? Owner bisa lanjut *denda 200rb Nama* / *denda 200rb rata*, atau *selesai*._`);
}
