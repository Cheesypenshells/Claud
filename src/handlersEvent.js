// Perintah untuk data event: tim, bahan baku, dan porsi gratis.

import { STATUS } from './schema.js';
import { parseTim, parseOrang, parseBahan, parseGratis, PERAN, ambilTanggal } from './parsers.js';
import { cocokkan, hargaJual } from './katalog.js';
import { hitungBahan, BAHAN_DIBELI } from './bahan.js';
import { ATURAN } from './laporan.js';
import { rupiah, tanggalLokal, waktuLokal, tambahHari, parseRentangTanggal, bersihkan, parseMoney } from './util.js';

const balas = (text) => [{ text }];
const namaPengirim = (pesan) => (pesan.senderName ? `${pesan.senderName} (${pesan.senderId})` : pesan.senderId);
const sama = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// ---------- Tim ----------

export async function tambahTim(ctx, pesan, event, orang) {
  const semua = await ctx.store.all('Tim Event');
  const ditambah = [];
  for (const o of orang) {
    const ada = semua.find((x) => x.kode_event === event.kode && sama(x.nama, o.nama));
    if (ada) continue;
    const row = {
      kode_event: event.kode,
      nama: o.nama,
      peran: o.peran,
      upah_harian: o.upah_harian,
      mulai: o.mulai || event.mulai,
      selesai: '',
      status: 'AKTIF',
      catatan: '',
      dicatat: waktuLokal(pesan.waktu),
    };
    await ctx.store.append('Tim Event', row);
    ditambah.push(row);
  }
  return ditambah;
}

function barisOrang(o) {
  const upah = o.peran === PERAN.DW || o.peran === PERAN.KASIR ? ` ${rupiah(o.upah_harian)}/hari` : '';
  const status = o.status === 'BERHENTI' ? ` (berhenti ${o.selesai})` : '';
  return `• ${o.nama} - ${o.peran}${upah}${status}`;
}

export async function daftarTim(ctx, event) {
  const tim = (await ctx.store.all('Tim Event')).filter((o) => o.kode_event === event.kode && o.status !== 'BATAL');
  if (!tim.length) return '(belum ada)';
  return Object.values(PERAN)
    .flatMap((p) => tim.filter((o) => o.peran === p))
    .map(barisOrang)
    .join('\n');
}

// #tim (blok) atau #tim saja untuk melihat daftar.
export async function perintahTim(ctx, pesan, event, cmd) {
  const orang = parseTim(cmd.badan);
  const ditambah = orang.length ? await tambahTim(ctx, pesan, event, orang) : [];
  const judul = orang.length ? `✅ ${ditambah.length} orang ditambahkan ke tim ${event.kode}` : `👥 *Tim ${event.kode}*`;
  return balas(`${judul}\n${await daftarTim(ctx, event)}\n\nTambah: *#tambah DW Joko 120rb* | Berhenti: *#berhenti Joko*`);
}

// #tambah DW Joko 120rb  /  #tambah kasir Sari  /  #tambah tetap Andi
export async function perintahTambah(ctx, pesan, event, cmd) {
  const peran = parseTim(`${cmd.argumen[0] || ''}: x`)[0]?.peran;
  const sisa = cmd.argumen.slice(1).join(' ');
  if (!peran || !sisa) return balas('Format: *#tambah <peran> <nama> [upah]*\nPeran: PIC, Tetap, DW, Kasir\nContoh: #tambah DW Joko 120rb');
  // Ditambah di tengah event: mulai kerja hari ini (untuk event yang sudah lewat: tanggal mulai event).
  const hariIni = tanggalLokal(pesan.waktu);
  const mulai = hariIni > event.mulai && hariIni <= event.selesai ? hariIni : event.mulai;
  const ditambah = await tambahTim(ctx, pesan, event, parseOrang(sisa, peran).map((o) => ({ ...o, mulai })));
  if (!ditambah.length) return balas(`⚠️ ${bersihkan(sisa)} sudah ada di tim ${event.kode}.`);
  return balas(`✅ Ditambahkan ke tim ${event.kode} mulai ${ditambah[0].mulai}:\n${ditambah.map(barisOrang).join('\n')}`);
}

