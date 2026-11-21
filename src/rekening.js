// Rekening karyawan untuk transfer fee PIC / gaji / penggantian uang, dan ringkasan setoran ke PIC.
//
// - Owner: #rekening  -> bot menanyakan rekening ke PIC event di grup pengeluaran.
//          #rekening Melia BCA 1234567890 a.n. Melia -> owner mengisi langsung.
// - #rekap untuk event yang sudah selesai: kalau rekening PIC belum ada, bot ikut menanyakannya (sekali).
// - Jawaban PIC: "BCA 1234567890 a.n. Melia" -> tersimpan di tab Karyawan (bank, no_rekening, atas_nama).
// - #setor (owner, grup pengeluaran): fee PIC + uang PIC yang terpakai = total yang harus ditransfer.
// Nomor rekening hanya ditampilkan di grup pengeluaran (owner + PIC), tidak di grup tim.

import { rupiah } from './util.js';
import { bacaData } from './main.js';
import { hitungEvent } from './laporan.js';

const balas = (text) => [{ text }];
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const nomor62 = (n) => String(n || '').replace(/\D/g, '').replace(/^0/, '62');
const kunci = (groupId) => `rekening:${groupId}`;

const BANK = [
  ['BCA', /\bbca\b/i], ['BRI', /\bbri\b/i], ['BNI', /\bbni\b/i], ['Mandiri', /\bmandiri\b/i], ['BSI', /\bbsi\b|syariah indonesia/i],
  ['CIMB Niaga', /\bcimb\b/i], ['Permata', /\bpermata\b/i], ['Danamon', /\bdanamon\b/i], ['BTN', /\bbtn\b/i], ['Bank Jago', /\bjago\b/i],
  ['SeaBank', /\bsea ?bank\b/i], ['Jenius', /\bjenius\b/i], ['blu BCA', /\bblu\b/i], ['BJB', /\bbjb\b/i], ['Bank Jatim', /\bjatim\b/i],
  ['Bank Jateng', /\bjateng\b/i], ['BPD Bali', /\bbpd\b/i], ['OCBC', /\bocbc\b/i], ['Maybank', /\bmaybank\b/i], ['Mega', /\bbank mega\b/i],
  ['DANA', /\bdana\b/i], ['OVO', /\bovo\b/i], ['GoPay', /\bgopay\b/i], ['ShopeePay', /\bshopee ?pay\b/i],
];

