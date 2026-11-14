# Memasang Bot di VPS Lokal (dari Tablet)

Bot berjalan 24 jam di VPS (server sewaan). Semua langkah bisa dikerjakan dari tablet.
Perkiraan waktu: 45–60 menit.

---

## Bagian A. Sewa VPS

Penyedia VPS Indonesia mana pun bisa dipakai, misalnya IDCloudHost, DomaiNesia, Biznet Gio, atau Jagoan Hosting.
Pilih paket **termurah** yang memenuhi spesifikasi berikut:

| Pengaturan | Pilih |
|---|---|
| CPU / RAM | **1 vCPU, 1 GB RAM** (sudah cukup) |
| Disk | 10 GB atau lebih |
| Sistem operasi | **Ubuntu 24.04 LTS** (atau Ubuntu 22.04 / Debian 12) |
| Lokasi | Jakarta / Indonesia |
| Pembayaran | Bulanan (transfer bank / virtual account / QRIS, sesuai pilihan penyedia) |

Setelah VPS aktif, catat tiga hal ini dari panel penyedia atau email:
- **Alamat IP**, contoh `103.xxx.xxx.xxx`
- **Username**, biasanya `root`
- **Password**

**Jangan kirim password VPS ke siapa pun, termasuk di chat ini.**

---

## Bagian B. Siapkan Google Sheets + "akun robot" (gratis, tanpa kartu)

Ikuti **Bagian B** di [SETUP-GOOGLE-CLOUD.md](SETUP-GOOGLE-CLOUD.md#bagian-b-siapkan-google-sheets).
Langkah ini memakai halaman Google Cloud hanya untuk membuat "akun robot", jadi **tidak perlu mengaktifkan billing atau memasukkan kartu**. Kalau ada tawaran "Activate / free trial", lewati saja.

Hasil yang harus ada di tablet:
- **ID spreadsheet**
- File **credentials.json**
- Spreadsheet sudah **dibagikan ke email `bot-cps@...`** sebagai Editor

---

## Bagian C. Masuk ke VPS dari tablet

Pasang aplikasi SSH di tablet, misalnya **Termius** atau **JuiceSSH** (cari di AppGallery atau toko aplikasi).
Aplikasi ini lebih mudah daripada konsol web, karena bisa **tempel (paste)** teks.

1. Buka aplikasinya, lalu tambah koneksi baru (**New Host**):
   - Address / Host: **alamat IP VPS**
   - Username: **root**
   - Password: **password VPS**
2. Sambungkan. Kalau ditanya *fingerprint / trust host*, pilih **Yes / Accept**.
3. Muncul layar hitam bertuliskan `root@...:~#`. Artinya Bapak sudah masuk ke VPS.

Kalau aplikasi SSH tidak tersedia, gunakan **Console / VNC** di panel penyedia VPS. Kekurangannya, di konsol web biasanya perintah harus diketik manual karena tidak bisa ditempel.

---

## Bagian D. Pasang bot (satu perintah)

1. Tempel perintah ini lalu tekan Enter:
   ```
   curl -fsSL https://raw.githubusercontent.com/Cheesypenshells/Claud/claude/cheesy-pen-shells-management-nq92xx/scripts/pasang-server.sh | bash
   ```
2. Tunggu beberapa menit. Skrip akan menanyakan:
   - **Nomor WhatsApp khusus bot**: `087766444003`
   - **Nomor WhatsApp owner**: nomor WhatsApp pribadi Pak George
   - **ID spreadsheet**
3. Saat diminta **credentials.json**:
   1. Ketik `2`, lalu Enter.
   2. Buka file `credentials.json` di tablet (misalnya dengan aplikasi File atau Notes), lalu **salin semua isinya**.
   3. Tempel di layar SSH. Skrip berhenti sendiri setelah isinya lengkap.
4. Bot mulai berjalan dan menampilkan **Kode pairing**, misalnya `ABCD-1234`.
5. Di HP nomor bot buka **WhatsApp > Perangkat tertaut > Tautkan perangkat > Tautkan dengan nomor telepon**, lalu masukkan kodenya.
6. Kalau muncul `[WA] Tersambung. Bot siap.`, berarti berhasil. Aplikasi SSH boleh ditutup; bot tetap berjalan di VPS.

---

## Bagian E. Daftarkan grup WhatsApp

1. Masukkan nomor bot ke grup-grup yang dipakai.
2. Kirim pendaftaran di tiap grup:

| Grup | Yang dikirim Pak George di grup itu |
|---|---|
| Grup pengeluaran event (Owner + PIC) | Blok `#event` (lihat [PANDUAN.md](PANDUAN.md)) |
| Grup tim event | `#daftar event KODE-EVENT` |
| Grup kas ruko | `#daftar ruko` |

---

## Perintah perawatan (di aplikasi SSH)

| Keperluan | Perintah |
|---|---|
| Melihat log bot | `journalctl -u cps-bot -f` |
| Menyalakan ulang bot | `systemctl restart cps-bot` |
| Memperbarui bot ke versi terbaru | `~/cps-bot/scripts/perbarui.sh` |
| Mengubah pengaturan | `nano ~/cps-bot/.env`, lalu nyalakan ulang bot |

Hal penting lainnya:
- **Bayar VPS tepat waktu.** Kalau VPS diputus karena telat bayar, bot berhenti. Data di Google Sheets tetap aman.
- **HP nomor bot** harus online minimal sesekali (sekitar 2 minggu sekali). Jangan hapus perangkat tertaut di HP itu.