// #berhenti Joko            -> hari kerja terakhir kemarin
// #berhenti Joko 9 Nov      -> hari kerja terakhir 9 Nov
export async function perintahBerhenti(ctx, pesan, event, cmd) {
  const teks = cmd.argumen.join(' ');
  const tim = (await ctx.store.all('Tim Event')).filter((o) => o.kode_event === event.kode && o.status !== 'BATAL');
  const o = tim
    .filter((x) => new RegExp(`(^|\\s)${x.nama.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`, 'i').test(teks))
    .sort((a, b) => b.nama.length - a.nama.length)[0];
  if (!o) return balas(`⚠️ Nama tidak ditemukan di tim ${event.kode}.\n${await daftarTim(ctx, event)}`);
  const tanggalTeks = bersihkan(teks.replace(new RegExp(o.nama, 'i'), ''));
  const tahun = Number(tanggalLokal(pesan.waktu).slice(0, 4));
  const terakhir = parseRentangTanggal(tanggalTeks, tahun)?.mulai || tambahHari(tanggalLokal(pesan.waktu), -1);
  await ctx.store.updateWhere('Tim Event', (x) => x.kode_event === event.kode && x.nama === o.nama, {
    selesai: terakhir,
    status: 'BERHENTI',
    catatan: `Dihentikan oleh ${pesan.senderName || pesan.senderId} (${waktuLokal(pesan.waktu)})`,
  });
  return balas(`🚪 ${o.nama} (${o.peran}) ditandai berhenti. Hari kerja terakhir: *${terakhir}*.\nUpah & bonus setelah tanggal itu tidak dihitung.`);
}

// ---------- Bahan baku ----------

const GERAK = { keluar: 'Keluar', bawa: 'Keluar', restock: 'Restock', tambahbahan: 'Restock', kembali: 'Kembali', sisa: 'Kembali', retur: 'Kembali' };
export const PERINTAH_BAHAN = Object.keys(GERAK);

