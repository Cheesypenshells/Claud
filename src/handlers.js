// Logika utama bot: menerima satu pesan grup, mengembalikan balasan.
// Tidak bergantung pada WhatsApp secara langsung supaya bisa dites.
//
// pesan = { id, groupId, groupName, senderId, senderName, text, adaFoto: boolean, waktu: Date }
// ctx   = { store, ownerIds: Set<string> }
// hasil = array balasan { text } untuk dikirim ke grup yang sama.

import { JENIS_GRUP, BUKU, JENIS, STATUS } from './schema.js';
import { parsePerintah, parseEvent, parsePengeluaranDetail, parseOmzet, parseTim, DAFTAR_KATEGORI } from './parsers.js';
import { rekapEvent, formatRekapEvent, rekapBulan, formatRekapBulan, jatuhTempo } from './finance.js';
import { rupiah, persen, tanggalLokal, jamLokal, waktuLokal, tambahHari, parseMoney, findMoney, parseRentangTanggal, BULAN, bersihkan as bersihkanTeks } from './util.js';
import { mulaiSapaan, mulaiEventBaru, prosesJawaban, blokUbah } from './wizard.js';
import { tentukanUangSiapa, perintahUang, perintahGanti, perintahPenggantian } from './uangSiapa.js';
import { perluTanyaHarga, tanyaHarga, tanyaBahan, tanyaKategori, tanyaKeterangan, jawabLengkapi } from './lengkapi.js';
import { KATEGORI, ambilTanggal, ambilUangSiapa, tebakKategori } from './parsers.js';
import { idDariTeks, bacaKoreksi, pilihCatatan, BATAS_LANJUTAN_MS } from './koreksi.js';
import { bacaGambar, bacaBukti, nominalUtama, tanggalBukti, daftarPesanan } from './bukti.js';
import { BATAS_STRUK, periksaStruk, perluDetail, eventWajibStruk, kenaliStruk, batasTanggal } from './struk.js';
import { daftarTunda, tambahTunda, ubahTunda, hapusTunda, idTundaDariTeks } from './tunda.js';
import { perintahNilai, jawabPenilaian, perintahPoin, perintahPoinBatal, perintahKpi } from './handlersKpi.js';
import { mulaiPengiriman, jawabPengiriman } from './pengiriman.js';
import { mulaiAnggota, jawabAnggota, ingatNama, perintahKaryawan } from './anggota.js';
import { tanganiAbsen, perintahAbsen, perintahIzin, perintahJadwal } from './absensi.js';
import { tanganiLaporan } from './laporanFoto.js';
import { perintahRekening, jawabRekening, perintahSetor, tanyaRekeningPic, jawabRekeningPribadi } from './rekening.js';
import { perintahGajian } from './gajian.js';
import {
  tambahTim, daftarTim, perintahTim, perintahTambah, perintahBerhenti, perintahBahan, jawabNilaiSisa, revisiBahan, perintahGajiTetap, adalahPerintahGaji, perintahGratis, perintahOwner, PERINTAH_BAHAN,
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
• *≥ Rp 100.000 wajib foto struk* (harga & keterangan di caption). Struk dicek: nominal, tanggal, toko, kategori, tidak kembar. Tanpa struk / tidak sesuai → ditahan sampai owner reply *acc*
• Transaksi hanya sah *2 hari sebelum s/d 2 hari sesudah event*; belanja online kirim detail pesanan yang ada tanggal pesannya
• Cash < Rp 100.000 tanpa struk: tulis detailnya (beli apa & di mana)
• Owner: *acc* (reply pesan bot) · *acc semua* · *acc P0001*
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
• *Laporan foto:* kirim foto + caption tag. Loading in: #tiba #booth #gudang #acc (PIC) · Harian: #posisi #grill #cooler #nampan #followers #temuan #bersih #pulang · Loading out: #stokakhir #bongkar #koli #muat #terima. Cek yang belum: *#loadingin* · *#harian* · *#loadingout*
• *Absen:* 2 jam sebelum buka bot membagikan *gaya foto* hari ini. Selfie di booth dengan gaya itu, kirim dengan caption *absen* (batas 1 jam sebelum buka). Telat 1-15 mnt Rp 10.000 · 16-30 mnt Rp 25.000 · >30 mnt Rp 50.000/jam. #absen = siapa sudah/belum · #absen denda = rekap denda
• #omzet + format laporan harian SOP BAB 6:
  #omzet
  OMZET TERVERIFIKASI: Rp 12.500.000
  JUMLAH TRANSAKSI: 85
  SELISIH / REFUND / KOREKSI: 0
• #keluar / #restock / #kembali + bahan per baris (mozzarella 20 pack)
• #gratis 3 porsi mozzarella isi 4 untuk @influencer`,
  owner: `*Khusus owner*
• *KPI:* #nilai (penilaian tim event, juga bisa PIC) · #nilai Dena 5 4 4 3 · #nilai tim 4 · #poin Dena +20 bantu masak bumbu · #poin Dena -10 SOP tidak dikerjakan · #poinbatal K0001 · #kpi · #kpi Dena · #kpi 2026-09
• *Karyawan:* #karyawan (daftar & nomor) · #karyawan lalu satu per baris *Nama 0812...* (cocokkan nama dengan nomor, grup pengeluaran/chat pribadi) · #anggota di grup tim (karyawan balas *saya [nama]*)
• *Absen (owner):* #izin Dena (bebas denda hari ini) · #izin Dena besok datang 10.00 karena pulang jam 3 pagi (dispensasi) · #izin batal Dena besok · #jadwal sabtu buka 08.00 karena hari pahlawan · #jadwal sabtu datang 07.00 · #jadwal batal sabtu · #jadwal (daftar). Bisa di grup atau chat pribadi bot
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
  if (/\s(sisa|sisah|sisanya|kembali|dikembalikan|retur|balik|stok akhir|stock akhir|bahan akhir)\s/.test(t)) return 'kembali';
  // Barang yang datang ke booth di tengah event disebut restock.
  if (/\s(restock|restok|restoc|tambahan bahan|tambah bahan|datang|tiba|sampai)\s/.test(t)) return 'restock';
  if (/\s(kirim|kiriman|dikirim|pengiriman|bawa|dibawa|keluar|bahan keluar|awal|stok awal|stock awal|bahan awal)\s/.test(t)) return 'keluar';
  return null;
}

// #feepic 20 / "bonus pic 20 persen": fee PIC khusus event. #feepic normal = kembali ke aturan kehadiran owner.
async function perintahFeePic(ctx, event, teks) {
  if (!event) return balas('⚠️ Event untuk grup ini belum dibuat.');
  if (/\b(normal|hapus|batal|reset|otomatis)\b/i.test(teks)) {
    await ctx.store.update('Event', 'kode', event.kode, { fee_pic_persen: '' });
    return balas(`↩️ Fee PIC ${event.kode} kembali mengikuti kehadiran owner (tidak hadir 25% · 1 hari 20% · setengah 15% · penuh 10%).`);
  }
  const m = String(teks).match(/(\d+(?:[.,]\d+)?)\s*(%|persen)?/i);
  const p = m ? Number(m[1].replace(',', '.')) : NaN;
  if (!(p >= 0 && p <= 100)) return balas('Format: *#feepic 20* (persen dari laba sebelum fee), atau *#feepic normal*.');
  await ctx.store.update('Event', 'kode', event.kode, { fee_pic_persen: p });
  return balas(`✅ *Fee PIC ${event.kode}: ${p}%* dari laba sebelum fee (khusus event ini, menggantikan aturan kehadiran owner).\n_Kembali ke aturan biasa: *#feepic normal*._`);
}

// Grup pengeluaran milik event (untuk pesan yang berisi harga).
async function grupPengeluaranEvent(ctx, event) {
  if (!event) return [];
  return (await ctx.store.all('Grup')).filter((g) => g.kode_event === event.kode && g.jenis === 'pengeluaran').map((g) => g.group_id);
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
  const info = [t.kategori, t.metode, t.bukti === 'Struk ✓' ? '🧾 struk ✓' : (String(t.bukti || '').startsWith('ACC') ? '👍 ACC owner' : '')].filter(Boolean).join(', ');
  const uang = t.dibayar_oleh ? ` (uang ${t.dibayar_oleh})` : '';
  const tgl = hariIni && t.tanggal && t.tanggal !== hariIni ? ` 📅 ${t.tanggal}` : '';
  return `${t.id} ${t.keterangan} - *${rupiah(t.nominal)}*${info ? ` [${info}]` : ''}${uang}${tgl}`;
}

