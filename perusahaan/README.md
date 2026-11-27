# Perusahaan Trading Digital

Perusahaan virtual milik pribadi (belum berbadan hukum). Pemilik dan penyuntik dana adalah satu orang: **Anda (Direktur Utama)**.
Perusahaan ini terdiri dari 4 divisi trading. Setiap divisi punya modal, robot, dan CEO AI sendiri.

## Struktur

```
Direktur Utama & pemilik modal: ANDA   (prinsip: "Rule No. 1: never lose money")
├── Divisi 1  Candlestick       robot MultiRobotEA Robot 1  magic 20261101  CEO AI gaya Tim Cook
├── Divisi 2  Trader Terkenal    robot MultiRobotEA Robot 2  magic 20261102  CEO AI gaya Ray Dalio
├── Divisi 3  Pemburu Tren       robot MultiRobotEA Robot 3  magic 20261103  CEO AI gaya Jeff Bezos
└── Divisi 4  Otak Gabungan      robot MultiRobotEA Robot 4  magic 20261104  CEO AI gaya Satya Nadella
```

- **Karyawan** = robot MT5 di setiap divisi. Robot inilah yang trading otomatis setiap hari.
- **CEO AI** = Claude yang berperan sesuai profil di folder `ceo/`. CEO AI membaca hasil divisinya, menilai, dan mengusulkan perbaikan.
- **Direktur Utama (Anda)** menyetujui atau menolak setiap usulan. CEO AI **tidak boleh** mengubah robot atau modal tanpa persetujuan Anda.

CEO AI adalah persona yang **terinspirasi** dari prinsip-prinsip yang dipublikasikan tokoh tersebut. CEO AI bukan tokoh itu sendiri dan tidak berbicara atas nama mereka.

## Modal & aturan (sama untuk semua divisi)

| Aturan | Nilai |
|---|---|
| Modal awal per divisi | $100 (virtual, di akun demo) |
| Rugi maks per posisi | $15, menyesuaikan sisa modal (saran: turunkan ke $3–5) |
| Rugi maks per hari (WIB) | $25 |
| Kalah 3x beruntun dalam sehari | Divisi libur sampai besok |
| Stop loss | Wajib di setiap posisi |
| Jam buka posisi | Sesi London–New York (15:00–04:00 WIB). Posisi ditutup saat sesi selesai |
| Modal habis | Divisi **ditutup permanen** |

## Siklus hidup divisi

| Tahap | Lama | Lulus kalau | Gagal kalau |
|---|---|---|---|
| 0. Backtest | 1–2 hari | Profit factor > 1.3, drawdown < 30%, minimal 50 transaksi di data 1–2 tahun | Rugi di backtest, langsung diperbaiki |
| 1. Masa percobaan (demo) | 1 minggu | Modal masih > $85 dan aturan tidak pernah dilanggar | Modal < $70 |
| 2. Demo penuh | 1–3 bulan | Untung bersih, profit factor > 1.3, minimal 30 transaksi | Modal < $70 atau 2 bulan berturut-turut rugi |
| 3. Uang asli kecil | 2–3 bulan | Hasil mirip demo (selisih wajar) | Drawdown > 30% |
| 4. Uang asli penuh | Berkelanjutan | Dievaluasi setiap bulan | Drawdown > 30% |

Lulus atau gagal diputuskan **Direktur Utama**. CEO AI hanya memberi rekomendasi.

## Rapat direksi mingguan

Setiap minggu, Direktur mengirim ke Claude:
1. Screenshot status di pojok kiri atas keempat chart (modal, hari ini, winrate).
2. Screenshot tab **History** MT5 (atau file laporan: klik kanan History → Report).
3. Catatan kejadian penting, misalnya robot mati, Winlator tertutup, atau berita besar.

Setiap CEO AI lalu menulis laporan dengan format di [`laporan/TEMPLATE.md`](laporan/TEMPLATE.md), disimpan sebagai `laporan/YYYY-MM-DD.md`.

## KPI yang dinilai

| KPI | Arti | Sehat |
|---|---|---|
| Net profit | Untung/rugi bersih | Positif |
| Profit factor | Total untung ÷ total rugi | > 1.3 |
| Winrate | % transaksi untung | 35–55% (untuk rasio TP:SL = 2:1) |
| Rata-rata per transaksi | Net profit ÷ jumlah transaksi | Positif |
| Max drawdown | Penurunan modal terdalam | < 30% |
| Kepatuhan aturan | SL selalu ada, batas harian dipatuhi | 100% |
