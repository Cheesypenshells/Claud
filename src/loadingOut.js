// Loading out (bongkar booth & kirim barang): pembagian tugas per bagian kerja, pendataan koli / sisa bahan / alat,
// pengumuman & pengingat otomatis, dan ringkasan ke owner. Dibangun di atas laporan foto (#tag) dan tab Jobdesk.
//
// Alur (keputusan owner): bongkar dimulai setelah closing hari terakhir; tim dibagi per bagian kerja, tiap bagian punya
// penanggung jawab (PJ) yang wajib foto laporan dengan #tag; barang langsung dikirim ke event berikutnya.
//   #bongkarbawah  bongkar bagian bawah        #bongkaratas  bongkar bagian atas      #cuci   cuci alat & area bersih
//   #stokakhir     sisa bahan baku (+ #sisa)   #koli         packing & hitung koli    #alat   data alat + kondisi
//   #muat          berangkat (sopir, kendaraan, jam, tujuan)         #terima  diterima di tujuan
//   #jobdeskout (owner/PIC)  lihat / bagi pembagian tugas    #jobdeskout ulang  bagi ulang
// Data: koli dibandingkan kiriman awal (tab Pengiriman); alat rusak/hilang diteruskan ke grup pengeluaran (tab Alat Event).

import { STATUS } from './schema.js';
import { tanggalLokal, waktuLokal, tambahHari } from './util.js';
import { anggotaKerja } from './jobdesk.js';
import { saatClosing } from './absensi.js';
import { tanggalClosing } from './stokHarian.js';

const balas = (text) => [{ text }];
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const nomor62 = (n) => String(n || '').replace(/\D/g, '').replace(/^0/, '62');
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const tgl = (t) => `${Number(String(t).slice(8, 10))} ${BULAN[Number(String(t).slice(5, 7)) - 1]}`;
export const TAHAP_OUT = 'Loading out';
export const TAHAP_OUT_BANTU = 'Loading out (bantu)';

// Urutan = prioritas. bobot > 0: bagian berat yang menentukan jumlah orang; bobot 0: ringan, dipegang PJ bagian `ikut`.
export const TUGAS_LOADING_OUT = [
  { tag: 'bongkarbawah', ikon: '🔧', label: 'BONGKAR bagian BAWAH: etalase, meja, kompor, lepas regulator gas, banner', jam: '2–3 jam', bobot: 2 },
  { tag: 'bongkaratas', ikon: '💡', label: 'BONGKAR bagian ATAS: lampu gantung, LED, bendera, hexos, kabel atas & bawah', jam: '1–2 jam', bobot: 2 },
  { tag: 'cuci', ikon: '🧽', label: 'CUCI & KERINGKAN semua alat masak / perlengkapan, bersihkan area booth', jam: '1–2 jam', bobot: 1 },
  { tag: 'stokakhir', ikon: '🦪', label: 'BAHAN BAKU: hitung sisa fisik (oyster, mozzarella, garlic, saus keju, topping, nampan), foto, catat #sisa, kemas bahan dingin', jam: '±1 jam', bobot: 1 },
  { tag: 'koli', ikon: '📦', label: 'PACKING & HITUNG KOLI: koli kering + koli bahan baku/dingin, label, cocokkan dengan kiriman awal', jam: '1–2 jam', bobot: 1 },
  { tag: 'alat', ikon: '🧰', label: 'DATA ALAT: jumlah & kondisi tiap alat (baik / rusak / hilang)', jam: '±30 menit', bobot: 0, ikut: 'cuci' },
  { tag: 'muat', ikon: '🚚', label: 'MUAT & KIRIM ke event berikutnya: sopir/ekspedisi, nomor kendaraan, jam berangkat, tujuan, foto muatan', jam: '±1 jam', bobot: 0, ikut: 'koli' },
];

