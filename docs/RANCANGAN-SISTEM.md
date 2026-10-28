# Rancangan Sistem "Kantor AI" Cheesy Pen Shells

Versi draf 1, disusun dari jawaban Pak George (owner). Status: **menunggu konfirmasi owner** sebelum mulai coding.

---

## 1. Gambaran Umum

```
 Grup WA "Pengeluaran <Kota>"  ─┐
 (Owner + PIC)                  │
                                ├──►  Bot WA (nomor khusus)  ──►  AI (baca chat & foto struk)
 Grup WA "Tim <Kota>"          ─┤                                        │
 (PIC + karyawan)               │                                        ▼
                                │                               Google Sheets (database)
 Grup WA "Gudang"              ─┘                               - bisa dibuka owner dari HP
 (Owner + yang pegang gudang)                                   - bisa dikoreksi manual
                                                                         │
                                Bot balas / TAG di grup  ◄───────────────┘
                                (rekap harian, peringatan SOP, alert stok)
```

Prinsip:
- **Gratis / semurah mungkin, dikelola sendiri.** Bot WA pakai WhatsApp biasa (bukan API berbayar), data disimpan di Google Sheets.
- **Bot hanya membaca grup yang didaftarkan.** Chat pribadi owner dan grup lain tidak dibaca.
- **AI mengusulkan, manusia memutuskan** untuk hal sensitif (denda, poin minus besar). Lihat bagian 8.

### Komponen teknis
| Komponen | Pilihan | Biaya |
|---|---|---|
| Bot WhatsApp | Library open-source (Baileys / whatsapp-web.js) yang login sebagai "perangkat tertaut" di **nomor WA baru khusus bot** | Gratis (hanya kartu SIM) |
| Database | Google Sheets | Gratis |
| AI pembaca chat & foto bukti transfer | Claude API (model kecil/murah) | Bayar per pemakaian, perkiraan puluhan ribu rupiah/bulan |
| Mesin yang menjalankan bot | Laptop/PC lama di ruko yang menyala 24 jam, atau server gratis (mis. free tier cloud) | Gratis / listrik saja |

> **Catatan risiko:** bot WA non-resmi melanggar ketentuan WhatsApp dan nomornya *bisa* diblokir. Karena itu bot **wajib pakai nomor terpisah**, jangan nomor pribadi/bisnis utama owner.

---

## 2. Struktur Grup WhatsApp

| Grup | Anggota | Isi yang dicatat bot |
|---|---|---|
| `Pengeluaran <Kota> <Bulan>` | Owner, PIC, bot | Bukti transfer, info pengeluaran cash, transfer masuk dari IO, setup event |
| `Tim <Kota> <Bulan>` | PIC, senior, junior, DW, bot | Absensi, pembagian posisi, foto SOP, laporan bahan harian, jumlah makan, komplain |
| `Gudang CPS` | Owner, karyawan yang pegang gudang, bot | Barang masuk/keluar/retur gudang, produksi bumbu |
| `Kas Ruko` (opsional) | Owner, bot | Gaji, listrik, air, sewa ruko (pembukuan terpisah dari event) |

---

## 3. Setup Event (dikirim owner di grup pengeluaran)

Contoh format pesan:
```
#event
Kota: Jambi
IO: Kepo Market
Tanggal: 1-14 Nov 2026
Wilayah harga: Sumatra
Bagi hasil: 27%
Admin: 500.000
Listrik/air/gas/galon: dihitung IO (nanti diinfokan)
Jadwal trf: H+1, Jumat-Minggu ditransfer Senin
Jam masuk: 10.00
PIC: Budi
Senior: Andi, Rudi, Sari
```
Bot membuat 1 "lembar event" baru di Sheets dan mengonfirmasi balik.

### Harga jual per wilayah (per pcs)
| Menu | Jawa | Sumatra (+5rb) | Kalimantan (+10rb) | Min. order |
|---|---|---|---|---|
| Garlic | 15.000 | 20.000 | 25.000 | 5 pcs |
| Mozzarella | 20.000 | 25.000 | 30.000 | 5 pcs |
| Seafood Mozzarella | 25.000 | 30.000 | 35.000 | 5 pcs |
| Fresh oyster (mentah) | 30.000 | 35.000 | 40.000 | 2 pcs |

---

## 4. Keuangan & Pembukuan

