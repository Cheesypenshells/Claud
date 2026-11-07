// Logika utama bot: menerima satu pesan grup, mengembalikan balasan.
// Tidak bergantung pada WhatsApp secara langsung supaya bisa dites.
//
// pesan = { id, groupId, groupName, senderId, senderName, text, adaFoto: boolean, waktu: Date }
// ctx   = { store, ownerIds: Set<string> }
// hasil = array balasan { text } untuk dikirim ke grup yang sama.

import { JENIS_GRUP, BUKU, JENIS, STATUS } from './schema.js';
import { parsePerintah, parseEvent, parsePengeluaranDetail, parseOmzet, parseTim, DAFTAR_KATEGORI } from './parsers.js';
import { rekapEvent, formatRekapEvent, rekapBulan, formatRekapBulan, jatuhTempo } from './finance.js';
import { rupiah, persen, tanggalLokal, jamLokal, waktuLokal, tambahHari, parseMoney } from './util.js';
import { mulaiSapaan, mulaiEventBaru, prosesJawaban, blokUbah } from './wizard.js';
import { tentukanUangSiapa, perintahUang, perintahGanti, perintahPenggantian } from './uangSiapa.js';
import { perluTanyaHarga, tanyaHarga, tanyaBahan, tanyaKategori, tanyaKeterangan, jawabLengkapi } from './lengkapi.js';
import { KATEGORI } from './parsers.js';
import {
  tambahTim, daftarTim, perintahTim, perintahTambah, perintahBerhenti, perintahBahan, perintahGratis, perintahOwner, PERINTAH_BAHAN,
} from './handlersEvent.js';

const BANTUAN = {
  umum: `*Perintah bot Cheesy Pen Shells*
#idsaya - lihat ID WhatsApp kamu
#bantuan - daftar perintah`,
  pengeluaran: `*Grup pengeluaran event*
• Ketik pengeluaran biasa, satu per baris:
  lalamove 150k
  makan malam 120rb cash
  ember 2 unit @30rb
• Foto bukti boleh dikirim, tapi harga tetap ditulis di caption
• #trf 3.500.000 omzet 1-2 Nov  (transfer masuk dari IO)
• #potongan listrik 250rb  (potongan IO: listrik/air/gas/galon)
• #omzet 12,5jt  (omzet harian, kalau tidak dikirim di grup event)
• #rekap - rekap event ini
• #batal T0012 - batalkan catatan
• #kategori T0012 Konsumsi - ganti kategori
• Uang siapa: tulis *uang mama* / *uang valen* / *uang saya* / *uang kas* di pesan (default: pengirim)
• #uang T0012 mama - ubah uang siapa | #penggantian - siapa harus ditransfer berapa
• #ganti Valen 500rb - catat transfer penggantian (owner)
• #selesai - tutup event (owner)

*Tim:* #tim (lihat/tambah), #tambah DW Joko 120rb, #berhenti Joko
*Bahan:* #keluar / #restock / #kembali + satu bahan per baris (mozzarella 20 pack)
*Gratis:* #gratis 3 porsi mozzarella isi 4 untuk @influencer
*Kategori otomatis:* sapu/etalase = barang non-konsumtif (kelalaian), sumpit/plastik = konsumtif, endorse = iklan, obat/ganti rugi = tak terduga, hotel 350rb x 3 malam = penginapan`,
  ruko: `*Grup kas ruko*
• Ketik pengeluaran ruko: listrik 850rb, gaji Andi 2jt, air 150rb
• #rekap - rekap bulan ini, #rekap bulan 2026-11
• #batal T0012`,
  event: `*Grup event (tim)*
• #omzet + format laporan harian SOP BAB 6:
  #omzet
  OMZET TERVERIFIKASI: Rp 12.500.000
  JUMLAH TRANSAKSI: 85
  SELISIH / REFUND / KOREKSI: 0
• #keluar / #restock / #kembali + bahan per baris (mozzarella 20 pack)
• #gratis 3 porsi mozzarella isi 4 untuk @influencer`,
  owner: `*Khusus owner*
• #eventbaru - bot bertanya data event satu per satu
• #mulai - bot menanyakan grup ini untuk apa
• #ubah bagi hasil 27 / #ubah tanggal 1-16 Nov 2026 - ubah data event
• #owner tidak / 1 hari / setengah / penuh - kehadiran owner (fee PIC 25/20/15/10%)
• #daftar pengeluaran KODE | #daftar event KODE | #daftar ruko | #daftar gudang
• #event (blok setup event sekaligus, lihat panduan)
• #rekap bulan [YYYY-MM]`,
};

