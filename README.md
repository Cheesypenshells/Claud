# Claud
Kantor cheesy pen shells 

Bot WhatsApp "kantor AI" untuk Cheesy Pen Shells: pembukuan per event dan per bulan, stok, SOP, dan KPI karyawan.

## Status
- **Tahap 1 – Pembukuan (sudah jalan):** setup event, pengeluaran dari format chat, omzet harian, transfer & potongan IO, rekap event, rekap bulanan, kas ruko, pengingat otomatis.
- Tahap 2 – Stok gudang & deteksi bahan hilang
- Tahap 3 – SOP, absensi, pembagian posisi
- Tahap 4 – Poin KPI, peringkat, gaji & bonus

## Dokumen
- [Cara memasang bot di Google Cloud dari tablet](docs/SETUP-GOOGLE-CLOUD.md) (dipakai)
- [Cara memasang bot di laptop](docs/SETUP.md) (alternatif)
- [Panduan pemakaian](docs/PANDUAN.md)
- [Rancangan sistem](docs/RANCANGAN-SISTEM.md)
- [Checklist SOP untuk bot](docs/CHECKLIST-SOP-BOT.md)

## Untuk developer
```
npm install
npm test     # tes otomatis
npm start    # jalankan bot (butuh file .env, lihat .env.example)
```
