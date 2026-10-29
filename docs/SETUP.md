# Cara Memasang Bot (Tahap 1)

Panduan ini untuk menjalankan bot di **laptop/PC** (Windows, Mac, atau Linux).
Kira-kira butuh 30–60 menit untuk pertama kali. Setelah itu cukup menjalankan `npm start`.

Yang perlu disiapkan:
- Laptop/PC yang bisa menyala selama jam kerja (sekitar 07.00–01.00).
- **Nomor WhatsApp baru khusus bot** yang sudah aktif di sebuah HP.
- Akun Google **cheesypenshells@gmail.com**.

---

## 1. Pasang Node.js

1. Buka https://nodejs.org lalu unduh versi **LTS** (22 atau lebih baru).
2. Pasang seperti aplikasi biasa (klik Next sampai selesai).
3. Cek: buka **Command Prompt** (Windows) atau **Terminal** (Mac), ketik `node -v`. Harus muncul `v22...` atau lebih baru.

## 2. Unduh kode bot

1. Buka repo GitHub `cheesypenshells/claud`, pilih branch `claude/cheesy-pen-shells-management-nq92xx`.
2. Klik **Code > Download ZIP**, lalu ekstrak, misalnya ke `C:\cps-bot`.
3. Buka Command Prompt di folder itu (di Windows Explorer: klik kolom alamat, ketik `cmd`, tekan Enter).
4. Ketik:
   ```
   npm install
   ```

## 3. Siapkan Google Sheets

### 3a. Buat spreadsheet
1. Login Google dengan **cheesypenshells@gmail.com**.
2. Buka https://sheets.google.com dan buat spreadsheet kosong, beri nama misalnya **CPS Kantor AI**.
3. Salin **ID spreadsheet** dari alamat browser, yaitu bagian di antara `/d/` dan `/edit`:
   `https://docs.google.com/spreadsheets/d/`**`1AbC...xyz`**`/edit`

### 3b. Buat "akun robot" Google (service account)
1. Buka https://console.cloud.google.com (masih dengan akun cheesypenshells@gmail.com).
2. Buat project baru, misalnya **cps-kantor-ai**.
3. Menu **APIs & Services > Library**, cari **Google Sheets API**, klik **Enable**.
4. Menu **APIs & Services > Credentials > Create credentials > Service account**.
   Nama: `bot-cps`, lalu klik **Done**.
5. Klik service account yang baru dibuat, buka tab **Keys > Add key > Create new key > JSON**.
   Sebuah file `.json` akan terunduh.
6. Ganti nama file itu menjadi **`credentials.json`** dan pindahkan ke folder bot (`C:\cps-bot`).
   **Jangan bagikan file ini ke siapa pun.**
7. Salin email service account (bentuknya `bot-cps@cps-kantor-ai.iam.gserviceaccount.com`).

### 3c. Beri akses spreadsheet ke robot
1. Buka spreadsheet **CPS Kantor AI**, klik **Share/Bagikan**.
2. Tempel email service account tadi, pilih **Editor**, lalu kirim.

Saat bot pertama kali jalan, tab `Grup`, `Event`, `Transaksi`, dan `Omzet` akan dibuat otomatis.

## 4. Isi pengaturan

1. Salin file `.env.example` menjadi `.env` (di folder yang sama).
2. Buka `.env` dengan Notepad dan isi:
   ```
   NOMOR_BOT=6281xxxxxxxxx           (nomor WA khusus bot)
   SPREADSHEET_ID=1AbC...xyz         (dari langkah 3a)
   GOOGLE_KEY_FILE=credentials.json
   OWNER_IDS=                        (diisi di langkah 6)
   ```

## 5. Jalankan bot dan tautkan WhatsApp

1. Di Command Prompt, ketik:
   ```
   npm start
   ```
2. Muncul **kode pairing 8 digit**.
3. Di HP nomor bot: **WhatsApp > Setelan > Perangkat tertaut > Tautkan perangkat > Tautkan dengan nomor telepon**, lalu masukkan kodenya.
4. Kalau berhasil muncul tulisan `[WA] Tersambung. Bot siap.`

Login tersimpan di folder `auth`, jadi lain kali cukup `npm start` tanpa pairing ulang.

## 6. Daftarkan owner

1. Masukkan nomor bot ke grup WhatsApp yang mau dipakai.
2. Di grup mana saja, ketik `#idsaya`. Bot membalas ID Bapak, misalnya `6281234567890`.
3. Isi ID itu di `.env`: `OWNER_IDS=6281234567890` (kalau lebih dari satu orang, pisahkan dengan koma).
4. Matikan bot (tekan `Ctrl + C`), lalu jalankan lagi `npm start`.

## 7. Daftarkan grup

| Grup | Yang dikirim owner di grup itu |
|---|---|
| Grup pengeluaran event (Owner + PIC) | Blok `#event` (lihat [PANDUAN.md](PANDUAN.md)). Grup otomatis terdaftar. |
| Grup tim event | `#daftar event JMB26-11` |
| Grup kas ruko | `#daftar ruko` |
| Grup gudang | `#daftar gudang` (dipakai mulai Tahap 2) |

Grup yang tidak didaftarkan **tidak dibaca** oleh bot.

---

## Hal penting

- **Bot hanya bekerja saat laptop menyala dan `npm start` berjalan.** Jangan tutup jendela Command Prompt. Matikan mode sleep laptop di pengaturan daya.
- Pesan yang masuk saat bot mati biasanya tetap diproses setelah bot menyala lagi. Namun pengingat terjadwal (rekap malam, pengingat omzet) hanya terkirim kalau bot sedang menyala pada jam tersebut.
- **HP nomor bot harus tetap aktif** dan tersambung internet minimal sesekali. Kalau HP utama tidak online selama sekitar 14 hari, WhatsApp akan melepas perangkat tertaut.
- Kalau muncul pesan "Bot keluar dari WhatsApp", hapus folder `auth` lalu ulangi langkah 5.
- File `.env`, `credentials.json`, dan folder `auth` berisi kunci rahasia. **Jangan dikirim ke siapa pun dan jangan di-upload ke GitHub.**