// Pengeluaran / transfer masuk. Nominal selalu dari teks (pesan atau caption foto).
async function catatUang(ctx, pesan, { buku, jenis, kodeEvent, teks, itemsSiap = null }) {
  let items = [];
  let dilewati = [];
  if (itemsSiap) return simpanDanBalas(ctx, pesan, { buku, jenis, kodeEvent, items: itemsSiap, dilewati, paksa: true });
  if (jenis === JENIS.MASUK_IO) {
    const nominal = parseMoney(teks);
    if (nominal) {
      const ket = teks.replace(/(rp\.?\s*)?[\d.,]+\s*(juta|jt|ribu|rb|k)?/i, '').trim();
      items = [{ keterangan: ket || 'Transfer omzet dari IO', nominal, kategori: 'Transfer IO', metode: 'TRANSFER' }];
    }
  } else {
    const ev = await cariEvent(ctx.store, kodeEvent);
    ({ items, dilewati } = parsePengeluaranDetail(teks, { adaFoto: pesan.adaFoto, hariIni: tanggalLokal(pesan.waktu), rentang: ev ? { mulai: ev.mulai, selesai: ev.selesai } : null }));
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

  // Foto bukti/struk tanpa harga di caption: nominal (dan tanggal) dibaca dari foto.
  if (!items.length && jenis === JENIS.KELUAR && pesan.adaFoto && pesan.ambilFoto && !dilewati.length) {
    const foto = await bacaFotoPesan(ctx, pesan);
    // Daftar pesanan belanja online: satu catatan per pesanan (toko), keterangan = nama barang.
    const pesanan = foto.teks ? daftarPesanan(foto.teks) : [];
    if (pesanan.length) {
      const { siapa } = ambilUangSiapa(teks);
      items = pesanan.map((o) => {
        const ket = bersihkanTeks(`${o.produk || 'Belanja online'}${o.jumlah ? ` x${o.jumlah}` : ''}${o.toko ? ` (${o.toko})` : ''}`);
        return { keterangan: ket, nominal: o.total, kategori: tebakKategori(`${o.produk} ${teks}`), metode: 'TRANSFER', dibayar_oleh: siapa || '', _dariFoto: true, _pesananOnline: true };
      });
    }
    const n = !items.length && foto.teks ? nominalUtama(foto.teks) : null;
    // Tanpa caption: kalau struknya jelas (ShopeeFood, KFC, Grab, rumah makan...) langsung dicatat; kalau tidak, tanya.
    const dikenali = n && !teks.trim() ? kenaliStruk(foto.teks) : null;
    if (dikenali) {
      const tgl = tanggalBukti(foto.teks);
      items = [{
        keterangan: dikenali.keterangan, nominal: n, kategori: dikenali.kategori, metode: metodeStruk(foto.teks, 'TRANSFER'),
        dibayar_oleh: '', ...(tgl ? { tanggal: tgl } : {}), _dariFoto: true,
      }];
    } else if (n && !teks.trim() && ctx.sesi) {
      // Siapa pun di grup boleh menjawab dengan reply; pengirim foto tetap tercatat sebagai pengirimnya.
      ctx.sesi.set(`fototanya:${pesan.groupId}:${n}`, { senderId: pesan.senderId, senderName: pesan.senderName || '', waktu: Date.now() });
      return balas(`📷 Dari foto terbaca *${rupiah(n)}*, tapi belum jelas pengeluaran apa.\n${tanyaKeterangan(ctx, pesan, n)}`);
    } else if (n) {
      const ev = await cariEvent(ctx.store, kodeEvent);
      ({ items, dilewati } = parsePengeluaranDetail(`${teks} ${n}`, { adaFoto: true, hariIni: tanggalLokal(pesan.waktu), rentang: ev ? { mulai: ev.mulai, selesai: ev.selesai } : null }));
      const tgl = tanggalBukti(foto.teks);
      for (const i of items) { if (!i.tanggal && tgl) i.tanggal = tgl; i._dariFoto = true; }
    } else if (!items.length && (foto.gagal || foto.teks)) {
      return balas('⚠️ Nominal belum ada di caption, dan tidak terbaca dari foto. Mohon tulis harganya, contoh: *dp penginapan 530rb*');
    }
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
  // Listrik/wifi yang dibayar di lokasi event bukan biaya ruko: masuk Admin & Sewa event.
  if (buku === BUKU.EVENT) items = items.map((i) => (i.kategori === KATEGORI.RUKO ? { ...i, kategori: KATEGORI.ADMIN } : i));

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
  return simpanDanBalas(ctx, pesan, { buku, jenis, kodeEvent, items, dilewati });
}

const BATAS_RAKSASA = 25000000;
const kunciDobel = (pesan) => `dobel|${pesan.groupId}|${pesan.senderId}`;

// Foto di pesan dibaca sekali (OCR). { teks, buffer } atau { gagal: true }.
async function bacaFotoPesan(ctx, pesan) {
  if (pesan._foto) return pesan._foto;
  try {
    const buffer = await pesan.ambilFoto();
    const teks = await (ctx.bacaGambar || bacaGambar)(buffer);
    pesan._foto = teks ? { teks, buffer } : { gagal: true };
  } catch {
    pesan._foto = { gagal: true };
  }
  return pesan._foto;
}

// Cara bayar menurut struk: "TUNAI/CASH" = CASH, "QRIS/DEBIT/TRANSFER" = TRANSFER.
const metodeStruk = (teks, lama) => (/\b(tunai|cash)\b/i.test(teks) ? 'CASH' : (/\b(qris|debit|transfer|trf|bca|mandiri|bri|bni|gopay|ovo|dana|shopeepay)\b/i.test(teks) ? 'TRANSFER' : lama || ''));

// Struk yang masih berlaku (catatannya tidak dibatalkan), untuk mendeteksi struk kembar.
async function strukBerlaku(store) {
  const batal = new Set((await store.all('Transaksi')).filter((t) => t.status === STATUS.BATAL).map((t) => t.id));
  return (await store.all('Struk')).filter((s) => !batal.has(s.id_transaksi));
}

// Aturan struk untuk pengeluaran baru: memisahkan item yang boleh langsung dicatat dan yang ditahan.
async function terapkanAturanStruk(ctx, pesan, { buku, kodeEvent, items }) {
  const isOwner = ctx.ownerIds.has(pesan.senderId);
  const event = buku === BUKU.EVENT ? await cariEvent(ctx.store, kodeEvent) : null;
  if (event && !eventWajibStruk(event)) return { lanjut: items, ditahan: [] };
  const foto = pesan.adaFoto && pesan.ambilFoto ? await bacaFotoPesan(ctx, pesan) : null;
  const daftarStruk = foto?.teks ? await strukBerlaku(ctx.store) : [];
  const nominalFoto = foto?.teks ? bacaBukti(foto.teks).nominal : [];
  let fotoDipakai = false;
  const lanjut = [];
  const ditahan = [];
  for (const item of items) {
    const besar = Number(item.nominal) >= BATAS_STRUK;
    // Satu foto bisa jadi bukti beberapa item kalau nominal masing-masing ada di foto (contoh daftar pesanan Shopee).
    const pakaiFoto = foto?.teks && (items.length === 1 ? !fotoDipakai : nominalFoto.includes(Number(item.nominal)));
    if (pakaiFoto) {
      fotoDipakai = true;
      const cek = periksaStruk({ item, teksOcr: foto.teks, buffer: foto.buffer, event, daftarStruk });
      if (cek.ok) {
        lanjut.push({ ...item, bukti: 'Struk ✓', metode: metodeStruk(foto.teks, item.metode), ...(cek.tanggal ? { tanggal: cek.tanggal } : {}), _sidik: cek.sidik });
      } else {
        ditahan.push(tambahTunda(ctx, pesan, { item, buku, kodeEvent, perlu: 'cek', alasan: cek.alasan }));
      }
    } else if (besar && !isOwner) {
      const alasan = foto?.gagal ? ['Foto struk tidak bisa dibaca, kirim ulang yang lebih jelas.'] : (foto?.teks ? ['Struk di foto bukan untuk pengeluaran ini.'] : []);
      ditahan.push(tambahTunda(ctx, pesan, { item, buku, kodeEvent, perlu: 'struk', alasan }));
    } else if (besar) {
      lanjut.push({ ...item, bukti: 'Tanpa struk (input owner)' });
    } else if (!isOwner && !pesan.adaFoto && perluDetail(item.keterangan)) {
      ditahan.push(tambahTunda(ctx, pesan, { item, buku, kodeEvent, perlu: 'detail', alasan: [] }));
    } else {
      lanjut.push({ ...item, bukti: pesan.adaFoto ? 'Foto (tidak terbaca)' : 'Tanpa struk (< 100rb)' });
    }
  }
  // Batas tanggal transaksi (bukan untuk input owner): 2 hari sebelum s/d 2 hari sesudah event.
  if (event && !isOwner) {
    const { awal, akhir } = batasTanggal(event);
    const hariIni = tanggalLokal(pesan.waktu);
    for (const item of [...lanjut]) {
      const tgl = item.tanggal || hariIni;
      let alasan = '';
      if (tgl < awal || tgl > akhir) {
        alasan = `Tanggal transaksi ${tgl} di luar batas (${awal} s/d ${akhir}). Transaksi di luar tanggal ini *tidak bisa dimasukkan*; hanya owner yang bisa ACC.`;
      } else if (item._pesananOnline && !item.tanggal) {
        alasan = 'Tanggal pesanan online tidak terlihat. Kirim screenshot *detail pesanan* yang ada *Waktu Pemesanan*-nya (reply pesan ini).';
      }
      if (alasan) {
        lanjut.splice(lanjut.indexOf(item), 1);
        ditahan.push(tambahTunda(ctx, pesan, { item, buku, kodeEvent, perlu: item._pesananOnline && !item.tanggal ? 'struk' : 'cek', alasan: [alasan] }));
      }
    }
  }
  return { lanjut, ditahan };
}

// Pesan untuk pengeluaran yang ditahan.
function pesanTunda(ditahan) {
  if (!ditahan.length) return [];
  const rp = (p) => `${p.id} ${p.item.keterangan} *${rupiah(p.item.nominal)}*`;
  const baris = [];
  const struk = ditahan.filter((p) => p.perlu === 'struk');
  const cek = ditahan.filter((p) => p.perlu === 'cek');
  const detail = ditahan.filter((p) => p.perlu === 'detail');
  if (struk.length) {
    baris.push(`⏳ *Belum masuk pembukuan, wajib struk (≥ ${rupiah(BATAS_STRUK)}):*`, ...struk.map((p) => `• ${rp(p)}${p.alasan?.length ? `\n  _${p.alasan.join(' ')}_` : ''}`),
      'Kirim *foto struk* dengan *reply pesan ini*. Tidak ada struk? *Owner* reply *acc* untuk menyetujui.');
  }
  if (cek.length) {
    if (baris.length) baris.push('');
    baris.push('❌ *Struk tidak sesuai, belum masuk pembukuan:*', ...cek.map((p) => `• ${rp(p)}\n${p.alasan.map((a) => `  - ${a}`).join('\n')}`),
      'Mohon *penjelasannya di grup* 🙏 (reply pesan ini). Kirim struk yang benar, atau *owner* reply *acc* kalau memang benar. Salah input? reply *batal*.');
  }
  if (detail.length) {
    if (baris.length) baris.push('');
    baris.push('✍️ *Pengeluaran cash, detailnya belum jelas:*', ...detail.map((p) => `• ${rp(p)} → beli apa saja & di mana?`),
      'Reply pesan ini dengan detailnya, contoh: *lakban & plastik di toko Maju*.');
  }
  return baris;
}

async function simpanDanBalas(ctx, pesan, { buku, jenis, kodeEvent, items, dilewati, paksa = false }) {
  // Aturan struk (hanya untuk pengeluaran baru; yang sudah lolos/ACC dikirim dengan paksa).
  let ditahan = [];
  if (jenis === JENIS.KELUAR && !paksa && ctx.sesi && ctx.wajibStruk) {
    ({ lanjut: items, ditahan } = await terapkanAturanStruk(ctx, pesan, { buku, kodeEvent, items }));
  }
  // Pengaman dobel: nominal >= 50rb yang sama persis dengan catatan aktif di event ini tidak langsung
  // dicatat (biasanya koreksi yang terkirim sebagai pesan baru). Pengirim bisa membalas "catat".
  let dobel = [];
  if (jenis === JENIS.KELUAR && !paksa) {
    const ada = (await ctx.store.all('Transaksi'))
      .filter((t) => t.kode_event === kodeEvent && t.jenis === JENIS.KELUAR && t.status !== STATUS.BATAL);
    const kata = (x) => String(x).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    const mirip = (i, t) => i.kategori === t.kategori || kata(i.keterangan).some((w) => kata(t.keterangan).includes(w));
    // Item dengan struk yang sudah dicek tidak perlu (struk kembar sudah diperiksa).
    dobel = items.filter((i) => i.bukti !== 'Struk ✓').map((i) => ({ i, lama: Number(i.nominal) >= 50000 && ada.find((t) => Number(t.nominal) === Number(i.nominal) && mirip(i, t)) }))
      .filter((x) => x.lama);
    // Nominal raksasa (>= Rp 25 juta, biasanya omzet atau salah ketik) juga ditanya dulu.
    const besar = items.filter((i) => Number(i.nominal) >= BATAS_RAKSASA && !dobel.some((d) => d.i === i))
      .map((i) => ({ i, lama: null, raksasa: true }));
    dobel = [...dobel, ...besar];
    if (dobel.length) {
      items = items.filter((i) => !dobel.some((d) => d.i === i));
      if (ctx.sesi) {
        // Penunjuk per grup: siapa pun boleh me-reply peringatan ini dengan "catat" / "batal".
        ctx.sesi.set(`dobelgrup|${pesan.groupId}`, { kunci: kunciDobel(pesan), waktu: Date.now() });
        ctx.sesi.set(kunciDobel(pesan), {
          senderId: pesan.senderId, senderName: pesan.senderName || '',
          items: dobel.map((d) => d.i), buku, kodeEvent, waktu: Date.now(),
          lama: dobel.filter((d) => d.lama).map((d) => ({ id: d.lama.id, keterangan: d.lama.keterangan, tanggal: String(d.lama.tanggal || '').slice(0, 10), nominal: Number(d.lama.nominal) })),
        });
      }
    }
  }
  const hariIni = tanggalLokal(pesan.waktu);
  const sama = dobel.filter((d) => !d.raksasa);
  const raksasa = dobel.filter((d) => d.raksasa);
  const pesanRaksasa = raksasa.length ? [
    '⚠️ *Belum saya catat, nominalnya sangat besar untuk pengeluaran:*',
    ...raksasa.map((d) => `• ${d.i.keterangan} *${rupiah(d.i.nominal)}*`),
    'Kalau ini *omzet*, tulis: *omset 125jt* (atau *#omzet 125jt*). Kalau salah ketik, kirim ulang angkanya.',
    '_Balas *catat* kalau memang pengeluaran sebesar ini, atau *batal*._',
  ] : [];
  const pesanDobel = sama.length ? [
    '⚠️ *Belum saya catat, nominalnya sama dengan catatan lama:*',
    ...sama.flatMap((d) => {
      const tglBaru = d.i.tanggal || hariIni;
      const tglLama = String(d.lama.tanggal || '').slice(0, 10);
      return [
        `• Baru: ${d.i.keterangan} ${rupiah(d.i.nominal)} (tgl ${tglBaru})`,
        `  Lama: *${d.lama.id}* ${d.lama.keterangan} ${rupiah(d.lama.nominal)} (tgl ${tglLama}, dicatat ${d.lama.dicatat || '-'})`,
        tglBaru === tglLama ? '  ⚠️ Tanggalnya juga sama.' : '  Tanggalnya beda.',
      ];
    }),
    'Supaya pasti, *kirim foto bukti trf/struk*-nya, nanti saya cek nominal & tanggalnya.',
    '_Atau balas *catat* kalau memang pengeluaran lain, *batal* kalau dobel._',
  ] : [];
  pesanDobel.push(...(pesanDobel.length && pesanRaksasa.length ? [''] : []), ...pesanRaksasa);
  const infoTunda = pesanTunda(ditahan);
  if (!items.length) return balas([...infoTunda, ...(infoTunda.length && pesanDobel.length ? [''] : []), ...pesanDobel].join('\n'));

  const tersimpan = await simpanTransaksi(ctx.store, {
    tanggal: tanggalLokal(pesan.waktu),
    kode_event: kodeEvent,
    buku,
    jenis,
    sumber: pesan.adaFoto ? 'foto+teks' : 'teks',
    pengirim: namaPengirim(pesan),
    dicatat: waktuLokal(pesan.waktu),
  }, items);

  // Struk yang dipakai dicatat di tab Struk supaya tidak bisa dipakai lagi.
  for (const t of tersimpan) {
    if (!t._sidik) continue;
    await ctx.store.append('Struk', {
      id_transaksi: t.id, kode_event: kodeEvent, tanggal: t._sidik.tanggal, nominal: Number(t.nominal), toko: t._sidik.toko,
      referensi: t._sidik.referensi, hash: t._sidik.hash, dicatat: waktuLokal(pesan.waktu),
    });
  }

  // Pesan (dan foto yang di-reply) yang sudah menjadi catatan diingat, supaya reply berikutnya ke pesan/foto
  // yang sama dianggap koreksi, bukan catatan baru.
  if (ctx.sesi) {
    for (const idPesan of [pesan.id, pesan.kutipan?.id].filter(Boolean)) {
      const lama = ctx.sesi.get(`pesancatat:${pesan.groupId}:${idPesan}`)?.ids || [];
      ctx.sesi.set(`pesancatat:${pesan.groupId}:${idPesan}`, { ids: [...new Set([...lama, ...tersimpan.map((t) => t.id)])] });
    }
  }

  // Diingat sebentar supaya pesan lanjutan seperti "uang valen" berlaku untuk catatan ini.
  if (ctx.terakhir) ctx.terakhir.set(`${pesan.groupId}|${pesan.senderId}`, { ids: tersimpan.map((t) => t.id), waktu: Date.now() });

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
  if (jenis === JENIS.KELUAR) {
    baris.push(`_Ada yang salah? Reply pesan ini, contoh: *uang valen* · *batal* · *tanggal 3 okt* · *masuk konsumsi*${tersimpan.length === 1 ? ' · *harusnya 50rb*' : ''}_`);
  } else {
    baris.push(`Salah? balas *#batal ${tersimpan[0].id}*`);
  }
  if (ctx.sesi && jenis === JENIS.KELUAR && tersimpan.length === 1 && tersimpan[0].kategori === KATEGORI.LAIN) {
    baris.push('', tanyaKategori(ctx, pesan, tersimpan[0].id, tersimpan[0].keterangan));
  }
  if (tersimpan.some((t) => t._dariFoto)) baris.push('_📷 Dibaca dari foto. Kalau salah, reply: *harusnya 530rb* / *masuk transport* / keterangan yang benar_');
  if (infoTunda.length) baris.push('', ...infoTunda);
  if (pesanDobel.length) baris.push('', ...pesanDobel);
  return balas(baris.join('\n'));
}

// Beberapa hari sekaligus (rekap event lama): "#omzet 23 sept 12jt, 24 sept 15,5jt" atau satu per baris.
async function catatOmzetBanyak(ctx, pesan, { grup, event, teks }) {
  const badan = teks.replace(/^#omzet\b/i, '');
  if (/:/.test(badan)) return catatOmzet(ctx, pesan, { grup, event, teks });
  const bagian = badan.split(/\n+|,\s+|;\s*/).map((b) => b.trim()).filter(Boolean);
  const rentang = { mulai: event.mulai, selesai: event.selesai };
  const hariIni = tanggalLokal(pesan.waktu);
  const layak = bagian.filter((b) => parseMoney(b) && ambilTanggal(b, hariIni, rentang).tanggal);
  if (bagian.length < 2 || layak.length !== bagian.length) return catatOmzet(ctx, pesan, { grup, event, teks });
  const hasil = [];
  for (const [i, b] of bagian.entries()) {
    hasil.push(...(await catatOmzet(ctx, { ...pesan, id: `${pesan.id || ''}-${i}` }, { grup, event, teks: `#omzet ${b}`, ringkas: true })));
  }
  const total = (await ctx.store.all('Omzet')).filter((r) => r.kode_event === event.kode && r.status !== STATUS.BATAL)
    .reduce((s, r) => s + Number(r.omzet || 0) - Number(r.refund || 0), 0);
  return balas(`✅ *Omzet ${bagian.length} hari tercatat* (${event.kode})\n${hasil.map((h) => h.text).join('\n')}\nTotal omzet event: *${rupiah(total)}*`);
}

// Rentang tanggal di dalam kalimat: "15-20 sept", "15 sampai 20 september", "15 sep - 2 okt".
function cariRentang(teks, tahun) {
  const t = String(teks).toLowerCase();
  const sambung = '\\s*(?:-|–|—|s\\.?d\\.?|sampai|hingga|sd)\\s*';
  let m = t.match(new RegExp(`(\\d{1,2})${sambung}(\\d{1,2})\\s+([a-z]+)`));
  if (m && BULAN[m[3]]) return { mulai: ymdTanggal(tahun, BULAN[m[3]], m[1]), selesai: ymdTanggal(tahun, BULAN[m[3]], m[2]) };
  m = t.match(new RegExp(`(\\d{1,2})\\s+([a-z]+)${sambung}(\\d{1,2})\\s+([a-z]+)`));
  if (m && BULAN[m[2]] && BULAN[m[4]]) return { mulai: ymdTanggal(tahun, BULAN[m[2]], m[1]), selesai: ymdTanggal(tahun, BULAN[m[4]], m[3]) };
  return parseRentangTanggal(t.trim(), tahun);
}
const ymdTanggal = (y, b, d) => `${y}-${String(b).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

async function catatOmzet(ctx, pesan, { grup, event, teks, ringkas = false }) {
  const tahun = Number(tanggalLokal(pesan.waktu).slice(0, 4));
  const o = parseOmzet(teks, tahun, { hariIni: tanggalLokal(pesan.waktu), rentang: { mulai: event.mulai, selesai: event.selesai } });
  if (!o.omzet) {
    return balas('⚠️ Nominal omzet tidak terbaca. Contoh:\n#omzet\nOMZET TERVERIFIKASI: Rp 12.500.000\nJUMLAH TRANSAKSI: 85');
  }
  // Omzet kotor = sebelum dipotong bagi hasil IO (yang disimpan). "omset bersih / nett / setelah potong IO"
  // = sudah dipotong: dikembalikan ke omzet kotor (bersih ÷ (1 − bagi hasil)).
  const potongIO = Number(event.bagi_hasil_persen || 0) / 100;
  const dariBersih = /\b(bersih|nett?|netto|setelah\s+(di)?potong\w*|sudah\s+(di)?potong\w*|dipotong\s+io)\b/i.test(teks) && !/\b(kotor|belum\s+(di)?potong\w*|sebelum\s+(di)?potong\w*)\b/i.test(teks);
  if (dariBersih && potongIO > 0 && potongIO < 1) {
    const masuk = o.omzet;
    o.omzet = Math.round(masuk / (1 - potongIO));
    o.catatan = [o.catatan, `diinput sebagai omzet bersih ${rupiah(masuk)} (setelah potongan IO ${persen(potongIO * 100)})`].filter(Boolean).join('; ');
  }
  // Event yang sudah selesai (rekap) tanpa tanggal: omzet total dicatat di hari terakhir event.
  const selesai = event.selesai && tanggalLokal(pesan.waktu) > event.selesai;
  const rentang = cariRentang(teks.replace(/^#omzet\b/i, ''), Number(tanggalLokal(pesan.waktu).slice(0, 4)));
  if (rentang && rentang.mulai !== rentang.selesai) {
    o.tanggal = rentang.selesai > event.selesai ? event.selesai : rentang.selesai;
    o.catatan = [o.catatan, `Omzet total event (${rentang.mulai} s/d ${rentang.selesai})`].filter(Boolean).join('; ');
  }
  const tanggal = o.tanggal || (selesai ? event.selesai : tanggalOperasional(pesan.waktu));
  if (!o.tanggal && selesai && !o.catatan) o.catatan = 'Omzet total event (tanpa tanggal per hari)';
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
  if (ringkas) return balas(`• ${tanggal}: ${rupiah(o.omzet)}${lama ? ' (mengganti laporan lama)' : ''}`);

  const omzetEvent = (await ctx.store.all('Omzet'))
    .filter((r) => r.kode_event === event.kode && r.status !== STATUS.BATAL)
    .reduce((s, r) => s + Number(r.omzet || 0) - Number(r.refund || 0), 0);

  const baris = [
    `✅ *Omzet ${tanggal} tercatat* (${event.kode})${lama ? ' - menggantikan laporan sebelumnya' : ''}`,
    `Omzet kotor: *${rupiah(o.omzet)}*${o.jumlah_transaksi ? ` dari ${o.jumlah_transaksi} transaksi` : ''}${dariBersih && potongIO > 0 ? ' _(dihitung dari omzet bersih yang diinput)_' : ''}`,
  ];
  if (o.refund) baris.push(`Refund/koreksi: ${rupiah(o.refund)}`);
  baris.push(`Total omzet kotor event sejauh ini: *${rupiah(omzetEvent)}*`);
  const target = Number(event.target_omzet || 0);
  if (target) baris.push(`Target: ${rupiah(target)} (${persen((omzetEvent / target) * 100)} tercapai)`);

  // Rincian keuangan hanya untuk grup pengeluaran (owner + PIC), bukan grup tim.
  if (grup.jenis === 'pengeluaran') {
    const kotor = o.omzet - o.refund;
    const bersih = kotor * (1 - potongIO);
    baris.push(`Potongan IO ${persen(potongIO * 100)}: ${rupiah(kotor - bersih)}`);
    baris.push(`Omzet bersih (ditransfer IO): *${rupiah(bersih)}*, dijadwalkan ${jatuhTempo(tanggal, event)}`);
    const bersihEvent = omzetEvent * (1 - potongIO);
    if (omzetEvent !== kotor) baris.push(`Total omzet bersih event: ${rupiah(bersihEvent)}`);
  }
  return balas(baris.join('\n'));
}

// Status event menurut tanggal: belum mulai / sedang berjalan / sudah selesai.
export function statusEvent(event, hariIni) {
  if (!event) return '';
  if (event.status === 'SELESAI' || (event.selesai && event.selesai < hariIni)) return 'selesai';
  if (event.mulai && event.mulai > hariIni) return 'belum';
  return 'berjalan';
}

const tglKata = (ymd) => `${Number(String(ymd).slice(8, 10))} ${['', 'jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'][Number(String(ymd).slice(5, 7))]}`;
const tglPendek = (ymd) => { const [y, m, d] = String(ymd).split('-'); return `${Number(d)}/${Number(m)}/${y}`; };

// Langkah yang perlu dilakukan di grup pengeluaran, sesuai status event.
function panduanStatus(event, hariIni) {
  const st = statusEvent(event, hariIni);
  const wajibStruk = eventWajibStruk(event)
    ? '\n🧾 Pengeluaran *≥ Rp 100.000 wajib foto struk*; tanpa struk ditahan sampai owner *acc*.'
    : '';
  if (st === 'selesai') {
    return [
      `📚 *Event ${event.kode} sudah selesai (${tglPendek(event.mulai)} – ${tglPendek(event.selesai)}) → mode REKAP DATA LAMA*`,
      'Grup tim *tidak perlu* didaftarkan. Masukkan semua data di grup ini, tulis tanggalnya:',
      `1️⃣ *Pengeluaran*: \`hotel ${tglKata(event.mulai)} 350rb uang ${event.pic || 'pic'}\` (boleh banyak sekaligus, pisah koma/baris)`,
      `2️⃣ *Omzet harian*: \`#omzet ${tglKata(event.mulai)} 12,5jt\` (boleh beberapa baris sekaligus)`,
      '3️⃣ *Transfer dari IO*: `#trf 45jt`',
      '4️⃣ *Potongan IO* (listrik/air/gas/galon): `#potongan listrik 250rb`',
      '5️⃣ *Bahan dari gudang*: `kiriman 10 pack keju` / `sisa 2 pack keju`',
      'Cek kapan saja dengan *#rekap*. Hasil lengkap ada di file event di Drive.',
    ].join('\n');
  }
  if (st === 'belum') {
    return [
      `🗓️ *Event ${event.kode} belum mulai* (mulai ${tglPendek(event.mulai)}).`,
      'Pengeluaran persiapan (tiket, ekspedisi, sewa) sudah bisa dicatat di grup ini.',
      `Saat event mulai, daftarkan grup tim: kirim *#daftar event ${event.kode}* di grup tim.${wajibStruk}`,
    ].join('\n');
  }
  return [
    `🟢 *Event ${event.kode} sedang berjalan.* Catat pengeluaran di grup ini; omzet harian dikirim di grup tim.`,
    `Daftarkan grup tim: kirim *#daftar event ${event.kode}* di grup tim.${wajibStruk}`,
  ].join('\n');
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
    '',
    panduanStatus(event, tanggalLokal(pesan.waktu)),
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
  const teksDaftar = `✅ Grup ini terdaftar sebagai *grup ${jenis}*${kode ? ` untuk event ${kode}` : ''}.\nKetik *#bantuan* untuk daftar perintah.`;
  // Grup tim event yang belum selesai: langsung tanya data pengiriman & stok awal.
  const ev = jenis === 'event' && kode ? await cariEvent(ctx.store, kode) : null;
  if (ev && ctx.sesi && statusEvent(ev, tanggalLokal(pesan.waktu)) !== 'selesai') {
    // Grup tim: karyawan menyebut namanya sendiri (nomor tercatat otomatis).
    // Grup pengeluaran (owner + PIC): bot menanyakan data pengiriman & stok awal bahan baku.
    const keluar = [{ text: teksDaftar }];
    const anggota = await mulaiAnggota(ctx, pesan.groupId, ev);
    if (anggota) keluar.push({ text: anggota });
    const sudahKirim = (await ctx.store.all('Pengiriman')).some((p) => p.kode_event === ev.kode && p.status !== STATUS.BATAL);
    const grupKeluar = (await ctx.store.all('Grup')).filter((g) => g.kode_event === ev.kode && g.jenis === 'pengeluaran').map((g) => g.group_id);
    if (!sudahKirim) for (const g of grupKeluar) keluar.push({ groupId: g, text: mulaiPengiriman(ctx, g, ev) });
    return keluar;
  }
  return balas(teksDaftar);
}

