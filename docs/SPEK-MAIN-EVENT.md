# Spesifikasi Sheet "Main" per Event

Tujuan: membedah **satu event, untung atau rugi**. Disusun dari jawaban Pak George (owner).
Status: **sedang dibangun**.

---

## 1. Tampilan

```
MAIN – PILIH EVENT: [ JMB26-11 ▼ ]      Jambi | Kepo Market | 1–14 Nov 2026
① Ringkasan untung/rugi + laba per hari
② Omzet harian (tabel + grafik batang)
③ Rincian biaya per kategori
④ Biaya iklan (endorse) + porsi gratis
⑤ Sisa bahan baku yang dikembalikan ke gudang
```

## 2. ① Ringkasan

| Baris | Isi |
|---|---|
| Omzet kotor | Total omzet event |
| Total biaya | Jumlah semua kategori di ③ |
| Sisa bahan dikembalikan | Nilai bahan sisa yang kembali ke gudang (mengurangi biaya bahan) |
| **Laba / Rugi** | Omzet − total biaya + sisa bahan; label UNTUNG / RUGI |
| Margin | Laba ÷ omzet |
| **Laba per hari** | Laba ÷ jumlah hari event (disetujui owner) |

## 3. ② Omzet Harian (disetujui)

Kolom: **Tanggal | Hari | Omzet | Jumlah transaksi | Refund | Potongan IO | Perkiraan transfer | Sudah ditransfer | Selisih**
- Target harian: **tidak perlu** untuk sekarang.
- **Grafik batang** omzet per hari: **ya**.

## 4. ③ Rincian Biaya

| No | Kategori | Sumber data / aturan |
|---|---|---|
| 1 | Potongan bagi hasil IO | Rata-rata **30%**, angka pasti per event dari setup |
| 2 | Admin IO + listrik/air/gas/galon | Listrik/gas/galon dilaporkan **harian di grup tim** |
| 3 | Bahan baku | Oyster + bumbu/keju/topping/saus dari gudang: (keluar + restock − sisa) × harga |
| 4a | Barang kering **konsumtif** | Sumpit, wrap kertas, kotak packaging, kantong plastik, sarung tangan. Wajar dibeli di lokasi kalau habis |
| 4b | Barang kering **non-konsumtif** | Sapu, etalase kaca, alat. Dibeli di lokasi = **pengeluaran karena kelalaian** (lupa dibawa) → ditandai khusus |
| 5 | Transport & ekspedisi | Lalamove, truk, Gojek, pesawat, dll. Sub-jenis bertambah seiring waktu |
| 6 | Penginapan | Harga hotel × lama menginap (malam) |
| 7 | Konsumsi | Dari chat: cash / transfer / belanja online. Dibandingkan dengan **budget makan** (bagian 6) |
| 8 | Gaji karyawan tetap | Porsi event dari perhitungan bulanan (bagian 5) |
| 9 | Upah DW + kasir | 100 ribu/hari/orang + bonus harian (bagian 5) |
| 10 | Estimasi bonus & absensi | Bonus omzet + bonus/potongan absensi (bagian 5) |
| 11 | Iklan | Bayar influencer/endorse (bagian 7) |
| 12 | Tak terduga | Sakit, ganti rugi, lain-lain; dilaporkan selama event berjalan |

## 5. Gaji & Bonus (aturan owner, menggantikan usulan awal)

### Karyawan tetap
- Gaji pokok **Rp 2.500.000/bulan**.
- Maksimal **2 karyawan tetap per lokasi event**.
- **Bonus event dari omzet event:** 2 karyawan tetap → masing-masing **1%**; hanya 1 karyawan tetap → **1,5%**.
- Aturan lama "omzet sebulan ≥ 500 jt → Rp 1 jt per event" **tidak dipakai lagi**.
- Bonus yang diterima = bonus × **poin KPI** (100 poin = 100% bonus; sistem poin di RANCANGAN-SISTEM.md bagian 8 tetap dipakai).
- Event dengan omzet **< Rp 50 juta**: tidak ada bonus event.
- **Bonus kerajinan Rp 500.000/bulan** kalau laporan baik dan absensi tepat waktu.

