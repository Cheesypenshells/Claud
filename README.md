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
