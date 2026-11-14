// Bahan baku rusak / hilang: siapa pun lapor, penanggung jawab bahan hari itu menanggung, owner memutuskan ganti rugi.
//   #rusak oyster 20 pcs, busuk karena es cooler habis      (+ foto wajib, grup tim)
//     → penanggung jawab: oyster = tim getok · bahan lain & nampan = plating + kasir (dari Tugas Harian hari itu)
//     → diteruskan ke grup pengeluaran (tanpa harga di grup tim)
//   Owner (balas pesan bot / ketik):
//     ganti rugi 150rb RS3            → dibagi rata ke penanggung jawab
//     ganti rugi 150rb Bima RS3       → hanya Bima
//     tidak RS3                        → tanpa ganti rugi
//   Ganti rugi masuk tab Denda (jenis "Ganti rugi bahan rusak") → dipotong di #gajian.

import { STATUS } from './schema.js';
import { tanggalLokal, waktuLokal, parseMoney, rupiah } from './util.js';
import { bacaIsiStok, penjagaBahan, tanggalClosing } from './stokHarian.js';

const balas = (text) => [{ text }];
const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const nomor62 = (n) => String(n || '').replace(/\D/g, '').replace(/^0/, '62');
const TAB = 'Bahan Rusak';

async function baca(ctx, t) { try { return await ctx.store.all(t); } catch { return []; } }

export async function perintahRusak(ctx, pesan, event, cmd, { grupPengeluaran = [] } = {}) {
  if (!event) return balas('⚠️ Ketik *#rusak* di grup tim event.');
  const isi = [cmd.sisaBaris, cmd.badan].filter(Boolean).join('\n').trim();
  const contoh = 'Format (kirim *foto* bahan yang rusak dengan caption):\n*#rusak oyster 20 pcs, busuk karena es cooler habis*\n*#rusak mozzarella 2 pack gudang, kemasan bocor*';
  if (!isi) return balas(contoh);
  if (!pesan.adaFoto) return balas(`📷 Laporan bahan rusak wajib pakai *foto bukti*.\n${contoh}`);
  const [bagianBahan, ...ket] = isi.split(/,|\n| - /);
  const items = bacaIsiStok(bagianBahan, await baca(ctx, 'Harga Bahan'));
  if (!items.length) return balas(`⚠️ Bahannya tidak dikenali.\n${contoh}`);
  const keterangan = ket.join(', ').trim();
  if (!keterangan) return balas(`⚠️ Tulis juga penyebab / keterangannya setelah koma.\n${contoh}`);

  const tanggal = tanggalClosing(pesan.waktu);
  const [karyawan, tugasSemua, rusakRows] = await Promise.all([baca(ctx, 'Karyawan'), baca(ctx, 'Tugas Harian'), baca(ctx, TAB)]);
  const tugasHari = tugasSemua.filter((r) => r.kode_event === event.kode && String(r.tanggal) === tanggal && r.status !== STATUS.BATAL);
  const k = karyawan.find((x) => nomor62(x.nomor_wa) === String(pesan.senderId));
  const pelapor = k ? k.nama : pesan.senderName || pesan.senderId;
  let urut = rusakRows.length;
  const tercatat = [];
  for (const it of items) {
    urut += 1;
    const row = {
      id: `RS${urut}`, tanggal, kode_event: event.kode, bahan: it.bahan, jumlah: it.jumlah, satuan: it.satuan || '', lokasi: it.lokasi,
      keterangan: keterangan.slice(0, 300), penanggung_jawab: penjagaBahan(it.bahan, tugasHari, pelapor).join(', '),
      foto: pesan.id || 'ada', pelapor, keputusan: 'MENUNGGU', ganti_rugi: '', diputuskan_oleh: '', dicatat: waktuLokal(pesan.waktu),
    };
    await ctx.store.append(TAB, row);
    tercatat.push(row);
  }
  const daftar = tercatat.map((r) => `• *${r.bahan} ${r.jumlah} ${r.satuan}*`.trim() + ` (${r.lokasi}) – PJ: ${r.penanggung_jawab} _(${r.id})_`).join('\n');
  const keluar = [{ text: `⚠️ *Bahan rusak dicatat* ${event.kode} – 📷 foto ✅\n${daftar}\nPenyebab: ${keterangan}\n_Penanggung jawab bahan hari ini ikut menanggung. Owner yang memutuskan ganti ruginya._` }];
  const ids = tercatat.map((r) => r.id).join(' ');
  for (const g of grupPengeluaran.filter((g) => g !== pesan.groupId)) {
    keluar.push({ groupId: g, text: `⚠️ *Bahan rusak ${event.kode}* dari *${pelapor}* (📷 foto di grup tim)\n${daftar}\nPenyebab: ${keterangan}\n\nKeputusan owner (balas pesan ini):\n*ganti rugi 150rb* → dibagi rata ke penanggung jawab\n*ganti rugi 150rb ${tercatat[0].penanggung_jawab.split(', ')[0]}* → hanya orang itu\n*tidak* → tanpa ganti rugi\n_Kode: ${ids}_` });
  }
  return keluar;
}