### Daily Worker (DW / freelance)
- Upah **Rp 100.000/hari** (bisa lebih, tergantung lokasi; diatur per event).
- Bonus harian dari **omzet hari itu**: > 15 jt → **+50 ribu**; > 30 jt → **+100 ribu**.

### Kasir
- Upah **Rp 100.000/hari**.
- Bonus harian dari **omzet hari itu**: ≥ 10 jt → **100 ribu**; ≥ 20 jt → **150 ribu**; ≥ 30 jt → **200 ribu**.
- Bonus followers IG @cheesypenshells: **Rp 50.000 per kelipatan 100 followers baru per hari**.

### Absensi (berlaku untuk semua DW dan karyawan tetap)
- Patokan tepat waktu: **1 jam sebelum booth buka** (SOP BAB 4).
- Datang tepat waktu: **+Rp 5.000/hari**.
- Terlambat: **−Rp 15.000 per 30 menit** keterlambatan.

## 6. Budget Makan (akumulasi selama event)
- Budget per karyawan per hari: **Rp 30.000** (2× makan × Rp 15.000).
- Budget PIC: **Rp 100.000/hari**.
- Budget **dijumlahkan selama event**. Tabel menampilkan: total budget, sudah terpakai (dari chat konsumsi), **sisa budget**.
- Sisa budget biasanya dipakai untuk **makan bersama di akhir event** (malam terakhir).

## 7. ④ Iklan & Porsi Gratis
- Iklan = bayar influencer yang datang, atau numpang upload video di akun mereka.
- Diskon/promo: **tidak dihitung** dulu.
- **Porsi gratis dihitung**: jumlah porsi × isi per porsi (contoh: 3 porsi × 4 pcs = 12 pcs oyster), dinilai dengan **harga jual** sesuai wilayah.

## 8. ⑤ Sisa Bahan Baku
- **Semua bahan bisa dikembalikan ke gudang**, termasuk oyster (dihitung per kg).
- Pack yang sudah dibuka (walau setengah) = **dianggap habis**. Sisa dihitung per pack utuh.

| Bahan | Satuan | Harga |
|---|---|---|
| Oyster | kg | Rp 15.000/kg |
| Mozzarella | pack 2,3 kg | Rp 234.000/pack |
| Bumbu garlic | pack | Rp 500.000/pack |
| Bumbu merah | pack | Rp 500.000/pack (menu **Sweet n Spicy**, harga jual sama dengan garlic; ditawarkan sebagai pengganti kalau bumbu garlic habis) |
| Topping cumi | kantong | Rp 150.000/kantong |
| Saus keju | kg (pack 1 kg) | Rp 38.000/kg |

## 9. Setup event lewat tanya-jawab bot
- Saat grup event baru dibuat, **bot bertanya satu per satu** di grup: lokasi, tanggal, IO, bagi hasil, PIC, karyawan (tetap, DW, kasir), upah DW lokasi itu, dll., lalu mengisi tabel sendiri.
- Owner bisa mengubah data lewat chat, misalnya karyawan berhenti/menghilang di tengah event → bot menghapus/menonaktifkan orang itu mulai tanggal tersebut.

## 9b. Fee PIC
- Fee PIC = maksimal **25% dari laba bersih** (setelah semua biaya).
- Dikurangi menurut kehadiran owner: datang 1 hari −5% (20%), setengah event −10% (15%), dari awal sampai akhir −15% (10%).
- Rugi → fee Rp 0. Laba bersih akhir = laba − fee PIC.

## 9c. Susunan file (keputusan owner)
1. **PEMBUKUAN** – rekap semua event dalam satu tabel + gaji per event.
2. **EVENT** – folder berisi satu spreadsheet per event (isi bagian 1–8 dokumen ini).
3. **GUDANG** – stok bahan baku & barang gudang.
4. **KPI KARYAWAN** – KPI, akumulasi bonus, perhitungan detail.

## 10. Pertanyaan Terbuka
Semua sudah terjawab.