// Bagi tugas: tiap bagian berat dapat minimal 1 orang (PJ = nama pertama), kelebihan orang dibagi ke bagian berat berurutan
// (bawah, atas, cuci, bahan, koli). Kalau orang < bagian, satu orang memegang beberapa bagian. Bagian ringan ikut PJ bagian `ikut`.
export function bagiLoadingOut(orang) {
  const hasil = TUGAS_LOADING_OUT.map((t) => ({ ...t, nama: [] }));
  const ke = (tag) => hasil.find((t) => t.tag === tag);
  const berat = hasil.filter((t) => t.bobot > 0);
  if (!orang.length) return hasil;
  if (orang.length >= berat.length) {
    berat.forEach((t, i) => t.nama.push(orang[i]));
    orang.slice(berat.length).forEach((n, i) => berat[i % berat.length].nama.push(n));
  } else {
    berat.forEach((t, i) => t.nama.push(orang[i % orang.length]));
  }
  for (const t of hasil.filter((x) => x.bobot === 0)) t.nama = ke(t.ikut).nama.slice(0, 1);
  return hasil;
}

async function baca(ctx, tab) { try { return await ctx.store.all(tab); } catch { return []; } }

async function eventBerikutnya(ctx, event) {
  const lain = (await baca(ctx, 'Event')).filter((e) => e.kode !== event.kode && e.status !== 'BATAL' && e.mulai && String(e.mulai) > String(event.selesai || event.mulai));
  return lain.sort((a, b) => String(a.mulai).localeCompare(String(b.mulai)))[0] || null;
}

export async function jobdeskOut(ctx, kode) {
  return (await baca(ctx, 'Jobdesk')).filter((j) => j.kode_event === kode && j.tahap === TAHAP_OUT && j.status !== STATUS.BATAL);
}
async function bantuOut(ctx, kode) {
  return (await baca(ctx, 'Jobdesk')).filter((j) => j.kode_event === kode && j.tahap === TAHAP_OUT_BANTU && j.status !== STATUS.BATAL);
}

async function koliAwal(ctx, kode) {
  const p = (await baca(ctx, 'Pengiriman')).filter((r) => r.kode_event === kode && r.status !== STATUS.BATAL).pop();
  return p ? { kering: Number(p.koli_kering) || 0, dingin: Number(p.koli_baku) || 0 } : null;
}

function teksJobdeskOut(event, bagian, awal, berikut) {
  const baris = bagian.map((t, i) => {
    const [pj, ...bantu] = t.nama;
    return [
      `${i + 1}️⃣ ${t.ikon} *${t.label}* _(${t.jam})_`,
      `   👷 PJ: *${pj || '-'}*${bantu.length ? ` · dibantu ${bantu.join(', ')}` : ''}${t.ikut ? ` _(bagian ringan, ikut PJ ${t.ikut === 'cuci' ? 'cuci' : 'koli'})_` : ''}`,
      `   📷 foto laporan caption *#${t.tag}*`,
    ].join('\n');
  });
  const orang = [...new Set(bagian.flatMap((t) => t.nama))];
  return [
    `📦 *JOBDESK LOADING OUT ${event.kode}* (${event.kota}, event selesai ${tgl(event.selesai || event.mulai)})`,
    `Mulai setelah closing & booth bersih. Tujuan barang: ${berikut ? `*event berikutnya ${berikut.kota || berikut.kode}* (mulai ${tgl(berikut.mulai)})` : '*event berikutnya* (tulis tujuannya di laporan #muat)'}.`,
    '',
    ...baris,
    '',
    awal ? `📊 *Patokan koli* (kiriman awal): ${awal.kering} koli kering + ${awal.dingin} koli bahan baku/dingin. Laporan *#koli* dibandingkan angka ini.` : '📊 Kiriman awal belum tercatat (#kirim), jadi koli belum bisa dibandingkan.',
    '',
    'Aturan:',
    '• Selesai satu bagian = foto laporan dengan #tag di grup ini. Yang belum akan diingatkan bot tiap 2 jam.',
    '• *#koli kering 23 dingin 4* (+ foto label) · *#alat* lalu satu alat per baris: *Kompor = 4 baik, 1 rusak* · bahan: *#sisa mozzarella 12 pack, ...*',
    '• Alat rusak/hilang dan koli kurang otomatis dilaporkan ke owner & PIC; penanggung jawab bagian menanggung.',
    '• PIC mengecek di lokasi sebelum booth diserahkan ke IO.',
    `_${orang.length} orang bertugas. Cek yang belum: *#loadingout* · bagi ulang: *#jobdeskout ulang*._`,
  ].join('\n');
}