// Keputusan owner. Kode RS diambil dari teks atau dari pesan bot yang dibalas.
export async function jawabRusak(ctx, pesan, { isOwner }) {
  const teks = String(pesan.text || '').replace(/^#\s*gantirugi\b/i, 'ganti rugi').trim();
  const ganti = teks.match(/^ganti\s*rugi\s+(.+)$/i);
  const tidak = /^(tidak|tdk|gak|nggak|ga|batal|maafkan|dimaafkan)\b/i.test(teks);
  if (!ganti && !tidak) return null;
  const kodeDi = (s) => (String(s || '').match(/\bRS\d+\b/gi) || []).map((x) => x.toUpperCase());
  const kode = kodeDi(teks).length ? kodeDi(teks) : kodeDi(pesan.kutipan?.teks);
  if (!kode.length) return ganti && /^#/.test(pesan.text || '') ? balas('Format: *#gantirugi RS3 150rb* atau balas pesan bahan rusak dengan *ganti rugi 150rb*') : null;
  if (!isOwner) return balas('⚠️ Ganti rugi bahan rusak hanya diputuskan owner.');
  const rows = (await baca(ctx, TAB)).filter((r) => kode.includes(String(r.id).toUpperCase()));
  if (!rows.length) return balas(`⚠️ Laporan ${kode.join(', ')} tidak ditemukan.`);
  if (rows.every((r) => r.keputusan !== 'MENUNGGU')) return balas(`👌 ${kode.join(', ')} sudah diputuskan sebelumnya (${rows[0].keputusan}).`);
  const oleh = pesan.senderName || pesan.senderId;
  const ringkas = rows.map((r) => `${r.bahan} ${r.jumlah} ${r.satuan}`.trim()).join(', ');
  const tandai = async (perubahan) => { for (const r of rows) await ctx.store.updateWhere(TAB, (x) => x.id === r.id && x.keputusan === 'MENUNGGU', { ...perubahan, diputuskan_oleh: oleh }); };
  if (tidak) {
    await tandai({ keputusan: 'TANPA GANTI RUGI', ganti_rugi: 0 });
    return balas(`👌 Bahan rusak ${kode.join(', ')} (${ringkas}): *tanpa ganti rugi*.`);
  }
  const sisa = ganti[1].replace(/\bRS\d+\b/gi, '');
  const jumlah = parseMoney(sisa);
  if (!jumlah) return balas('Format: *ganti rugi 150rb* (dibagi rata ke penanggung jawab) atau *ganti rugi 150rb Nama*');
  const pj = [...new Set(rows.flatMap((r) => String(r.penanggung_jawab || '').split(',').map((x) => x.trim()).filter(Boolean)))];
  const kenal = [...pj, ...(await baca(ctx, 'Karyawan')).map((x) => x.nama)];
  const disebut = sisa.replace(/[\d.,]+\s*(rb|ribu|k|jt|juta)?/ig, '').split(/[,&]|\s+dan\s+|\s+/).map((x) => x.trim()).filter((x) => x && !/^rata$/i.test(x))
    .map((n) => kenal.find((x) => sama(x, n)) || kenal.find((x) => String(x).toLowerCase().startsWith(n.toLowerCase()))).filter(Boolean);
  const kena = [...new Set(disebut.length ? disebut : pj)];
  if (!kena.length) return balas('Sebutkan namanya: *ganti rugi 150rb Nama*');
  const per = Math.round(jumlah / kena.length / 100) * 100;
  const kodeEvent = rows[0].kode_event;
  for (const n of kena) {
    await ctx.store.append('Denda', {
      tanggal: tanggalLokal(pesan.waktu), kode_event: kodeEvent, nama: n, jumlah: per, jenis: 'Ganti rugi bahan rusak',
      alasan: `Bahan rusak ${kode.join(', ')} (${ringkas}): ${rows[0].keterangan}${kena.length > 1 ? ` – dibagi rata ${kena.length} orang dari ${rupiah(jumlah)}` : ''}`,
      oleh, status: STATUS.OK, dicatat: waktuLokal(pesan.waktu),
    });
  }
  await tandai({ keputusan: 'GANTI RUGI', ganti_rugi: jumlah });
  return balas(`💸 *Ganti rugi bahan rusak* ${kode.join(', ')} (${ringkas}): ${kena.map((n) => `${n} ${rupiah(per)}`).join(', ')}${kena.length > 1 ? ` (dibagi rata dari ${rupiah(jumlah)})` : ''}.\n_Dipotong dari gaji di *#gajian*. Tercatat di tab Denda._`);
}
