// Membaca pengaturan dari file .env (lihat .env.example).

import 'dotenv/config';

// Nomor boleh ditulis 0877... atau 62877...; disimpan dalam format 62877...
export const nomorWa = (s) => String(s || '').replace(/\D/g, '').replace(/^0/, '62');
const daftar = (s) => String(s || '').split(/[,\s]+/).map(nomorWa).filter(Boolean);

export const config = {
  ownerIds: new Set(daftar(process.env.OWNER_IDS)),
  nomorBot: nomorWa(process.env.NOMOR_BOT),
  folderLogin: process.env.FOLDER_LOGIN_WA || 'auth',

  spreadsheetId: process.env.SPREADSHEET_ID || '',
  googleKeyFile: process.env.GOOGLE_KEY_FILE || 'credentials.json',

  jam: {
    pengingatOmzet: process.env.JAM_PENGINGAT_OMZET ?? '23:00',
    rekapMalam: process.env.JAM_REKAP_MALAM ?? '23:30',
    pengingatTransfer: process.env.JAM_PENGINGAT_TRANSFER ?? '10:00',
  },
};