### 4.1 Pemasukan per event
- **Omset kotor harian** dilaporkan PIC tiap tutup booth (angka dari kasir).
- **Transfer IO** dicatat dari bukti transfer di grup pengeluaran.
- Bot menghitung **perkiraan transfer**:
  `Transfer seharusnya = Omset kotor − potongan bagi hasil (25–30%) − admin − listrik/air/gas/galon`
- Bot mencocokkan **perkiraan vs transfer yang benar-benar masuk** dan mengikuti jadwal (H+1; Jumat–Minggu dibayar Senin; atau sekali setelah event). Jika lewat jadwal belum masuk / nominal beda → bot ingatkan owner.

### 4.2 Pengeluaran per event
Dibaca AI dari chat atau screenshot, mis. *"lalamove 150k"*, *"makan malam 120rb"*, *"ember 1 unit 30rb"*.
Kategori: Transport/Ekspedisi, Konsumsi, Peralatan, Oyster (beli langsung ke supplier untuk lokasi), Penginapan, Gaji DW, Lain-lain.

### 4.3 Bahan dari gudang (dibebankan ke event)
Bumbu, keju, topping, saus keju tidak dibeli per event, tapi **diambil dari gudang dengan harga pokok (HPP) per pack**.
```
Pemakaian      = Keluar awal + Restock − Sisa (retur ke gudang)
Biaya bahan    = Pemakaian × HPP per pack
```
Contoh: keluar 10 + restock 10 − sisa 2 = **18 pack terpakai**.

### 4.4 Laba-rugi
- **Per event:** Transfer bersih IO − pengeluaran event − bahan gudang − gaji (porsi event) − bonus DW.
- **Per bulan:** jumlah semua event − biaya ruko (gaji tetap yang belum terbagi ke event, listrik, air, sewa) = **laba bersih bulanan**.

---

## 5. Stok Gudang (Ruko Puri Gardena Blok C/9, lantai 1)

Buku stok mencatat setiap mutasi:
| Tanggal | Barang | Jenis | Jumlah | Tujuan/Asal | HPP/pack | Saldo |
|---|---|---|---|---|---|---|
| 1 Nov | Bumbu butter garlic | Keluar | 20 | Event Jambi | … | 180 |
| 1 Nov | Keju mozzarella (2,3 kg) | Keluar | 50 | Event Jambi | … | 250 |
| 15 Nov | Bumbu butter garlic | Retur | 2 | Event Jambi | … | 182 |

- **Produksi bumbu sendiri:** HPP per pack = total biaya produksi ÷ jumlah pack yang dihasilkan.
- **Stok opname** berkala: jumlah fisik dibandingkan saldo catatan. Selisih → alert ke owner.

---

## 6. Deteksi Bahan yang Hilang / Tidak Wajar

### 6.1 Oyster (bahan utama)
Patokan dari owner: **100 kg oyster ≈ Rp 10 juta omset (harga Jawa)** → ±Rp 100.000 omset per kg.
Untuk Sumatra/Kalimantan, patokan disesuaikan dengan kenaikan harga per wilayah.
```
Omset per kg = Omset kotor event ÷ kg oyster terpakai
Jika omset per kg < 95% patokan  →  ALERT (melebihi toleransi rusak 5%)
```

### 6.2 Bumbu, keju, topping
Dihitung dari **resep standar per pcs** (lihat pertanyaan terbuka) dikali jumlah terjual:
```
Pemakaian teoritis = Σ (pcs terjual per menu × takaran per pcs)
Selisih            = Pemakaian aktual − Pemakaian teoritis
Jika selisih > 5%  →  ALERT, TAG PIC, masuk ke KPI "Kekurangan stok" tim
```

### 6.3 Laporan bahan harian (grup tim)
Tiap tutup booth: stok awal, tambahan, sisa per bahan. Bot memeriksa angka masuk akal (sisa hari ini = awal besok) dan menandai yang janggal.

---

## 7. SOP, Absensi & Pembagian Posisi

### 7.1 Posisi kerja di booth
| Posisi | Tugas |
|---|---|
| Kasir | PIC (keluarga/owner) |
| Bakaran / Pemanggang | Memasak semua order dari kasir |
| Plating | Di belakang pemanggang: seleksi bahan, membumbui oyster mentah, mengambil oyster dari bagian getok |
| Getok (2 orang) | Atur cooler box & es batu, bersihkan oyster, buka cangkang, kirim ke plating |