// Kata kunci kalimat bahan -> perintah bahan (#keluar / #restock / #kembali).
function gerakBahanDariKalimat(teks) {
  const t = ` ${String(teks).toLowerCase()} `;
  if (/\s(sisa|kembali|dikembalikan|retur|balik)\s/.test(t)) return 'kembali';
  // Barang yang datang ke booth di tengah event disebut restock.
  if (/\s(restock|restok|tambahan bahan|tambah bahan|datang|tiba|sampai)\s/.test(t)) return 'restock';
  if (/\s(kirim|kiriman|dikirim|bawa|dibawa|keluar|bahan keluar)\s/.test(t)) return 'keluar';
  return null;
}

// Disimpan sebagai "Nama (628xxx)" supaya mudah dibaca dan tetap unik.
function namaPengirim(pesan) {
  return pesan.senderName ? `${pesan.senderName} (${pesan.senderId})` : pesan.senderId;
}

function balas(text) {
  return [{ text }];
}

// Omzet yang dilaporkan sebelum jam 05.00 dianggap omzet hari sebelumnya (closing lewat tengah malam).
function tanggalOperasional(waktu) {
  const tgl = tanggalLokal(waktu);
  return jamLokal(waktu) < '05:00' ? tambahHari(tgl, -1) : tgl;
}

async function cariGrup(store, groupId) {
  const semua = await store.all('Grup');
  return semua.find((g) => g.group_id === groupId) || null;
}

async function cariEvent(store, kode) {
  if (!kode) return null;
  const semua = await store.all('Event');
  return semua.find((e) => String(e.kode).toUpperCase() === String(kode).toUpperCase()) || null;
}

async function idBaru(store) {
  const semua = await store.all('Transaksi');
  const maks = semua.reduce((m, t) => Math.max(m, Number(String(t.id).replace(/\D/g, '')) || 0), 0);
  return `T${String(maks + 1).padStart(4, '0')}`;
}

async function simpanTransaksi(store, dasar, items) {
  const tersimpan = [];
  for (const item of items) {
    const id = await idBaru(store);
    const row = { ...dasar, ...item, id, status: dasar.status || STATUS.OK };
    await store.append('Transaksi', row);
    tersimpan.push(row);
  }
  return tersimpan;
}

function barisItem(t, hariIni) {
  const info = [t.kategori, t.metode].filter(Boolean).join(', ');
  const uang = t.dibayar_oleh ? ` (uang ${t.dibayar_oleh})` : '';
  const tgl = hariIni && t.tanggal && t.tanggal !== hariIni ? ` 📅 ${t.tanggal}` : '';
  return `${t.id} ${t.keterangan} - *${rupiah(t.nominal)}*${info ? ` [${info}]` : ''}${uang}${tgl}`;
}