// Koreksi lewat reply pesan bot (atau pesan singkat tepat setelah mencatat). null kalau bukan koreksi.
async function koreksiCatatan(ctx, pesan, event, ids, isOwner) {
  const semua = await ctx.store.all('Transaksi');
  const semuaTarget = ids.map((id) => semua.find((t) => String(t.id).toUpperCase() === id)).filter(Boolean);
  if (!semuaTarget.length) return null;
  const { catatan: target, teks: teksKoreksi, cocok } = pilihCatatan(pesan.text, semuaTarget);
  const k = bacaKoreksi(teksKoreksi, { hariIni: tanggalLokal(pesan.waktu), satuCatatan: target.length === 1, cocokKeterangan: cocok, rentang: event ? { mulai: event.mulai, selesai: event.selesai } : null });
  if (!k) return null;
  const boleh = target.filter((t) => isOwner || String(t.pengirim).includes(`(${pesan.senderId})`));
  if (!boleh.length) return balas('⚠️ Hanya owner atau pengirim asli yang bisa mengubah catatan ini.');
  const aktif = boleh.filter((t) => t.status !== STATUS.BATAL);
  if (!aktif.length) return balas(`Catatan ${boleh.map((t) => t.id).join(', ')} sudah dibatalkan.`);
  if (k.batal) {
    for (const t of aktif) await ctx.store.update('Transaksi', 'id', t.id, { status: STATUS.BATAL });
    return balas(`🗑️ *Dibatalkan:*\n${aktif.map((t) => `${t.id} ${t.keterangan} ${rupiah(t.nominal)}`).join('\n')}`);
  }
  const patch = {};
  if (k.siapa) patch.dibayar_oleh = await tentukanUangSiapa(ctx, pesan, event?.kode || '', k.siapa);
  if (k.tanggal) patch.tanggal = k.tanggal;
  if (k.kategori) patch.kategori = k.kategori;
  if (k.nominal) patch.nominal = k.nominal;
  if (k.keterangan) patch.keterangan = k.keterangan.charAt(0).toUpperCase() + k.keterangan.slice(1);
  const hasil = [];
  for (const t of aktif) hasil.push(await ctx.store.update('Transaksi', 'id', t.id, patch) || { ...t, ...patch });
  const apa = [patch.keterangan && `keterangan "${patch.keterangan}"`, patch.dibayar_oleh && `uang ${patch.dibayar_oleh}`, patch.tanggal && `tanggal ${patch.tanggal}`, patch.kategori && `kategori ${patch.kategori}`, patch.nominal && `nominal ${rupiah(patch.nominal)}`].filter(Boolean).join(', ');
  const lewat = boleh.length < target.length ? `\n_${target.length - boleh.length} catatan milik orang lain tidak diubah._` : '';
  return balas(`✅ *Sudah diubah* (${apa}):\n${hasil.map((t) => barisItem(t, tanggalLokal(pesan.waktu))).join('\n')}${lewat}`);
}

