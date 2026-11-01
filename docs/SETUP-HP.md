# Memasang Bot di HP Android (Termux)

Bot dijalankan di **HP Android Pak George** memakai aplikasi **Termux**.
Bot hanya bekerja **saat dinyalakan**. Pesan yang masuk selama bot mati diproses begitu bot dinyalakan lagi.
Tanggal dan jam laporan tetap mengikuti waktu pesan dikirim.

Syarat:
- HP **Android 7 ke atas** (Samsung, Xiaomi, Oppo, Vivo, Realme, dll.). Tidak bisa di iPhone atau HP/tablet Huawei HarmonyOS terbaru.
- Ruang kosong sekitar **1 GB** dan koneksi internet/WiFi.
- **Nomor WhatsApp khusus bot** (087766444003) sudah aktif di HP mana pun.
- Waktu pemasangan pertama sekitar 45 menit.

---

## Langkah 1. Siapkan Google Sheets dan "akun robot" (gratis, tanpa kartu)

Ikuti **Bagian B** di [SETUP-GOOGLE-CLOUD.md](SETUP-GOOGLE-CLOUD.md#bagian-b-siapkan-google-sheets).
Lewati semua tawaran "Activate / free trial", karena langkah ini tidak perlu kartu.

Lakukan dari **HP Android yang akan menjalankan bot**, supaya file `credentials.json` langsung tersimpan di folder **Download** HP itu. Hasil yang harus ada:
- **ID spreadsheet**, disimpan di catatan HP.
- File **credentials.json** di folder **Download**. Kalau namanya lain, ganti menjadi `credentials.json`.
- Spreadsheet sudah **dibagikan ke email `bot-cps@...`** sebagai Editor.

## Langkah 2. Pasang Termux

1. Buka browser HP, lalu kunjungi **https://f-droid.org/packages/com.termux/**.
2. Gulir ke bagian **Download APK**, unduh, lalu buka filenya untuk memasang.
   Di Samsung akan muncul peringatan: ketuk **Pengaturan**, aktifkan **Izinkan dari sumber ini**, lalu kembali dan ketuk **Pasang**.
   Kalau muncul peringatan **Play Protect**, pilih **Detail lainnya > Tetap pasang**.
   Jangan pakai Termux dari Play Store, karena versinya sudah lama dan sering gagal.
3. Buka aplikasi **Termux**. Muncul layar hitam dengan tanda `$`.

## Langkah 3. Matikan penghemat baterai untuk Termux

Supaya bot tidak dimatikan HP saat berjalan.

**Samsung (One UI):**
1. **Pengaturan > Aplikasi > Termux > Baterai**, lalu pilih **Tidak dibatasi**.
2. **Pengaturan > Baterai** (atau **Perawatan baterai dan perangkat > Baterai**) **> Batas penggunaan latar belakang > Aplikasi yang tidak pernah ditidurkan > tombol +**, lalu centang **Termux** dan pilih **Tambah**.
3. Di menu yang sama, matikan **Tidurkan aplikasi yang tidak digunakan**.

**Merek lain:** **Setelan > Aplikasi > Termux > Baterai > Tidak dibatasi**. Di Xiaomi/Oppo/Vivo, aktifkan juga **Mulai otomatis / Autostart** untuk Termux.

## Langkah 4. Pasang bot (satu perintah)

1. Di Termux, ketik atau tempel perintah ini lalu tekan Enter:
   ```
   curl -fsSL https://raw.githubusercontent.com/Cheesypenshells/Claud/claude/cheesy-pen-shells-management-nq92xx/scripts/pasang-hp.sh | bash
   ```
   Kalau muncul `curl: not found`, ketik dulu `pkg install -y curl`, lalu ulangi perintah di atas.
2. Tunggu 5–15 menit, karena Node.js sedang dipasang.
3. Kalau muncul permintaan **izin penyimpanan**, pilih **Izinkan**.
4. Jawab pertanyaan berikut:
   - **Nomor WhatsApp khusus bot**: `087766444003`
   - **Nomor WhatsApp owner**: nomor WhatsApp pribadi Pak George
   - **ID spreadsheet**
5. Bot langsung berjalan dan menampilkan **Kode pairing**, misalnya `ABCD-1234`.

## Langkah 5. Tautkan nomor bot

1. Di **HP nomor bot**: buka **WhatsApp > Perangkat tertaut > Tautkan perangkat > Tautkan dengan nomor telepon**.
2. Masukkan kode pairing dari Termux.
3. Kalau di Termux muncul `[WA] Tersambung. Bot siap.`, berarti berhasil.

Kalau nomor bot ada di HP yang sama dengan Termux, pindah dulu ke WhatsApp nomor bot untuk memasukkan kode, lalu kembali ke Termux.

## Langkah 6. Daftarkan grup WhatsApp

1. Masukkan nomor bot ke grup-grup yang dipakai.
2. Kirim pendaftaran di tiap grup:

| Grup | Yang dikirim Pak George di grup itu |
|---|---|
| Grup pengeluaran event (Owner + PIC) | Blok `#event` (lihat [PANDUAN.md](PANDUAN.md)) |
| Grup tim event | `#daftar event KODE-EVENT` |
| Grup kas ruko | `#daftar ruko` |

---

## Pemakaian sehari-hari

| Keperluan | Caranya |
|---|---|
| **Menyalakan bot** | Buka Termux, ketik `bot`, Enter |
| **Mematikan bot** | Di Termux tekan **Ctrl** (tombol di baris atas keyboard Termux) + **C** |
| **Memperbarui bot** | Matikan bot, ketik `perbarui-bot`, lalu `bot` |

Saran pemakaian:
- **Nyalakan bot minimal sekali sehari**, misalnya malam setelah closing. Saat menyala, bot memproses semua laporan yang tertunda dan membalas di grup.
- Jadwal otomatis (pengingat omzet 23.00, rekap 23.30, pengingat transfer 10.00) hanya terkirim kalau bot menyala setelah jam tersebut di hari yang sama. Kapan pun bot menyala, `#rekap` tetap bisa dipakai.
- Saat bot menyala, Termux boleh ditinggal di latar belakang dan HP boleh dipakai seperti biasa.
- **Jangan biarkan bot mati lebih dari 2–3 hari.** Pesan yang lebih lama dari 3 hari tidak diproses.

## Kalau ada masalah

- **Bot tidak membalas:** pastikan Termux sedang menjalankan bot (ada tulisan "Bot berjalan").
- **"Bot keluar dari WhatsApp":** bot akan meminta kode pairing baru; ulangi Langkah 5.
- **Error Google Sheets:** pastikan spreadsheet dibagikan ke email `bot-cps@...` sebagai Editor.
