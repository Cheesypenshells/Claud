# Rancangan Sistem "Kantor AI" Cheesy Pen Shells

Versi draf 2. Disusun dari jawaban Pak George (owner) dan dokumen SOP BAB 1–8.
Status: **Tahap 1 (pembukuan) sudah dibuat**, lihat [SETUP.md](SETUP.md) dan [PANDUAN.md](PANDUAN.md). Tahap 2–4 menunggu jawaban pertanyaan terbuka.
Detail checklist SOP harian untuk bot ada di [CHECKLIST-SOP-BOT.md](CHECKLIST-SOP-BOT.md).

---

## 1. Gambaran Umum

```
 Grup WA "Pengeluaran <Kota>"  ─┐
 (Owner + PIC)                  │
                                ├──►  Bot WA (nomor khusus)  ──►  Pembaca format pesan
 Grup WA "Event <Kota>"        ─┤                                        │
 (PIC + senior + DW)            │                                        ▼
                                │                               Google Sheets (database)
 Grup WA "Gudang Pusat"        ─┘                               - bisa dibuka owner dari HP
 (Owner + yang pegang gudang)                                   - bisa dikoreksi manual
                                                                         │
                                Bot balas / TAG di grup  ◄───────────────┘
                                (rekap harian, peringatan SOP, alert stok)
```

Prinsip:
- **Gratis, dikelola sendiri.** Bot WA pakai WhatsApp biasa (bukan API berbayar), data disimpan di Google Sheets.
- **Semua laporan berupa teks dengan format WhatsApp** (keputusan owner). Bot tidak membaca isi foto. Jam laporan diambil dari waktu pesan WhatsApp. Harga pengeluaran selalu ditulis.
- **Bot hanya membaca grup yang didaftarkan.** Chat pribadi owner dan grup lain tidak dibaca.
- **Bot mengusulkan, manusia memutuskan** untuk denda dan poin minus. Ini sesuai SOP BAB 4 & BAB 8: *"tidak ada sanksi otomatis hanya karena temuan"* dan *"tidak ada pemotongan upah atau denda otomatis tanpa dasar hukum yang sah"*.

### Komponen teknis
| Komponen | Pilihan | Biaya |
|---|---|---|
| Bot WhatsApp | Library open-source (Baileys / whatsapp-web.js) yang login sebagai "perangkat tertaut" di **nomor WA baru khusus bot** | Gratis (hanya kartu SIM) |
| Database | Google Sheets | Gratis |
| Mesin yang menjalankan bot | Laptop/PC di ruko yang menyala 24 jam, atau server gratis | Gratis / listrik saja |

> **Catatan risiko:** bot WA non-resmi melanggar ketentuan WhatsApp dan nomornya *bisa* diblokir. Karena itu bot **wajib pakai nomor terpisah**.

---

## 2. Struktur Grup WhatsApp (mengikuti SOP BAB 1 Pasal 9)

| Grup | Anggota | Isi yang dicatat bot |
|---|---|---|
| `Pengeluaran <Kota>` | Owner, PIC, bot | Setup event, bukti transfer, pengeluaran cash, transfer masuk dari IO |
| `Event <Kota>` | PIC, senior, DW, kasir, bot | Absensi, pembagian posisi, loading in, kesiapan booth, QC, omzet, stok, closing, loading out |
| `Gudang Pusat` | Owner, karyawan yang pegang gudang, bot | Barang masuk/keluar gudang, koli, perpindahan antarevent, produksi bumbu |
| `Kas Ruko` (opsional) | Owner, bot | Gaji, listrik, air, sewa ruko (pembukuan terpisah dari event) |

---

## 3. Setup Event (dikirim owner di grup pengeluaran)

Kode event mengikuti SOP BAB 2 (contoh `SBY26`), misalnya `JMB26-11` untuk Jambi, November 2026.
```
#event
Kode: JMB26-11
Kota: Jambi
IO: Kepo Market
Tanggal: 1-14 Nov 2026
Wilayah harga: Sumatra
Target omzet: 150.000.000
Bagi hasil: 27%
Admin: 500.000
Listrik/air/gas/galon: dihitung IO (nanti diinfokan)
Jadwal trf: H+1, Jumat-Minggu ditransfer Senin
Jam buka: 11.00   (absen wajib 1 jam sebelum buka = 10.00, SOP BAB 4)
PIC: Budi
Senior: Andi, Rudi, Sari
DW: Joko, Tono
Kasir: Budi
```

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
- **Omzet terverifikasi harian** dikirim kasir/PIC tiap tutup booth dengan format SOP BAB 6 bagian H, termasuk **jumlah pcs per menu**.
- **Transfer IO** dicatat dari bukti transfer di grup pengeluaran.
- Bot menghitung perkiraan transfer:
  `Transfer seharusnya = Omzet − potongan bagi hasil (25–30%) − admin − listrik/air/gas/galon`
