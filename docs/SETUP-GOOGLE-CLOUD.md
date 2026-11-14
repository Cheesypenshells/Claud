# Memasang Bot di Google Cloud (dari Tablet)

Bot berjalan 24 jam di server gratis Google Cloud (**e2-micro**), jadi tidak perlu laptop.
Semua langkah dikerjakan lewat **browser tablet** (Chrome atau browser Huawei) dengan akun **cheesypenshells@gmail.com**.

Tips: buka situs Google Cloud dalam **mode desktop** di browser tablet (menu browser > "Situs desktop") supaya semua tombol terlihat.

Yang perlu disiapkan:
- Kartu kredit/debit **Visa atau Mastercard** untuk verifikasi Google Cloud.
- **Nomor WhatsApp baru khusus bot** yang sudah aktif di sebuah HP.
- Sekitar 45–60 menit.

---

## Bagian A. Aktifkan Google Cloud

1. Buka **https://console.cloud.google.com** dan login dengan cheesypenshells@gmail.com.
2. Klik **Activate / Mulai uji coba gratis**, isi data dan kartu. Google akan memverifikasi kartu.
3. Di bagian atas, klik pemilih project **> New Project**. Beri nama `cps-kantor-ai`, lalu klik **Create**. Pastikan project ini yang terpilih.

### Pasang alarm biaya (wajib, supaya tidak kaget)
1. Menu ☰ **> Billing > Budgets & alerts > Create budget**.
2. Nama `Batas CPS`. Jumlah: nilai kecil, misalnya **US$ 5** (sekitar Rp 80 ribu).
3. Biarkan notifikasi 50%, 90%, 100%. Email peringatan akan dikirim ke cheesypenshells@gmail.com.

> **Tentang biaya:** server e2-micro termasuk paket gratis Google. Namun alamat IP publik server *mungkin* dikenakan biaya kecil (beberapa dolar per bulan) setelah masa uji coba berakhir. Saya belum bisa memastikan aturan terbarunya. Alarm biaya di atas akan memberi tahu Bapak kalau ada tagihan. Cek juga menu **Billing > Reports** sebulan sekali.

---

## Bagian B. Siapkan Google Sheets

### B1. Buat spreadsheet
1. Buka **https://sheets.google.com**, buat spreadsheet kosong bernama **CPS Kantor AI**.
2. Salin **ID spreadsheet** dari alamat browser, yaitu bagian di antara `/d/` dan `/edit`. Simpan di catatan HP.

### B2. Buat "akun robot" untuk mengisi Sheets
Kembali ke **https://console.cloud.google.com** (project `cps-kantor-ai`):
1. Menu ☰ **> APIs & Services > Library**, cari **Google Sheets API**, klik **Enable**.
2. Menu ☰ **> APIs & Services > Credentials > Create credentials > Service account**.
   Nama `bot-cps`, klik **Create and continue**, lalu **Done**.
3. Klik `bot-cps` di daftar, buka tab **Keys > Add key > Create new key > JSON > Create**.
   File `.json` akan terunduh ke tablet. **Ganti namanya menjadi `credentials.json`.**
   **Jangan bagikan file ini ke siapa pun.**
4. Salin email `bot-cps@cps-kantor-ai.iam.gserviceaccount.com` (terlihat di halaman yang sama).
5. Buka spreadsheet **CPS Kantor AI**, klik **Bagikan**, tempel email tadi, pilih **Editor**, lalu kirim.

---

## Bagian C. Buat server

1. Menu ☰ **> Compute Engine > VM instances**. Klik **Enable** kalau diminta, lalu tunggu 1–2 menit.
2. Klik **Create instance** dan isi:

   | Pengaturan | Isi |
   |---|---|
   | Name | `cps-bot` |
   | Region | **us-central1 (Iowa)** — wajib salah satu dari us-central1, us-west1, us-east1 supaya gratis |
   | Zone | biarkan |
   | Machine type | **e2-micro** (General purpose > E2) |
   | Boot disk | klik **Change**: Operating system **Debian**, versi terbaru; Boot disk type **Standard persistent disk**; Size **10 GB** |
   | Firewall | biarkan kosong (tidak perlu HTTP/HTTPS) |

3. Klik **Create** dan tunggu sampai muncul tanda centang hijau.

---

## Bagian D. Pasang bot (satu perintah)

1. Di daftar VM, klik tombol **SSH** di baris `cps-bot`. Akan terbuka jendela terminal hitam. Klik **Authorize** kalau diminta.
2. Salin perintah di bawah ini, tempel di jendela SSH, lalu tekan Enter:
   ```
   curl -fsSL https://raw.githubusercontent.com/Cheesypenshells/Claud/claude/cheesy-pen-shells-management-nq92xx/scripts/pasang-server.sh | bash
   ```
3. Tunggu beberapa menit. Skrip akan menanyakan:
   - **Nomor WhatsApp khusus bot**, contoh `6281234567890`
   - **Nomor WhatsApp owner** (nomor Pak George)
   - **ID spreadsheet** dari langkah B1
4. Lalu skrip meminta **credentials.json**:
   - Di jendela SSH, klik ikon **Upload file** (gambar panah ke atas, di kanan atas).
   - Pilih file `credentials.json` dari tablet dan tunggu sampai selesai.
   - Kembali ke jendela SSH, ketik `1`, lalu Enter.
5. Bot mulai berjalan dan menampilkan **Kode pairing**, misalnya `ABCD-1234`.
6. Di **HP nomor bot**: buka **WhatsApp > Perangkat tertaut > Tautkan perangkat > Tautkan dengan nomor telepon**, lalu masukkan kodenya.
7. Kalau muncul `[WA] Tersambung. Bot siap.`, berarti berhasil. Tekan **Ctrl+C** untuk menutup log; bot tetap berjalan.
   (Di keyboard tablet tanpa tombol Ctrl, cukup tutup jendela SSH.)

---

## Bagian E. Daftarkan grup WhatsApp

1. Masukkan nomor bot ke grup-grup yang dipakai.
2. Lakukan pendaftaran berikut di masing-masing grup:

| Grup | Yang dikirim Pak George di grup itu |
|---|---|
| Grup pengeluaran event (Owner + PIC) | Blok `#event` (lihat [PANDUAN.md](PANDUAN.md)) |
| Grup tim event | `#daftar event KODE-EVENT` |
| Grup kas ruko | `#daftar ruko` |

Cara pakai sehari-hari ada di [PANDUAN.md](PANDUAN.md).

---

## Perintah perawatan (di jendela SSH)

| Keperluan | Perintah |
|---|---|
| Melihat log bot | `sudo journalctl -u cps-bot -f` |
| Menyalakan ulang bot | `sudo systemctl restart cps-bot` |
| Memperbarui bot ke versi terbaru | `~/cps-bot/scripts/perbarui.sh` |
| Mengubah pengaturan | `nano ~/cps-bot/.env`, lalu nyalakan ulang bot |

## Kalau ada masalah

- **Bot tidak membalas:** cek log. Kalau tertulis "Bot keluar dari WhatsApp", jalankan `sudo systemctl restart cps-bot` lalu pairing ulang dengan kode baru di log.
- **Error Google Sheets ("permission" / "not found"):** pastikan spreadsheet sudah dibagikan ke email `bot-cps@...` sebagai **Editor**, dan ID spreadsheet di `.env` benar.
- **HP nomor bot harus tetap aktif** dan online sesekali. Kalau HP tersebut tidak online sekitar 14 hari, WhatsApp akan melepas perangkat tertaut.