// Pengeluaran / transfer masuk. Nominal selalu dari teks (pesan atau caption foto).
async function catatUang(ctx, pesan, { buku, jenis, kodeEvent, teks }) {
  let items = [];
  let dilewati = [];
  if (jenis === JENIS.MASUK_IO) {
    const nominal = parseMoney(teks);
    if (nominal) {
      const ket = teks.replace(/(rp\.?\s*)?[\d.,]+\s*(juta|jt|ribu|rb|k)?/i, '').trim();
      items = [{ keterangan: ket || 'Transfer omzet dari IO', nominal, kategori: 'Transfer IO', metode: 'TRANSFER' }];
    }
  } else {
    ({ items, dilewati } = parsePengeluaranDetail(teks, { adaFoto: pesan.adaFoto, hariIni: tanggalLokal(pesan.waktu) }));
  }

  // Ada angka tapi isinya obrolan/koreksi: jangan dicatat, tunjukkan catatan terakhir & cara membatalkannya.
  if (!items.length && dilewati.length) {
    const terakhir = (await ctx.store.all('Transaksi'))
      .filter((t) => t.kode_event === kodeEvent && t.status !== STATUS.BATAL && String(t.pengirim).includes(`(${pesan.senderId})`))
      .slice(-3);
    const baris = ['💬 Pesan ini sepertinya obrolan/koreksi, jadi *tidak saya catat*.'];
    if (terakhir.length) baris.push('', 'Catatan terakhir kamu:', ...terakhir.map((t) => barisItem(t)), '', `Kalau ada yang salah: balas *#batal ${terakhir.at(-1).id}*, lalu kirim ulang yang benar.`);
    baris.push('Untuk mencatat: satu pengeluaran per baris, contoh *minum karyawan 67.865*');
    return balas(baris.join('\n'));
  }

  if (!items.length) {
    if (pesan.adaFoto || jenis !== JENIS.KELUAR) {
      return balas('⚠️ Nominal belum ada. Mohon tulis harga dan keterangannya, contoh: *lalamove 150rb*');
    }
    // Laporan pembelian tanpa harga, contoh "beli sapu": tanyakan harganya.
    if (ctx.sesi && perluTanyaHarga(teks)) return balas(tanyaHarga(ctx, pesan, teks));
    return [];
  }

  // Hanya nominal tanpa keterangan (contoh "300rb"): tanyakan untuk apa.
  if (ctx.sesi && jenis === JENIS.KELUAR && !pesan.adaFoto && items.length === 1 && items[0].keterangan === 'Pengeluaran') {
    return balas(tanyaKeterangan(ctx, pesan, items[0].nominal));
  }

  if (jenis === JENIS.POTONGAN_IO) items = items.map((i) => ({ ...i, kategori: 'Potongan IO' }));

  // Kategori yang pernah dipilih owner/PIC untuk keterangan serupa (tab Kamus Kategori).
  if (items.some((i) => i.kategori === KATEGORI.LAIN)) {
    const kamus = (await ctx.store.all('Kamus Kategori')).filter((x) => x.kata && x.kategori)
      .sort((a, b) => String(b.kata).length - String(a.kata).length);
    items = items.map((i) => {
      if (i.kategori !== KATEGORI.LAIN) return i;
      const ket = i.keterangan.toLowerCase();
      const hit = kamus.find((x) => ket.includes(String(x.kata).toLowerCase()));
      return hit ? { ...i, kategori: hit.kategori } : i;
    });
  }

  // Uang siapa: dari pesan ("uang mama"), atau default pengirimnya sendiri.
  if (jenis === JENIS.KELUAR) {
    for (const i of items) i.dibayar_oleh = await tentukanUangSiapa(ctx, pesan, kodeEvent, i.dibayar_oleh);
  }

  const tersimpan = await simpanTransaksi(ctx.store, {
    tanggal: tanggalLokal(pesan.waktu),
    kode_event: kodeEvent,
    buku,
    jenis,
    sumber: pesan.adaFoto ? 'foto+teks' : 'teks',
    pengirim: namaPengirim(pesan),
    dicatat: waktuLokal(pesan.waktu),
  }, items);

  const judul = {
    [JENIS.KELUAR]: 'Pengeluaran tercatat',
    [JENIS.MASUK_IO]: 'Transfer masuk dari IO tercatat',
    [JENIS.POTONGAN_IO]: 'Potongan IO tercatat',
  }[jenis];
  const baris = [`✅ *${judul}* (${kodeEvent})`, ...tersimpan.map((t) => barisItem(t, tanggalLokal(pesan.waktu)))];
  if (dilewati.length) baris.push(`_Tidak dicatat (${dilewati.map((d) => d.alasan).join(', ')}): ${dilewati.map((d) => `"${d.baris}"`).join('; ')}_`);

  if (buku === BUKU.EVENT && jenis === JENIS.KELUAR) {
    const semua = await ctx.store.all('Transaksi');
    const total = semua
      .filter((t) => t.kode_event === kodeEvent && t.jenis === JENIS.KELUAR && t.status !== STATUS.BATAL)
      .reduce((s, t) => s + Number(t.nominal || 0), 0);
    baris.push(`Total pengeluaran event: ${rupiah(total)}`);
  }
  baris.push(`Salah? balas *#batal ${tersimpan[0].id}*`);
  if (jenis === JENIS.KELUAR) baris.push(`Bukan uang ${tersimpan[0].dibayar_oleh}? balas *#uang ${tersimpan[0].id} mama* (atau nama lain / kas)`);
  if (ctx.sesi && jenis === JENIS.KELUAR && tersimpan.length === 1 && tersimpan[0].kategori === KATEGORI.LAIN) {
    baris.push('', tanyaKategori(ctx, pesan, tersimpan[0].id, tersimpan[0].keterangan));
  }
  return balas(baris.join('\n'));
}