// Bahan baku event: pengiriman pertama (Keluar), restock, sisa (Kembali). Bisa di grup tim (tanpa harga)
// atau grup pengeluaran (dengan nilai rupiah dari tab Harga Bahan). Untuk rekap event yang sudah selesai,
// tanggal boleh ditulis ("restock keju 3 balok 28 sep"); tanpa tanggal: awal = hari pertama event,
// sisa = hari terakhir event, restock = hari ini (atau hari pertama kalau event sudah selesai).
// Oyster dari supplier = pembelian di lokasi (pengeluaran biasa), bukan barang gudang.
// Setelah sisa dilaporkan, bot bertanya di grup pengeluaran: sisa ini dihargai berapa per satuan?
export async function perintahBahan(ctx, pesan, event, cmd, { harga: denganHarga = false, grupPengeluaran = [], tanggal: tanggalPaksa = '', judulRevisi = '' } = {}) {
  const gerak = GERAK[cmd.perintah];
  const hargaBahan = await ctx.store.all('Harga Bahan');
  const hariIni = tanggalLokal(pesan.waktu);
  const mentah = [cmd.sisaBaris, cmd.badan].filter(Boolean).join('\n');
  const { tanggal: tglTulis, sisa: tanpaTanggal } = ambilTanggal(mentah, hariIni, { mulai: event.mulai, selesai: event.selesai });
  let items = parseBahan(tglTulis ? tanpaTanggal : mentah, hargaBahan, cocokkan);
  if (!items.length) {
    return balas(`Format: *#${cmd.perintah}* lalu satu bahan per baris, contoh:\n#${cmd.perintah}\nmozzarella 20 pack\nbumbu garlic 5 pack\n\nBahan yang dikenali: ${hargaBahan.map((b) => b.bahan).join(', ')}`);
  }
  // Oyster dll. dibeli di lokasi: bukan awal/restock gudang.
  const dibeli = gerak === 'Kembali' ? [] : items.filter((i) => BAHAN_DIBELI.includes(i.bahan));
  items = items.filter((i) => !dibeli.includes(i));
  const infoBeli = dibeli.length
    ? `🦪 *${dibeli.map((i) => `${i.bahan} ${i.jumlah} ${i.satuan}`).join(', ')}* tidak dicatat sebagai bahan gudang: ${dibeli.map((i) => i.bahan).join(', ')} dibeli dari supplier, jadi dicatat sebagai *pengeluaran pembelian* dengan harganya${denganHarga ? `, contoh: *${dibeli[0].bahan.toLowerCase()} ${dibeli[0].jumlah} ${dibeli[0].satuan} 3,9jt*` : ' di grup pengeluaran'}.`
    : '';
  if (!items.length) return balas(infoBeli);

  const selesai = event.selesai && hariIni > event.selesai;
  const tanggal = tglTulis || tanggalPaksa || (gerak === 'Keluar' ? event.mulai : gerak === 'Kembali' && selesai ? event.selesai : selesai ? event.mulai : hariIni) || hariIni;
  const dicatat = `${waktuLokal(pesan.waktu)}:${pesan.id || ''}`;
  for (const it of items) {
    await ctx.store.append('Bahan Event', {
      tanggal, kode_event: event.kode, bahan: it.bahan, gerak, jumlah: it.jumlah, satuan: it.satuan,
      pengirim: namaPengirim(pesan), status: STATUS.OK, dicatat, harga_satuan: '',
    });
  }
  const semua = (await ctx.store.all('Bahan Event')).filter((b) => b.kode_event === event.kode && b.status !== STATUS.BATAL);
  const hitung = hitungBahan(semua, hargaBahan);
  const hargaDari = (nama) => Number(hargaBahan.find((x) => x.bahan === nama)?.harga || 0);
  const ringkas = hitung.filter((b) => items.some((i) => i.bahan === b.bahan)).map((b) => (b.dibeli
    ? `• ${b.bahan} (dibeli di lokasi): sisa ${b.sisa} ${b.satuan}`
    : `• ${b.bahan}: awal ${b.awal} + restock ${b.restock} = ${b.awal + b.restock}, sisa ${b.sisa} → terpakai *${b.terpakai} ${b.satuan}*${denganHarga ? ` = *${rupiah(b.nilaiTerpakai)}*` : ''}`));
  const judul = `${judulRevisi}${{ Keluar: 'Bahan baku pengiriman pertama', Restock: 'Restock bahan baku', Kembali: 'Sisa bahan baku' }[gerak]}`;
  const rincian = items.map((i) => `${i.bahan} ${i.jumlah} ${i.satuan}${denganHarga && gerak !== 'Kembali' ? ` × ${rupiah(hargaDari(i.bahan))} = ${rupiah(i.jumlah * hargaDari(i.bahan))}` : ''}`).join('\n');
  const totalEvent = hitung.reduce((s, b) => s + b.nilaiTerpakai, 0);
  const infoHarga = denganHarga ? `\n*Biaya bahan baku event (terpakai, semua bahan): ${rupiah(totalEvent)}*\n_Masuk rekap pengeluaran. Harga per satuan dari tab Harga Bahan._` : '';
  const keluar = [{ text: [`✅ *${judul}* (${event.kode}) – tgl ${tanggal}\n${rincian}\n\nTotal event:\n${ringkas.join('\n')}${gerak === 'Kembali' ? '' : infoHarga}`, infoBeli].filter(Boolean).join('\n\n') }];

  // Sisa: tanyakan nilainya di grup pengeluaran (harga tidak pernah dikirim ke grup tim).
  if (gerak === 'Kembali' && ctx.sesi) {
    const tujuan = denganHarga ? [pesan.groupId] : grupPengeluaran;
    const daftar = items.map((i, n) => `${n + 1}. ${i.bahan} ${i.jumlah} ${i.satuan} – harga tab: ${rupiah(hargaDari(i.bahan))}/${i.satuan}`).join('\n');
    const contoh = items.length > 1 ? `*${items.map((i) => `${i.bahan.split(' ')[0].toLowerCase()} 200rb`).join(', ')}*` : '*200rb*';
    const tanya = `💰 *Sisa bahan ${event.kode} dihargai berapa per satuan?*\n${daftar}\n\nBalas ${contoh} (harga per satuan), *ya* = pakai harga tab, atau *0* kalau tidak bernilai (rusak/busuk).`;
    for (const g of tujuan) {
      ctx.sesi.set(`nilaisisa:${g}`, { kode: event.kode, dicatat, items: items.map((i) => ({ bahan: i.bahan, jumlah: i.jumlah, satuan: i.satuan })), waktu: Date.now() });
      if (g === pesan.groupId) keluar[0].text += `\n\n${tanya}`;
      else keluar.push({ groupId: g, text: tanya });
    }
    if (!tujuan.length) keluar[0].text += '\n\n_Nilai sisa akan ditanyakan di grup pengeluaran (belum terdaftar)._';
  }
  return keluar;
}

