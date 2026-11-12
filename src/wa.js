// Koneksi WhatsApp (Baileys). Bot login sebagai "perangkat tertaut" di nomor khusus bot.
// Hanya pesan dari grup yang diteruskan ke handler; chat pribadi diabaikan.
// Foto tidak diunduh; bot hanya mencatat bahwa pesan berisi foto.

import {
  makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers, downloadMediaMessage,
} from 'baileys';
import { rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { angkaId } from './util.js';

const logger = pino({ level: 'silent' });

// Pesan yang masuk saat bot mati dikirim ulang WhatsApp ketika bot menyala (jenis 'append').
// Yang lebih lama dari batas ini diabaikan supaya riwayat chat lama tidak ikut tercatat.
const BATAS_TERTUNDA_MS = 3 * 24 * 60 * 60 * 1000;
const SIMPAN_ID_TERAKHIR = 3000;

// Daftar ID pesan yang sudah diproses, disimpan di disk supaya tidak tercatat dua kali setelah restart.
export function buatPencatatId(file) {
  let ids = [];
  try {
    if (existsSync(file)) ids = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    ids = [];
  }
  const set = new Set(ids);
  return {
    sudah: (id) => set.has(id),
    tandai(id) {
      set.add(id);
      ids.push(id);
      if (ids.length > SIMPAN_ID_TERAKHIR) set.delete(ids.shift());
      writeFileSync(file, JSON.stringify(ids));
    },
  };
}

function isiPesan(m) {
  const msg = m.message || {};
  const inti = msg.ephemeralMessage?.message || msg.viewOnceMessage?.message || msg.documentWithCaptionMessage?.message || msg;
  const teks = inti.conversation
    || inti.extendedTextMessage?.text
    || inti.imageMessage?.caption
    || inti.documentMessage?.caption
    || '';
  const adaFoto = Boolean(inti.imageMessage || inti.documentMessage?.mimetype?.startsWith('image/'));
  // Pesan yang di-reply (dikutip): teksnya dipakai untuk koreksi catatan, contoh reply "uang valen".
  const info = inti.extendedTextMessage?.contextInfo || inti.imageMessage?.contextInfo || inti.documentMessage?.contextInfo;
  const q = info?.quotedMessage;
  const teksKutipan = q ? (q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || '') : '';
  const kutipan = q ? { teks: teksKutipan, pengirim: angkaId(info.participant), id: info.stanzaId || '', foto: Boolean(q.imageMessage) } : null;
  return { teks, adaFoto, kutipan };
}

export async function mulaiWhatsApp({ folderLogin, nomorBot, kodePairing, onPesan, onGrupBaru }) {
  const { state, saveCreds } = await useMultiFileAuthState(folderLogin);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  const namaGrup = new Map();
  const pencatat = buatPencatatId(path.join(folderLogin, 'terproses.json'));
  let sock;
  let sudahMintaKode = false;

  const kirim = async (groupId, text, quoted) => {
    try {
      await sock.sendMessage(groupId, { text }, quoted ? { quoted } : {});
    } catch (err) {
      console.error(`[WA] Gagal kirim ke ${groupId}:`, err.message);
    }
  };

  const sambung = () => {
    // Kode pairing kedaluwarsa dalam beberapa menit; minta kode baru setiap kali menyambung ulang.
    sudahMintaKode = false;
    sock = makeWASocket({
      version,
      auth: state,
      logger,
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (u) => {
      if (u.qr && !nomorBot) {
        console.log('\nScan QR ini dari WhatsApp nomor bot: Setelan > Perangkat tertaut > Tautkan perangkat\n');
        qrcode.generate(u.qr, { small: true });
      }
      if (u.qr && nomorBot && !sudahMintaKode && !sock.authState.creds.registered) {
        sudahMintaKode = true;
        const kode = await sock.requestPairingCode(nomorBot, kodePairing || undefined);
        console.log(`\nKode pairing: ${kode}`);
        console.log('Di HP nomor bot, ketuk notifikasi WhatsApp "masukkan kode", atau buka');
        console.log('WhatsApp > Perangkat tertaut > Tautkan perangkat > Tautkan dengan nomor telepon saja,');
        console.log(`lalu ketik ${kode}. Kode tetap sama walau bot menyambung ulang.\n`);
      }
      if (u.connection === 'open') console.log('[WA] Tersambung. Bot siap.');
      if (u.connection === 'close') {
        const kodeStatus = u.lastDisconnect?.error?.output?.statusCode;
        if (kodeStatus === DisconnectReason.loggedOut) {
          // Login lama tidak berlaku lagi: hapus, lalu keluar. Saat dijalankan ulang, bot meminta pairing baru.
          console.error('[WA] Bot keluar dari WhatsApp. Data login dihapus; jalankan ulang bot untuk pairing lagi.');
          rmSync(folderLogin, { recursive: true, force: true });
          process.exit(1);
        }
        console.log('[WA] Koneksi terputus, menyambung ulang dalam 5 detik...');
        setTimeout(sambung, 5000);
      }
    });

    // Bot dimasukkan ke grup baru.
    sock.ev.on('groups.upsert', (grupBaru) => {
      for (const g of grupBaru) onGrupBaru?.(g.id);
    });
    sock.ev.on('group-participants.update', ({ id, participants, action }) => {
      const saya = angkaId(sock.user?.id);
      const sayaLid = angkaId(sock.user?.lid);
      const ditambah = action === 'add' && participants.some((p) => {
        const n = angkaId(typeof p === 'string' ? p : p?.id);
        return n && (n === saya || n === sayaLid);
      });
      if (ditambah) onGrupBaru?.(id);
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' && type !== 'append') return;
      for (const m of messages) {
        const groupId = m.key.remoteJid;
        // Grup, atau chat pribadi (untuk penilaian KPI / perintah owner). Status & siaran diabaikan.
        const pribadi = /@(s\.whatsapp\.net|lid)$/.test(groupId || '');
        if ((!groupId?.endsWith('@g.us') && !pribadi) || m.key.fromMe || !m.message) continue;
        if (pencatat.sudah(m.key.id)) continue;
        const waktu = new Date(Number(m.messageTimestamp) * 1000);
        if (type === 'append' && Date.now() - waktu.getTime() > BATAS_TERTUNDA_MS) continue;
        const { teks, adaFoto, kutipan } = isiPesan(m);
        if (!teks && !adaFoto) continue;

        if (!pribadi && !namaGrup.has(groupId)) {
          const meta = await sock.groupMetadata(groupId).catch(() => null);
          namaGrup.set(groupId, meta?.subject || groupId);
        }

        const pesan = {
          id: m.key.id,
          groupId,
          groupName: pribadi ? 'chat pribadi' : namaGrup.get(groupId),
          senderId: pribadi ? angkaId(m.key.senderPn || m.key.remoteJidAlt || groupId) : angkaId(m.key.participantPn || m.key.participant),
          pribadi,
          senderName: m.pushName || '',
          text: teks,
          adaFoto,
          waktu,
          kutipan,
          // Foto diunduh hanya kalau dibutuhkan (memeriksa bukti trf untuk catatan yang nominalnya sama).
          ambilFoto: adaFoto ? () => downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage }) : null,
        };
        pencatat.tandai(m.key.id);
        await onPesan(pesan, (text) => kirim(groupId, text, m));
      }
    });
  };

  sambung();
  // kirimPribadi: chat langsung ke nomor (contoh meminta penilaian KPI ke PIC).
  // Daftar anggota grup: [{ nomor, admin }]. Nomor diambil dari phoneNumber/jid; kalau WhatsApp hanya
  // memberi ID tersembunyi (LID), nomor berisi ID itu dan tersembunyi = true. Nomor bot sendiri tidak ikut.
  const anggotaGrup = async (groupId) => {
    const meta = await sock.groupMetadata(groupId).catch(() => null);
    if (!meta) return [];
    const saya = new Set([angkaId(sock.user?.id), angkaId(sock.user?.lid)].filter(Boolean));
    return meta.participants.map((p) => {
      const jid = [p.phoneNumber, p.jid, p.id].find((x) => String(x || '').endsWith('@s.whatsapp.net')) || p.id;
      return { nomor: angkaId(jid), tersembunyi: !String(jid).endsWith('@s.whatsapp.net'), lid: angkaId(p.lid || (String(p.id).endsWith('@lid') ? p.id : '')), admin: Boolean(p.admin) };
    }).filter((a) => a.nomor && !saya.has(a.nomor) && !saya.has(a.lid));
  };
  return { anggotaGrup, kirim: (groupId, text) => kirim(groupId, text), kirimPribadi: (nomor, text) => kirim(`${String(nomor).replace(/\D/g, '').replace(/^0/, '62')}@s.whatsapp.net`, text) };
}
