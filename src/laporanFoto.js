// Laporan foto SOP di grup tim event, untuk 3 tahap:
//   1. Loading in (hari pertama, SOP BAB 3)  : #tiba, #booth, #gudang, data pengiriman (#kirim), #acc
//   2. Laporan harian (tiap hari, BAB 4-6)     : #posisi, #grill, #cooler, #nampan, #followers, #temuan,
//                                               #omzet, #bersih, #pulang
//   3. Loading out (hari terakhir, BAB 7)      : #stokakhir, #bongkar, #koli, #muat, #terima
//
// Karyawan kirim foto dengan caption tag (#booth) atau kalimat biasa ("booth sudah siap"). Beberapa foto
// sekaligus (album) dihitung satu laporan: foto tanpa caption dari orang yang sama dalam 5 menit ikut masuk.
// Bot mencatat siapa, jam berapa, berapa foto (tab "Laporan Foto"), lalu menyebut yang belum.
// Bot tidak bisa menilai isi foto (rapi/bersih); yang dicek otomatis: foto baru (bukan terusan / bukan foto
// lama yang dikirim ulang), dan angka followers di screenshot Instagram (dibaca dengan OCR).
// Temuan (serpihan, busuk, alat rusak, komplain) langsung diteruskan ke grup pengeluaran (owner + PIC).

import { mintaNilaiJobdesk, mintaNilaiBantu } from './nilaiJobdesk.js';
import { pjPerTag, pembantuPerTag } from './jobdesk.js';
import { createHash } from 'node:crypto';
import { STATUS } from './schema.js';
import { waktuLokal } from './util.js';
import { zonaKota, lokal, jadwalHari, aturanHari, timEvent, namaDariNomor } from './absensi.js';

const T = { IN: 'loadingin', HARIAN: 'harian', OUT: 'loadingout' };
const NAMA_TAHAP = { loadingin: 'Loading in', harian: 'Laporan harian', loadingout: 'Loading out' };