async function catatOmzet(ctx, pesan, { grup, event, teks }) {
  const tahun = Number(tanggalLokal(pesan.waktu).slice(0, 4));
  const o = parseOmzet(teks, tahun);
  if (!o.omzet) {
    return balas('⚠️ Nominal omzet tidak terbaca. Contoh:\n#omzet\nOMZET TERVERIFIKASI: Rp 12.500.000\nJUMLAH TRANSAKSI: 85');
  }
  const tanggal = o.tanggal || tanggalOperasional(pesan.waktu);
  const semua = await ctx.store.all('Omzet');
  const lama = semua.find((r) => r.kode_event === event.kode && r.tanggal === tanggal && r.status !== STATUS.BATAL);
  if (lama) await ctx.store.update('Omzet', 'dicatat', lama.dicatat, { status: STATUS.BATAL });

  await ctx.store.append('Omzet', {
    tanggal,
    kode_event: event.kode,
    omzet: o.omzet,
    jumlah_transaksi: o.jumlah_transaksi,
    refund: o.refund,
    catatan: o.catatan,
    pengirim: namaPengirim(pesan),
    status: STATUS.OK,
    dicatat: `${waktuLokal(pesan.waktu)}:${pesan.id || ''}`,
  });

  const omzetEvent = (await ctx.store.all('Omzet'))
    .filter((r) => r.kode_event === event.kode && r.status !== STATUS.BATAL)
    .reduce((s, r) => s + Number(r.omzet || 0) - Number(r.refund || 0), 0);

  const baris = [
    `✅ *Omzet ${tanggal} tercatat* (${event.kode})${lama ? ' - menggantikan laporan sebelumnya' : ''}`,
    `Omzet: *${rupiah(o.omzet)}*${o.jumlah_transaksi ? ` dari ${o.jumlah_transaksi} transaksi` : ''}`,
  ];
  if (o.refund) baris.push(`Refund/koreksi: ${rupiah(o.refund)}`);
  baris.push(`Total omzet event sejauh ini: *${rupiah(omzetEvent)}*`);
  const target = Number(event.target_omzet || 0);
  if (target) baris.push(`Target: ${rupiah(target)} (${persen((omzetEvent / target) * 100)} tercapai)`);

  // Rincian keuangan hanya untuk grup pengeluaran (owner + PIC), bukan grup tim.
  if (grup.jenis === 'pengeluaran') {
    const bersih = (o.omzet - o.refund) * (1 - Number(event.bagi_hasil_persen || 0) / 100);
    baris.push(`Perkiraan transfer IO: ${rupiah(bersih)}, dijadwalkan ${jatuhTempo(tanggal, event)}`);
  }
  return balas(baris.join('\n'));
}

async function perintahEvent(ctx, pesan, grup, cmd) {
  const { data, error } = parseEvent(`#event\n${cmd.badan}`);
  if (error) return balas(`⚠️ ${error}\n\nKetik *#bantuan* untuk contoh format.`);

  const lama = await cariEvent(ctx.store, data.kode);
  if (lama) {
    await ctx.store.update('Event', 'kode', lama.kode, data);
  } else {
    await ctx.store.append('Event', { ...data, status: 'AKTIF', dibuat: waktuLokal(pesan.waktu) });
  }

  if (!grup) {
    await ctx.store.append('Grup', {
      group_id: pesan.groupId,
      nama_grup: pesan.groupName,
      jenis: 'pengeluaran',
      kode_event: data.kode,
      didaftarkan_oleh: pesan.senderName || pesan.senderId,
      tanggal: waktuLokal(pesan.waktu),
    });
  } else if (grup.jenis === 'pengeluaran' && grup.kode_event !== data.kode) {
    await ctx.store.update('Grup', 'group_id', grup.group_id, { kode_event: data.kode });
  }

  const event = await cariEvent(ctx.store, data.kode);
  // PIC yang merangkap kasir tidak dihitung sebagai kasir berbayar (PIC = owner/keluarga, tanpa upah).
  const daftarOrang = parseTim(cmd.badan);
  const namaPic = daftarOrang.filter((o) => o.peran === 'PIC').map((o) => o.nama.toLowerCase());
  const orang = daftarOrang.filter((o) => !(o.peran === 'Kasir' && namaPic.includes(o.nama.toLowerCase())));
  if (orang.length) await tambahTim(ctx, pesan, event, orang);
  const tim = await daftarTim(ctx, event);

  return balas([
    `✅ *Event ${data.kode} ${lama ? 'diperbarui' : 'dibuat'}*`,
    `Kota: ${data.kota} | IO: ${data.io}`,
    `Tanggal: ${data.mulai} s/d ${data.selesai}`,
    `Wilayah harga: ${data.wilayah}`,
    `Bagi hasil IO: ${persen(data.bagi_hasil_persen)} | Admin: ${rupiah(data.admin)}`,
    `Jadwal transfer: ${data.jadwal_trf === 'AKHIR' ? 'sekali setelah event selesai' : 'H+1, Jumat-Minggu dibayar Senin'}`,
    data.target_omzet ? `Target omzet: ${rupiah(data.target_omzet)}` : null,
    data.jam_buka ? `Jam buka: ${data.jam_buka}` : null,
    '',
    `*Tim:*\n${tim}`,
    '',
    grup && grup.jenis !== 'pengeluaran'
      ? `Grup ini terdaftar sebagai grup ${grup.jenis}.`
      : 'Grup ini menjadi *grup pengeluaran* event tersebut.',
    `Untuk grup tim, kirim di grup tim: *#daftar event ${data.kode}*`,
  ].filter((b) => b !== null).join('\n'));
}

