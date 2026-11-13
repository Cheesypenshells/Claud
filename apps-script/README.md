# Antrian pesanan & komplain pelanggan (Google Apps Script)

Web app gratis di akun Google owner. Satu link, beberapa halaman:

| Halaman | Link | Untuk |
|---|---|---|
| Kasir | `<url>?p=kasir` | HP/tablet kasir (PIN): foto struk → nomor antrian + QR pesanan, kolom Menunggu / Dibakar / Siap, foto saat dibakar, Panggil |
| Pelanggan | `<url>?p=pesanan&t=<token>` | dibuka dari QR di layar kasir: foto struk, menu, nomor antrian, nomor yang dipanggil, status + foto dibakar, bunyi & getar saat dipanggil |
| Komplain | `<url>?p=komplain&e=<KODE>` | QR di depan booth; bot WhatsApp meneruskan ke owner |

Data masuk ke Google Sheet pembukuan (tab **Antrian** & **Komplain**), foto ke folder Drive *CPS ANTRIAN*.
Menu dibaca dari foto struk (OCR Google Drive) dan dicocokkan dengan tab **Harga Menu**; kasir bisa memperbaikinya.

## Pemasangan (sekali)

1. Buat project Apps Script baru, salin `Code.gs` dan `appsscript.json` (tampilkan manifest lewat *Project Settings*).
2. Tambah file `Konfig.gs` (jangan di-commit):
   ```js
   var KONFIG_CPS = { SPREADSHEET_ID: '<ID sheet pembukuan>', KASIR_PIN: '<PIN kasir>' };
   ```
3. *Deploy → New deployment → Web app*: Execute as **Me**, Who has access **Anyone**. Buka link `?p=kasir` sekali dan setujui izin.
4. Simpan link `/exec` di tab Pengaturan bot: kunci `url_antrian`. Bot lalu bisa membalas `#qr`.