// foto: wajib foto · orang: tiap anggota tim (bukan satu untuk tim) · bagian: sebelum/selama/tutup
export const BUTIR = [
  { tag: 'tiba', tahap: T.IN, label: 'Barang tiba', isi: 'armada, muatan, semua koli, kerusakan (jika ada)', foto: true, kata: /\b(barang|armada|truk|muatan|koli)\b.*\b(tiba|datang|sampai|sampe|nyampe)\b|\b(tiba|datang|sampai)\b.*\b(barang|armada|muatan)\b/i },
  { tag: 'booth', tahap: T.IN, label: 'Booth bagian bawah (etalase, meja, kompor, banner)', isi: 'etalase, meja, kompor, banner terpasang', foto: true, kata: /\bbooth\b.*\b(siap|jadi|selesai|beres|rakit|done)\b|\brakit\w*\b.*\bbooth\b/i },
  { tag: 'gudang', tahap: T.IN, label: 'Gudang belakang ditata', isi: 'freezer, label koli, stok awal, kondisi bahan', foto: true, kata: /\b(gudang|freezer)\b.*\b(siap|tata|rapi|beres|selesai)\b|\bfoto (gudang|freezer)\b/i },
  { tag: 'listrik', tahap: T.IN, label: 'Booth bagian atas (lampu, LED, bendera, hexos, kabel)', isi: 'lampu gantung & LED menyala, bendera, hexos, jalur kabel rapi', foto: true, kata: /\b(listrik|kabel|lampu|led|bendera|hexos|stop ?kontak)\b/i },
  { tag: 'display', tahap: T.IN, label: 'Estetika, dekorasi & alat masak bersih', isi: 'dekorasi, alat masak sudah dicuci & tertata, siap jualan', foto: true, kata: /\b(display|estetika|dekor\w*|cuci\w*|alat masak)\b/i },
  { tag: 'kirim', tahap: T.IN, label: 'Data pengiriman & stok awal', isi: 'dijawab lewat pertanyaan #kirim', foto: false, otomatis: 'pengiriman' },
  { tag: 'acc', tahap: T.IN, label: 'ACC PIC sebelum buka', isi: 'PIC/owner ketik #acc setelah semua dicek', foto: false, khusus: 'pic' },

  { tag: 'posisi', tahap: T.HARIAN, bagian: 'sebelum', label: 'Pembagian posisi', isi: 'Kasir, Grill, Plating, Getok 1, Getok 2', foto: false, kata: null },
  { tag: 'grill', tahap: T.HARIAN, bagian: 'sebelum', label: 'Grill siap', isi: 'grill, torch, gas, bumbu + tampak depan booth + display cangkang', foto: true, kata: /\b(grill|torch)\b.*\b(siap|ready|ok)\b|\bfoto grill\b/i },
  { tag: 'cooler', tahap: T.HARIAN, bagian: 'sebelum', label: 'Cooler box', isi: 'cooler berisi es cukup, tidak terendam air', foto: true, kata: /\bcooler\b/i },
  { tag: 'nampan', tahap: T.HARIAN, bagian: 'sebelum', label: 'Nampan di freezer', isi: '10 nampan (7 mozza / 1 seafood / 2 garlic)', foto: true, kata: /\bnampan\b/i },
  { tag: 'followers', tahap: T.HARIAN, bagian: 'sebelum', label: 'Followers IG saat buka & tutup', isi: 'screenshot profil Instagram', foto: true, kata: /\b(followers?|follower|pengikut)\b/i, ulang: 2 },
  { tag: 'bantu', tahap: T.HARIAN, bagian: 'selama', label: 'Bantu kerjaan owner', isi: 'apa yang dibantu (boleh dengan foto)', foto: false, kata: null, opsional: true, bebas: true },
  { tag: 'temuan', tahap: T.HARIAN, bagian: 'selama', label: 'Temuan', isi: 'serpihan / bau / busuk / alat rusak / komplain + tindakan', foto: true, kata: /\b(temuan|serpihan|busuk|basi|bau|rusak|komplain|complain)\b/i, opsional: true },
  { tag: 'omzet', tahap: T.HARIAN, bagian: 'tutup', label: 'Omzet harian', isi: 'format #omzet', foto: false, otomatis: 'omzet' },
  { tag: 'bersih', tahap: T.HARIAN, bagian: 'tutup', label: 'Kebersihan setelah tutup', isi: 'area depan, grill, wastafel, cooler sudah dikuras', foto: true, kata: /\b(bersih|kebersihan|closing|beres(-| )?beres)\b/i },
  { tag: 'pulang', tahap: T.HARIAN, bagian: 'tutup', label: 'Absen pulang', isi: 'tiap orang ketik #pulang', foto: false, orang: true },

  { tag: 'stokakhir', tahap: T.OUT, label: 'Stok akhir', isi: 'stock opname akhir + foto stok dingin', foto: true, kata: /\bstok akhir\b/i },
  { tag: 'bongkar', tahap: T.OUT, label: 'Sebelum bongkar', isi: 'booth, area depan-belakang, peralatan, freezer', foto: true, kata: /\bbongkar\b/i },
  { tag: 'koli', tahap: T.OUT, label: 'Koli balik', isi: 'jumlah koli kering + dingin + foto label', foto: true, kata: /\bkoli\b/i },
  { tag: 'muat', tahap: T.OUT, label: 'Barang berangkat', isi: 'sopir/ekspedisi, nomor kendaraan, jam berangkat, tujuan, foto muatan', foto: true, kata: /\b(muat|berangkat|jalan)\b.*\b(barang|truk|armada|muatan)\b|\b(barang|truk|armada)\b.*\b(berangkat|jalan)\b/i },
  { tag: 'terima', tahap: T.OUT, label: 'Barang diterima di tujuan', isi: 'hitung ulang di gudang / kota berikutnya', foto: true, kata: /\b(diterima|sampai gudang|tiba di gudang|sudah sampai)\b/i },
];
const PER_TAG = Object.fromEntries(BUTIR.map((b) => [b.tag, b]));
export const TAG_LAPORAN = Object.keys(PER_TAG).filter((t) => !['kirim', 'omzet'].includes(t));
const TAG_STATUS = { loadingin: T.IN, loadin: T.IN, harian: T.HARIAN, laporan: T.HARIAN, ceklis: T.HARIAN, checklist: T.HARIAN, loadingout: T.OUT, loadout: T.OUT };
export const PERINTAH_STATUS = Object.keys(TAG_STATUS);

const SUSUL_MS = 5 * 60 * 1000;
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const balas = (text) => [{ text }];

// Tahap yang berlaku pada tanggal itu.
function tahapHari(event, tanggal) {
  const t = [];
  if (tanggal <= event.mulai) t.push(T.IN);
  if (tanggal >= event.mulai && (!event.selesai || tanggal <= event.selesai)) t.push(T.HARIAN);
  if (event.selesai && tanggal >= event.selesai) t.push(T.OUT);
  return t;
}