export async function buatLoadingOut(ctx, event, { waktu = new Date(), ulang = false } = {}) {
  if (ulang) {
    // updateWhere mengubah satu baris per panggilan: ulangi sampai semua baris pembagian lama dibatalkan.
    const lama = (j) => j.kode_event === event.kode && (j.tahap === TAHAP_OUT || j.tahap === TAHAP_OUT_BANTU) && j.status !== STATUS.BATAL;
    for (let i = 0; i < 60 && (await ctx.store.updateWhere('Jobdesk', lama, { status: STATUS.BATAL })); i++);
  }
  const orang = await anggotaKerja(ctx, event);
  const bagian = bagiLoadingOut(orang);
  for (const t of bagian) {
    for (const [i, nama] of t.nama.entries()) {
      await ctx.store.append('Jobdesk', {
        kode_event: event.kode, tahap: i === 0 ? TAHAP_OUT : TAHAP_OUT_BANTU, tag: t.tag, tugas: t.label, nama, status: STATUS.OK, dicatat: waktuLokal(waktu),
      });
    }
  }
  return teksJobdeskOut(event, bagian, await koliAwal(ctx, event.kode), await eventBerikutnya(ctx, event));
}

async function bagianAda(ctx, event) {
  const pj = await jobdeskOut(ctx, event.kode);
  if (!pj.length) return null;
  const bantu = await bantuOut(ctx, event.kode);
  return TUGAS_LOADING_OUT.map((t) => ({ ...t, nama: [...pj.filter((j) => j.tag === t.tag).map((j) => j.nama), ...bantu.filter((j) => j.tag === t.tag).map((j) => j.nama)] }));
}

// Penanggung jawab per tag loading out (untuk status & pengingat).
export async function pjLoadingOut(ctx, kode) {
  const peta = {};
  for (const j of await jobdeskOut(ctx, kode)) (peta[j.tag] = peta[j.tag] || []).push(j.nama);
  return peta;
}

// #jobdeskout / #jobdeskout ulang
export async function perintahJobdeskOut(ctx, pesan, event, argumen, { bolehUbah }) {
  if (!event) return balas('⚠️ Grup ini belum terhubung ke event.');
  const ulang = /^(ulang|bagi ulang|acak|reset)$/i.test(argumen.join(' ').trim());
  if (ulang && !bolehUbah) return balas('⚠️ Bagi ulang jobdesk loading out hanya oleh owner atau PIC.');
  if (!ulang) {
    const ada = await bagianAda(ctx, event);
    if (ada) return balas(teksJobdeskOut(event, ada, await koliAwal(ctx, event.kode), await eventBerikutnya(ctx, event)));
  }
  if (!bolehUbah) return balas('Pembagian tugas loading out belum dibuat. Owner atau PIC ketik *#jobdeskout*.');
  return balas(await buatLoadingOut(ctx, event, { waktu: pesan.waktu, ulang }));
}

// ---------- koli ----------
// "kering 23 dingin 4" / "23 kering, 4 dingin" / "kering: 23 koli, baku 4"
export function bacaKoli(teks) {
  const KATA = /^(kering|dingin|baku|beku|bahan|frozen)$/;
  const token = String(teks || '').toLowerCase().match(/\d+|kering|dingin|baku|beku|bahan|frozen/g) || [];
  const hasil = { kering: null, dingin: null };
  // Urutan ditentukan dari token pertama: "23 kering, 4 dingin" (angka dulu) atau "kering 23 dingin 4" (kata dulu).
  const angkaDulu = token.length > 0 && /^\d+$/.test(token[0]);
  for (let i = 0; i < token.length - 1; i++) {
    const [a, b] = [token[i], token[i + 1]];
    const angka = angkaDulu ? a : b;
    const kata = angkaDulu ? b : a;
    if (!/^\d+$/.test(angka) || !KATA.test(kata)) continue;
    hasil[kata === 'kering' ? 'kering' : 'dingin'] = Number(angka);
    i++;
  }
  return hasil;
}

