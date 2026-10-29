// Logika utama bot: menerima satu pesan grup, mengembalikan balasan.
// Tidak bergantung pada WhatsApp secara langsung supaya bisa dites.
//
// pesan = { id, groupId, groupName, senderId, senderName, text, adaFoto: boolean, waktu: Date }
// ctx   = { store, ownerIds: Set<string> }
// hasil = array balasan { text } untuk dikirim ke grup yang sama.

import { JENIS_GRUP, BUKU, JENIS, STATUS } from './schema.js';
import { parsePerintah, parseEvent, parsePengeluaran, parseOmzet, DAFTAR_KATEGORI } from './parsers.js';
import { rekapEvent, formatRekapEvent, rekapBulan, formatRekapBulan, jatuhTempo } from './finance.js';
import { rupiah, persen, tanggalLokal, jamLokal, waktuLokal, tambahHari, parseMoney } from './util.js';

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
• #selesai - tutup event (owner)`,
  ruko: `*Grup kas ruko*
• Ketik pengeluaran ruko: listrik 850rb, gaji Andi 2jt, air 150rb
• #rekap - rekap bulan ini, #rekap bulan 2026-11
• #batal T0012`,
  event: `*Grup event (tim)*
• #omzet + format laporan harian SOP BAB 6:
  #omzet
  OMZET TERVERIFIKASI: Rp 12.500.000
  JUMLAH TRANSAKSI: 85
  SELISIH / REFUND / KOREKSI: 0`,
  owner: `*Khusus owner*
• #daftar pengeluaran KODE | #daftar event KODE | #daftar ruko | #daftar gudang
• #event (blok setup event, lihat panduan)
• #rekap bulan [YYYY-MM]`,
};

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

function barisItem(t) {
  const info = [t.kategori, t.metode].filter(Boolean).join(', ');
  return `${t.id} ${t.keterangan} - *${rupiah(t.nominal)}*${info ? ` [${info}]` : ''}`;
}

// Pengeluaran / transfer masuk. Nominal selalu dari teks (pesan atau caption foto).
async function catatUang(ctx, pesan, { buku, jenis, kodeEvent, teks }) {
  let items = [];
  if (jenis === JENIS.MASUK_IO) {
    const nominal = parseMoney(teks);
    if (nominal) {
      const ket = teks.replace(/(rp\.?\s*)?[\d.,]+\s*(juta|jt|ribu|rb|k)?/i, '').trim();
      items = [{ keterangan: ket || 'Transfer omzet dari IO', nominal, kategori: 'Transfer IO', metode: 'TRANSFER' }];
    }
  } else {
    items = parsePengeluaran(teks, { adaFoto: pesan.adaFoto });
  }

  if (!items.length) {
    if (pesan.adaFoto || jenis !== JENIS.KELUAR) {
      return balas('⚠️ Nominal belum ada. Mohon tulis harga dan keterangannya, contoh: *lalamove 150rb*');
    }
    return [];
  }

  if (jenis === JENIS.POTONGAN_IO) items = items.map((i) => ({ ...i, kategori: 'Potongan IO' }));

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
  const baris = [`✅ *${judul}* (${kodeEvent})`, ...tersimpan.map(barisItem)];

  if (buku === BUKU.EVENT && jenis === JENIS.KELUAR) {
    const semua = await ctx.store.all('Transaksi');
    const total = semua
      .filter((t) => t.kode_event === kodeEvent && t.jenis === JENIS.KELUAR && t.status !== STATUS.BATAL)
      .reduce((s, t) => s + Number(t.nominal || 0), 0);
    baris.push(`Total pengeluaran event: ${rupiah(total)}`);
  }
  baris.push(`Salah? balas *#batal ${tersimpan[0].id}*`);
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

  return balas([
    `✅ *Event ${data.kode} ${lama ? 'diperbarui' : 'dibuat'}*`,
    `Kota: ${data.kota} | IO: ${data.io}`,
    `Tanggal: ${data.mulai} s/d ${data.selesai}`,
    `Wilayah harga: ${data.wilayah}`,
    `Bagi hasil IO: ${persen(data.bagi_hasil_persen)} | Admin: ${rupiah(data.admin)}`,
    `Jadwal transfer: ${data.jadwal_trf === 'AKHIR' ? 'sekali setelah event selesai' : 'H+1, Jumat-Minggu dibayar Senin'}`,
    data.target_omzet ? `Target omzet: ${rupiah(data.target_omzet)}` : null,
    data.jam_buka ? `Jam buka: ${data.jam_buka}` : null,
    data.pic ? `PIC: ${data.pic}` : null,
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

export async function handlePesan(ctx, pesan) {
  const teks = String(pesan.text || '').trim();
  const cmd = parsePerintah(teks);
  const isOwner = ctx.ownerIds.has(pesan.senderId);
  const grup = await cariGrup(ctx.store, pesan.groupId);

  // Perintah yang berlaku di grup mana pun.
  if (cmd?.perintah === 'idsaya') {
    return balas(`ID WhatsApp ${pesan.senderName || ''}: *${pesan.senderId}*${isOwner ? ' (owner)' : ''}`);
  }
  if (cmd && ['daftar', 'event'].includes(cmd.perintah)) {
    if (!ctx.ownerIds.size) return balas('⚠️ OWNER_IDS belum diisi di file .env. Ketik #idsaya, lalu masukkan ID tersebut ke OWNER_IDS.');
    if (!isOwner) return balas('⚠️ Perintah ini khusus owner.');
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

  if (cmd) {
    switch (cmd.perintah) {
      case 'rekap': return perintahRekap(ctx, pesan, grup, cmd, isOwner);
      case 'batal': return perintahBatal(ctx, pesan, cmd, isOwner);
      case 'kategori': return perintahKategori(ctx, cmd);
      case 'omzet':
      case 'omset':
        if (!event) return balas('⚠️ Grup ini belum terhubung ke event.');
        return catatOmzet(ctx, pesan, { grup, event, teks });
      default: break;
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
      case 'selesai':
        if (!isOwner) return balas('⚠️ Perintah ini khusus owner.');
        await ctx.store.update('Event', 'kode', event.kode, { status: 'SELESAI' });
        return balas(`🏁 Event ${event.kode} ditandai selesai. Rekap harian otomatis dihentikan; #rekap tetap bisa dipakai.`);
      default:
        return [];
    }
  }

  return catatUang(ctx, pesan, { buku: BUKU.EVENT, jenis: JENIS.KELUAR, kodeEvent: event.kode, teks });
}