async function perintahDaftar(ctx, pesan, grup, cmd) {
  const jenis = (cmd.argumen[0] || '').toLowerCase();
  const kode = (cmd.argumen[1] || '').toUpperCase();
  if (!JENIS_GRUP.includes(jenis)) {
    return balas(`Format: *#daftar <jenis> [kode event]*\nJenis: ${JENIS_GRUP.join(', ')}\nContoh: #daftar event JMB26-11`);
  }
  if ((jenis === 'pengeluaran' || jenis === 'event') && !kode) {
    return balas(`Kode event wajib untuk grup ${jenis}. Contoh: #daftar ${jenis} JMB26-11`);
  }
  if (kode && !(await cariEvent(ctx.store, kode))) {
    return balas(`⚠️ Event ${kode} belum ada. Buat dulu dengan blok *#event* di grup pengeluaran.`);
  }
  const data = {
    group_id: pesan.groupId,
    nama_grup: pesan.groupName,
    jenis,
    kode_event: kode,
    didaftarkan_oleh: pesan.senderName || pesan.senderId,
    tanggal: waktuLokal(pesan.waktu),
  };
  if (grup) await ctx.store.update('Grup', 'group_id', grup.group_id, data);
  else await ctx.store.append('Grup', data);
  return balas(`✅ Grup ini terdaftar sebagai *grup ${jenis}*${kode ? ` untuk event ${kode}` : ''}.\nKetik *#bantuan* untuk daftar perintah.`);
}

async function perintahBatal(ctx, pesan, cmd, isOwner) {
  const id = (cmd.argumen[0] || '').toUpperCase();
  const semua = await ctx.store.all('Transaksi');
  const t = semua.find((r) => String(r.id).toUpperCase() === id);
  if (!t) return balas(`⚠️ Catatan ${id || '(kosong)'} tidak ditemukan. Contoh: #batal T0012`);
  if (!isOwner && !String(t.pengirim).includes(`(${pesan.senderId})`)) {
    return balas('⚠️ Hanya owner atau pengirim asli yang bisa membatalkan catatan ini.');
  }
  if (t.status === STATUS.BATAL) return balas(`${id} sudah dibatalkan sebelumnya.`);
  await ctx.store.update('Transaksi', 'id', t.id, { status: STATUS.BATAL });
  return balas(`🗑️ ${t.id} dibatalkan: ${t.keterangan} ${rupiah(t.nominal)}`);
}

async function perintahKategori(ctx, cmd) {
  const id = (cmd.argumen[0] || '').toUpperCase();
  const kategoriInput = cmd.argumen.slice(1).join(' ').toLowerCase();
  const kategori = DAFTAR_KATEGORI.find((k) => k.toLowerCase().startsWith(kategoriInput));
  if (!id || !kategoriInput || !kategori) {
    return balas(`Format: #kategori T0012 <kategori>\nPilihan: ${DAFTAR_KATEGORI.join(', ')}`);
  }
  const hasil = await ctx.store.update('Transaksi', 'id', id, { kategori });
  return balas(hasil ? `✅ ${id} sekarang kategori *${kategori}*` : `⚠️ Catatan ${id} tidak ditemukan.`);
}