// Jawaban "sisa ... dihargai berapa?": "200rb" / "keju 200rb, garlic 450rb" / "ya" / "0".
// Mengembalikan balasan, atau null kalau pesan ini bukan jawaban (pesan pengeluaran biasa).
export async function jawabNilaiSisa(ctx, pesan, event) {
  if (!ctx.sesi || !event) return null;
  const kunci = `nilaisisa:${pesan.groupId}`;
  const s = ctx.sesi.get(kunci);
  if (!s || s.kode !== event.kode || Date.now() - s.waktu > 2 * 24 * 60 * 60 * 1000) return null;
  const t = String(pesan.text || '').trim();
  if (!t || t.startsWith('#')) return null;
  const balasTanya = /dihargai berapa/i.test(pesan.kutipan?.teks || '');
  const hargaBahan = await ctx.store.all('Harga Bahan');
  const hargaTab = (nama) => Number(hargaBahan.find((x) => x.bahan === nama)?.harga || 0);
  const nilai = new Map();
  if (/^(ya|y|iya|ok|oke|pakai|pakai harga tab|sesuai|sama|harga tab)$/i.test(t)) {
    for (const i of s.items) nilai.set(i.bahan, hargaTab(i.bahan));
  } else if (/^(0|nol|tidak|gak|ga|tidak bernilai|busuk|rusak|hangus|gratis)$/i.test(t)) {
    for (const i of s.items) nilai.set(i.bahan, 0);
  } else {
    const bagian = t.split(/\n|,|;|\s+dan\s+/i).map((x) => x.trim()).filter(Boolean);
    for (const b of bagian) {
      const uang = parseMoney(b) ?? (/^\s*0\s*$|\b(0|nol)\b/.test(b) ? 0 : null);
      const kandidat = hargaBahan.filter((h) => s.items.some((i) => i.bahan === h.bahan));
      const dikenal = cocokkan(b, kandidat, 'bahan')?.bahan;
      const cocok = s.items.find((i) => i.bahan === dikenal || b.toLowerCase().includes(i.bahan.toLowerCase().split(' ')[0]));
      const target = cocok || (s.items.length === 1 && bagian.length === 1 ? s.items[0] : null);
      if (!target || uang === null) continue;
      // "keju 2 balok total 400rb" -> per satuan
      nilai.set(target.bahan, /\btotal\b/i.test(b) ? Math.round(uang / target.jumlah) : uang);
    }
    // Bukan jawaban: tidak ada nilai terbaca dan bukan reply ke pertanyaannya.
    if (!nilai.size) return balasTanya ? balas('Belum terbaca. Contoh: *200rb* (per satuan), *keju 200rb, garlic 450rb*, *ya* (harga tab), atau *0*.') : null;
    // Pesan yang juga berisi kata lain (pengeluaran biasa) tanpa reply: jangan ditelan.
    const sisaKata = t.toLowerCase().replace(/\d[\d.,]*\s*(rb|ribu|k|jt|juta)?/g, ' ').split(/[^a-z]+/).filter((w) => w.length > 2
      && !/^(per|pack|balok|kg|kantong|total|dan|sisa|harga|dihargai|nilai|satuan|rp)$/.test(w)
      && !s.items.some((i) => {
        const h = hargaBahan.find((x) => x.bahan === i.bahan);
        const alias = [i.bahan, ...String(h?.alias || '').split(',')].join(' ').toLowerCase();
        return alias.split(/[^a-z]+/).includes(w);
      }));
    if (sisaKata.length && !balasTanya) return null;
  }
  for (const [bahan, h] of nilai) {
    await ctx.store.updateWhere('Bahan Event', (r) => r.kode_event === s.kode && r.dicatat === s.dicatat && r.bahan === bahan && r.gerak === 'Kembali', { harga_satuan: h });
  }
  const belum = s.items.filter((i) => !nilai.has(i.bahan));
  if (belum.length) ctx.sesi.set(kunci, { ...s, items: belum, waktu: Date.now() }); else ctx.sesi.hapus(kunci);
  const semua = (await ctx.store.all('Bahan Event')).filter((b) => b.kode_event === s.kode && b.status !== STATUS.BATAL);
  const total = hitungBahan(semua, hargaBahan).reduce((x, b) => x + b.nilaiTerpakai, 0);
  const baris = s.items.filter((i) => nilai.has(i.bahan)).map((i) => `• ${i.bahan} ${i.jumlah} ${i.satuan} × ${rupiah(nilai.get(i.bahan))} = *${rupiah(i.jumlah * nilai.get(i.bahan))}*`);
  return balas(`✅ *Nilai sisa bahan ${s.kode} dicatat* (mengurangi biaya bahan baku)\n${baris.join('\n')}${belum.length ? `\nBelum: ${belum.map((i) => i.bahan).join(', ')}` : ''}\n*Biaya bahan baku event sekarang: ${rupiah(total)}*`);
}