// Mencatat pengeluaran yang tadinya ditahan, atas nama pengirim aslinya.
async function catatTunda(ctx, pesan, daftar, ubah) {
  const hasil = [];
  const kelompok = new Map();
  for (const p of daftar) {
    const k = `${p.buku}|${p.kodeEvent}|${p.senderId}`;
    if (!kelompok.has(k)) kelompok.set(k, []);
    kelompok.get(k).push(p);
  }
  for (const grup of kelompok.values()) {
    const p0 = grup[0];
    const atasNama = { ...pesan, senderId: p0.senderId, senderName: p0.senderName, adaFoto: false };
    const items = grup.map((p) => ubah(p));
    const r = await simpanDanBalas(ctx, atasNama, { buku: p0.buku, jenis: JENIS.KELUAR, kodeEvent: p0.kodeEvent, items, dilewati: [], paksa: true });
    hasil.push(...r.map((x) => x.text));
  }
  hapusTunda(ctx, pesan.groupId, daftar.map((p) => p.id));
  return hasil;
}

// Balasan untuk pengeluaran yang ditahan: foto struk, "acc" (owner), "batal", detail cash, atau penjelasan.
async function selesaikanTunda(ctx, pesan, { cmd, isOwner, teks }) {
  const semua = daftarTunda(ctx, pesan.groupId);
  if (!semua.length) return null;
  const ids = [...idTundaDariTeks(pesan.kutipan?.teks), ...idTundaDariTeks(teks)];
  const acc = /^(#?acc|setuju|approve|disetujui|ok acc|acc ya|acc semua)\b/i.test(teks);
  const batal = /^(#?batal|hapus|salah input|gak jadi|tidak jadi|ga jadi)\b/i.test(teks) && !/T\d{4}/i.test(teks);
  let target = semua.filter((p) => ids.includes(p.id));
  if (!target.length) {
    if (acc && isOwner && /semua/i.test(teks)) target = semua;
    else if (acc && isOwner && semua.length === 1) target = semua;
    else if (acc && isOwner) return balas(`Ada ${semua.length} pengeluaran menunggu: ${semua.map((p) => p.id).join(', ')}.\nReply pesan bot yang berisi nomornya dengan *acc*, ketik *acc P0001*, atau *acc semua*.`);
    else if (pesan.adaFoto && pesan.ambilFoto && !parseMoney(teks)) target = semua.filter((p) => p.senderId === pesan.senderId && p.perlu !== 'detail');
    if (!target.length) return null;
  }
  if (cmd && !acc && !batal) return null;

  if (acc) {
    if (!isOwner) return balas('⚠️ Hanya *owner* yang bisa ACC pengeluaran tanpa struk / struk tidak sesuai.');
    const teksAcc = await catatTunda(ctx, pesan, target, (p) => ({
      ...p.item,
      keterangan: p.penjelasan ? `${p.item.keterangan} (${p.penjelasan})` : p.item.keterangan,
      bukti: p.perlu === 'cek' ? 'ACC owner (struk tidak sesuai)' : (p.perlu === 'struk' ? 'ACC owner (tanpa struk)' : 'ACC owner'),
    }));
    return balas(`👍 *Disetujui owner:* ${target.map((p) => p.id).join(', ')}\n\n${teksAcc.join('\n\n')}`);
  }
  if (batal) {
    const boleh = target.filter((p) => isOwner || p.senderId === pesan.senderId);
    if (!boleh.length) return balas('⚠️ Hanya owner atau pengirim asli yang bisa membatalkan.');
    hapusTunda(ctx, pesan.groupId, boleh.map((p) => p.id));
    return balas(`🗑️ Tidak dicatat: ${boleh.map((p) => `${p.id} ${p.item.keterangan} ${rupiah(p.item.nominal)}`).join(', ')}`);
  }
  // Foto struk
  if (pesan.adaFoto && pesan.ambilFoto && !parseMoney(teks)) {
    const butuhStruk = target.filter((p) => p.perlu !== 'detail');
    if (!butuhStruk.length) return null;
    const foto = await bacaFotoPesan(ctx, pesan);
    if (!foto.teks) return balas('⚠️ Foto struknya belum bisa saya baca. Kirim ulang foto yang lebih jelas (tidak miring/buram), atau owner reply *acc*.');
    const nominal = bacaBukti(foto.teks).nominal;
    const lewatReply = ids.length > 0;
    const cocok = butuhStruk.length === 1 && lewatReply ? butuhStruk : butuhStruk.filter((p) => nominal.includes(Number(p.item.nominal))).slice(0, 1);
    // Foto tanpa reply yang tidak cocok dengan catatan yang menunggu = pengeluaran baru.
    if (!cocok.length && !lewatReply) return null;
    if (!cocok.length) return balas(`❌ Struk ini tidak cocok dengan ${butuhStruk.map((p) => p.id).join(', ')} (nominal di struk: ${nominal.slice(0, 4).map(rupiah).join(', ') || 'tidak terbaca'}). Reply pesan yang berisi nomornya dengan struk yang benar.`);
    const p = cocok[0];
    const event = p.buku === BUKU.EVENT ? await cariEvent(ctx.store, p.kodeEvent) : null;
    const cek = periksaStruk({ item: p.item, teksOcr: foto.teks, buffer: foto.buffer, event, daftarStruk: await strukBerlaku(ctx.store) });
    if (!cek.ok) {
      ubahTunda(ctx, pesan.groupId, p.id, { perlu: 'cek', alasan: cek.alasan });
      return balas(pesanTunda([{ ...p, perlu: 'cek', alasan: cek.alasan }]).join('\n'));
    }
    const hasil = await catatTunda(ctx, pesan, [p], (x) => ({ ...x.item, bukti: 'Struk ✓', metode: metodeStruk(foto.teks, x.item.metode), ...(cek.tanggal ? { tanggal: cek.tanggal } : {}), _sidik: cek.sidik }));
    return balas(`🧾 *Struk sesuai* (nominal, tanggal${cek.tanggal ? ` ${cek.tanggal}` : ''}, toko ${cek.sidik.toko || '-'}).\n\n${hasil.join('\n\n')}`);
  }
  // Teks tanpa harga: detail cash (pengirim asli) atau penjelasan untuk struk yang tidak sesuai.
  if (!teks || parseMoney(teks)) return null;
  const detail = target.filter((p) => p.perlu === 'detail' && p.senderId === pesan.senderId);
  if (detail.length) {
    if (perluDetail(teks)) return balas('✍️ Masih kurang jelas. Tulis barangnya & tempat belinya, contoh: *lakban & plastik di toko Maju*.');
    const hasil = await catatTunda(ctx, pesan, detail, (p) => ({ ...p.item, keterangan: `${p.item.keterangan} (${teks})`, bukti: 'Tanpa struk (< 100rb, detail)' }));
    return balas(hasil.join('\n\n'));
  }
  const dijelaskan = target.filter((p) => p.perlu !== 'detail');
  if (!dijelaskan.length || !pesan.kutipan) return null;
  for (const p of dijelaskan) ubahTunda(ctx, pesan.groupId, p.id, { penjelasan: teks.slice(0, 200) });
  return balas(`📝 Penjelasan dicatat untuk ${dijelaskan.map((p) => p.id).join(', ')}. Masih menunggu *struk yang sesuai* atau *owner* reply *acc*.`);
}

// "Penginapan veri bukan 500k, total dari trf 2620k itu termasuk deposit 500k yang nanti dikembalikan":
// biaya = total transfer - deposit. Kalau maksudnya tidak jelas, tanya; tidak pernah dicatat sebagai catatan baru.
async function koreksiNominalRumit(ctx, pesan, ids, isOwner) {
  const teks = String(pesan.text || '');
  const semua = await ctx.store.all('Transaksi');
  const kandidat = ids.map((id) => semua.find((t) => String(t.id).toUpperCase() === id)).filter((t) => t && t.status !== STATUS.BATAL);
  const { catatan } = pilihCatatan(teks, kandidat);
  const normal = teks.replace(/([a-z])(\d)/gi, '$1 $2');
  const uang = findMoney(normal);
  const iDeposit = normal.toLowerCase().search(/deposit|jaminan/);
  const tanya = `💬 Maksudnya nominal ${catatan.length === 1 ? catatan[0].id : 'catatan yang mana'} jadi berapa? Reply pesan catatannya, contoh: *harusnya 2.120.000*`;
  if (catatan.length !== 1 || iDeposit < 0 || uang.length < 2) return balas(`Pesan ini *tidak saya catat* sebagai pengeluaran baru.\n${tanya}`);
  const t = catatan[0];
  if (!isOwner && !String(t.pengirim).includes(`(${pesan.senderId})`)) return balas('⚠️ Hanya owner atau pengirim asli yang bisa mengubah catatan ini.');
  const deposit = (uang.find((u) => u.index > iDeposit) || uang[uang.length - 1]).nilai;
  const total = Math.max(...uang.map((u) => u.nilai));
  if (!(total > deposit)) return balas(`Pesan ini *tidak saya catat* sebagai pengeluaran baru.\n${tanya}`);
  const biaya = total - deposit;
  const keterangan = `${t.keterangan} (trf ${rupiah(total)} termasuk deposit ${rupiah(deposit)} yang dikembalikan)`;
  const baru = await ctx.store.update('Transaksi', 'id', t.id, { nominal: biaya, keterangan });
  return balas([
    `✅ *Sudah diubah* (nominal ${rupiah(biaya)}):`,
    barisItem(baru || { ...t, nominal: biaya, keterangan }, tanggalLokal(pesan.waktu)),
    `_Biaya = transfer ${rupiah(total)} − deposit ${rupiah(deposit)}. Deposit tidak dihitung sebagai biaya. Kalau depositnya ternyata tidak kembali, reply: *harusnya ${rupiah(total).replace('Rp ', '')}*_`,
  ].join('\n'));
}

// Foto bukti untuk catatan yang nominalnya sama dengan catatan lama: cocokkan nominal & tanggal.
async function periksaBukti(ctx, pesan, d) {
  const teksFoto = (await bacaFotoPesan(ctx, pesan)).teks || null;
  if (!teksFoto) {
    return balas('⚠️ Fotonya belum bisa saya baca (pembaca foto belum terpasang di HP bot, atau foto gagal diunduh).\nBalas *catat* kalau memang pengeluaran lain, atau *batal* kalau dobel.');
  }
  const bukti = bacaBukti(teksFoto);
  const terbaca = `Terbaca di bukti: ${bukti.nominal.length ? bukti.nominal.slice(0, 4).map(rupiah).join(', ') : 'nominal tidak terbaca'}${bukti.tanggal ? `, tanggal ${bukti.tanggal}` : ', tanggal tidak terbaca'}`;
  const dicatat = [];
  const tetap = [];
  const baris = ['🔍 *Bukti saya cek*', terbaca];
  d.items.forEach((item, i) => {
    const lama = (d.lama || [])[i] || {};
    if (!bukti.nominal.includes(Number(item.nominal))) {
      baris.push(`• ${item.keterangan} ${rupiah(item.nominal)}: nominal ini *tidak ada* di bukti.`);
      tetap.push({ item, lama });
    } else if (bukti.tanggal && bukti.tanggal === lama.tanggal) {
      baris.push(`• ${item.keterangan} ${rupiah(item.nominal)}: nominal & tanggal (${bukti.tanggal}) sama dengan *${lama.id}* → ini catatan yang sama, *tidak saya catat lagi*.`);
    } else {
      baris.push(`• ${item.keterangan} ${rupiah(item.nominal)}: cocok dengan bukti${bukti.tanggal ? `, tanggal ${bukti.tanggal} beda dengan ${lama.id} (${lama.tanggal || '-'})` : ''} → *dicatat*.`);
      dicatat.push({ ...item, ...(bukti.tanggal ? { tanggal: bukti.tanggal } : {}), sumber: 'foto bukti' });
    }
  });
  if (tetap.length) {
    ctx.sesi.set(kunciDobel(pesan), { ...d, items: tetap.map((x) => x.item), lama: tetap.map((x) => x.lama), waktu: Date.now() });
    baris.push('_Kirim foto lain, atau balas *catat* / *batal* untuk yang belum jelas._');
  } else {
    ctx.sesi.hapus(kunciDobel(pesan));
  }
  if (!dicatat.length) return balas(baris.join('\n'));
  const hasil = await catatUang(ctx, pesan, { buku: d.buku, jenis: JENIS.KELUAR, kodeEvent: d.kodeEvent, teks: '', itemsSiap: dicatat });
  return balas(`${baris.join('\n')}\n\n${hasil.map((h) => h.text).join('\n')}`);
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
    bahan: await ctx.store.all('Bahan Event'),
    hargaBahan: await ctx.store.all('Harga Bahan'),
    tim: await ctx.store.all('Tim Event'),
  }, hariIni);
  const tunda = ctx.sesi ? daftarTunda(ctx, pesan.groupId) : [];
  const infoTunda = tunda.length
    ? `\n\n⏳ *Belum dihitung, menunggu struk/ACC/detail:* ${tunda.length} pengeluaran, ${rupiah(tunda.reduce((s, p) => s + Number(p.item.nominal || 0), 0))}\n${tunda.map((p) => `• ${p.id} ${p.item.keterangan} ${rupiah(p.item.nominal)} (${{ struk: 'menunggu struk', cek: 'struk tidak sesuai', detail: 'detail cash' }[p.perlu]})`).join('\n')}`
    : '';
  // Event sudah selesai: rekening PIC untuk transfer fee & penggantian ditanyakan (sekali) kalau belum ada.
  const tanyaRek = statusEvent(event, hariIni) === 'selesai' ? await tanyaRekeningPic(ctx, pesan, event) : '';
  return balas(formatRekapEvent(r, hariIni) + infoTunda + (tanyaRek ? `\n\n${tanyaRek}` : ''));
}

