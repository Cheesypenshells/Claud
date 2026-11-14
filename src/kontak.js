// Buku kontak per lokasi event (tukang es batu, katering, gas, galon, supplier oyster, tukang listrik, dll.).
// Simpan: "#kontak es batu Pak Budi 0812 3456 7890" / "simpan nomor katering Bu Sri 0813... di semarang".
//   Kota bawaan = kota event grup itu. Tersimpan di tab "Kontak Lokasi" dan bisa dipakai di event berikutnya.
// Cari:   "#kontak" (kota event ini) · "#kontak bali" · "#kontak es batu" · "nomor es batu semarang?"

import { STATUS } from './schema.js';
import { waktuLokal } from './util.js';

const balas = (text) => [{ text }];
const RE_NOMOR = /(?:^|[^\d])((?:\+?62|0)8[\d\s-]{7,15}\d)/;
export const JENIS_KONTAK = [
  ['Es batu', /\bes ?batu\b/i], ['Katering', /\b(katering|catering|nasi kotak|makan(an)? karyawan)\b/i],
  ['Gas', /\b(gas|elpiji|lpg)\b/i], ['Galon / air', /\b(galon|air minum|aqua)\b/i],
  ['Supplier oyster', /\b(oyster|tiram|kerang)\b/i], ['Supplier seafood', /\b(cumi|seafood|ikan)\b/i],
  ['Tukang listrik', /\b(listrik|electric|genset)\b/i], ['Laundry', /\blaundry\b/i],
  ['Sewa freezer / alat', /\b(sewa|freezer|kulkas|alat)\b/i], ['Transport / truk', /\b(truk|pickup|pick up|lalamove|angkut|ekspedisi|transport)\b/i],
  ['Penginapan', /\b(hotel|kos|kost|penginapan|homestay)\b/i], ['Percetakan', /\b(percetakan|banner|spanduk|print)\b/i],
  ['Pasar / bahan', /\b(pasar|lemon|sayur|bumbu)\b/i], ['IO / pengelola', /\b(io|pengelola|panitia|eo)\b/i],
];
const RE_SIMPAN = /\b(kontak|simpan|catat|nomor|no\.?|nmr|hp|wa|whatsapp|telp|telepon)\b/i;

const nomor0 = (n) => `0${String(n).replace(/\D/g, '').replace(/^62/, '').replace(/^0/, '')}`;

function jenisDari(teks) {
  return JENIS_KONTAK.find(([, re]) => re.test(teks))?.[0] || '';
}

