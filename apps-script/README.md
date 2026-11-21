# Antrian pesanan & komplain pelanggan (Google Apps Script)

Web app gratis di akun Google owner. Satu link, beberapa halaman:

| Halaman | Link | Untuk |
|---|---|---|
| Kasir | `<url>?p=kasir` | HP/tablet kasir (PIN): foto struk → nomor antrian + QR pesanan, kolom Menunggu / Dibakar / Siap, foto saat dibakar, Panggil |
| Pelanggan | `<url>?p=pesanan&t=<token>` | dibuka dari QR di layar kasir: foto struk, menu, nomor antrian, nomor yang dipanggil, status + foto dibakar, bunyi & getar saat dipanggil |
| Komplain | `<url>?p=komplain&e=<KODE>` | QR di depan booth; bot WhatsApp meneruskan ke owner |

Data masuk ke Google Sheet pembukuan (tab **Antrian** & **Komplain**), foto ke folder Drive *CPS ANTRIAN*.
Menu dibaca dari foto struk (OCR Google Drive) dan dicocokkan dengan tab **Harga Menu**; kasir bisa memperbaikinya.

## Pemasangan (sekali, ±10 menit, pakai laptop/PC)

1. Buka sheet pembukuan → menu **Ekstensi → Apps Script**.
2. Hapus isi `Code.gs` bawaan, lalu tempel seluruh isi `Code.gs` dari repo ini. Simpan.
3. Pilih fungsi **MULAI_PASANG**, klik **▶ Jalankan**, lalu setujui izin Google. Fungsi ini menghubungkan sheet, membuat tab Antrian/Komplain dan folder foto.
4. **Terapkan → Deployment baru → Aplikasi web**: Jalankan sebagai **Saya**, Akses **Siapa saja**. Salin link `/exec`.
5. Simpan link itu di tab Pengaturan: kunci `url_antrian`.

PIN kasir dibaca dari tab Pengaturan (kunci `pin_kasir`) dan ikut di link kasir yang dikirim bot.
Alternatif: Script Property `KASIR_PIN`/`SPREADSHEET_ID`, atau file `Konfig.gs` (jangan di-commit).