- Bot mencocokkan perkiraan dengan transfer yang masuk sesuai jadwal (H+1; Jumat–Minggu dibayar Senin; atau sekali setelah event). Kalau telat atau nominal beda, owner diingatkan.

### 4.2 Pengeluaran per event
Ditulis di chat dengan harga, mis. *"lalamove 150k"*, *"makan malam 120rb"*, *"ember 2 unit @30rb"*.
Kategori: Transport/Ekspedisi, Konsumsi, Peralatan, Oyster (beli langsung untuk lokasi), Penginapan, Gaji DW, Lain-lain.

### 4.3 Bahan dari gudang (dibebankan ke event)
```
Pemakaian      = Keluar awal + Restock − Sisa (retur ke gudang)
Biaya bahan    = Pemakaian × HPP per pack
```
Contoh bumbu (HPP **Rp 500.000/pack**): keluar 10 + restock 10 − sisa 2 = 18 pack → **Rp 9.000.000**.

### 4.4 Laba-rugi
- **Per event:** Transfer bersih IO − pengeluaran event − bahan gudang − gaji (porsi event) − bonus.
- **Per bulan:** jumlah semua event − biaya ruko = **laba bersih bulanan**.

---

## 5. Stok Gudang & Satuan Baku

Satuan baku mengikuti SOP BAB 2, 3, 6, dan 7:
| Bahan | Satuan | Isi | HPP |
|---|---|---|---|
| Oyster hidup | kg | 1 kg ≈ 4–7 pcs | Beli per event, min. ±100 kg |
| Bumbu butter garlic | pack | 1,5 kg | Rp 500.000/pack |
| Mozzarella | pack | 2,3 kg | ? |
| Saus keju | pack | 1 kg | ? |
| Topping seafood | pack | 1 kg | ? |

Buku stok gudang mencatat setiap mutasi (masuk, keluar ke event, retur, rusak) dengan format laporan WA SOP BAB 2 Pasal 9 `[CPS | BARANG KELUAR | KODE EVENT]`. Bot membalas saldo terbaru setiap ada mutasi.

---

## 6. Deteksi Bahan Hilang / Tidak Wajar

Data takaran dari owner:
| Bahan | Takaran standar | Artinya |
|---|---|---|
| Oyster | 1 kg ≈ 4–7 pcs | 100 kg ≈ Rp 10 juta omzet (harga Jawa) |
| Bumbu | 1 pack per Rp 10 juta omzet | |
| Mozzarella | 10 g per pcs (varian mozza & seafood mozza) | 1 pack 2,3 kg ≈ 230 pcs |
| Topping seafood | 10 g per pcs (varian seafood) | 1 pack 1 kg = 100 pcs |
| Nampan | 1 nampan = 50 pcs | |

### 6.1 Pemeriksaan tiga lapis (dari laporan harian)
1. **Getok (kg → pcs):** `pcs dibuka ÷ kg oyster terpakai` harus 4–7. Di bawah 4 → alert ("oyster hilang/terbuang di getok").
2. **Plating → jual:** `pcs di nampan − pcs terjual − pcs ditolak − sisa nampan` harus ≈ 0. Selisih → alert ke plating & kasir.
3. **Bahan pendamping:**
   ```
   Mozzarella teoritis = (pcs mozza + pcs seafood mozza) × 10 g
   Topping teoritis    = pcs seafood mozza × 10 g
   Bumbu teoritis      = omzet ÷ 10 juta (pack)
   Jika pemakaian aktual > teoritis + 5%  →  ALERT, TAG PIC & senior
   ```
4. **Cek kasar omzet per kg:** omzet ÷ kg oyster, dibandingkan patokan Rp 100.000/kg (Jawa, disesuaikan untuk Sumatra/Kalimantan). Turun lebih dari 5% → alert.

Selisih yang lewat toleransi 5% masuk ke KPI kelompok "Stok". Jika terbukti lalai, bot mengusulkan denda senilai barang (perlu ACC owner/PIC).

---

## 7. SOP, Absensi & Pembagian Posisi

Ringkasan di bawah. Jadwal lengkap, tag WA, dan penanggung jawab tiap foto ada di **[CHECKLIST-SOP-BOT.md](CHECKLIST-SOP-BOT.md)**.

| Fase SOP | Kapan | Isi laporan |
|---|---|---|
| BAB 2 Persiapan gudang | H-2 Jawa / H-5 Sumatra / H-30 Kalimantan | Barang keluar, koli, bahan beku |
| BAB 3 Loading in | Hari kedatangan | Foto armada & koli, booth depan, gudang belakang, stok awal |
| BAB 4–6 Operasional harian | Tiap hari | Absen, posisi, foto kesiapan, QC, omzet, stock opname, foto closing |
| BAB 7 Loading out | Hari terakhir | Stok akhir, koli kering & dingin, serah terima |
| BAB 8 Pengawasan | Tiap hari | Penilaian harian senior (5 aspek), temuan |

