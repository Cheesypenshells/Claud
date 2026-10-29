// Membaca pengaturan dari file .env (lihat .env.example).

import 'dotenv/config';

const daftar = (s) => String(s || '').split(/[,\s]+/).map((x) => x.replace(/\D/g, '')).filter(Boolean);

export const config = {
  ownerIds: new Set(daftar(process.env.OWNER_IDS)),
  nomorBot: String(process.env.NOMOR_BOT || '').replace(/\D/g, ''),
  folderLogin: process.env.FOLDER_LOGIN_WA || 'auth',

  spreadsheetId: process.env.SPREADSHEET_ID || '',
  googleKeyFile: process.env.GOOGLE_KEY_FILE || 'credentials.json',

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',

  jam: {
    pengingatOmzet: process.env.JAM_PENGINGAT_OMZET ?? '23:00',
    rekapMalam: process.env.JAM_REKAP_MALAM ?? '23:30',
    pengingatTransfer: process.env.JAM_PENGINGAT_TRANSFER ?? '10:00',
  },
};