// Bot baru dimasukkan ke grup: kalau grup belum terdaftar, bot menyapa dan bertanya grup ini untuk apa.
export async function handleGrupBaru(ctx, groupId) {
  if (await cariGrup(ctx.store, groupId)) return [];
  if (ctx.sesi.get(groupId)?.jenis === 'sapaan') return []; // sapaan sudah dikirim (event WhatsApp bisa datang dua kali)
  return balas(mulaiSapaan(ctx, groupId));
}

// Chat pribadi dengan bot: hanya penilaian KPI (PIC/owner) dan perintah KPI owner; selain itu diabaikan.
async function handlePribadi(ctx, pesan) {
  const teks = String(pesan.text || '').trim();
  const cmd = parsePerintah(teks);
  const isOwner = ctx.ownerIds.has(pesan.senderId);
  if (!cmd) return (await jawabPenilaian(ctx, pesan)) || (await jawabRekeningPribadi(ctx, pesan)) || [];
  const opsi = { event: null, argumen: cmd.argumen, isOwner };
  if (cmd.perintah === 'nilai') return perintahNilai(ctx, pesan, opsi);
  if (cmd.perintah === 'kpi') return perintahKpi(ctx, pesan, opsi);
  if (isOwner && cmd.perintah === 'karyawan') return balas(await perintahKaryawan(ctx, [cmd.sisaBaris, cmd.badan].filter(Boolean).join('\n'), null));
  if (isOwner && ['izin', 'ijin', 'ijjin', 'dispensasi', 'jadwal'].includes(cmd.perintah)) {
    // Chat pribadi: event dari kode yang ditulis, atau satu-satunya event yang belum selesai.
    let isi = [cmd.sisaBaris, cmd.badan].filter(Boolean).join(' ');
    const events = (await ctx.store.all('Event')).filter((e) => e.status !== 'SELESAI');
    let ev = events.find((e) => new RegExp(`\\b${e.kode}\\b`, 'i').test(isi));
    if (ev) isi = isi.replace(new RegExp(`\\b${ev.kode}\\b`, 'i'), ' ');
    else if (events.length === 1) [ev] = events;
    else if (cmd.perintah !== 'jadwal') {
      const tim = await ctx.store.all('Tim Event');
      const cocok = events.filter((e) => tim.some((o) => o.kode_event === e.kode && o.status !== 'BATAL' && new RegExp(`\\b${String(o.nama).split(' ')[0]}\\b`, 'i').test(isi)));
      if (cocok.length === 1) [ev] = cocok;
    }
    return balas(cmd.perintah === 'jadwal' ? await perintahJadwal(ctx, pesan, ev, isi) : await perintahIzin(ctx, pesan, ev, isi));
  }
  if (isOwner && ['gajian', 'penggajian'].includes(cmd.perintah)) {
    const semua = await ctx.store.all('Event');
    const kode = cmd.argumen.find((a) => semua.some((e) => e.kode.toLowerCase() === a.toLowerCase()));
    const aktifEv = semua.filter((e) => e.status !== 'BATAL').sort((a, b) => String(b.mulai).localeCompare(String(a.mulai)));
    const ev = kode ? semua.find((e) => e.kode.toLowerCase() === kode.toLowerCase()) : aktifEv[0];
    return perintahGajian(ctx, pesan, ev, { isOwner });
  }
  if (isOwner && cmd.perintah === 'poin') return perintahPoin(ctx, pesan, opsi);
  if (isOwner && cmd.perintah === 'poinbatal') return perintahPoinBatal(ctx, pesan, opsi);
  return [];
}