**Posisi kerja:** Kasir (PIC/ditunjuk), Grill/Bakar, Plating, Getok (2 orang). Setiap pagi senior/PIC mengirim pembagian posisi; bot memakai data ini untuk tahu siapa yang di-TAG kalau ada tugas yang belum dikerjakan.

**Alur pengecekan bot:**
1. Batas waktu lewat dan bukti belum ada → bot **TAG penanggung jawab + senior + PIC**.
2. Satu jam setelah di-TAG belum juga dikerjakan → bot mengusulkan **poin minus**.
3. Berulang / ada barang rusak karena lalai → bot mengusulkan **catatan pelanggaran / denda senilai barang**. Semua usulan perlu `#acc` atau `#tolak` dari PIC/owner.

---

## 8. KPI Karyawan — Sistem Poin (maks. 100 poin/bulan)

### 8.1 Pembagian bobot: 60% individu, 40% kelompok
| Komponen | Poin maks. | Jenis | Sumber data |
|---|---|---|---|
| Absensi & ketepatan waktu | 15 | Individu | Absen bot (hadir 1 jam sebelum buka) |
| SOP & jobdesk posisi | 25 | Individu | Checklist foto/laporan sesuai posisi |
| Penilaian harian senior/PIC: attitude, skill, kejujuran, rasa kepemilikan | 20 | Individu | Form BAB 8 bagian I (5 aspek Baik/Perlu perbaikan) |
| Omzet vs target event | 15 | Kelompok | Omzet terverifikasi |
| Ketepatan stok (selisih ≤ 5%) | 10 | Kelompok | Deteksi bagian 6 |
| Kebersihan & komplain pelanggan | 10 | Kelompok | Foto closing, laporan PIC |
| Kinerja tim (pembagian tugas, kecepatan) | 5 | Kelompok | Nilai PIC akhir event |
| **Total** | **100** | 60 individu + 40 kelompok | |

### 8.2 Poin plus & minus
```
Skor bulan = Skor komponen + Poin plus − Poin minus   (dibatasi 0 – 100)
```
| Contoh kejadian | Poin |
|---|---|
| SOP tidak dikerjakan setelah di-TAG | −10 |
| Telat 2x berturut-turut | −5 (+ usulan denda) |
| Lalai sehingga bahan rusak | −10 (+ usulan denda senilai barang) |
| Bantu masak bumbu di gudang | +20 |
| Bantu loading/bongkar muat di luar jadwal | +10 |
| Laporan temuan QC yang mencegah produk buruk terjual | +5 |

Contoh owner: tidak mengerjakan SOP (−10) + bantu masak bumbu (+20) = **selisih +10 poin**.
Daftar poin plus/minus bisa diubah owner kapan saja di Google Sheets.

### 8.3 Contoh perhitungan (Andi, senior, November)
| Bagian | Data | Poin |
|---|---|---|
| Absensi (15) | 22 dari 24 hari tepat waktu | 13,75 |
| SOP & jobdesk (25) | 90% tugas selesai tepat waktu | 22,5 |
| Penilaian senior/PIC (20) | rata-rata 4,5 dari 5 aspek "Baik" | 18 |
| Omzet (15) | capai 100% target | 15 |
| Stok (10) | selisih 3% (dalam toleransi) | 10 |
| Kebersihan & komplain (10) | 1 komplain | 8 |
| Kinerja tim (5) | nilai PIC 4/5 | 4 |
| **Skor komponen** | | **91,25** |
| Poin minus | 1x SOP tidak dikerjakan | −10 |
| Poin plus | 1x bantu masak bumbu | +20 |
| **Skor akhir** | 101,25 → dibatasi | **100** |

---

## 9. Gaji & Bonus

Prinsip owner: **poin = persentase klaim bonus.** 100 poin berarti klaim 100% bonus individu, 80 poin berarti 80%.

### 9.1 Karyawan tetap (senior/junior)
```
Gaji pokok                 tetap per bulan (dibagi ke event sesuai hari kerja untuk laporan laba event)
Kolam bonus bulan          = Total omzet semua event × tarif (1–3%)
Bonus maksimal per orang   = Kolam bonus × (hari kerja orang ÷ total hari kerja semua karyawan tetap)
Bonus diterima             = Bonus maksimal × (Skor poin ÷ 100)
Gaji bulan                 = Gaji pokok + Bonus diterima − Denda yang sudah di-ACC
```
Bonus yang tidak terklaim (karena poin < 100) kembali ke perusahaan.

