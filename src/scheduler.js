// Tugas terjadwal: pengingat omzet, rekap malam, dan pengingat transfer IO yang telat.
// `tugasJatuhTempo` dipanggil tiap menit; mengembalikan pesan yang perlu dikirim.

import { STATUS } from './schema.js';
import { rekapEvent, formatRekapEvent } from './finance.js';
import { rupiah, tanggalLokal, jamLokal, tambahHari } from './util.js';

// Event dianggap aktif dari hari pertama sampai 7 hari setelah selesai (menunggu transfer terakhir).
function eventAktif(event, hariIni) {
  return event.status !== 'SELESAI'
    && event.mulai <= hariIni
    && hariIni <= tambahHari(event.selesai, 7);
}

function grupUntuk(grupRows, kode, jenis) {
  return grupRows.filter((g) => g.kode_event === kode && g.jenis === jenis).map((g) => g.group_id);
}

export function buatPenjadwal({ store, jam }) {
  const sudahJalan = new Set();

  return async function tugasJatuhTempo(sekarang = new Date()) {
    const hariIni = tanggalLokal(sekarang);
    const jamIni = jamLokal(sekarang);
    const keluar = [];

    const tugas = [
      ['omzet', jam.pengingatOmzet],
      ['rekap', jam.rekapMalam],
      ['transfer', jam.pengingatTransfer],
    ].filter(([nama, j]) => j && jamIni >= j && !sudahJalan.has(`${nama}:${hariIni}`));
    if (!tugas.length) return keluar;

    const [events, grupRows, omzet, transaksi] = await Promise.all([
      store.all('Event'), store.all('Grup'), store.all('Omzet'), store.all('Transaksi'),
    ]);
    const aktif = events.filter((e) => eventAktif(e, hariIni));

    for (const [nama] of tugas) {
      sudahJalan.add(`${nama}:${hariIni}`);
      for (const event of aktif) {
        if (nama === 'omzet') {
          if (hariIni > event.selesai) continue;
          const sudah = omzet.some((o) => o.kode_event === event.kode && o.tanggal === hariIni && o.status !== STATUS.BATAL);
          if (sudah) continue;
          for (const groupId of grupUntuk(grupRows, event.kode, 'event')) {
            keluar.push({
              groupId,
              text: `⏰ Laporan *#omzet* hari ini (${hariIni}) untuk ${event.kode} belum masuk.${event.pic ? ` Mohon PIC ${event.pic} kirim` : ' Mohon dikirim'} sesuai format SOP BAB 6.`,
            });
          }
        }

        if (nama === 'rekap') {
          const r = rekapEvent(event, { omzet, transaksi }, hariIni);
          for (const groupId of grupUntuk(grupRows, event.kode, 'pengeluaran')) {
            keluar.push({ groupId, text: `🌙 ${formatRekapEvent(r, hariIni)}` });
          }
        }

        if (nama === 'transfer') {
          const r = rekapEvent(event, { omzet, transaksi }, hariIni);
          if (r.telat <= 0) continue;
          for (const groupId of grupUntuk(grupRows, event.kode, 'pengeluaran')) {
            keluar.push({
              groupId,
              text: `💸 *Pengingat transfer IO ${event.kode}*\nTransfer yang sudah jatuh tempo tapi belum tercatat masuk: *${rupiah(r.telat)}*.\nKalau sudah masuk, kirim bukti dengan caption *#trf*. Kalau belum, mohon tanyakan ke ${event.io}.`,
            });
          }
        }
      }
    }
    return keluar;
  };
}