// Tanggal laporan sebuah tahap: loading in = hari pertama, loading out = hari terakhir.
function tanggalTahap(event, tahap, hariIni) {
  if (tahap === T.IN) return hariIni < event.mulai ? hariIni : event.mulai;
  if (tahap === T.OUT) return hariIni > event.selesai ? hariIni : event.selesai;
  return hariIni;
}

// Angka followers dari teks OCR screenshot Instagram ("1.234 Postingan 12,5 rb Pengikut ...").
export function followersDari(teks) {
  const t = String(teks || '').replace(/\r/g, '');
  const ANGKA = /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(rb|ribu|k|jt|juta|m)?\b/gi;
  const nilai = (a, s) => {
    const sat = String(s || '').toLowerCase();
    if (sat) return Math.round(Number(a.replace(',', '.')) * (/^(jt|juta|m)$/.test(sat) ? 1e6 : 1e3));
    return Number(a.replace(/[.,]/g, ''));
  };
  // angka tepat sebelum kata followers/pengikut (satu baris)
  const dekat = t.match(/(\d[\d.,]*)\s*(rb|ribu|k|jt|juta|m)?\s*(followers|pengikut)/i);
  if (dekat) return nilai(dekat[1], dekat[2]);
  // tata letak IG: baris angka di atas baris label (postingan / pengikut / mengikuti)
  const baris = t.split('\n').map((b) => b.trim()).filter(Boolean);
  for (let i = 1; i < baris.length; i++) {
    const label = baris[i].toLowerCase().split(/\s+/);
    const idx = label.findIndex((w) => /^(followers|pengikut)$/.test(w));
    if (idx < 0) continue;
    const angka = [...baris[i - 1].matchAll(ANGKA)];
    if (angka.length === label.length && angka[idx]) return nilai(angka[idx][1], angka[idx][2]);
  }
  return null;
}

async function laporan(ctx, kode) {
  return (await ctx.store.all('Laporan Foto')).filter((r) => r.kode_event === kode && r.status === STATUS.OK);
}

async function idBaru(ctx) {
  const semua = await ctx.store.all('Laporan Foto');
  const n = semua.reduce((m, r) => Math.max(m, Number(String(r.id).replace(/\D/g, '')) || 0), 0) + 1;
  return `L${String(n).padStart(4, '0')}`;
}

async function sidikFoto(pesan) {
  if (!pesan.ambilFoto) return { buffer: null, sidik: '' };
  const buffer = await pesan.ambilFoto().catch(() => null);
  return { buffer, sidik: buffer ? createHash('sha256').update(buffer).digest('hex').slice(0, 24) : '' };
}

// Tag dari caption: "#booth ..." atau kalimat yang cocok.
function tagDari(teks, cmd, tahapAktif) {
  if (cmd && PER_TAG[cmd.perintah] && TAG_LAPORAN.includes(cmd.perintah)) return cmd.perintah;
  if (cmd) return null;
  const cocok = BUTIR.filter((b) => b.kata && b.kata.test(teks) && tahapAktif.includes(b.tahap));
  // "koli" bisa loading in (barang tiba) atau loading out: utamakan tahap yang sedang berjalan
  return cocok[0]?.tag || null;
}