**Contoh** (omzet sebulan 400 jt, tarif 2% → kolam 8 jt, total hari kerja 6 karyawan = 132 hari):
| Karyawan | Hari kerja | Bonus maksimal | Poin | Bonus diterima |
|---|---|---|---|---|
| A | 24 | 1.454.545 | 100 | 1.454.545 |
| B | 24 | 1.454.545 | 80 | 1.163.636 |
| C | 20 | 1.212.121 | 85 | 1.030.303 |
| D | 22 | 1.333.333 | 70 | 933.333 |
| E | 24 | 1.454.545 | 95 | 1.381.818 |
| F (junior) | 18 | 1.090.909 | 75 | 818.182 |

### 9.2 Daily Worker (DW) — grill/plating/getok
```
Bonus harian dasar: omzet event < 100 jt → 0 | 100–200 jt → 50.000 | ≥ 200 jt → 100.000–150.000
Bonus diterima    = Bonus harian dasar × hari kerja × (Skor poin event ÷ 100)
Gaji DW           = Upah harian × hari kerja + Bonus diterima − Denda yang sudah di-ACC
```

### 9.3 Kasir DW
Kasir mencatat pesanan dan mendorong pelanggan belanja lebih banyak lewat promo, jadi bonusnya dihitung **per hari** dari omzet harian:
| Omzet harian | Bonus |
|---|---|
| ≥ 10 jt | 100.000 |
| ≥ 20 jt | 200.000 |
| ≥ 30 jt | 250.000 |

**Bonus followers Instagram @cheesypenshells:** Rp 50.000 untuk setiap kelipatan penuh 100 followers baru per hari. Contoh: +250 followers = 2 × 50.000 = Rp 100.000; +90 followers = Rp 0.
Bukti: screenshot jumlah followers saat buka dan saat tutup, dikirim ke grup event. Bot membaca angkanya dan menghitung selisih.

---

## 10. Laporan Otomatis

| Kapan | Laporan | Dikirim ke |
|---|---|---|
| Tiap malam | Rekap hari: omzet, pengeluaran, absensi, SOP yang belum beres, alert stok | Grup pengeluaran (keuangan) & grup event (operasional) |
| Akhir event | Laba-rugi event, pemakaian bahan, skor KPI tim | Owner |
| Akhir bulan | Pembukuan bulanan, kas ruko, peringkat poin, **draf slip gaji & bonus** | Owner |
| Kapan saja | `#rekap`, `#stok`, `#poin Andi`, `#gaji Andi` | Owner |

---

## 11. Tahapan Pengerjaan

1. **Tahap 1 – Fondasi & Keuangan:** bot WA, Google Sheets, setup event, pengeluaran & transfer IO, rekap event & bulanan, kas ruko.
2. **Tahap 2 – Stok:** buku gudang, mutasi, HPP, pemeriksaan tiga lapis (bagian 6).
3. **Tahap 3 – SOP & Absensi:** absensi, pembagian posisi, checklist foto dengan TAG otomatis.
4. **Tahap 4 – Poin & Gaji:** skor poin, peringkat, usulan denda, draf gaji & bonus bulanan.

---

## 12. Pertanyaan Terbuka

**Sudah dijawab:**
- Perangkat: laptop menyala selama jam kerja; nomor WA baru khusus bot akan dibeli owner.
- Google Sheets memakai akun cheesypenshells@gmail.com.
- Tanpa AI pembaca foto: semua laporan lewat format teks WhatsApp, harga pengeluaran selalu ditulis.

**Untuk Tahap 3 (SOP):**
3. Bukti SOP (foto booth, cooler, kebersihan): cukup dicek bahwa pesan bertag (mis. `#bersih`) **berisi foto**, tanpa membaca isi fotonya. Setuju?

**Untuk perhitungan:**
4. Bobot KPI pada 8.1 dan daftar poin plus/minus pada 8.2 sudah sesuai?
5. Tarif kolam bonus 1–3%: kapan 1%, 2%, 3%? (usulan: rata-rata omzet event < 100 jt → 1%, 100–200 jt → 2%, > 200 jt → 3%)
6. Bonus kasir: omzet **harian** (bukan total event)? Dan di antara tingkat, misalnya omzet 15 jt, dapat 100 ribu?
7. Daftar nama karyawan tetap + gaji pokok; upah harian DW dan upah harian kasir.
8. Nominal denda telat 2x berturut-turut.
9. HPP mozzarella, saus keju, dan topping per pack. Saus keju dipakai berapa gram per pcs / di menu apa?
10. Mozzarella: SOP BAB 4/5 menulis 10–15 g per pcs, sedangkan owner menyebut 10 g. Patokan resmi yang mana?