Setiap pagi bot meminta PIC mengisi **pembagian posisi hari itu** (posisi bisa dirolling).

### 7.2 Absensi
Karyawan kirim di grup tim: `#masuk` (dengan foto di booth) dan `#pulang`. Bot mencatat nama, jam masuk, jam pulang, dan posisi.
Terlambat = lewat jam masuk + toleransi. **Telat 2x berturut-turut → denda** (nominal menunggu konfirmasi).

### 7.3 Checklist SOP (dari dokumen SOP owner)
| Fase | Contoh tugas | Bukti | Batas waktu |
|---|---|---|---|
| Loading in | Rakit booth, cek peralatan | Foto booth siap | Sebelum buka |
| Event berjalan (harian) | Sapu & bersihkan lantai booth, booth siap jualan, laporan bahan | Foto + `#sop sapu`, `#sop booth-siap` | Per jam yang ditentukan |
| Loading out | Packing, hitung stok sisa, kirim ke lokasi berikutnya/gudang | Foto packing + laporan sisa | Hari terakhir |

**Alur pengecekan bot:**
1. Batas waktu lewat dan bukti belum ada → bot **TAG PIC + karyawan penanggung jawab** di grup.
2. Masih belum dikerjakan → tercatat **poin minus SOP** di KPI.
3. Berulang / keterlaluan → bot memberi **catatan pelanggaran** (poin minus lebih besar) dan, bila ada barang rusak karena lalai, **usulan denda = nilai barang**.

---

## 8. KPI Karyawan (skor 0–100)

| Komponen | Bobot | Jenis | Sumber data | Bisa didenda? |
|---|---|---|---|---|
| Absensi & ketepatan waktu | 10% | Individu | Absensi bot | Ya (telat 2x berturut) |
| Kepatuhan SOP | 20% | Individu | Checklist bot | Ya (lalai hitung stok) |
| Omset | 20% | Kelompok | Omset vs target event | – |
| Kekurangan stok | 20% | Kelompok | Deteksi bagian 6 | Ya (jika kurang) |
| Kebersihan | 10% | Kelompok | Foto SOP kebersihan | – |
| Komplain pelanggan | 10% | Kelompok | Laporan PIC | – |
| Rasa kepemilikan (attitude, skill, kejujuran) | 10% | Individu | Nilai PIC | – |

- **Individu (40%)**: absensi, SOP, rasa kepemilikan.
- **Kelompok (60%)**: omset, stok, kebersihan, komplain. Nilai PIC untuk kinerja tim, pembagian tugas, dan kecepatan kerja masuk ke penilaian kelompok.
- Setiap akhir event PIC mengisi form singkat nilai 1–5 per karyawan via WA, lalu bot mengonversi.
- **Peringkat bulanan** dikirim ke owner (bukan ke grup, kecuali owner mau).
- **Denda & poin minus besar = usulan bot, disetujui PIC/owner** dengan membalas `#setuju` / `#tolak`.

---

## 9. Usulan Rumus Gaji & Bonus

### 9.1 Karyawan tetap (senior/junior)
**a. Gaji pokok** tetap dibayar penuh per bulan, lalu **dibagi ke event** sesuai hari kerja (untuk laporan laba per event):
```
Gaji pokok di event X = Gaji pokok bulanan × (hari kerja di event X ÷ total hari kerja bulan itu)
```
Contoh: gaji 2 juta, 2 event dengan jumlah hari sama → masing-masing event dibebani 1 juta.

**b. Bonus omset (kolam bonus bulanan)**
```
Kolam bonus = Total omset semua event dalam sebulan × tarif (1% / 2% / 3%)
Poin orang  = Hari kerja × (Skor KPI ÷ 100)
Bonus orang = Kolam bonus × (Poin orang ÷ Total poin semua karyawan tetap)
```
Usulan tarif (bisa diubah owner): rata-rata omset per event < 100 jt → 1%; 100–200 jt → 2%; > 200 jt → 3%.

**c. Bonus kerajinan** untuk kerja di luar jaga booth (masak bumbu di gudang, bongkar muat, jaga gudang): nominal tetap per tugas, dicatat bot dari laporan.

**d. Potongan:** denda yang sudah disetujui.