// Teks tambahan untuk balasan laporan #koli: dibandingkan kiriman awal.
export async function infoKoli(ctx, event, isi) {
  const awal = await koliAwal(ctx, event.kode);
  const k = bacaKoli(isi);
  if (k.kering === null && k.dingin === null) return { teks: '\n_Tulis jumlahnya di caption supaya bisa dicocokkan, contoh: *#koli kering 23 dingin 4*_', selisih: false, k };
  const baris = (nama, jml, asal) => {
    if (jml === null) return `${nama}: belum disebut`;
    if (asal === undefined || asal === null) return `${nama}: ${jml}`;
    const d = jml - asal;
    return `${nama}: ${jml}/${asal} ${d === 0 ? '✅' : `⚠️ ${d > 0 ? 'lebih' : 'kurang'} ${Math.abs(d)}`}`;
  };
  const selisih = awal ? ((k.kering !== null && k.kering !== awal.kering) || (k.dingin !== null && k.dingin !== awal.dingin)) : false;
  return { teks: `\n📦 ${baris('Koli kering', k.kering, awal?.kering)} · ${baris('koli dingin/bahan baku', k.dingin, awal?.dingin)}${awal ? '' : ' _(kiriman awal belum tercatat)_'}`, selisih, k, awal };
}

// ---------- alat ----------
const KOND = { baik: 'baik', bagus: 'baik', ok: 'baik', normal: 'baik', rusak: 'rusak', patah: 'rusak', pecah: 'rusak', hilang: 'hilang' };
// "Kompor = 4 baik, 1 rusak" / "Regulator 4" / "Lampu LED 120x60 = 6 baik 1 hilang"
export function bacaAlat(teks) {
  const hasil = [];
  for (const baris of String(teks || '').split('\n')) {
    let nama; let sisa;
    if (baris.includes('=')) { const i = baris.indexOf('='); nama = baris.slice(0, i); sisa = baris.slice(i + 1); }
    else { const m = baris.match(/^\s*([^\d]+?)\s*(\d.*)$/); if (!m) continue; nama = m[1]; sisa = m[2]; }
    nama = nama.replace(/^[\s\-•*]+/, '').replace(/[:\s]+$/, '').replace(/\s+/g, ' ');
    if (nama.length < 2 || /^(baik|bagus|ok|normal|rusak|patah|pecah|hilang)$/i.test(nama)) continue;
    const jumlah = { baik: 0, rusak: 0, hilang: 0 };
    let ada = false;
    const re = /(\d+)\s*(baik|bagus|ok|normal|rusak|patah|pecah|hilang)?|(baik|bagus|ok|normal|rusak|patah|pecah|hilang)\s*(\d+)/gi;
    let x;
    while ((x = re.exec(sisa))) { jumlah[KOND[String(x[2] ?? x[3] ?? 'baik').toLowerCase()]] += Number(x[1] ?? x[4]); ada = true; }
    if (ada) hasil.push({ alat: nama, ...jumlah });
  }
  return hasil;
}

// Simpan data alat (tab Alat Event) dan buat teks ringkasan + laporan rusak/hilang untuk owner & PIC.
export async function catatAlat(ctx, event, { isi, pelapor, fotoId, waktu }) {
  const daftar = bacaAlat(isi);
  if (!daftar.length) return { teks: '\n_Tulis alatnya satu per baris di caption, contoh:_\n*#alat*\n*Kompor = 4 baik, 1 rusak*\n*Regulator gas = 4 baik*', bermasalah: [] };
  const tanggal = tanggalLokal(waktu);
  for (const a of daftar) {
    await ctx.store.updateWhere('Alat Event', (r) => r.kode_event === event.kode && sama(r.alat, a.alat) && r.status !== STATUS.BATAL, { status: STATUS.BATAL });
    await ctx.store.append('Alat Event', {
      tanggal, kode_event: event.kode, alat: a.alat, baik: a.baik, rusak: a.rusak, hilang: a.hilang, pelapor, foto: fotoId || '', status: STATUS.OK, dicatat: waktuLokal(waktu),
    });
  }
  const bermasalah = daftar.filter((a) => a.rusak || a.hilang);
  const total = daftar.reduce((s, a) => s + a.baik + a.rusak + a.hilang, 0);
  return {
    teks: `\n🧰 ${daftar.length} jenis alat (${total} buah) tercatat.${bermasalah.length ? `\n⚠️ ${bermasalah.map((a) => `${a.alat}${a.rusak ? ` rusak ${a.rusak}` : ''}${a.hilang ? ` hilang ${a.hilang}` : ''}`).join(', ')} → dilaporkan ke owner & PIC.` : ' Semua baik ✅'}`,
    bermasalah,
  };
}