// Revisi bahan: reply ke pesan bahan (atau balasan bot-nya) dengan daftar baru. Baris lama yang cocok
// (gerak, bahan, jumlah) dibatalkan, lalu daftar baru dicatat dengan tanggal yang sama.
export async function revisiBahan(ctx, pesan, event, { gerak, teksLama, teksBaru, harga = false, grupPengeluaran = [] }) {
  const hargaBahan = await ctx.store.all('Harga Bahan');
  const lamaBersih = String(teksLama || '').split(/\n\s*\n?Total event:/i)[0].split('\n').map((b) => b.split('×')[0]).join('\n');
  const itemsLama = parseBahan(lamaBersih, hargaBahan, cocokkan);
  const itemsBaru = parseBahan(teksBaru, hargaBahan, cocokkan);
  if (!itemsBaru.length) return null;
  const semua = await ctx.store.all('Bahan Event');
  const dibatalkan = [];
  for (const it of itemsLama) {
    const cocok = semua.filter((b) => b.kode_event === event.kode && b.gerak === gerak && b.bahan === it.bahan && Number(b.jumlah) === Number(it.jumlah) && b.status !== STATUS.BATAL && !dibatalkan.includes(b)).pop();
    if (cocok) dibatalkan.push(cocok);
  }
  if (!dibatalkan.length) return null;
  for (const b of dibatalkan) {
    await ctx.store.updateWhere('Bahan Event', (r) => r.kode_event === b.kode_event && r.gerak === b.gerak && r.bahan === b.bahan && r.dicatat === b.dicatat && Number(r.jumlah) === Number(b.jumlah) && r.status !== STATUS.BATAL, { status: STATUS.BATAL });
  }
  const perintah = { Keluar: 'keluar', Restock: 'restock', Kembali: 'kembali' }[gerak];
  const hasil = await perintahBahan(ctx, pesan, event, { perintah, sisaBaris: teksBaru, badan: '', argumen: [] }, {
    harga, grupPengeluaran, tanggal: dibatalkan[0].tanggal, judulRevisi: '✏️ Revisi – ',
  });
  hasil[0].text = `${hasil[0].text}\n\n_Data lama dibatalkan: ${dibatalkan.map((b) => `${b.bahan} ${b.jumlah} ${b.satuan}`).join(', ')}._`;
  return hasil;
}

// ---------- Porsi gratis ----------