// "BCA 1234 5678 90 a.n. Melia Sari" -> { bank, nomor, atasNama }. null kalau bukan rekening.
export function bacaRekening(teks) {
  const t = String(teks || '');
  const bank = BANK.find(([, re]) => re.test(t))?.[0] || '';
  const m = t.match(/(\d[\d\s.-]{5,24}\d)/);
  if (!m) return null;
  const nomor = m[1].replace(/\D/g, '');
  if (nomor.length < 6 || nomor.length > 20) return null;
  if (!bank && !/\b(rek|rekening|norek|no\.? ?rek|account)\b/i.test(t)) return null;
  const an = t.match(/\b(?:a\.?\s?n\.?|atas nama|an)\s*[:.]?\s*([a-z][a-z .']{1,40})$/i);
  return { bank, nomor, atasNama: an ? an[1].trim().replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '' };
}

async function simpanRekening(ctx, nama, rek) {
  const karyawan = await ctx.store.all('Karyawan');
  const ada = karyawan.find((k) => sama(k.nama, nama));
  const isi = { bank: rek.bank, no_rekening: rek.nomor, atas_nama: rek.atasNama || nama };
  if (ada) {
    await ctx.store.updateWhere('Karyawan', (k) => sama(k.nama, nama) && k.kode === ada.kode, isi);
  } else {
    const urut = karyawan.reduce((m, k) => Math.max(m, Number(String(k.kode).replace(/\D/g, '')) || 0), 0) + 1;
    const peran = (await ctx.store.all('Tim Event')).filter((o) => sama(o.nama, nama)).pop()?.peran || 'PIC';
    await ctx.store.append('Karyawan', { kode: `K${String(urut).padStart(2, '0')}`, nama, peran, status: 'AKTIF', ...isi });
  }
}

async function picEvent(ctx, event) {
  return (await ctx.store.all('Tim Event')).filter((o) => o.kode_event === event.kode && o.peran === 'PIC' && o.status !== 'BATAL');
}

async function rekeningAda(ctx, nama) {
  const k = (await ctx.store.all('Karyawan')).find((x) => sama(x.nama, nama));
  return k?.no_rekening ? k : null;
}

function teksTanya(event, nama) {
  return `🏦 *${nama}*, mohon kirim *nomor rekening* untuk transfer fee PIC & penggantian uang event ${event.kode}.\nBalas pesan ini dengan format: *BCA 1234567890 a.n. ${nama}*`;
}

// Pertanyaan rekening ke PIC yang belum punya rekening. Mengembalikan teks atau ''.
export async function tanyaRekeningPic(ctx, pesan, event, { paksa = false } = {}) {
  if (!ctx.sesi || !event) return '';
  const belum = [];
  for (const o of await picEvent(ctx, event)) if (paksa || !(await rekeningAda(ctx, o.nama))) belum.push(o.nama);
  if (!belum.length) return '';
  const tanda = `rekening_ditanya:${event.kode}`;
  if (!paksa && ctx.sesi.get(tanda)) return '';
  ctx.sesi.set(tanda, { waktu: Date.now() });
  ctx.sesi.set(kunci(pesan.groupId), { kode: event.kode, nama: belum[0], waktu: Date.now() });
  return teksTanya(event, belum[0]);
}

// #rekening [nama bank nomor a.n. ...]
export async function perintahRekening(ctx, pesan, event, teks, { isOwner }) {
  if (!isOwner) return balas('⚠️ Perintah ini khusus owner.');
  if (!event) return balas('⚠️ Grup ini belum terhubung ke event.');
  const rek = bacaRekening(teks);
  if (rek) {
    const pic = await picEvent(ctx, event);
    const nama = pic.find((o) => new RegExp(`\\b${o.nama}\\b`, 'i').test(teks))?.nama || pic[0]?.nama;
    if (!nama) return balas('⚠️ PIC event ini belum ada di data tim.');
    await simpanRekening(ctx, nama, rek);
    return balas(`✅ Rekening *${nama}* disimpan: ${rek.bank} ${rek.nomor}${rek.atasNama ? ` a.n. ${rek.atasNama}` : ''}`);
  }
  const tanya = await tanyaRekeningPic(ctx, pesan, event, { paksa: true });
  return balas(tanya || '⚠️ PIC event ini belum ada di data tim.');
}

// Jawaban PIC atas pertanyaan rekening. null kalau bukan jawaban.
export async function jawabRekening(ctx, pesan, event, { isOwner }) {
  if (!ctx.sesi || !event) return null;
  const s = ctx.sesi.get(kunci(pesan.groupId));
  if (!s || s.kode !== event.kode || Date.now() - s.waktu > 3 * 24 * 60 * 60 * 1000) return null;
  const rek = bacaRekening(pesan.text);
  if (!rek) return null;
  // Yang menjawab: PIC itu sendiri (nomornya di tab Karyawan), owner, atau reply ke pertanyaannya.
  const karyawan = await ctx.store.all('Karyawan');
  const pengirim = karyawan.find((k) => nomor62(k.nomor_wa) === nomor62(pesan.senderId));
  const balasTanya = /nomor rekening/i.test(pesan.kutipan?.teks || '');
  if (!isOwner && !balasTanya && pengirim && !sama(pengirim.nama, s.nama)) return null;
  await simpanRekening(ctx, s.nama, rek);
  ctx.sesi.hapus(kunci(pesan.groupId));
  return balas(`✅ Rekening *${s.nama}* disimpan: *${rek.bank || 'bank?'} ${rek.nomor}*${rek.atasNama ? ` a.n. ${rek.atasNama}` : ''}\n_Muncul di tabel Setoran ke PIC di file event. Ketik *#setor* untuk melihat total yang ditransfer._`);
}

// #setor: fee PIC + gaji PIC + uang PIC yang terpakai = total yang harus ditransfer owner.
export async function perintahSetor(ctx, pesan, event, { isOwner }) {
  if (!isOwner) return balas('⚠️ Perintah ini khusus owner.');
  if (!event) return balas('⚠️ Grup ini belum terhubung ke event.');
  const data = await bacaData(ctx.store);
  const ev = data.events.find((e) => e.kode === event.kode) || event;
  const r = hitungEvent(ev, data);
  if (!r.setoranPic.length) return balas('Tidak ada PIC yang menerima fee di event ini.');
  const bagian = r.setoranPic.map((p) => [
    `💸 *Setoran ke PIC ${p.nama}* (${event.kode})`,
    `Fee PIC ${r.feePicPersen}% dari laba sebelum fee (${rupiah(r.labaSebelumFee)}): ${rupiah(p.fee)}`,
    p.upah ? `Gaji / bonus PIC: ${rupiah(p.upah)}` : '',
    `Uang PIC yang terpakai: keluar ${rupiah(p.dibayar)}${p.diganti ? `, sudah diganti ${rupiah(p.diganti)}` : ''} → ${rupiah(p.terpakai)}`,
    `*TOTAL DITRANSFER: ${rupiah(p.total)}*`,
    p.noRekening ? `Rekening: *${p.bank} ${p.noRekening}* a.n. ${p.atasNama || p.nama}` : 'Rekening: _belum ada_ (ketik *#rekening* untuk menanyakan ke PIC)',
  ].filter(Boolean).join('\n'));
  const p = r.setoranPic[0];
  return balas(`${bagian.join('\n\n')}\n\n_Setelah ditransfer, catat penggantian uangnya dengan *#ganti ${p.nama} ${Math.round(p.terpakai)}* supaya sisa uang PIC jadi 0._`);
}

// ---------- Rekening tim setelah event selesai ----------
// Sehari setelah event selesai (jam >= 10.00), sekali per event, untuk event yang penggajiannya lewat bot:
// senior, DW, dan kasir yang rekeningnya belum ada ditanya lewat chat pribadi (kalau nomornya dikenal);
// yang nomornya belum dikenal diminta lewat satu pesan di grup tim untuk mengirim rekening ke chat pribadi bot.
export async function tugasRekening(ctx, sekarang = new Date(), { tanggalLokal, ikutGajian }) {
  const keluar = [];
  const jam = Number(String(sekarang.toLocaleString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false })).slice(0, 2));
  if (jam < 10) return keluar;
  const hariIni = tanggalLokal(sekarang);
  const [events, tim, karyawan, grup, pengaturan] = await Promise.all([
    ctx.store.all('Event'), ctx.store.all('Tim Event'), ctx.store.all('Karyawan'), ctx.store.all('Grup'), ctx.store.all('Pengaturan'),
  ]);
  const atur = Object.fromEntries(pengaturan.map((p) => [p.kunci, p.nilai]));
  for (const e of events.filter((x) => x.status !== 'BATAL' && x.selesai && x.selesai < hariIni && ikutGajian(x, atur))) {
    const kunciTanya = `rekening_tim_ditanya_${e.kode}`;
    if (pengaturan.some((p) => p.kunci === kunciTanya)) continue;
    await ctx.store.append('Pengaturan', { kunci: kunciTanya, nilai: hariIni, keterangan: 'Bot sudah meminta rekening tim (gaji/bonus)' });
    const anggota = tim.filter((o) => o.kode_event === e.kode && o.status !== 'BATAL' && ['Tetap', 'DW', 'Kasir'].includes(o.peran) && !/^(dw|kasir)\s*\d+$/i.test(o.nama));
    const tanpaNomor = [];
    for (const o of anggota) {
      const k = karyawan.find((x) => sama(x.nama, o.nama));
      if (k?.no_rekening) continue;
      if (k?.nomor_wa) {
        keluar.push({ nomor: nomor62(k.nomor_wa), text: `🏦 Halo *${o.nama}*, event *${e.kode}* (${e.kota}) sudah selesai. Terima kasih atas kerjanya! 🙏\nUntuk transfer gaji/bonus, mohon *balas chat ini* dengan nomor rekening, contoh:\n*BCA 1234567890 a.n. ${o.nama}*` });
      } else tanpaNomor.push(o.nama);
    }
    if (tanpaNomor.length) {
      for (const g of grup.filter((x) => x.kode_event === e.kode && x.jenis === 'event')) {
        keluar.push({ groupId: g.group_id, text: `🏦 Event *${e.kode}* sudah selesai, terima kasih semuanya! 🙏\n*${tanpaNomor.join(', ')}*: untuk transfer gaji/bonus, mohon kirim nomor rekening lewat *chat pribadi ke nomor bot ini* (jangan di grup), contoh:\n*${tanpaNomor[0]} BCA 1234567890 a.n. ${tanpaNomor[0]}*` });
      }
    }
  }
  return keluar;
}

// Rekening yang dikirim karyawan lewat chat pribadi ("BCA 123 a.n. Joko" / "Joko BCA 123 a.n. Joko").
// Pengirim dikenali dari nomornya (tab Karyawan) atau dari nama tim yang disebut. null kalau bukan rekening.
export async function jawabRekeningPribadi(ctx, pesan) {
  const rek = bacaRekening(pesan.text);
  if (!rek) return null;
  const karyawan = await ctx.store.all('Karyawan');
  let nama = karyawan.find((k) => nomor62(k.nomor_wa) === nomor62(pesan.senderId))?.nama;
  if (!nama) {
    const tim = await ctx.store.all('Tim Event');
    const kandidat = [...new Set(tim.filter((o) => o.status !== 'BATAL').map((o) => o.nama))]
      .filter((n) => !/^(dw|kasir)\s*\d+$/i.test(n) && new RegExp(`\\b${String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(pesan.text));
    if (kandidat.length !== 1) return balas('🤔 Nomor ini belum dikenal bot. Tulis juga nama kamu di depannya, contoh: *Joko BCA 1234567890 a.n. Joko*');
    [nama] = kandidat;
    await simpanRekening(ctx, nama, rek);
    // simpan juga nomor WA-nya supaya lain kali dikenal
    await ctx.store.updateWhere('Karyawan', (k) => sama(k.nama, nama) && !k.nomor_wa, { nomor_wa: `0${nomor62(pesan.senderId).replace(/^62/, '')}` });
  } else {
    await simpanRekening(ctx, nama, rek);
  }
  return balas(`✅ Terima kasih *${nama}*, rekening disimpan: *${rek.bank || 'bank?'} ${rek.nomor}*${rek.atasNama ? ` a.n. ${rek.atasNama}` : ''}\n_Kalau salah, kirim ulang dengan format yang sama._`);
}
