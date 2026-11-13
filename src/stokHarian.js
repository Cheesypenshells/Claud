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
    `(nampan di freezer, minimal ${MIN_NAMPAN})`,
    ...NAMPAN.map((n) => `${n.bahan} = ... nampan`),
  ].join('\n');
}

// Hitung berkurang per bahan untuk tanggal closing `tanggal`.
export function hitungStok({ kode, mulai }, tanggal, item, stokRows, bahanRows) {
  const milikBahan = (r) => r.kode_event === kode && r.bahan === item.bahan && aktif(r);
  const kemarin = stokRows.filter((r) => milikBahan(r) && String(r.tanggal) < tanggal).sort((a, b) => String(a.tanggal).localeCompare(String(b.tanggal))).pop();
  const gerak = bahanRows.filter(milikBahan);
  let sebelumnya = null;
  let dari = mulai;
  if (adalahNampan(item.bahan)) return { ...item, sebelumnya: kemarin ? num(kemarin.jumlah) : null, restock: 0, terpakai: null, dariKemarin: Boolean(kemarin), nampan: true };
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
  const { nampan, sisa: teksBahan } = pisahNampan(teks);
  const items = [...parseBahan(teksBahan, hargaBahan, cocokkan), ...nampan];
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
  const baris = hasil.filter((h) => !h.nampan).map((h) => {
    const s = h.satuan || '';
    if (h.terpakai === null) return `• ${h.bahan}: *${fmt(h.jumlah)} ${s}* _(stok awal belum tercatat, jadi pemakaian mulai dihitung besok)_`;
    const asal = `${h.dariKemarin ? 'kemarin' : 'stok awal'} ${fmt(h.sebelumnya)}${h.restock ? ` + restock ${fmt(h.restock)}` : ''}`;
    if (h.terpakai < 0) return `• ${h.bahan}: *${fmt(h.jumlah)} ${s}* (${asal}) ⚠️ *naik ${fmt(-h.terpakai)}*: cek lagi hitungannya atau restock yang belum dicatat`;
    return `• ${h.bahan}: *${fmt(h.jumlah)} ${s}* (${asal}) → berkurang *${fmt(h.terpakai)} ${s}*`;
  });
  const belum = [...daftar, ...NAMPAN].filter((b) => !hasil.some((h) => h.bahan === b.bahan)).map((b) => b.bahan);
  const hariIniLain = stokRows.filter((r) => r.kode_event === event.kode && String(r.tanggal) === tanggal && aktif(r) && !hasil.some((h) => h.bahan === r.bahan));
  const masihBelum = belum.filter((b) => !hariIniLain.some((r) => r.bahan === b));
  // Nampan: jumlah per jenis + total dibanding minimal (gabung dengan yang sudah dilapor hari ini).
  const barisNampan = hasil.filter((h) => h.nampan).map((h) => `• ${h.bahan}: *${fmt(h.jumlah)}*${h.sebelumnya !== null ? ` (kemarin ${fmt(h.sebelumnya)})` : ''}`);
  const nampanHariIni = [...hasil.filter((h) => h.nampan), ...hariIniLain.filter((r) => adalahNampan(r.bahan))];
  let minimal = MIN_NAMPAN;
  try { minimal = Number((await ctx.store.all('Pengaturan')).find((p) => p.kunci === 'min_nampan')?.nilai) || MIN_NAMPAN; } catch { /* bawaan */ }
  const totalNampan = nampanHariIni.reduce((t, r) => t + num(r.jumlah), 0);
  const terakhir = event.selesai && tanggal >= event.selesai;
  return balas([
    `📦 *Stok closing ${event.kode}* – ${tglPendek(tanggal)} tercatat (oleh ${pesan.senderName || 'tim'})`,
    ...baris,
    ...(barisNampan.length ? ['', '🧊 *Nampan siap bakar di freezer*', ...barisNampan, teksTotalNampan(totalNampan, minimal)] : []),
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

// ---------------------------------------------------------------- sidak stok (PIC/owner, dadakan)
// #sidak (chat pribadi ke bot atau grup pengeluaran; TIDAK di grup tim supaya tetap dadakan)
//   #sidak              -> format hitungan
//   #sidak
//   Mozzarella = 12 pack -> dibandingkan dengan laporan closing terakhir (+ restock setelahnya).
// Kalau berbeda, bot bertanya: minus berapa poin untuk pelapor closing itu ("minus 5", "minus 5 Bima", "tidak").

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
  const { nampan, sisa: teksBahan } = pisahNampan(teks);
  const items = [...parseBahan(teksBahan, hargaBahan, cocokkan), ...nampan];
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
    const lap = stokRows.filter((r) => r.kode_event === event.kode && r.bahan === it.bahan && aktif(r)).sort((a, b) => `${a.tanggal}${a.dicatat}`.localeCompare(`${b.tanggal}${b.dicatat}`)).pop();
    if (!lap) return { ...it, laporan: null };
    const restock = bahanRows.filter((r) => r.kode_event === event.kode && r.bahan === it.bahan && aktif(r) && r.gerak === 'Restock' && String(r.tanggal) > String(lap.tanggal))
      .reduce((s, r) => s + num(r.jumlah), 0);
    const seharusnya = num(lap.jumlah) + restock;
    return { ...it, laporan: lap, restock, seharusnya, selisih: it.jumlah - seharusnya, pelapor: namaPelapor(lap.pengirim, karyawan) };
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
  const pelapor = [...new Set(beda.map((h) => h.pelapor))];
  if (beda.length && ctx.sesi) {
    ctx.sesi.set(kunciSidak(pesan), { kode: event.kode, pelapor, ringkas: beda.map((h) => `${h.bahan} ${h.selisih > 0 ? '+' : ''}${fmt(h.selisih)} ${h.satuan || ''}`.trim()).join(', '), tanggal: String(beda[0].laporan.tanggal), waktu: Date.now() });
  }
  return balas([
    `🕵️ *Hasil sidak stok ${event.kode}* (${oleh})`,
    ...baris,
    beda.length
      ? `\n⚠️ *${beda.length} bahan berbeda dengan laporan.* Mau beri minus poin KPI untuk pelapor closing (${pelapor.join(', ')})?\nBalas: *minus 5* · *minus 5 ${pelapor[0]}* · *tidak*`
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
  if (/^(tidak|tdk|gak|nggak|ga|batal|skip|lewati)\b/i.test(teks)) { ctx.sesi.hapus(k); return balas('👌 Tidak ada minus poin untuk sidak ini. Hasilnya tetap tercatat di tab Sidak Stok.'); }
  const m = teks.match(/^(?:minus|min|kurang|potong|-)\s*(\d+)\s*(?:poin)?\s*(.*)$/i);
  if (!m) return null;
  const poin = -Number(m[1]);
  const sebut = m[2].split(/[,&]|\s+dan\s+|\s+/).map((x) => x.trim()).filter(Boolean);
  const kenal = [...(await ctx.store.all('Karyawan')).map((x) => x.nama), ...(await ctx.store.all('Tim Event')).filter((t) => t.kode_event === s.kode).map((t) => t.nama)];
  const dicocokkan = sebut.map((n) => kenal.find((x) => sama(x, n)) || kenal.find((x) => String(x).toLowerCase().startsWith(n.toLowerCase()))).filter(Boolean);
  const nama = [...new Set(dicocokkan.length ? dicocokkan : s.pelapor)];
  let urut = (await ctx.store.all('Poin KPI')).length;
  for (const n of nama) {
    urut += 1;
    await ctx.store.append('Poin KPI', {
      id: `K${String(urut).padStart(4, '0')}`, tanggal: tanggalLokal(pesan.waktu), nama: n, poin,
      alasan: `Sidak stok: berbeda dengan laporan closing ${tglPendek(s.tanggal)} (${s.ringkas})`, kode_event: s.kode,
      dicatat_oleh: `${pesan.senderName || pesan.senderId} (sidak)`, status: STATUS.OK, dicatat: waktuLokal(pesan.waktu),
    });
  }
  ctx.sesi.hapus(k);
  return balas(`🔻 *${poin} poin KPI* untuk ${nama.join(', ')}: sidak stok ${s.kode} berbeda dengan laporan (${s.ringkas}).\n_Masuk Poin KPI. Salah? *#poinbatal K....* (lihat tab Poin KPI)._`);
}