// Status checklist sebuah tahap.
export async function teksStatus(ctx, event, tahap, tanggal) {
  const semua = await laporan(ctx, event.kode);
  const hari = semua.filter((r) => r.tahap === NAMA_TAHAP[tahap] && r.tanggal === tanggal);
  const tim = await timEvent(ctx, event.kode);
  const zona = zonaKota(event.kota);
  const baris = [];
  for (const b of BUTIR.filter((x) => x.tahap === tahap && x.tag !== 'bantu')) {
    if (b.otomatis === 'pengiriman') {
      const ada = (await ctx.store.all('Pengiriman')).some((p) => p.kode_event === event.kode && p.status !== STATUS.BATAL);
      baris.push(`${ada ? '✅' : '❌'} ${b.label}${ada ? '' : ' → *#kirim*'}`);
      continue;
    }
    if (b.otomatis === 'omzet') {
      const ada = (await ctx.store.all('Omzet')).some((o) => o.kode_event === event.kode && o.tanggal === tanggal && o.status !== STATUS.BATAL);
      baris.push(`${ada ? '✅' : '❌'} ${b.label}${ada ? '' : ' → *#omzet*'}`);
      continue;
    }
    const milik = hari.filter((r) => r.tag === b.tag);
    if (b.orang) {
      const belum = tim.filter((o) => !milik.some((r) => sama(r.nama, o.nama)));
      baris.push(`${belum.length ? '❌' : '✅'} ${b.label}: ${milik.length}/${tim.length}${belum.length ? ` (belum: ${belum.map((o) => o.nama).join(', ')})` : ''}`);
      continue;
    }
    if (!milik.length) {
      baris.push(`${b.opsional ? '➖' : '❌'} ${b.label} → *#${b.tag}*${b.foto ? ' + foto' : ''} _(${b.isi})_`);
      continue;
    }
    const isi = milik.map((r) => `${r.nama} ${r.jam}${Number(r.jumlah_foto) ? `, ${r.jumlah_foto} foto` : ''}${r.angka ? `, ${Number(r.angka).toLocaleString('id-ID')}` : ''}`).join(' · ');
    const kurang = b.ulang && milik.length < b.ulang ? ` _(baru ${milik.length}/${b.ulang}: buka & tutup)_` : '';
    baris.push(`✅ ${b.label}: ${isi}${kurang}`);
  }
  const j = jadwalHari(event, tanggal, await aturanHari(ctx, event.kode, tanggal));
  const jamBuka = j ? ` · buka ${lokal(j.buka, zona).jam} ${zona.nama}` : '';
  // Penanggung jawab dari jobdesk (loading in).
  if (tahap === T.IN) {
    const pj = await pjPerTag(ctx, event.kode);
    const bantu = await pembantuPerTag(ctx, event.kode);
    for (let i = 0; i < baris.length; i++) {
      const tag = (baris[i].match(/#(\w+)/) || [])[1] || BUTIR.filter((b) => b.tahap === T.IN)[i]?.tag;
      if (pj[tag]?.length) baris[i] += ` 👷 ${pj[tag].join(', ')}${bantu[tag]?.length ? ` 🤝 ${bantu[tag].join(', ')}` : ''}`;
    }
  }
  return `📋 *${NAMA_TAHAP[tahap]} ${event.kode} – ${tanggal}*${jamBuka}\n${baris.join('\n')}`;
}

function sisaTeks(ctx, event, tahap, tanggal) {
  return teksStatus(ctx, event, tahap, tanggal).then((t) => {
    const belum = t.split('\n').filter((b) => b.startsWith('❌')).map((b) => (b.match(/\*#(\w+)\*/) || [])[1]).filter(Boolean);
    return belum.length ? `Belum: ${belum.map((x) => `#${x}`).join(', ')}` : `🎉 ${NAMA_TAHAP[tahap]} lengkap.`;
  });
}

// Pesan di grup tim: laporan foto / #posisi / #pulang / #acc / status. Mengembalikan balasan atau null.
export async function tanganiLaporan(ctx, pesan, event, { cmd, isOwner = false, grupPengeluaran = [] } = {}) {
  if (!event || !ctx.store) return null;
  const teks = String(pesan.text || '').trim();
  const zona = zonaKota(event.kota);
  const { tanggal: hariIni, jam } = lokal(pesan.waktu, zona);
  const aktif = tahapHari(event, hariIni);

  // Status checklist
  if (cmd && TAG_STATUS[cmd.perintah]) {
    const tahap = TAG_STATUS[cmd.perintah];
    const tgl = /^\d{4}-\d{2}-\d{2}$/.test(cmd.argumen[0] || '') ? cmd.argumen[0] : tanggalTahap(event, tahap, hariIni);
    return balas(await teksStatus(ctx, event, tahap, tgl));
  }

  // Foto lanjutan tanpa caption (album) → tambah ke laporan terakhir orang itu.
  const kunciSusul = `lapfoto:${pesan.groupId}:${pesan.senderId}`;
  if (pesan.adaFoto && !teks && ctx.sesi) {
    const s = ctx.sesi.get(kunciSusul);
    if (s && Date.now() - s.waktu < SUSUL_MS) {
      const { sidik } = await sidikFoto(pesan);
      if (pesan.diteruskan || (sidik && (await ctx.store.all('Laporan Foto')).some((r) => String(r.sidik).split(' ').includes(sidik)))) return null;
      const baris = (await ctx.store.all('Laporan Foto')).find((r) => r.id === s.id);
      if (baris) {
        await ctx.store.updateWhere('Laporan Foto', (r) => r.id === s.id, { jumlah_foto: Number(baris.jumlah_foto || 0) + 1, sidik: `${baris.sidik} ${sidik}`.trim() });
        ctx.sesi.set(kunciSusul, { ...s, waktu: Date.now() });
      }
      return []; // dicatat diam-diam
    }
    return null;
  }

  const tag = tagDari(teks, cmd, aktif);
  if (!tag) return null;
  const b = PER_TAG[tag];
  const tim = await timEvent(ctx, event.kode);
  const orang = (await namaDariNomor(ctx, pesan.senderId, tim)) || (isOwner ? { nama: 'Owner', peran: 'Owner' } : null);
  const nama = orang?.nama || pesan.senderName || pesan.senderId;
  const tahap = b.tahap;
  const tanggal = tahap === T.HARIAN ? hariIni : tanggalTahap(event, tahap, hariIni);

  if (b.khusus === 'pic' && !isOwner && orang?.peran !== 'PIC') return balas('⚠️ ACC loading in hanya oleh PIC atau owner.');
  if (b.foto && !pesan.adaFoto) {
    // kalimat biasa tanpa foto ("cooler nya dimana") tidak dibalas; hanya tag
    if (!cmd) return null;
    return balas(`📷 *#${tag}* wajib pakai foto: ${b.isi}. Kirim fotonya dengan caption *#${tag}*.`);
  }
  if (pesan.adaFoto && pesan.diteruskan) return balas(`❌ Foto terusan (forward) tidak diterima untuk *#${tag}*. Ambil foto baru langsung dari kamera.`);

  let sidik = '';
  let buffer = null;
  if (pesan.adaFoto) {
    ({ sidik, buffer } = await sidikFoto(pesan));
    if (sidik && (await ctx.store.all('Laporan Foto')).some((r) => String(r.sidik).split(' ').includes(sidik))) {
      return balas(`❌ Foto ini *sama persis* dengan foto laporan sebelumnya. Untuk *#${tag}* kirim foto baru hari ini.`);
    }
  }
  const semua = await laporan(ctx, event.kode);
  if (b.orang && semua.some((r) => r.tag === tag && r.tanggal === tanggal && sama(r.nama, nama))) return balas(`👌 *${nama}* sudah #${tag} hari ini.`);

  // Followers: baca angka dari screenshot.
  let angka = '';
  let infoAngka = '';
  if (tag === 'followers' && buffer) {
    try {
      const { bacaGambar } = await import('./bukti.js');
      const n = followersDari(await (ctx.bacaGambar || bacaGambar)(buffer));
      if (n) {
        angka = n;
        const tadi = semua.filter((r) => r.tag === 'followers' && r.tanggal === tanggal && r.angka).pop();
        const selisih = tadi ? n - Number(tadi.angka) : null;
        infoAngka = `\n👥 Followers terbaca: *${n.toLocaleString('id-ID')}*${selisih !== null ? ` (${selisih >= 0 ? '+' : ''}${selisih.toLocaleString('id-ID')} sejak ${tadi.jam})` : ''}`;
      } else {
        infoAngka = '\n_(Angka followers tidak terbaca dari screenshot; tulis di caption, contoh: #followers 12.540)_';
      }
    } catch { /* OCR tidak tersedia */ }
  }
  if (tag === 'followers' && !angka) {
    const tertulis = teks.match(/(\d{1,3}(?:[.,]\d{3})+|\d{3,})/);
    if (tertulis) { angka = Number(tertulis[1].replace(/[.,]/g, '')); infoAngka = `\n👥 Followers: *${angka.toLocaleString('id-ID')}*`; }
  }

  const id = await idBaru(ctx);
  const isi = cmd ? [cmd.sisaBaris, cmd.badan].filter(Boolean).join('\n') : teks;
  await ctx.store.append('Laporan Foto', {
    id, tanggal, kode_event: event.kode, tahap: NAMA_TAHAP[tahap], tag, nama, jam: `${jam} ${zona.nama}`,
    jumlah_foto: pesan.adaFoto ? 1 : 0, isi: isi.slice(0, 500), angka, foto_id: pesan.id, sidik, status: STATUS.OK, dicatat: waktuLokal(pesan.waktu),
  });
  if (pesan.adaFoto && ctx.sesi) ctx.sesi.set(kunciSusul, { id, waktu: Date.now() });

  const keluar = [];
  if (tag === 'temuan') {
    const lapor = `🚨 *TEMUAN ${event.kode}* dari ${nama} (${jam} ${zona.nama})\n${isi || '(tanpa keterangan)'}\n_Foto ada di grup tim. PIC mohon segera ditindak._`;
    for (const g of grupPengeluaran) keluar.push({ groupId: g, text: lapor });
    keluar.unshift({ text: `🚨 Temuan dari *${nama}* tercatat (${id}) dan sudah diteruskan ke owner & PIC.${isi ? '' : '\nTulis juga jenis temuan & tindakannya, contoh: *#temuan oyster bau 3 pcs, sudah dibuang*'}` });
    return keluar;
  }
  const sisa = b.opsional ? '' : `\n${await sisaTeks(ctx, event, tahap, tanggal)}`;
  const ket = pesan.adaFoto ? ' _(foto berikutnya dalam 5 menit ikut dihitung)_' : '';
  // Pekerjaan jobdesk: PIC diminta mengecek di lokasi dan memberi poin (chat pribadi / grup pengeluaran).
  if (tag === 'bantu') {
    if (!isi.trim()) {
      await ctx.store.updateWhere('Laporan Foto', (r) => r.id === id, { status: 'BATAL' });
      return balas('🤝 Tulis juga *bantu apa*, contoh: *#bantu angkat galon & beli es batu untuk pak george* (boleh dengan foto).');
    }
    const mintaBantu = await mintaNilaiBantu(ctx, event, { lapId: id, pengirim: nama, jam: `${jam} ${zona.nama}`, isi });
    return [{ text: `🤝 Terima kasih *${nama}*! Bantuan tercatat (${id}): ${isi}\n_Owner akan memberi poin._` }, ...mintaBantu];
  }
  const minta = tahap === T.IN ? await mintaNilaiJobdesk(ctx, event, { lapId: id, tag, pengirim: nama, jam: `${jam} ${zona.nama}` }) : [];
  return [{ text: `📷 *${b.label}* (#${tag}) dari *${nama}* jam ${jam} ${zona.nama} tercatat.${ket}${infoAngka}${sisa}${minta.length ? '\n_PIC akan mengecek hasilnya di lokasi._' : ''}` }, ...minta];
}

// Pengingat terjadwal: saat booth buka, sebut laporan sebelum-buka (dan loading in hari pertama) yang belum.
export async function tugasLaporan(ctx, sekarang = new Date()) {
  const keluar = [];
  if (!ctx.sesi) return keluar;
  const [events, grup] = await Promise.all([ctx.store.all('Event'), ctx.store.all('Grup')]);
  for (const ev of events.filter((e) => e.status !== 'SELESAI' && e.jam_buka)) {
    const zona = zonaKota(ev.kota);
    const { tanggal } = lokal(sekarang, zona);
    const aktif = tahapHari(ev, tanggal);
    if (!aktif.includes(T.HARIAN)) continue;
    const j = jadwalHari(ev, tanggal, await aturanHari(ctx, ev.kode, tanggal));
    if (!j || sekarang < j.buka || sekarang - j.buka > 30 * 60000) continue;
    const kunci = `lapingat:${ev.kode}:${tanggal}`;
    if (ctx.sesi.get(kunci)) continue;
    ctx.sesi.set(kunci, { kirim: true });
    const grupTim = grup.filter((g) => g.kode_event === ev.kode && g.jenis === 'event').map((g) => g.group_id);
    const semua = (await laporan(ctx, ev.kode)).filter((r) => r.tanggal === tanggal);
    const belum = BUTIR.filter((b) => b.tahap === T.HARIAN && b.bagian === 'sebelum' && !semua.some((r) => r.tag === b.tag)).map((b) => `#${b.tag}`);
    const bagian = [];
    if (belum.length) bagian.push(`⏰ *Booth ${ev.kode} sudah buka.* Laporan sebelum buka yang belum masuk: ${belum.join(', ')}`);
    if (aktif.includes(T.IN)) {
      const inBelum = (await teksStatus(ctx, ev, T.IN, tanggal)).split('\n').filter((x) => x.startsWith('❌'));
      if (inBelum.length) bagian.push(`📦 Loading in belum lengkap:\n${inBelum.join('\n')}`);
    }
    if (bagian.length) for (const g of grupTim) keluar.push({ groupId: g, text: bagian.join('\n\n') });
  }
  return keluar;
}