// Pesan berisi nomor HP + kata kontak/jenis -> data kontak. null kalau bukan.
export function bacaKontak(teks, kotaKenal = []) {
  const t = String(teks || '');
  const m = t.match(RE_NOMOR);
  if (!m) return null;
  const jenis = jenisDari(t);
  if (!jenis && !RE_SIMPAN.test(t)) return null;
  const nomor = nomor0(m[1]);
  if (nomor.length < 10 || nomor.length > 14) return null;
  const kota = kotaKenal.find((k) => new RegExp(`\\b${k}\\b`, 'i').test(t)) || '';
  let nama = t.replace(m[1], ' ').replace(/^#\w+/, ' ')
    .replace(/\b(simpan|catat|kontak|nomor|no\.?|nmr|hp|wa|whatsapp|telp|telepon|ya|yaa|tolong|di|untuk|buat|nya|ini|tukang|abang|penjual)\b/gi, ' ');
  if (kota) nama = nama.replace(new RegExp(`\\b${kota}\\b`, 'gi'), ' ');
  const re = JENIS_KONTAK.find(([j]) => j === jenis)?.[1];
  if (re) nama = nama.replace(new RegExp(re.source, 'gi'), ' ');
  nama = nama.replace(/[,:;()-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { jenis: jenis || 'Lainnya', nama: nama || '-', nomor, kota };
}

export async function simpanKontak(ctx, pesan, event, k) {
  const kota = k.kota || event?.kota || '';
  const semua = await ctx.store.all('Kontak Lokasi');
  const ada = semua.find((x) => x.status !== STATUS.BATAL && x.nomor === k.nomor && String(x.kota).toLowerCase() === kota.toLowerCase());
  if (ada) {
    await ctx.store.updateWhere('Kontak Lokasi', (x) => x === ada || (x.nomor === ada.nomor && x.kota === ada.kota && x.status !== STATUS.BATAL), { jenis: k.jenis, nama: k.nama, dicatat: waktuLokal(pesan.waktu) });
  } else {
    await ctx.store.append('Kontak Lokasi', {
      kota, lokasi: event ? `${event.io || ''} (${event.kode})`.trim() : '', jenis: k.jenis, nama: k.nama, nomor: k.nomor,
      catatan: '', dicatat_oleh: pesan.senderName || pesan.senderId, status: STATUS.OK, dicatat: waktuLokal(pesan.waktu),
    });
  }
  return balas(`📇 Kontak ${ada ? 'diperbarui' : 'disimpan'} – *${kota || 'tanpa kota'}*\n• ${k.jenis}: *${k.nama}* ${k.nomor}\n_Cari lagi kapan saja: *#kontak ${String(kota).toLowerCase() || ''}*_`.replace(' *#kontak *', ' *#kontak*'));
}

export async function cariKontak(ctx, teks, event) {
  const semua = (await ctx.store.all('Kontak Lokasi')).filter((x) => x.status !== STATUS.BATAL);
  const kotaEvent = (await ctx.store.all('Event')).map((e) => e.kota);
  const kotaKenal = [...new Set([...semua.map((x) => x.kota), ...kotaEvent].filter(Boolean))];
  const t = String(teks || '').toLowerCase();
  const jenis = jenisDari(t);
  // Kata sisa yang bukan jenis/kata tanya = nama kota (walau belum dikenal, contoh "#kontak bali").
  const reJenis = JENIS_KONTAK.find(([j]) => j === jenis)?.[1];
  const sisa = t.replace(reJenis ? new RegExp(reJenis.source, 'gi') : /$^/, ' ')
    .replace(/\b(kontak|nomor|no|nmr|hp|wa|ada|minta|semua|dong|ya|yaa|siapa|cari|apa|tukang|di|yang|nya|tolong|kirim)\b/g, ' ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const kota = kotaKenal.find((k) => t.includes(String(k).toLowerCase()))
    || (sisa && sisa.split(' ').length <= 2 ? sisa.replace(/\b\w/g, (c) => c.toUpperCase()) : '')
    || (/\bsemua\b/.test(t) ? '' : event?.kota || '');
  const hasil = semua.filter((x) => (!kota || String(x.kota).toLowerCase() === kota.toLowerCase()) && (!jenis || x.jenis === jenis));
  if (!hasil.length) {
    return balas(`📇 Belum ada kontak${jenis ? ` ${jenis.toLowerCase()}` : ''}${kota ? ` di *${kota}*` : ''}.\nSimpan dengan: *#kontak es batu Pak Budi 081234567890*${semua.length ? `\nKota yang sudah ada kontaknya: ${[...new Set(semua.map((x) => x.kota))].join(', ')}` : ''}`);
  }
  const perKota = new Map();
  for (const x of hasil) { const k = x.kota || '-'; if (!perKota.has(k)) perKota.set(k, []); perKota.get(k).push(x); }
  return balas([...perKota.entries()].map(([k, d]) => `📇 *Kontak ${k}*\n${d.sort((a, b) => a.jenis.localeCompare(b.jenis)).map((x) => `• ${x.jenis}: *${x.nama}* ${x.nomor}${x.lokasi ? ` _(${x.lokasi})_` : ''}`).join('\n')}`).join('\n\n'));
}

// Pesan biasa: simpan (ada nomor HP) atau tanya ("nomor es batu semarang?"). null kalau bukan soal kontak.
export async function tanganiKontak(ctx, pesan, event) {
  const t = String(pesan.text || '').trim();
  if (!t || t.startsWith('#') || pesan.adaFoto) return null;
  const events = await ctx.store.all('Event');
  const kotaKenal = [...new Set([...events.map((e) => e.kota), ...(await ctx.store.all('Kontak Lokasi')).map((x) => x.kota)].filter(Boolean))];
  const k = bacaKontak(t, kotaKenal);
  if (k) return simpanKontak(ctx, pesan, event, k);
  // Pertanyaan: "nomor es batu semarang?", "kontak katering bali", "ada nomor tukang gas?"
  if (/\b(nomor|no\.?|kontak|nmr|hp|wa)\b/i.test(t) && (jenisDari(t) || /\bkontak\b/i.test(t)) && (/\?|\b(ada|berapa|minta|siapa|cari|apa)\b/i.test(t) || t.split(/\s+/).length <= 5)) {
    return cariKontak(ctx, t, event);
  }
  return null;
}