// ---------- terjadwal: pengumuman, pengingat 2 jam, ringkasan ----------
const JEDA_INGAT_MS = 2 * 3600e3;
const MAKS_INGAT = 24; // 48 jam: tetap mengingatkan walau bot sempat mati lama (slot dihitung dari jam pengumuman)

async function laporanOut(ctx, kode) {
  return (await baca(ctx, 'Laporan Foto')).filter((r) => r.kode_event === kode && r.tahap === TAHAP_OUT && r.status === STATUS.OK);
}

async function ringkasanOwner(ctx, event, peta, lap) {
  const k = await koliAwal(ctx, event.kode);
  const kol = lap.filter((r) => r.tag === 'koli').pop();
  const kk = kol ? bacaKoli(kol.isi) : { kering: null, dingin: null };
  const alat = (await baca(ctx, 'Alat Event')).filter((r) => r.kode_event === event.kode && r.status !== STATUS.BATAL);
  const rusak = alat.filter((a) => Number(a.rusak) || Number(a.hilang));
  const sisa = (await baca(ctx, 'Bahan Event')).filter((b) => b.kode_event === event.kode && b.status !== STATUS.BATAL && b.gerak === 'Sisa');
  const muat = lap.filter((r) => r.tag === 'muat').pop();
  const cocok = (a, b) => (a === null || b === undefined ? '' : a === b ? ' ✅' : ` ⚠️ (kiriman awal ${b})`);
  return [
    `✅ *Loading out ${event.kode} selesai* – semua bagian sudah lapor.`,
    '',
    `📦 Koli kembali: kering ${kk.kering ?? '?'}${k ? cocok(kk.kering, k.kering) : ''} · dingin ${kk.dingin ?? '?'}${k ? cocok(kk.dingin, k.dingin) : ''}`,
    `🧰 Alat: ${alat.length} jenis tercatat${rusak.length ? `, bermasalah: ${rusak.map((a) => `${a.alat} (rusak ${a.rusak || 0}, hilang ${a.hilang || 0})`).join('; ')}` : ', semua baik ✅'}`,
    `🦪 Sisa bahan baku tercatat: ${sisa.length ? sisa.map((b) => `${b.bahan} ${b.jumlah}`).join(', ') : '⚠️ belum ada (*#sisa ...*), biaya bahan di rekap belum benar'}`,
    `🚚 Muat: ${muat ? `${muat.nama} ${muat.jam}${muat.isi ? ` – ${muat.isi}` : ''}` : '–'}`,
    '',
    `Penanggung jawab: ${TUGAS_LOADING_OUT.filter((t) => peta[t.tag]).map((t) => `#${t.tag} ${peta[t.tag][0]}`).join(' · ')}`,
    'Selisih / rusak / hilang: putuskan denda dengan *#denda Nama 100rb alasan*. Rekap & rapor KPI menyusul.',
  ].join('\n');
}

