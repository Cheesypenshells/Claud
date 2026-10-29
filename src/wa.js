// Koneksi WhatsApp (Baileys). Bot login sebagai "perangkat tertaut" di nomor khusus bot.
// Hanya pesan dari grup yang diteruskan ke handler; chat pribadi diabaikan.

import {
  makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage,
  fetchLatestBaileysVersion, Browsers,
} from 'baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { angkaId } from './util.js';

const logger = pino({ level: 'silent' });

function isiPesan(m) {
  const msg = m.message || {};
  const inti = msg.ephemeralMessage?.message || msg.viewOnceMessage?.message || msg.documentWithCaptionMessage?.message || msg;
  const teks = inti.conversation
    || inti.extendedTextMessage?.text
    || inti.imageMessage?.caption
    || inti.documentMessage?.caption
    || '';
  let media = null;
  if (inti.imageMessage) media = { mimetype: inti.imageMessage.mimetype || 'image/jpeg' };
  else if (inti.documentMessage?.mimetype?.startsWith('image/')) media = { mimetype: inti.documentMessage.mimetype };
  return { teks, media };
}

export async function mulaiWhatsApp({ folderLogin, nomorBot, onPesan }) {
  const { state, saveCreds } = await useMultiFileAuthState(folderLogin);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  const namaGrup = new Map();
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
        const kode = await sock.requestPairingCode(nomorBot);
        console.log(`\nKode pairing: ${kode}\nDi HP nomor bot: WhatsApp > Perangkat tertaut > Tautkan perangkat > Tautkan dengan nomor telepon\n`);
      }
      if (u.connection === 'open') console.log('[WA] Tersambung. Bot siap.');
      if (u.connection === 'close') {
        const kodeStatus = u.lastDisconnect?.error?.output?.statusCode;
        if (kodeStatus === DisconnectReason.loggedOut) {
          console.error(`[WA] Bot keluar dari WhatsApp. Hapus folder "${folderLogin}" lalu jalankan ulang untuk login lagi.`);
          process.exit(1);
        }
        console.log('[WA] Koneksi terputus, menyambung ulang dalam 5 detik...');
        setTimeout(sambung, 5000);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const m of messages) {
        const groupId = m.key.remoteJid;
        if (!groupId?.endsWith('@g.us') || m.key.fromMe || !m.message) continue;
        const { teks, media } = isiPesan(m);
        if (!teks && !media) continue;

        if (!namaGrup.has(groupId)) {
          const meta = await sock.groupMetadata(groupId).catch(() => null);
          namaGrup.set(groupId, meta?.subject || groupId);
        }

        let image = null;
        if (media) {
          try {
            const buffer = await downloadMediaMessage(m, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
            image = { buffer, mimetype: media.mimetype };
          } catch (err) {
            console.error('[WA] Gagal mengunduh foto:', err.message);
          }
        }

        const pesan = {
          id: m.key.id,
          groupId,
          groupName: namaGrup.get(groupId),
          senderId: angkaId(m.key.participantPn || m.key.participant),
          senderName: m.pushName || '',
          text: teks,
          image,
          waktu: new Date(Number(m.messageTimestamp) * 1000),
        };
        await onPesan(pesan, (text) => kirim(groupId, text, m));
      }
    });
  };

  sambung();
  return { kirim: (groupId, text) => kirim(groupId, text) };
}