export async function handlePesan(ctx, pesan) {
  if (pesan.pribadi) return handlePribadi(ctx, pesan);
  ingatNama(ctx, pesan);
  let teks = String(pesan.text || '').trim();
  // "rekap" / "rekapnya" / "lihat rekap" saja (tanpa #) = #rekap.
  if (/^(lihat\s+|cek\s+|minta\s+)?(rekap|rekapan|rekapnya|rekap dong|rekap ya)[.!?]*$/i.test(teks)) {
    teks = '#rekap';
    pesan = { ...pesan, text: teks };
  }
  // "omset bali 125jt" / "omzet 3 okt 12,5jt" tanpa tanda # = laporan omzet, bukan pengeluaran.
  // Juga "total omset bali 125jt", "ini omset harian 125jt", "penjualan 3 okt 12jt", "pendapatan event 125jt".
  const RE_OMZET = /\b(omset|omzet|omsetnya|omzetnya|penjualan|pendapatan|sales)\b/i;
  const awalOmzet = /^(total\s+)?(omset|omzet|omsetnya|omzetnya)\b/i.test(teks);
  if (!teks.startsWith('#') && RE_OMZET.test(teks) && parseMoney(teks) && (awalOmzet || (teks.split(/\s+/).length <= 15
    && !/\b(bagi hasil|potongan|potong|admin|fee|bonus|komisi)\b/i.test(teks) && !/\n/.test(teks.trim())))) {
    teks = `#omzet ${teks.replace(/\b(ini|itu|total|omset|omzet|omsetnya|omzetnya|penjualan|pendapatan|sales|harian)\b/gi, ' ').replace(/[ \t]+/g, ' ').replace(/\n+/g, ' ').trim()}`;
    pesan = { ...pesan, text: teks };
  }
  const cmd = parsePerintah(teks);
  const isOwner = ctx.ownerIds.has(pesan.senderId);
  const grup = await cariGrup(ctx.store, pesan.groupId);

  // Perintah yang berlaku di grup mana pun.
  if (cmd?.perintah === 'idsaya') {
    return balas(`ID WhatsApp ${pesan.senderName || ''}: *${pesan.senderId}*${isOwner ? ' (owner)' : ''}`);
  }

  // Tanya-jawab bot (setup grup / event): siapa pun di grup boleh menjawab (memulainya tetap khusus owner).
  if (ctx.sesi && (!cmd || cmd.perintah === 'batal' && !cmd.argumen.length)) {
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
  // Daftar anggota grup (nama & peran) yang sedang ditanyakan; setelah selesai lanjut ke data pengiriman.
  if (!cmd && ctx.sesi && event) {
    const j = await jawabAnggota(ctx, pesan, event);
    if (j) return balas(j.teks);
  }
  // Absensi foto di grup tim (dan reply owner/PIC "tolak" / "bebas denda" ke foto absen).
  if (!cmd && event && grup.jenis === 'event') {
    const absen = await tanganiAbsen(ctx, pesan, event, { isOwner });
    if (absen) return balas(absen);
  }
  // Laporan foto SOP (loading in, harian, loading out) dan status checklist-nya, di grup tim.
  if (event && grup.jenis === 'event') {
    const grupPengeluaran = (await ctx.store.all('Grup')).filter((g) => g.kode_event === event.kode && g.jenis === 'pengeluaran').map((g) => g.group_id);
    const lapor = await tanganiLaporan(ctx, pesan, event, { cmd, isOwner, grupPengeluaran });
    if (lapor) return lapor;
  }
  // Jawaban PIC atas pertanyaan nomor rekening ("BCA 1234567890 a.n. Melia").
  if (!cmd && event && grup.jenis === 'pengeluaran') {
    const rek = await jawabRekening(ctx, pesan, event, { isOwner });
    if (rek) return rek;
  }
  // "bonus pic nya 20 persen" / "fee pic 20%" (owner, grup pengeluaran) = fee PIC khusus event ini.
  if (!cmd && event && grup.jenis === 'pengeluaran' && isOwner && /\b(fee|bonus|bagian|jatah)\s+(pic|melia|untuk pic)\b/i.test(teks) && /\d+(?:[.,]\d+)?\s*(%|persen)/i.test(teks)) {
    return perintahFeePic(ctx, event, teks);
  }
  // "gaji tiara, veri, dena masing masing 2 juta" (owner, grup pengeluaran) = gaji khusus event karyawan tetap.
  if (!cmd && event && grup.jenis === 'pengeluaran' && isOwner && adalahPerintahGaji(teks)) {
    const hasil = await perintahGajiTetap(ctx, pesan, event, teks);
    if (!/^Format:/.test(hasil[0].text)) return hasil;
  }
  // Jawaban "sisa bahan dihargai berapa?" (grup pengeluaran).
  if (!cmd && event && grup.jenis === 'pengeluaran') {
    const nilai = await jawabNilaiSisa(ctx, pesan, event);
    if (nilai) return nilai;
  }
  // Data pengiriman & stok awal yang sedang ditanyakan.
  if (!cmd && ctx.sesi && event) {
    const grupPengeluaran = (await ctx.store.all('Grup')).filter((g) => g.kode_event === event.kode && g.jenis === 'pengeluaran').map((g) => g.group_id);
    const jawabKirim = await jawabPengiriman(ctx, pesan, { namaPengirim, grupPengeluaran, event });
    if (jawabKirim) return jawabKirim;
  }
  // Penilaian KPI yang sedang berjalan (jawaban "5 4 4 3").
  if (!cmd && ctx.sesi) {
    const jawabNilai = await jawabPenilaian(ctx, pesan);
    if (jawabNilai) return jawabNilai;
  }
  // Reply ke foto dengan angka kecil tanpa satuan ("makan mama 38") = ribuan (38rb).
  if (!cmd && pesan.kutipan?.foto && !parseMoney(teks) && /(^|\s)\d{1,3}(\s|$)/.test(teks)) {
    pesan = { ...pesan, text: teks.replace(/(^|\s)(\d{1,3})(?=\s|$)/, '$1$2rb') };
    teks = pesan.text;
  }
  const teksTanpaPerintah = cmd ? [cmd.sisaBaris, cmd.badan].filter(Boolean).join('\n') : teks;

  // Pengeluaran yang ditahan (menunggu struk / ACC owner / detail cash).
  if (ctx.sesi) {
    const hasil = await selesaikanTunda(ctx, pesan, { cmd, isOwner, teks });
    if (hasil) return hasil;
  }

  // Jawaban (reply) untuk "Pengeluaran Rp X ini untuk apa?" dari foto, oleh siapa pun di grup.
  if (!cmd && pesan.kutipan && ctx.sesi && teks && !parseMoney(teks) && (grup.jenis === 'ruko' || event)) {
    const m = String(pesan.kutipan.teks).match(/Pengeluaran \*?Rp ([\d.]+)\*? ini untuk apa/i);
    if (m) {
      const nominal = Number(m[1].replace(/\./g, ''));
      const kunci = `fototanya:${pesan.groupId}:${nominal}`;
      const asal = ctx.sesi.get(kunci);
      if (asal) { ctx.sesi.hapus(kunci); ctx.sesi.hapus(`lengkapi:${pesan.groupId}:${asal.senderId}`); }
      const atasNama = asal ? { ...pesan, senderId: asal.senderId, senderName: asal.senderName } : pesan;
      const ruko = grup.jenis === 'ruko';
      const uangSiapa = asal?.uangSiapa && !ambilUangSiapa(teks).siapa ? ` uang ${asal.uangSiapa}` : '';
      return catatUang(ctx, atasNama, { buku: ruko ? BUKU.RUKO : BUKU.EVENT, jenis: JENIS.KELUAR, kodeEvent: ruko ? 'RUKO' : event.kode, teks: `${teks} ${nominal}${uangSiapa}` });
    }
  }

  // Peringatan dobel: "batal" = tidak dicatat; foto bukti trf dicek nominal & tanggalnya.
  // Milik pengirim sendiri, atau (kalau me-reply peringatannya) milik siapa pun di grup.
  const balasDobel = /nominalnya (sama dengan catatan lama|sangat besar)/i.test(pesan.kutipan?.teks || '');
  const ambilDobel = () => {
    if (!ctx.sesi) return null;
    const sendiri = ctx.sesi.get(kunciDobel(pesan));
    if (sendiri && Date.now() - sendiri.waktu < 60 * 60 * 1000) return { d: sendiri, kunci: kunciDobel(pesan) };
    const p = balasDobel && ctx.sesi.get(`dobelgrup|${pesan.groupId}`);
    const lain = p && ctx.sesi.get(p.kunci);
    return lain && Date.now() - lain.waktu < 60 * 60 * 1000 ? { d: lain, kunci: p.kunci } : null;
  };
  if (ctx.sesi) {
    const { d, kunci: kunciD } = ambilDobel() || {};
    if (d) {
      if (!cmd && /^(batal|dobel|hapus|gak jadi|tidak jadi|ga jadi|ya dobel|iya dobel|itu dobel|dobel itu)$/i.test(teks.replace(/[.!]+$/, ''))) {
        ctx.sesi.hapus(kunciD);
        return balas((d.lama || []).length ? `👌 Oke, tidak dicatat (dobel dengan ${d.lama.map((x) => x.id).join(', ')}).` : '👌 Oke, tidak dicatat.');
      }
      // Foto dipakai sebagai bukti dobel hanya kalau me-reply peringatan dobel, atau nominalnya cocok.
      // Foto lain (bukti transfer lain) diproses sebagai pengeluaran baru.
      if (pesan.adaFoto && pesan.ambilFoto && !parseMoney(teks)) {
        const balasPeringatan = /nominalnya sama dengan catatan lama/i.test(pesan.kutipan?.teks || '');
        const foto = await bacaFotoPesan(ctx, pesan);
        const nominal = foto.teks ? bacaBukti(foto.teks).nominal : [];
        if (balasPeringatan || d.items.some((i) => nominal.includes(Number(i.nominal)))) return periksaBukti(ctx, pesan, d);
      }
    }
  }

  // Jawaban "catat" atas peringatan dobel. Boleh dengan tambahan koreksi: "catat, uang melia",
  // "catat tanggal 3 okt". Me-reply peringatannya dengan "ya" / "lanjut" / "bukan dobel" juga berarti catat.
  if (!cmd && ctx.sesi) {
    const m = teks.match(/^(?:ya|iya|oke|ok|tetap|lanjut)?\s*catat(?:\s+(?:aja|saja|ya))?\b[\s,.:;-]*(.*)$/is)
      || (balasDobel && teks.match(/^(?:ya|iya|yaa|oke|ok|lanjut|benar|betul|bukan dobel|beda|lain)\b[\s,.:;-]*(.*)$/is))
      // Reply peringatan dengan koreksi saja ("uang melia semua", "tanggal 3 okt") = catat yang baru dengan koreksi itu.
      || (balasDobel && !parseMoney(teks) && (() => { const k = bacaKoreksi(teks, { hariIni: tanggalLokal(pesan.waktu), satuCatatan: true }); return k && !k.batal ? [teks, teks] : null; })());
    const ambil = m && ambilDobel();
    if (ambil) {
      const { d, kunci: kunciD } = ambil;
      ctx.sesi.hapus(kunciD);
      // Dicatat atas nama pengirim asli pesan pengeluaran.
      const asal = d.senderId ? { ...pesan, senderId: d.senderId, senderName: d.senderName } : pesan;
      // Yang ditahan ternyata omzet ("omset ... 93jt"): catat sebagai omzet, bukan pengeluaran.
      const omzetItem = d.items.filter((i) => /\b(omset|omzet|penjualan|pendapatan)\b/i.test(i.keterangan));
      if (omzetItem.length && omzetItem.length === d.items.length && event) {
        const hasilOmzet = [];
        for (const [n, i] of omzetItem.entries()) {
          const tgl = i.tanggal ? ` ${i.tanggal}` : '';
          hasilOmzet.push(...await catatOmzet(ctx, { ...asal, id: `${pesan.id || ''}-o${n}` }, { grup, event, teks: `#omzet${tgl} ${i.nominal}` }));
        }
        return hasilOmzet;
      }
      const hasil = await catatUang(ctx, asal, { buku: d.buku, jenis: JENIS.KELUAR, kodeEvent: d.kodeEvent, teks: '', itemsSiap: d.items });
      const tambahan = bersihkanTeks(m[1] || '');
      if (!tambahan) return hasil;
      const ids = ctx.sesi.get(`pesancatat:${pesan.groupId}:${pesan.id}`)?.ids || [];
      const koreksi = ids.length ? await koreksiCatatan(ctx, { ...pesan, text: tambahan }, event, ids, true) : null;
      if (koreksi) return [...hasil, ...koreksi];
      return [...hasil, { text: `🤔 Sudah dicatat, tapi "${tambahan}" belum saya pahami. Reply catatannya dengan, contoh: *uang melia* / *tanggal 3 okt* / *masuk konsumsi*.` }];
    }
  }

  // Reply koreksi ("uang melia", "tanggal 3 okt", "batal") ke peringatan dobel tanpa kata "catat": jangan sampai
  // catatan LAMA yang disebut di peringatan ikut berubah/batal. Jelaskan caranya.
  if (!cmd && balasDobel && !pesan.adaFoto && teks) {
    const k = bacaKoreksi(teks, { hariIni: tanggalLokal(pesan.waktu), satuCatatan: true, rentang: event ? { mulai: event.mulai, selesai: event.selesai } : null });
    if (k) {
      if (!ambilDobel()) return balas('⏳ Catatan baru di peringatan ini sudah tidak tersimpan (lewat 1 jam). Mohon kirim ulang pengeluarannya sebagai pesan baru.');
      return balas(`📝 Catatan barunya *belum saya catat*. Kalau memang pengeluaran lain, reply peringatan dengan *catat ${teks}* (semua kolom catatan baru dipakai, lalu diubah sesuai koreksimu). Kalau dobel, reply *batal*.`);
    }
  }

  // Reply ke pesan/foto yang sudah tercatat: koreksi untuk catatan itu, tidak pernah dicatat dua kali.
  const sudahCatat = !cmd && pesan.kutipan?.id && ctx.sesi?.get(`pesancatat:${pesan.groupId}:${pesan.kutipan.id}`);
  if (sudahCatat?.ids?.length) {
    const hasil = await koreksiCatatan(ctx, pesan, event, sudahCatat.ids, isOwner);
    if (hasil) return hasil;
    const semua = await ctx.store.all('Transaksi');
    const catatan = sudahCatat.ids.map((id) => semua.find((t) => t.id === id)).filter((t) => t && t.status !== STATUS.BATAL);
    if (catatan.length) {
      return balas([
        '✅ *Pesan/foto ini sudah tercatat*, tidak saya catat lagi:',
        ...catatan.map((t) => barisItem(t, tanggalLokal(pesan.waktu))),
        '_Mau mengubah? Reply dengan: *uang melia* · *harusnya 38rb* · *tanggal 22 sept* · *batal*. Pengeluaran lain kirim sebagai pesan baru (tanpa reply)._',
      ].join('\n'));
    }
  }

  // Reply ke pesan bot yang berisi nomor catatan: "uang valen", "batal", "tanggal 3 okt", "masuk konsumsi".
  if (!cmd && pesan.kutipan) {
    const ids = idDariTeks(pesan.kutipan.teks);
    if (ids.length) {
      const hasil = await koreksiCatatan(ctx, pesan, event, ids, isOwner);
      if (hasil) return hasil;
      // Reply koreksi dengan beberapa angka ("bukan 500k, total trf 2620k termasuk deposit 500k"): jangan dicatat baru.
      if (parseMoney(teks) && /\b(bukan|salah|harusnya|seharusnya|termasuk|deposit|jaminan|dikembalikan|refund|koreksi)\b/i.test(teks)) {
        return koreksiNominalRumit(ctx, pesan, ids, isOwner);
      }
      // Reply ke catatan tanpa harga baru tapi tidak dipahami: beri contoh, jangan diam.
      if (!parseMoney(teks)) {
        if (/\b(jumlah|nominal|harga|uang|total)\b.*\bsalah\b|\bsalah\b.*\b(jumlah|nominal|harga|total)\b/i.test(teks)) {
          return balas('💬 Yang benar berapa, untuk catatan yang mana? Reply pesan catatannya, contoh: *hotel harusnya 222.540*');
        }
        if (/\bsalah\b/i.test(teks) && teks.split(/\s+/).length <= 4) {
          return balas('💬 Apa yang salah? Reply pesan catatannya dengan yang benar, contoh:\n• *hotel harusnya 1.081.171* (nominal)\n• *hotel uang valen* (uang siapa)\n• *hotel tanggal 22 sept* (tanggal)\n• *batal* (hapus semua catatan di pesan itu)');
        }
        return balas('🤔 Maaf, koreksinya belum saya pahami. Reply pesan catatan dengan salah satu contoh ini:\n• *uang valen* (atau mama / kas)\n• *grab uang valen* (kalau hanya satu item)\n• *tanggal 3 okt*\n• *masuk konsumsi*\n• *harusnya 50rb* (kalau isinya satu catatan)\n• *batal*');
      }
    }
  }

  // Jawaban atas pertanyaan bot sebelumnya (harga / jumlah bahan / nama bahan / kategori).
  if (!cmd && ctx.sesi) {
    const jawab = jawabLengkapi(ctx, pesan, await ctx.store.all('Harga Bahan'));
    // Nominal pertanyaan "ini untuk apa?" berubah (dikurangi deposit dll): pindahkan catatan foto ke nominal baru.
    if (jawab?.nominalBaru && jawab.nominalLama) {
      const lama = ctx.sesi.get(`fototanya:${pesan.groupId}:${jawab.nominalLama}`);
      const sesiBaru = ctx.sesi.get(`lengkapi:${pesan.groupId}:${pesan.senderId}`);
      ctx.sesi.hapus(`fototanya:${pesan.groupId}:${jawab.nominalLama}`);
      if (lama && sesiBaru) ctx.sesi.set(`fototanya:${pesan.groupId}:${jawab.nominalBaru}`, { ...lama, uangSiapa: sesiBaru.uangSiapa || '' });
    }
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
    if (jawab?.bahan && event) return perintahBahan(ctx, pesan, event, { perintah: jawab.bahan.gerak, sisaBaris: jawab.bahan.teks, badan: '', argumen: [] }, { harga: grup?.jenis === 'pengeluaran', grupPengeluaran: await grupPengeluaranEvent(ctx, event) });
    if (jawab?.pengeluaran) {
      if (grup.jenis === 'ruko') return catatUang(ctx, pesan, { buku: BUKU.RUKO, jenis: JENIS.KELUAR, kodeEvent: 'RUKO', teks: jawab.pengeluaran });
      if (event) return catatUang(ctx, pesan, { buku: BUKU.EVENT, jenis: JENIS.KELUAR, kodeEvent: event.kode, teks: jawab.pengeluaran });
    }
  }

  // Pesan singkat tanpa reply tepat setelah mencatat ("Uang valen", "tanggal 3 okt"): untuk catatan terakhir pengirim.
  const lanjutan = !cmd && !pesan.kutipan && ctx.terakhir?.get(`${pesan.groupId}|${pesan.senderId}`);
  if (lanjutan && Date.now() - lanjutan.waktu < BATAS_LANJUTAN_MS && !/^\s*(batal|hapus|cancel)\b/i.test(teks)) {
    const hasil = await koreksiCatatan(ctx, pesan, event, lanjutan.ids, isOwner);
    if (hasil) return hasil;
  }
  if (cmd) {
    switch (cmd.perintah) {
      case 'rekap': return perintahRekap(ctx, pesan, grup, cmd, isOwner);
      case 'nilai':
        if (grup.jenis !== 'pengeluaran') return balas('⚠️ Penilaian KPI dilakukan di grup pengeluaran (owner + PIC) atau chat pribadi dengan bot, bukan di grup tim.');
        return perintahNilai(ctx, pesan, { event, argumen: cmd.argumen, isOwner });
      case 'poin': return perintahPoin(ctx, pesan, { event, argumen: cmd.argumen, isOwner });
      case 'anggota': {
        if (!event) return balas('⚠️ Grup ini belum terhubung ke event.');
        const daftarAnggota = await mulaiAnggota(ctx, pesan.groupId, event);
        return balas(daftarAnggota || '⚠️ Tim event belum ada. Isi tim dulu di grup pengeluaran (#tim).');
      }
      case 'rekening':
      case 'norek':
      case 'rek':
        if (grup.jenis !== 'pengeluaran') return balas('⚠️ Rekening hanya diurus di grup pengeluaran (owner + PIC).');
        return perintahRekening(ctx, pesan, event, [cmd.sisaBaris, cmd.badan].filter(Boolean).join(' '), { isOwner });
      case 'gajian':
      case 'penggajian':
        if (grup.jenis !== 'pengeluaran') return balas('⚠️ Daftar gaji hanya bisa dilihat di grup pengeluaran atau chat pribadi dengan bot.');
        return perintahGajian(ctx, pesan, event, { isOwner });
      case 'setor':
      case 'setoran':
        if (grup.jenis !== 'pengeluaran') return balas('⚠️ Setoran ke PIC hanya bisa dilihat di grup pengeluaran.');
        return perintahSetor(ctx, pesan, event, { isOwner });
      case 'feepic':
      case 'fee': {
        if (!isOwner) return balas('⚠️ Fee PIC hanya diatur owner.');
        if (grup.jenis !== 'pengeluaran') return balas('⚠️ Fee PIC hanya diatur di grup pengeluaran.');
        return perintahFeePic(ctx, event, [cmd.sisaBaris, cmd.badan].filter(Boolean).join(' '));
      }
      case 'gaji': {
        if (!isOwner) return balas('⚠️ Gaji khusus event hanya diatur owner.');
        if (grup.jenis !== 'pengeluaran') return balas('⚠️ Gaji hanya diatur di grup pengeluaran (owner + PIC), bukan di grup tim.');
        return perintahGajiTetap(ctx, pesan, event, [cmd.sisaBaris, cmd.badan].filter(Boolean).join(' '));
      }
      case 'izin':
      case 'ijin':
      case 'ijjin':
      case 'dispensasi':
      case 'jadwal': {
        if (!isOwner) return balas('⚠️ Izin, dispensasi, dan jadwal khusus absen hanya bisa diberikan owner.');
        const isi = [cmd.sisaBaris, cmd.badan].filter(Boolean).join(' ');
        return balas(cmd.perintah === 'jadwal' ? await perintahJadwal(ctx, pesan, event, isi) : await perintahIzin(ctx, pesan, event, isi));
      }
      case 'absen':
      case 'absensi':
        return balas(await perintahAbsen(ctx, pesan, event, cmd.argumen, { isOwner }));
      case 'karyawan': {
        if (!isOwner) return balas('⚠️ Perintah ini khusus owner.');
        if (grup.jenis !== 'pengeluaran') return balas('⚠️ Data & nomor karyawan hanya di grup pengeluaran atau chat pribadi dengan bot.');
        return balas(await perintahKaryawan(ctx, [cmd.sisaBaris, cmd.badan].filter(Boolean).join('\n'), event));
      }
      case 'kirim':
      case 'stokawal':
      case 'pengiriman':
        if (!event) return balas('⚠️ Grup ini belum terhubung ke event.');
        return balas(mulaiPengiriman(ctx, pesan.groupId, event));
      case 'poinbatal': return perintahPoinBatal(ctx, pesan, { event, argumen: cmd.argumen, isOwner });
      case 'kpi': return perintahKpi(ctx, pesan, { event, argumen: cmd.argumen, isOwner });
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
        return catatOmzetBanyak(ctx, pesan, { grup, event, teks });
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
          return perintahBahan(ctx, pesan, event, cmd, { harga: grup?.jenis === 'pengeluaran', grupPengeluaran: await grupPengeluaranEvent(ctx, event) });
        }
        break;
    }
  }

  // Revisi bahan: reply ke pesan bahan / balasan bot-nya dengan daftar baru ("keju 55 pack, garlic 30 pack").
  if (!cmd && event && pesan.kutipan?.teks && !parseMoney(teks)) {
    const q = pesan.kutipan.teks;
    const dariBot = q.match(/(Bahan baku pengiriman pertama|Restock bahan baku|Sisa bahan baku)/);
    const gerakQ = dariBot ? { 'Bahan baku pengiriman pertama': 'Keluar', 'Restock bahan baku': 'Restock', 'Sisa bahan baku': 'Kembali' }[dariBot[1]]
      : { keluar: 'Keluar', restock: 'Restock', kembali: 'Kembali' }[gerakBahanDariKalimat(q)];
    const gerakBaru = gerakBahanDariKalimat(teks);
    if (gerakQ && (!gerakBaru || /\b(revisi|ralat|koreksi|harusnya|seharusnya|yang benar)\b/i.test(teks) || gerakBaru === Object.entries({ keluar: 'Keluar', restock: 'Restock', kembali: 'Kembali' }).find(([, v]) => v === gerakQ)?.[0])) {
      const r = await revisiBahan(ctx, pesan, event, {
        gerak: gerakQ, teksLama: q, teksBaru: teks.replace(/\b(revisi|ralat|koreksi|harusnya|seharusnya|yang benar)\b[:\s]*/gi, ''),
        harga: grup.jenis === 'pengeluaran', grupPengeluaran: await grupPengeluaranEvent(ctx, event),
      });
      if (r) return r;
    }
  }
  // Kalimat biasa tentang bahan tanpa harga, contoh "kiriman 10 pack keju" / "sisa 3 pack mozzarella".
  if (!cmd && event && !parseMoney(teks)) {
    const gerak = gerakBahanDariKalimat(teks);
    if (gerak) {
      const hasil = await perintahBahan(ctx, pesan, event, { perintah: gerak, sisaBaris: teks, badan: '', argumen: [] }, { harga: grup?.jenis === 'pengeluaran', grupPengeluaran: await grupPengeluaranEvent(ctx, event) });
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
  // "Okk sekarang kita rekap pengeluaran ya", "mulai input ya": jawab dengan langkah sesuai status event.
  if (/\b(rekap\w*|ngerekap\w*|mulai|input|masukin|masukkan|isi data|data lama)\b/i.test(teks)) {
    const kunci = `panduan:${pesan.groupId}`;
    const terakhir = ctx.sesi.get(kunci);
    if (!terakhir || Date.now() - terakhir.waktu > 2 * 60 * 1000) {
      ctx.sesi.set(kunci, { waktu: Date.now() });
      return balas(`👍 Siap!\n\n${panduanStatus(event, tanggalLokal(pesan.waktu))}`);
    }
  }
  if (/\?|(^|\s)(kamu|bot|gimana|bagaimana|sudah|udah|sampai mana)(\s|$)/i.test(teks)) {
    const kunci = `petunjuk:${pesan.groupId}`;
    const terakhir = ctx.sesi.get(kunci);
    if (terakhir && Date.now() - terakhir.waktu < 10 * 60 * 1000) return [];
    ctx.sesi.set(kunci, { waktu: Date.now() });
    if (statusEvent(event, tanggalLokal(pesan.waktu)) === 'selesai') return balas(`🤖 Maaf, saya belum bisa diajak ngobrol.\n\n${panduanStatus(event, tanggalLokal(pesan.waktu))}`);
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