**Contoh simulasi** (total omset sebulan 400 jt, tarif 2% → kolam 8 jt):
| Karyawan | Hari kerja | KPI | Poin | Bonus omset |
|---|---|---|---|---|
| A (senior) | 24 | 90 | 21,6 | 1.578.000 |
| B (senior) | 24 | 80 | 19,2 | 1.403.000 |
| C (senior) | 20 | 85 | 17,0 | 1.242.000 |
| D (senior) | 22 | 70 | 15,4 | 1.125.000 |
| E (senior) | 24 | 95 | 22,8 | 1.666.000 |
| F (junior) | 18 | 75 | 13,5 | 986.000 |
| **Total** | | | **109,5** | **8.000.000** |

Gaji A = 2.000.000 (pokok) + 1.578.000 (bonus omset) + bonus kerajinan − denda ≈ **3,6 juta+**.

### 9.2 Daily Worker (DW)
```
Gaji DW = (Upah harian + Bonus harian) × hari kerja − denda
```
| Total omset event | Bonus harian dasar |
|---|---|
| < 100 jt | 0 |
| 100–200 jt | 50.000 |
| ≥ 200 jt | 100.000 – 150.000 |

Usulan penyesuaian dengan KPI individu: KPI ≥ 90 → bonus penuh/batas atas; 70–89 → bonus dasar; 60–69 → setengah; < 60 → tidak dapat bonus.

---

## 10. Laporan Otomatis

| Kapan | Laporan | Dikirim ke |
|---|---|---|
| Tiap malam | Rekap hari: omset, pengeluaran, absensi, SOP yang belum beres, alert stok | Grup pengeluaran (versi keuangan) & grup tim (versi operasional) |
| Akhir event | Laba-rugi event, pemakaian bahan, skor KPI tim | Owner |
| Akhir bulan | Pembukuan bulanan, kas ruko, peringkat KPI, **draf slip gaji & bonus** semua karyawan | Owner |
| Kapan saja | Perintah `#rekap`, `#stok`, `#gaji Andi` | Owner |

---

## 11. Tahapan Pengerjaan

1. **Tahap 1 – Fondasi & Keuangan:** bot WA, Google Sheets, setup event, pencatatan pengeluaran & transfer IO, rekap per event & bulanan, kas ruko.
2. **Tahap 2 – Stok:** buku gudang, mutasi keluar/restock/retur, HPP, deteksi bahan tidak wajar.
3. **Tahap 3 – SOP & Absensi:** absensi, pembagian posisi, checklist SOP dengan TAG otomatis.
4. **Tahap 4 – KPI & Gaji:** skor KPI, peringkat, usulan denda, draf gaji & bonus bulanan.

---

## 12. Pertanyaan Terbuka (perlu jawaban owner)

1. **HPP bumbu:** Rp 500 ribu itu untuk **1 pack** atau untuk **seluruh 200 pack** (berarti Rp 2.500/pack)? Pada contoh, 18 pack × 500 rb = 9 juta.
2. **Takaran:** 1 kg oyster ≈ berapa pcs? 1 pack bumbu / 1 pack keju (2,3 kg) / topping cukup untuk berapa pcs per menu?
3. **Rincian penjualan:** kasir mencatat jumlah pcs per menu, atau hanya total omset? Kasir pakai aplikasi/sistem IO?
4. **Absensi:** toleransi telat berapa menit? Nominal denda telat 2x berturut-turut?
5. **Gaji:** daftar nama karyawan tetap + gaji pokok masing-masing; upah harian DW berapa?
6. **Denda & poin minus:** otomatis oleh bot, atau usulan bot lalu disetujui PIC/owner (usulan saya)?
7. **Tarif bonus 1–3%:** setuju dengan usulan di 9.1b atau punya patokan sendiri?
8. **Perangkat:** ada laptop/PC di ruko yang bisa menyala 24 jam? Siap beli 1 nomor WA baru khusus bot?
9. **Biaya AI** untuk membaca screenshot (perkiraan puluhan ribu/bulan) diterima? Alternatif gratis: semua pengeluaran diketik dengan format tetap tanpa foto.
10. **Akun Google** yang dipakai untuk Google Sheets.
11. **Dokumen SOP** (loading in, event berjalan, loading out) mohon dikirim untuk dijadikan checklist.