async function perintahRekap(ctx, pesan, grup, cmd, isOwner) {
  const hariIni = tanggalLokal(pesan.waktu);
  const mintaBulan = (cmd.argumen[0] || '').toLowerCase() === 'bulan' || grup.jenis === 'ruko';
  if (mintaBulan) {
    if (!isOwner) return balas('⚠️ Rekap bulanan hanya untuk owner.');
    const arg = cmd.argumen.find((a) => /^\d{4}-\d{2}$/.test(a));
    const bulan = arg || hariIni.slice(0, 7);
    const r = rekapBulan(bulan, {
      events: await ctx.store.all('Event'),
      omzet: await ctx.store.all('Omzet'),
      transaksi: await ctx.store.all('Transaksi'),
    });
    return balas(formatRekapBulan(r));
  }
  if (grup.jenis !== 'pengeluaran') return balas('⚠️ Rekap keuangan hanya bisa dilihat di grup pengeluaran.');
  const event = await cariEvent(ctx.store, grup.kode_event);
  if (!event) return balas('⚠️ Event untuk grup ini belum dibuat. Kirim blok *#event* dulu.');
  const r = rekapEvent(event, {
    omzet: await ctx.store.all('Omzet'),
    transaksi: await ctx.store.all('Transaksi'),
  }, hariIni);
  return balas(formatRekapEvent(r, hariIni));
}

// Bot baru dimasukkan ke grup: kalau grup belum terdaftar, bot menyapa dan bertanya grup ini untuk apa.
export async function handleGrupBaru(ctx, groupId) {
  if (await cariGrup(ctx.store, groupId)) return [];
  if (ctx.sesi.get(groupId)?.jenis === 'sapaan') return []; // sapaan sudah dikirim (event WhatsApp bisa datang dua kali)
  return balas(mulaiSapaan(ctx, groupId));
}