export async function perintahGratis(ctx, pesan, event, cmd) {
  const hargaMenu = await ctx.store.all('Harga Menu');
  const items = parseGratis([cmd.sisaBaris, cmd.badan].filter(Boolean).join('\n'), hargaMenu, cocokkan);
  if (!items.length) {
    return balas(`Format: *#gratis <jumlah> porsi <menu> isi <pcs> untuk <siapa>*\nContoh: #gratis 3 porsi mozzarella isi 4 untuk @rina_food\n\nMenu: ${hargaMenu.map((m) => m.menu).join(', ')}`);
  }
  const baris = [];
  let total = 0;
  for (const it of items) {
    await ctx.store.append('Porsi Gratis', {
      tanggal: tanggalLokal(pesan.waktu),
      kode_event: event.kode,
      ...it,
      pengirim: namaPengirim(pesan),
      status: STATUS.OK,
      dicatat: waktuLokal(pesan.waktu),
    });
    const nilai = it.pcs * hargaJual(hargaMenu.find((m) => m.menu === it.menu), event.wilayah);
    total += nilai;
    baris.push(`${it.porsi ? `${it.porsi} porsi × ${it.isi} pcs` : `${it.pcs} pcs`} ${it.menu}${it.untuk ? ` untuk ${it.untuk}` : ''} = ${it.pcs} pcs (${rupiah(nilai)})`);
  }
  const semua = (await ctx.store.all('Porsi Gratis')).filter((g) => g.kode_event === event.kode && g.status !== STATUS.BATAL);
  const terpakai = semua.reduce((s, g) => s + Number(g.pcs || 0) * hargaJual(hargaMenu.find((m) => m.menu === g.menu) || {}, event.wilayah), 0);
  const sisa = ATURAN.budgetPorsiGratis - terpakai;
  const infoBudget = sisa >= 0
    ? `Budget porsi gratis event: terpakai ${rupiah(terpakai)} dari ${rupiah(ATURAN.budgetPorsiGratis)}, sisa *${rupiah(sisa)}*`
    : `⚠️ *Budget porsi gratis terlewati!* Terpakai ${rupiah(terpakai)} dari ${rupiah(ATURAN.budgetPorsiGratis)} (lebih ${rupiah(-sisa)})`;
  return balas(`🎁 *Porsi gratis tercatat* (${event.kode})\n${baris.join('\n')}\nNilai harga jual: *${rupiah(total)}*\n\n${infoBudget}`);
}

// ---------- Kehadiran owner (menentukan fee PIC) ----------
// #owner tidak | #owner 1 hari | #owner setengah | #owner penuh | #owner 4 hari
export async function perintahOwner(ctx, pesan, event, cmd) {
  const t = cmd.argumen.join(' ').toLowerCase();
  let nilai = null;
  if (/^(tidak|ga|gak|nggak|0)(\s|$)|^0 hari/.test(t)) nilai = 'tidak';
  else if (/penuh|full|semua|awal sampai akhir/.test(t)) nilai = 'penuh';
  else if (/setengah|separuh|half/.test(t)) nilai = 'setengah';
  else if (/(\d+)\s*hari/.test(t)) {
    const hari = Number(t.match(/(\d+)\s*hari/)[1]);
    const lama = Math.round((new Date(`${event.selesai}T00:00:00Z`) - new Date(`${event.mulai}T00:00:00Z`)) / 86400000) + 1;
    nilai = hari <= 0 ? 'tidak' : hari >= lama ? 'penuh' : hari >= lama / 2 ? 'setengah' : '1 hari';
  }
  if (!nilai) {
    return balas('Format: *#owner tidak* | *#owner 1 hari* | *#owner setengah* | *#owner penuh* (atau jumlah hari, contoh #owner 4 hari)\nFee PIC: tidak datang 25%, 1 hari 20%, setengah event 15%, penuh 10% dari laba bersih.');
  }
  await ctx.store.update('Event', 'kode', event.kode, { owner_hadir: nilai });
  const persen = { tidak: 25, '1 hari': 20, setengah: 15, penuh: 10 }[nilai];
  return balas(`✅ Kehadiran owner di ${event.kode}: *${nilai}*\nFee PIC menjadi *${persen}%* dari laba bersih.`);
}
