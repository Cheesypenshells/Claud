// Perintah untuk data event: tim, bahan baku, dan porsi gratis.

import { STATUS } from './schema.js';
import { parseTim, parseOrang, parseBahan, parseGratis, PERAN } from './parsers.js';
import { cocokkan, hargaJual } from './katalog.js';
import { rupiah, tanggalLokal, waktuLokal, tambahHari, parseRentangTanggal, bersihkan } from './util.js';

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
      mulai: o.mulai || (tanggalLokal(pesan.waktu) > event.mulai ? tanggalLokal(pesan.waktu) : event.mulai),
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
  const tim = (await ctx.store.all('Tim Event')).filter((o) => o.kode_event === event.kode);
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
  const ditambah = await tambahTim(ctx, pesan, event, parseOrang(sisa, peran));
  if (!ditambah.length) return balas(`⚠️ ${bersihkan(sisa)} sudah ada di tim ${event.kode}.`);
  return balas(`✅ Ditambahkan ke tim ${event.kode} mulai ${ditambah[0].mulai}:\n${ditambah.map(barisOrang).join('\n')}`);
}

// #berhenti Joko            -> hari kerja terakhir kemarin
// #berhenti Joko 9 Nov      -> hari kerja terakhir 9 Nov
export async function perintahBerhenti(ctx, pesan, event, cmd) {
  const teks = cmd.argumen.join(' ');
  const tim = (await ctx.store.all('Tim Event')).filter((o) => o.kode_event === event.kode);
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

export async function perintahBahan(ctx, pesan, event, cmd) {
  const gerak = GERAK[cmd.perintah];
  const hargaBahan = await ctx.store.all('Harga Bahan');
  const items = parseBahan([cmd.sisaBaris, cmd.badan].filter(Boolean).join('\n'), hargaBahan, cocokkan);
  if (!items.length) {
    return balas(`Format: *#${cmd.perintah}* lalu satu bahan per baris, contoh:\n#${cmd.perintah}\nmozzarella 20 pack\nbumbu garlic 5 pack\noyster 100 kg\n\nBahan yang dikenali: ${hargaBahan.map((b) => b.bahan).join(', ')}`);
  }
  for (const it of items) {
    await ctx.store.append('Bahan Event', {
      tanggal: tanggalLokal(pesan.waktu),
      kode_event: event.kode,
      bahan: it.bahan,
      gerak,
      jumlah: it.jumlah,
      satuan: it.satuan,
      pengirim: namaPengirim(pesan),
      status: STATUS.OK,
      dicatat: waktuLokal(pesan.waktu),
    });
  }
  const semua = (await ctx.store.all('Bahan Event')).filter((b) => b.kode_event === event.kode && b.status !== STATUS.BATAL);
  const ringkas = [...new Set(items.map((i) => i.bahan))].map((nama) => {
    const g = semua.filter((b) => b.bahan === nama);
    const t = (j) => g.filter((b) => b.gerak === j).reduce((s, b) => s + Number(b.jumlah || 0), 0);
    const satuan = items.find((i) => i.bahan === nama).satuan;
    return `• ${nama}: keluar ${t('Keluar')} + restock ${t('Restock')} − kembali ${t('Kembali')} = terpakai *${t('Keluar') + t('Restock') - t('Kembali')} ${satuan}*`;
  });
  const judul = { Keluar: 'Bahan keluar dari gudang', Restock: 'Restock bahan', Kembali: 'Sisa bahan dikembalikan ke gudang' }[gerak];
  const catatan = gerak === 'Kembali' ? '\n_Pack yang sudah dibuka dianggap habis; tulis pack utuh saja._' : '';
  return balas(`✅ *${judul}* (${event.kode})\n${items.map((i) => `${i.bahan} ${i.jumlah} ${i.satuan}`).join('\n')}\n\nTotal event:\n${ringkas.join('\n')}${catatan}`);
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
  return balas(`🎁 *Porsi gratis tercatat* (${event.kode})\n${baris.join('\n')}\nNilai harga jual: *${rupiah(total)}*`);
}