export async function handlePesan(ctx, pesan) {
  const teks = String(pesan.text || '').trim();
  const cmd = parsePerintah(teks);
  const isOwner = ctx.ownerIds.has(pesan.senderId);
  const grup = await cariGrup(ctx.store, pesan.groupId);

  // Perintah yang berlaku di grup mana pun.
  if (cmd?.perintah === 'idsaya') {
    return balas(`ID WhatsApp ${pesan.senderName || ''}: *${pesan.senderId}*${isOwner ? ' (owner)' : ''}`);
  }

  // Tanya-jawab bot (setup grup / event). Hanya jawaban owner yang dibaca; perintah # tetap jalan seperti biasa.
  if (isOwner && ctx.sesi && (!cmd || cmd.perintah === 'batal' && !cmd.argumen.length)) {
    const hasil = prosesJawaban(ctx, pesan, { events: await ctx.store.all('Event') });
    if (hasil?.blok) {
      return perintahEvent(ctx, pesan, grup, { badan: hasil.blok.split('\n').slice(1).join('\n') });
    }
    if (hasil?.daftar) {
      return perintahDaftar(ctx, pesan, grup, { argumen: [hasil.daftar, hasil.kode || ''] });
    }
    if (hasil) return balas(hasil.balasan);
  }

  if (cmd && ['daftar', 'event', 'eventbaru', 'mulai'].includes(cmd.perintah)) {
    if (!ctx.ownerIds.size) return balas('⚠️ OWNER_IDS belum diisi di file .env. Ketik #idsaya, lalu masukkan ID tersebut ke OWNER_IDS.');
    if (!isOwner) return balas('⚠️ Perintah ini khusus owner.');
    if (cmd.perintah === 'eventbaru') return balas(mulaiEventBaru(ctx, pesan.groupId));
    if (cmd.perintah === 'mulai') return balas(mulaiSapaan(ctx, pesan.groupId));
    if (cmd.perintah === 'event' && !cmd.badan.trim()) return balas(mulaiEventBaru(ctx, pesan.groupId));
    return cmd.perintah === 'daftar' ? perintahDaftar(ctx, pesan, grup, cmd) : perintahEvent(ctx, pesan, grup, cmd);
  }

  // Grup yang belum didaftarkan diabaikan sepenuhnya.
  if (!grup) return [];

  if (cmd && ['bantuan', 'help', 'menu'].includes(cmd.perintah)) {
    const bagian = [BANTUAN.umum, BANTUAN[grup.jenis]];
    if (isOwner) bagian.push(BANTUAN.owner);
    return balas(bagian.filter(Boolean).join('\n\n'));
  }

  if (grup.jenis === 'gudang') return []; // Tahap 2

  const event = await cariEvent(ctx.store, grup.kode_event);
  const teksTanpaPerintah = cmd ? [cmd.sisaBaris, cmd.badan].filter(Boolean).join('\n') : teks;

  // Jawaban atas pertanyaan bot sebelumnya (harga / jumlah bahan / nama bahan / kategori).
  if (!cmd && ctx.sesi) {
    const jawab = jawabLengkapi(ctx, pesan, await ctx.store.all('Harga Bahan'));
    if (jawab?.balasan) return balas(jawab.balasan);
    if (jawab?.kategori) {
      // Ingat pilihan ini supaya catatan berikutnya dengan keterangan yang sama langsung berkategori.
      const kata = String(jawab.kategori.keterangan || '').trim().toLowerCase();
      const kamus = await ctx.store.all('Kamus Kategori');
      if (kata && !kamus.some((x) => String(x.kata).toLowerCase() === kata)) {
        await ctx.store.append('Kamus Kategori', { kata, kategori: jawab.kategori.kategori, dicatat: `${jawab.kategori.id} oleh ${pesan.senderName || pesan.senderId}` });
      }
      const hasil = await perintahKategori(ctx, { argumen: [jawab.kategori.id, jawab.kategori.kategori] });
      return balas(`${hasil[0].text}\n_Lain kali "${kata}" otomatis masuk ${jawab.kategori.kategori}._`);
    }
    if (jawab?.bahan && event) return perintahBahan(ctx, pesan, event, { perintah: jawab.bahan.gerak, sisaBaris: jawab.bahan.teks, badan: '', argumen: [] });
    if (jawab?.pengeluaran) {
      if (grup.jenis === 'ruko') return catatUang(ctx, pesan, { buku: BUKU.RUKO, jenis: JENIS.KELUAR, kodeEvent: 'RUKO', teks: jawab.pengeluaran });
      if (event) return catatUang(ctx, pesan, { buku: BUKU.EVENT, jenis: JENIS.KELUAR, kodeEvent: event.kode, teks: jawab.pengeluaran });
    }
  }

  if (cmd) {
    switch (cmd.perintah) {
      case 'rekap': return perintahRekap(ctx, pesan, grup, cmd, isOwner);
      case 'batal': return perintahBatal(ctx, pesan, cmd, isOwner);
      case 'kategori': return perintahKategori(ctx, cmd);
      case 'uang':
        if (!event) return balas('⚠️ Grup ini belum terhubung ke event.');
        return perintahUang(ctx, pesan, event, cmd);
      case 'penggantian':
      case 'uangsiapa':
        if (!event) return balas('⚠️ Grup ini belum terhubung ke event.');
        if (grup.jenis !== 'pengeluaran') return balas('⚠️ Rincian uang hanya bisa dilihat di grup pengeluaran.');
        return perintahPenggantian(ctx, event);
      case 'ganti':
        if (!event) return balas('⚠️ Grup ini belum terhubung ke event.');
        if (!isOwner) return balas('⚠️ Perintah ini khusus owner.');
        return perintahGanti(ctx, pesan, event, cmd);
      case 'omzet':
      case 'omset':
        if (!event) return balas('⚠️ Grup ini belum terhubung ke event.');
        return catatOmzet(ctx, pesan, { grup, event, teks });
      case 'tim':
      case 'tambah':
      case 'berhenti':
        if (!event) return balas('⚠️ Grup ini belum terhubung ke event.');
        if (grup.jenis !== 'pengeluaran' && !isOwner) return balas('⚠️ Perubahan tim hanya oleh owner, atau lewat grup pengeluaran.');
        if (cmd.perintah === 'tim') return perintahTim(ctx, pesan, event, cmd);
        if (cmd.perintah === 'tambah') return perintahTambah(ctx, pesan, event, cmd);
        return perintahBerhenti(ctx, pesan, event, cmd);
      case 'gratis':
        if (!event) return balas('⚠️ Grup ini belum terhubung ke event.');
        return perintahGratis(ctx, pesan, event, cmd);
      default:
        if (PERINTAH_BAHAN.includes(cmd.perintah)) {
          if (!event) return balas('⚠️ Grup ini belum terhubung ke event.');
          return perintahBahan(ctx, pesan, event, cmd);
        }
        break;
    }
  }

  // Kalimat biasa tentang bahan tanpa harga, contoh "kiriman 10 pack keju" / "sisa 3 pack mozzarella".
  if (!cmd && event && !parseMoney(teks)) {
    const gerak = gerakBahanDariKalimat(teks);
    if (gerak) {
      const hasil = await perintahBahan(ctx, pesan, event, { perintah: gerak, sisaBaris: teks, badan: '', argumen: [] });
      if (!/^Format:/.test(hasil[0]?.text || '')) return hasil;
      // Kurang jumlah atau nama bahan: tanyakan.
      const tanya = ctx.sesi && tanyaBahan(ctx, pesan, teks, gerak, await ctx.store.all('Harga Bahan'));
      if (tanya) return balas(tanya);
    }
  }

  if (grup.jenis === 'event') return []; // laporan SOP lain masuk di Tahap 3

  if (grup.jenis === 'ruko') {
    if (cmd) return [];
    return catatUang(ctx, pesan, { buku: BUKU.RUKO, jenis: JENIS.KELUAR, kodeEvent: 'RUKO', teks });
  }

  // Grup pengeluaran event.
  if (!event) return cmd || pesan.adaFoto || parseMoney(teks) ? balas('⚠️ Event untuk grup ini belum dibuat. Owner kirim blok *#event* dulu.') : [];

  if (cmd) {
    switch (cmd.perintah) {
      case 'trf':
      case 'tf':
      case 'masuk':
        return catatUang(ctx, pesan, { buku: BUKU.EVENT, jenis: JENIS.MASUK_IO, kodeEvent: event.kode, teks: teksTanpaPerintah });
      case 'potongan':
        return catatUang(ctx, pesan, { buku: BUKU.EVENT, jenis: JENIS.POTONGAN_IO, kodeEvent: event.kode, teks: teksTanpaPerintah });
      case 'owner':
        if (!isOwner) return balas('⚠️ Perintah ini khusus owner.');
        return perintahOwner(ctx, pesan, event, cmd);
      case 'ubah': {
        if (!isOwner) return balas('⚠️ Perintah ini khusus owner.');
        const blok = blokUbah(event, teksTanpaPerintah);
        if (!blok) return balas('Format: *#ubah <data> <nilai baru>*\nContoh: #ubah bagi hasil 27 | #ubah tanggal 1-16 Nov 2026 | #ubah admin 750rb | #ubah jam buka 12.00\nData: kota, io, tanggal, wilayah, bagi hasil, admin, jadwal, jam buka, target, pic');
        return perintahEvent(ctx, pesan, grup, { badan: blok.split('\n').slice(1).join('\n') });
      }
      case 'selesai':
        if (!isOwner) return balas('⚠️ Perintah ini khusus owner.');
        await ctx.store.update('Event', 'kode', event.kode, { status: 'SELESAI' });
        return balas(`🏁 Event ${event.kode} ditandai selesai. Rekap harian otomatis dihentikan; #rekap tetap bisa dipakai.`);
      default:
        return [];
    }
  }

  const hasil = await catatUang(ctx, pesan, { buku: BUKU.EVENT, jenis: JENIS.KELUAR, kodeEvent: event.kode, teks });
  if (hasil.length || !ctx.sesi) return hasil;

  // Pertanyaan/obrolan ke bot (tanpa angka): beri petunjuk singkat, paling sering sekali per 10 menit per grup.
  if (/\?|(^|\s)(kamu|bot|gimana|bagaimana|sudah|udah|sampai mana)(\s|$)/i.test(teks)) {
    const kunci = `petunjuk:${pesan.groupId}`;
    const terakhir = ctx.sesi.get(kunci);
    if (terakhir && Date.now() - terakhir.waktu < 10 * 60 * 1000) return [];
    ctx.sesi.set(kunci, { waktu: Date.now() });
    return balas([
      '🤖 Maaf, saya belum bisa diajak ngobrol. Yang bisa saya lakukan:',
      '• *#rekap* - lihat total omzet, pengeluaran, dan laba event ini (sudah termasuk koreksi)',
      '• Catat pengeluaran: satu per baris, contoh *minum karyawan 67.865*',
      '• *#batal T0012* - batalkan catatan yang salah',
      '• *#bantuan* - semua perintah',
    ].join('\n'));
  }
  return [];
}
