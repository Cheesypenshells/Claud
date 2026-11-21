# Robot Trading EURUSD (MT5)

File: `TrendBreakoutEA.mq5`, sebuah Expert Advisor untuk MetaTrader 5.

## Strategi
- **Pair:** EURUSD, pair paling banyak diperdagangkan di dunia (sekitar 20%+ volume forex global, spread paling kecil).
- **Ide dasar:** aturan *Turtle Traders* (Richard Dennis & William Eckhardt, 1983). Aturannya sudah dipublikasikan, misalnya di buku Curtis Faith, *Way of the Turtle*.
  - Buy jika candle H1 ditutup di atas harga tertinggi 20 candle sebelumnya **dan** di atas EMA 200 (tren naik).
  - Sell jika ditutup di bawah harga terendah 20 candle **dan** di bawah EMA 200.
  - SL = 2 x ATR(14), TP = 2 x jarak SL (rasio risk:reward 1:2).

## Jam buka posisi: sesi London & New York
Robot hanya membuka posisi baru antara **08:00 dan 21:00 waktu London**, Senin sampai Jumat:

| Periode | Jam WIB |
|---|---|
| Musim dingin Eropa (akhir Okt s/d akhir Mar) | 15:00 – 04:00 |
| Musim panas Eropa (akhir Mar s/d akhir Okt) | 14:00 – 03:00 |

Pergeseran jam ini dihitung otomatis. Posisi yang sudah terbuka tetap berjalan sampai kena SL atau TP.

## Aturan risiko (sudah terkunci di kode)
| Aturan | Nilai |
|---|---|
| Rugi maksimal per posisi | $15 (lot dihitung otomatis) |
| Rugi maksimal per hari | $25 |
| Kalah beruntun, lalu jeda | 3x kalah, jeda 24 jam |
| Posisi tanpa stop loss | langsung ditutup |
| Akun real | ditolak, kecuali `InpAllowRealAccount = true` |

Kalau jatah rugi harian tinggal $10, posisi berikutnya hanya boleh berisiko $10.

## Cara pakai
1. Install MetaTrader 5 dan buka **akun demo** di broker (gratis, uang virtual).
2. MT5: File, lalu Open Data Folder. Salin `TrendBreakoutEA.mq5` ke `MQL5/Experts/`.
3. Buka MetaEditor, buka file, tekan **Compile** (F7).
4. **Backtest:** View, lalu Strategy Tester. Pilih TrendBreakoutEA dan EURUSD H1, modal awal 100 USD, mode "Every tick based on real ticks", periode minimal 3 tahun.
5. **Uji demo:** tarik EA ke chart EURUSD H1 dan aktifkan *Algo Trading*. Jalankan 1 sampai 3 bulan.
6. Hanya jika hasil demo bagus, baru pertimbangkan akun real.

---

# Versi tanpa laptop: robot Python di GitHub

Robot yang sama ditulis ulang dalam Python (folder `robot/`). **GitHub Actions** menjalankannya otomatis setiap jam, gratis. Robot terhubung ke akun MT5 lewat **MetaApi**, jadi posisi yang dibuka robot langsung terlihat di aplikasi MT5 iPad/HP.

| File | Isi |
|---|---|
| `robot/config.py` | **Semua setting** (risiko, jam, strategi) |
| `robot/strategy.py` | Sinyal breakout + EMA 200 |
| `robot/risk.py` | Jam sesi, SL $15, batas harian $25, jeda 3x kalah, hitung lot |
| `robot/main.py` | Koneksi ke akun & eksekusi order |
| `.github/workflows/robot.yml` | Jadwal: menit ke-3 tiap jam, Senin–Jumat |

Pengaman tambahan:
- Robot menolak akun REAL.
- Default **mode simulasi**: robot hanya mencatat keputusan, tidak membuka posisi.
- Setelah order dikirim, robot mengecek bahwa SL benar-benar terpasang.

## Setup (bisa semua dari iPad/HP)
1. **Daftar di metaapi.cloud**, lalu klik *Add account*:
   - Platform MT5
   - Login `5059089807`
   - Password = password akun demo
   - Server `MetaQuotes-Demo`
2. Salin **Account ID** dari halaman akun tersebut, lalu buat **API token** di menu *API access token*.
3. Di GitHub: buka repo ini, lalu **Settings → Secrets and variables → Actions → New repository secret**. Buat dua secret:
   - `METAAPI_TOKEN` = token dari langkah 2
   - `METAAPI_ACCOUNT_ID` = Account ID
4. Pastikan kode ini sudah ada di branch utama (`main`). Jadwal otomatis GitHub hanya berjalan dari branch utama.
5. Uji coba: tab **Actions → Robot EURUSD → Run workflow**, lalu buka hasilnya dan baca log.
6. Kalau log sudah benar: **Settings → Secrets and variables → Actions → tab Variables**, buat variable `DRY_RUN` = `false`. Robot mulai trading sungguhan di akun demo.

Untuk menghentikan robot: **Actions → Robot EURUSD → ⋯ → Disable workflow**.

## Tes
```
pip install -r requirements.txt pytest
python -m pytest -q
```

---

# Backtest gratis di TradingView

File: `tradingview/TrendBreakout.pine`. Strategi dan aturan risikonya sama dengan robot: SL $15, batas harian $25, jeda 3x kalah, sesi London–NY. Modal awal $100, dan biaya spread sudah diperhitungkan.

1. Buka TradingView (aplikasi atau web), lalu buka chart **EURUSD** dengan timeframe **1 jam**.
2. Buka **Pine Editor**, hapus isinya, tempel seluruh isi file, lalu klik **Add to chart**.
3. Buka tab **Strategy Tester**. Hasil backtest ada di *Overview* dan *Performance Summary*.

---

# MultiRobotEA: 4 robot dalam 1 file (MT5)

File: `MultiRobotEA.mq5`. Pasang file yang sama di **4 chart H1** (chart boleh simbol apa saja), lalu pilih nomor robot di tab **Inputs**:

| Robot | Cara kerja | Simbol |
|---|---|---|
| 1 - Candlestick | Bullish/bearish engulfing & pin bar, searah EMA50 | EURUSD |
| 2 - Trader terkenal | Aturan Turtle Traders (Richard Dennis): breakout 20 candle + EMA200 | EURUSD |
| 3 - Pemburu tren | Scan EURUSD, GBPUSD, USDJPY, XAUUSD, BTCUSD. Pilih tren terkuat, masuk saat pullback ke EMA20 | Daftar simbol |
| 4 - Otak gabungan | Hitung sinyal robot 1–3, ikuti robot yang rata-rata hasil 20 transaksi terakhirnya terbaik. Robot yang sedang rugi tidak diikuti | Ikut robot terpilih |

Aturan tiap robot dihitung **terpisah** (magic 20261101–20261104):
- **Modal virtual $100.** Kalau habis, robot berhenti permanen.
- **SL wajib**, dengan rugi maksimal $15 per posisi. Risikonya adaptif: ikut naik atau turun sesuai sisa modal robot.
- **Batas rugi $25 per hari WIB.** Kalah 3x berturut-turut di hari yang sama, robot berhenti sampai besok.
- **Trading harian:** hanya membuka posisi di sesi London–NY, dan posisi ditutup saat sesi selesai.
- Status setiap robot tampil di pojok kiri atas chart.