// Dipanggil tiap menit. Setelah closing hari terakhir: umumkan pembagian (grup tim + chat pribadi PJ), ingatkan tiap 2 jam
// yang belum lapor, lalu beri ringkasan ke owner begitu semua bagian lapor. Pengingat berlanjut sampai 48 jam setelah pengumuman.
export async function tugasLoadingOut(ctx, sekarang = new Date()) {
  const keluar = [];
  if (!ctx.sesi) return keluar;
  const [events, grup, karyawan, sesiKasir] = await Promise.all(['Event', 'Grup', 'Karyawan', 'Sesi Kasir'].map((t) => baca(ctx, t)));
  const hari = tanggalClosing(sekarang);
  for (const e of events.filter((x) => x.selesai && x.status !== 'BATAL' && hari >= x.selesai && hari <= tambahHari(x.selesai, 2))) {
    if (sekarang < saatClosing(e, e.selesai, sesiKasir).saat) continue;
    const grupTim = grup.filter((g) => g.kode_event === e.kode && g.jenis === 'event').map((g) => g.group_id);
    const kunciUmum = `loadingout-umum:${e.kode}`;
    let umum = ctx.sesi.get(kunciUmum);
    if (!umum) {
      let bagian = await bagianAda(ctx, e);
      let teks;
      if (bagian) teks = teksJobdeskOut(e, bagian, await koliAwal(ctx, e.kode), await eventBerikutnya(ctx, e));
      else { teks = await buatLoadingOut(ctx, e, { waktu: sekarang }); bagian = await bagianAda(ctx, e); }
      ctx.sesi.set(kunciUmum, { waktu: sekarang.getTime() });
      umum = { waktu: sekarang.getTime() };
      for (const g of grupTim) keluar.push({ groupId: g, text: `🌙 *Waktunya LOADING OUT.* Closing selesai, mulai bongkar & packing.\n\n${teks}` });
      // Chat pribadi ke tiap penanggung jawab: bagian miliknya.
      for (const nama of [...new Set(bagian.flatMap((t) => t.nama.slice(0, 1)))]) {
        const hp = karyawan.find((k) => sama(k.nama, nama) && k.nomor_wa);
        if (!hp) continue;
        const milik = bagian.filter((t) => sama(t.nama[0], nama));
        keluar.push({ nomor: nomor62(hp.nomor_wa), text: `📦 *${nama}*, kamu penanggung jawab loading out ${e.kode}:\n${milik.map((t) => `• ${t.ikon} ${t.label.split(':')[0]} → foto *#${t.tag}*`).join('\n')}\nKirim fotonya ke grup tim setelah selesai ya.` });
      }
      continue;
    }
    const peta = await pjLoadingOut(ctx, e.kode);
    const lap = await laporanOut(ctx, e.kode);
    const sudah = new Set(lap.map((r) => r.tag));
    const belum = TUGAS_LOADING_OUT.filter((t) => peta[t.tag]?.length && !sudah.has(t.tag));
    const kunciSelesai = `loadingout-selesai:${e.kode}`;
    if (!belum.length && Object.keys(peta).length) {
      if (!ctx.sesi.get(kunciSelesai)) {
        ctx.sesi.set(kunciSelesai, { kirim: true });
        const teks = await ringkasanOwner(ctx, e, peta, lap);
        for (const o of ctx.ownerIds || []) keluar.push({ nomor: o, text: teks });
        for (const g of grup.filter((x) => x.kode_event === e.kode && x.jenis === 'pengeluaran')) keluar.push({ groupId: g.group_id, text: teks });
      }
      continue;
    }
    const ke = Math.floor((sekarang.getTime() - umum.waktu) / JEDA_INGAT_MS);
    if (ke < 1 || ke > MAKS_INGAT) continue;
    const kunci = `ingatout:${e.kode}:${ke}`;
    if (ctx.sesi.get(kunci)) continue;
    ctx.sesi.set(kunci, { kirim: true });
    const teks = [
      `⏰ *Update loading out ${e.kode}* – ${belum.length} bagian belum lapor:`,
      ...belum.map((t) => `• ${t.ikon} *${peta[t.tag][0]}* – ${t.label.split(':')[0]} → foto *#${t.tag}*`),
      '',
      `_Sudah lapor: ${TUGAS_LOADING_OUT.filter((t) => sudah.has(t.tag)).map((t) => `#${t.tag}`).join(', ') || '-'}. Selesai lebih cepat? Bantu bagian lain yang belum._`,
    ].join('\n');
    for (const g of grupTim) keluar.push({ groupId: g, text: teks });
  }
  return keluar;
}
