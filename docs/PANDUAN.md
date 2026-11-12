# Panduan Pemakaian Bot (Tahap 1: Pembukuan)

Ketik `#bantuan` di grup mana pun untuk melihat ringkasan perintah.

---

## 1. Membuka event baru

### Cara paling mudah: bot bertanya
1. Buat grup WhatsApp baru, misalnya **Pengeluaran Jambi**, lalu masukkan PIC dan nomor bot.
2. Bot langsung menyapa: *"Grup ini untuk apa?"* Balas **1** (grup pengeluaran event baru).
   Kalau bot tidak menyapa, ketik `#mulai` atau `#eventbaru`.
3. Bot menanyakan 13 hal satu per satu: kota, IO, tanggal, wilayah harga, bagi hasil (balas *ok* untuk 30%), admin, jadwal transfer, jam buka, target, PIC, senior, DW, dan kasir. Balas *-* untuk yang tidak ada.
4. Bot menampilkan ringkasan. Balas **ya** untuk menyimpan, atau nomor pertanyaan untuk mengubahnya (misalnya *5*).
5. Kode event dibuat otomatis, misalnya **JMB26-11** (Jambi, November 2026).

Hanya jawaban owner yang dibaca bot. Ketik **batal** untuk berhenti.

**Grup tim:** masukkan bot ke grup tim, balas **2**, lalu pilih event dari daftar.
**Grup kas ruko:** balas **3**.

### Mengubah data event lewat chat (owner, di grup pengeluaran)
| Contoh | Hasil |
|---|---|
| `#ubah bagi hasil 27` | Bagi hasil jadi 27% |
| `#ubah tanggal 1-16 Nov 2026` | Tanggal event diperpanjang |
| `#ubah admin 750rb` | Biaya admin IO diganti |
| `#ubah jam buka 12.00` | Jam buka booth (patokan absensi) |
| `#tambah DW Rina 100rb` / `#berhenti Joko` | Tim berubah di tengah event |

### Cara lama: satu blok sekaligus
Owner juga tetap bisa mengirim semuanya dalam satu pesan:

```
#event
Kode: JMB26-11
Kota: Jambi
IO: Kepo Market
Tanggal: 1-14 Nov 2026
Wilayah harga: Sumatra
Target omzet: 150jt
Bagi hasil: 30%
Admin: 500rb
Jadwal trf: H+1, Jumat-Minggu ditransfer Senin
Jam buka: 11.00
PIC: Budi
Senior: Andi, Rudi
DW: Joko 120rb, Tono
Kasir: Sari
```

Lalu di **grup tim** event tersebut, owner mengetik: `#daftar event JMB26-11`

---

## 2. Mencatat pengeluaran (owner/PIC, di grup pengeluaran)

Cukup ketik seperti biasa, satu pengeluaran per baris:
```
lalamove 150k
makan malam 120rb cash
ember 2 unit @30rb
```
Bot membalas:
```
✅ Pengeluaran tercatat (JMB26-11)
T0001 lalamove - Rp 150.000 [Transport & Ekspedisi]
T0002 makan malam - Rp 120.000 [Konsumsi, CASH]
T0003 ember 2 unit - Rp 60.000 [Peralatan]
Total pengeluaran event: Rp 330.000
```

- **Format nominal yang dikenali:** `150k`, `150rb`, `150 ribu`, `1,5jt`, `Rp 150.000`, `150000`.
- **Chat biasa tanpa nominal** ("oke pak", "siap") tidak dicatat.
- **Baris "total ..."** diabaikan supaya tidak terhitung dua kali.
- **Laporan kurang lengkap? Bot bertanya balik** ke pengirimnya (orang lain yang menjawab tidak dihitung):
  - `beli sapu` → bot bertanya harganya → balas `25rb`
  - `300rb` saja → bot bertanya untuk apa → balas `lalamove ke venue`
  - `kiriman keju` → bot bertanya berapa pack → balas `10`
  - `kiriman 5 pack` → bot bertanya bahan apa → balas nomor/nama bahan
  - kategori tidak dikenali → bot menawarkan pilihan kategori → balas nomornya
  Balas **batal** kalau ternyata bukan laporan. Pertanyaan kedaluwarsa setelah 1 jam.
- **Uang siapa:** setiap pengeluaran dicatat dibayar pakai uang siapa.
  - Tulis di pesannya: `makan tim 200rb uang mama`, `hotel 300rb pakai uang valen`, `es batu 20rb uang kas`, `(uang saya)`.
  - Kalau tidak ditulis, dianggap **uang orang yang mengirim pesan**.
  - Ubah: `#uang T0012 mama`. Lihat siapa harus diganti berapa: `#penggantian`.
  - Owner mencatat transfer penggantian: `#ganti Valen 500rb` (bukan biaya event).
  - Hasilnya ada di file event (bagian ⑥ Uang Siapa) dan PEMBUKUAN → tab **Penggantian Uang**.
- **Beberapa pengeluaran sekaligus**: satu per baris, atau dalam satu baris dipisah koma: `Listrik 353k, minuman 25 sept 11k, lemon dan softex 24k tanggal 25 sept`. Tambahan pendek di akhir (`, uang mama` / `, cash`) berlaku untuk semuanya. Kata `semua uang valen` (atau `uang valen semua`) di mana pun dalam pesan juga berlaku untuk semua item.
- **Tanggal belanja** (kalau dilaporkan belakangan): tulis saja tanggalnya di baris itu, contoh `makan siang 22 sept 53rb`, `tgl 22/9 bensin 50rb`, `hotel tanggal2-3 okt 236rb` atau `makan karyawan tanggal 26 sore 66rb`. Kalau bulannya tidak ditulis, bot memilih bulan yang masuk masa event.
- **Status event menentukan cara kerja bot** (bot memberi tahu langkahnya setelah event dibuat, dan setiap kali ditulis "rekap" / "mulai input"):
  - **Sudah selesai → mode REKAP DATA LAMA**: grup tim tidak perlu. Semua data dimasukkan di grup pengeluaran dengan tanggalnya: pengeluaran (`hotel 23 sep 350rb uang melia`), omzet (`#omzet 23 sept 12,5jt`, boleh beberapa baris sekaligus), `#trf`, `#potongan`, bahan gudang.
  - **Belum mulai**: catat pengeluaran persiapan; daftarkan grup tim saat event mulai.
  - **Sedang berjalan**: pengeluaran di grup pengeluaran, omzet harian di grup tim.
- **Aturan struk** (berlaku untuk event yang mulai sejak 8 Nov 2026; event yang sudah berjalan seperti Lombok tidak diubah. Untuk karyawan/PIC; input owner sendiri tidak wajib struk):
  - **≥ Rp 100.000 wajib foto struk.** Kirim foto struk dengan caption pengeluarannya (`makan KFC 150rb`), atau reply pesan bot dengan fotonya. Bot membaca struk dan mengecek: nominal ada di struk, tanggal struk dalam masa event, merek/toko sesuai keterangan (KFC ≠ pecel ayam), kategori sesuai (transport grab ≠ struk KFC), dan struk belum pernah dipakai. Lolos → masuk pembukuan dengan tanda 🧾 struk ✓ dan tanggal dari struk.
  - **Tanpa struk atau struk tidak sesuai → ditahan (P0001, P0002, …), belum masuk spreadsheet.** Bot meminta penjelasan di grup. Selesai dengan: kirim struk yang benar, owner reply `acc` (atau `acc semua` / `acc P0001`), atau `batal`.
  - **Batas tanggal transaksi**: hanya dari **2 hari sebelum event mulai s/d 2 hari setelah event selesai** (tanggal di struk, tanggal yang ditulis, atau hari laporan). Di luar itu ditolak, supaya struk lama tidak bisa dimasukkan; hanya owner yang bisa `acc`. Screenshot belanja online wajib menunjukkan **tanggal pesan** (detail pesanan / Waktu Pemesanan), bukan hanya estimasi tiba.
  - **Cash < Rp 100.000 tanpa struk** wajib keterangan jelas. Keterangan umum seperti "belanja" / "makan" ditahan sampai pengirim reply detailnya (beli apa & di mana).
  - `#rekap` menampilkan pengeluaran yang masih menunggu (belum dihitung). Struk yang dipakai tersimpan di tab **Struk** PEMBUKUAN; kolom **Bukti** menunjukkan Struk ✓ / ACC owner / Tanpa struk.
- **Nominal sama dengan catatan lama** (≥ Rp 50.000, kategori/keterangan mirip): bot belum mencatat dan menunjukkan catatan lama beserta tanggalnya. Kirim **foto bukti trf/struk**: bot membaca nominal & tanggalnya. Kalau tanggalnya sama dengan catatan lama → tidak dicatat lagi (dobel); kalau beda → dicatat dengan tanggal di bukti. Bisa juga balas `catat` (memang beda) atau `batal` (dobel).
- **Koreksi cukup dengan reply** pesan bot "Pengeluaran tercatat": `uang valen`, `batal`, `tanggal 3 okt`, `masuk konsumsi`, atau (kalau isinya satu catatan) `harusnya 50rb`. Bot langsung mengubah dan mengirim konfirmasi. Pesan singkat seperti `Uang valen` yang dikirim tanpa reply dalam 10 menit setelah mencatat juga berlaku untuk catatan terakhir pengirim.
- **Harga wajib ditulis.** Bot tidak membaca isi foto. Foto bukti boleh tetap dikirim untuk arsip, tapi harga ditulis di caption, misalnya `lalamove 150rb`. Foto tanpa harga akan diminta ditulis ulang.
- **Salah catat:** `#batal T0002`. Bisa dilakukan owner atau orang yang mengirim.
- **Ganti kategori:** `#kategori T0001 Transport`.

Kategori: Oyster, Gaji & Upah, Konsumsi, Penginapan, Transport & Ekspedisi, Utilitas Ruko, Bahan Operasional, Peralatan, Lain-lain.

---

## 3. Transfer dari IO (grup pengeluaran)

| Kejadian | Ketik |
|---|---|
| Omzet ditransfer IO | `#trf 7.500.000 omzet 3 Nov` |
| IO memotong listrik/air/gas/galon | `#potongan listrik 250rb` (bisa beberapa baris) |

Bot menghitung **perkiraan transfer**:
`omzet − bagi hasil − admin − potongan listrik/air/gas/galon`.

Jadwal yang dipakai: **H+1**, sedangkan omzet Jumat, Sabtu, dan Minggu dibayar **Senin**. Kalau di blok `#event` ditulis "setelah event selesai", semuanya dijadwalkan H+1 setelah event berakhir. Setiap pagi jam 10.00 bot mengingatkan kalau ada transfer yang sudah jatuh tempo tapi belum dicatat masuk.

---

## 4. Laporan omzet harian (PIC/kasir, di grup tim)

Pakai format SOP BAB 6 bagian H:
```
#omzet
EVENT/KOTA: Jambi
OMZET TERVERIFIKASI: Rp 12.500.000
JUMLAH TRANSAKSI: 85
SELISIH / REFUND / KOREKSI: 0
```
Bisa juga singkat: `#omzet 12,5jt`

- **Laporan sebelum jam 05.00 pagi** dihitung sebagai omzet hari sebelumnya (closing lewat tengah malam).
- **Laporan dikirim ulang** untuk tanggal yang sama menggantikan laporan sebelumnya.
- **Omzet tanggal lain:** tambahkan baris `TANGGAL: 2 Nov 2026`.
- **Di grup tim** bot hanya menampilkan omzet dan pencapaian target. Rincian bagi hasil hanya muncul di grup pengeluaran.
- **Pengingat:** jam 23.00 bot mengingatkan di grup tim kalau laporan omzet hari itu belum masuk.

---

## 5. Rekap

| Perintah | Di mana | Isi |
|---|---|---|
| `#rekap` | Grup pengeluaran | Laba-rugi sementara event: omzet, potongan IO, transfer masuk, piutang, pengeluaran per kategori |
| `#rekap` | Grup ruko | Rekap bulan ini (owner) |
| `#rekap bulan 2026-11` | Grup pengeluaran/ruko | Rekap bulan tertentu: semua event + biaya ruko (owner) |

Selain itu, setiap malam jam 23.30 rekap event dikirim otomatis ke grup pengeluaran. Ini berlaku sampai 7 hari setelah event selesai, atau sampai owner mengetik `#selesai`.

---

## 6. Buku kas ruko (owner, di grup kas ruko)

Biaya ruko dicatat terpisah dari event:
```
token listrik 850rb
air PDAM 150rb
gaji Andi 2jt
sewa ruko 5jt
```

---

## 7. Google Sheets

Semua data bisa dilihat dan dikoreksi langsung di spreadsheet **CPS Kantor AI**:

| Tab | Isi |
|---|---|
| `Event` | Data setiap event: bagi hasil, admin, jadwal transfer, dan lainnya |
| `Transaksi` | Semua pengeluaran (merah muda), transfer masuk dari IO (hijau), dan potongan IO (kuning). Kolom **Status**: OK / BATAL (abu-abu dicoret) |
| `Omzet` | Laporan omzet harian |
| `Grup` | Grup WhatsApp yang terdaftar |

Aturan saat mengoreksi data di Sheets:
- Boleh mengubah isi sel. Arahkan jari/kursor ke judul kolom untuk melihat keterangan kolom tersebut.
- **Jangan mengubah judul kolom** (baris pertama).
- Tulis tanggal dengan format `2026-11-03`.
- Untuk membatalkan catatan, ganti `status` menjadi `BATAL`. Jangan menghapus baris.

Perubahan di Sheets terbaca bot paling lambat 30 detik kemudian.

---

## 8. Tim, bahan baku, dan porsi gratis (untuk sheet Main)

### Tim event
Saat membuat event, tambahkan baris tim di blok `#event`:
```
Senior: Andi, Rudi
DW: Joko 120rb, Tono
Kasir: Sari
```
Upah DW dan kasir standar **Rp 100.000/hari**. Tulis angka setelah nama kalau berbeda.

| Keperluan | Ketik (di grup pengeluaran) |
|---|---|
| Lihat tim | `#tim` |
| Tambah orang di tengah event | `#tambah DW Rina 100rb` (peran: PIC / Tetap / DW / Kasir) |
| Karyawan berhenti / menghilang | `#berhenti Joko` (hari kerja terakhir = kemarin) atau `#berhenti Joko 9 Nov` |

### Bahan baku dari gudang
Satu bahan per baris. Bisa dikirim di grup tim atau grup pengeluaran.
```
#keluar
mozzarella 20 pack
bumbu garlic 5 pack
oyster 100 kg
```
- Bisa juga ditulis dengan kalimat biasa tanpa harga, contoh: `kiriman 10 pack keju`, `restock bumbu garlic 2 pack`, `sisa 3 pack keju dikembalikan`.
- **Restock** = barang yang datang ke booth di tengah event. Kata *restock*, *datang*, atau *tiba* dicatat sebagai restock, contoh: `barang datang 5 pack keju`.
- `#restock ...` untuk tambahan di tengah event.
- `#kembali ...` untuk sisa yang dikembalikan ke gudang. **Pack yang sudah dibuka dianggap habis**, jadi tulis pack utuh saja.

Bahan yang dikenali dan harganya ada di tab **Harga Bahan** (bisa diubah).

### Porsi gratis
`#gratis 3 porsi mozzarella isi 4 untuk @influencer` → dicatat 12 pcs, dinilai dengan harga jual sesuai wilayah (tab **Harga Menu**).
**Budget porsi gratis Rp 500.000 per event.** Setiap kali `#gratis`, bot membalas sisa budget, dan memberi peringatan ⚠️ kalau sudah terlewati.

### Kategori pengeluaran otomatis
| Contoh yang diketik | Masuk kategori |
|---|---|
| `sumpit 2 pack @15rb`, `plastik 20rb`, `sarung tangan 30rb` | Barang kering **konsumtif** |
| `sapu 25rb`, `etalase 500rb`, `kompor 300rb` | Barang kering **non-konsumtif ⚠️ kelalaian** (barang yang seharusnya dibawa) |
| `endorse @makanjambi 500rb` | Iklan & endorse |
| `obat sakit Andi 50rb`, `ganti rugi gelas 30rb` | Tak terduga |
| `hotel 350rb x 3 malam` | Penginapan (otomatis dikali 3) |
| `makan siang tim 180rb` | Konsumsi (dibandingkan dengan budget makan) |

---

## 9. Susunan file di Google Drive

Semua file bot ada di **PROJECT CHEESY PEN SHELLS > 0. KANTOR AI (BOT)**:

| File | Isi |
|---|---|
| **PEMBUKUAN** | Tab **Rekap Event**: satu baris per event, berisi tim, omzet, dibayar ke IO, semua biaya, gaji, fee PIC, **laba bersih**, dan link ke file event. Tab **Gaji per Event**: rincian per orang. Tab lain adalah data mentah bot. |
| **EVENT** (folder) | Satu spreadsheet per event, misalnya *LOMBOK - JANGKRIK (24 Sep - 11 Okt 2026)*. Tab **Ringkasan** membedah untung/rugi (omzet harian + grafik, biaya, budget makan, tim & gaji, iklan, porsi gratis, sisa bahan, uang siapa). Lalu **satu tab per kategori** (Transport, Penginapan, Konsumsi, Bahan Baku, Bahan Operasional, BK Konsumtif, BK Non-Konsumtif, Admin & Sewa, Iklan, Tak Terduga, Gaji & Upah, Lain-lain) dengan **TOTAL di baris paling atas**, tab **Transfer & Penggantian**, dan tab **Semua Transaksi**. |
| **0. INPUT EVENT LAMA (manual)** | Untuk mengisi data event sebelumnya secara manual (tab Event, Omzet Harian, Pengeluaran, Transfer & Potongan IO, Tim, Bahan Baku, Porsi Gratis). Bot menghitungnya dengan cara yang sama, lalu hasilnya muncul di PEMBUKUAN dan file event. Petunjuk ada di tab **0. Cara Isi**. |
| **GUDANG** | Stok bahan baku di gudang (segera dibuat). |
| **KPI KARYAWAN** | KPI, bonus, dan perhitungan detail (segera dibuat). |

**File event dibuat otomatis.** Setiap ada event baru, bot memakai salah satu file bernama **"(kosong) cadangan event"** di folder EVENT, lalu mengganti namanya. Kalau file cadangan habis, buat spreadsheet kosong baru di folder EVENT dan beri nama **(kosong)**.

**Fee PIC** = 25% dari laba bersih, dikurangi sesuai kehadiran owner. Ketik di grup pengeluaran:
`#owner tidak` (25%) | `#owner 1 hari` (20%) | `#owner setengah` (15%) | `#owner penuh` (10%), atau `#owner 4 hari`.

Angka diperbarui bot paling lambat 30 detik setelah ada laporan baru, selama bot menyala.


## KPI karyawan

**Skor maksimal 100 poin per bulan** = 60 individu + 40 kelompok, lalu + poin plus − poin minus (dibatasi 0–100). Poin = persen klaim bonus (skor 80 → 80% bonus maksimal).

| Bagian | Poin | Sumber |
|---|---|---|
| Absen (20% individu) | 12 | Nilai PIC 1–5 |
| Performa kinerja (40%) | 24 | Nilai PIC 1–5 |
| Attitude (20%) | 12 | Nilai PIC 1–5 |
| Karir (20%) | 12 | Nilai PIC 1–5 |
| Omzet vs target | 15 | Omzet event ÷ target |
| Ketepatan stok | 10 | (deteksi stok menyusul; sementara penuh) |
| Kebersihan & komplain | 10 | −2 per komplain pelanggan (QR booth menyusul) |
| Kinerja tim | 5 | Nilai PIC 1–5 |

- **Penilaian PIC:** sehari setelah event selesai (jam 10.00) bot chat pribadi ke PIC dan menanyakan tiap anggota tim satu per satu: balas 4 angka `5 4 4 3` (absen, kinerja, attitude, karir), boleh plus catatan, `lewati`, atau `batal`; terakhir nilai kinerja tim `4`. Syarat: nama & nomor WA PIC ada di tab **Karyawan** PEMBUKUAN. Kalau tidak ada, bot mengingatkan di grup pengeluaran: ketik `#nilai`.
- **Langsung:** `#nilai Dena 5 4 4 3`, `#nilai tim 4`, untuk event lama `#nilai BAL26-09`.
- **Poin plus/minus (owner):** `#poin Dena +20 bantu masak bumbu`, `#poin Dena -10 SOP tidak dikerjakan`, batalkan `#poinbatal K0001`.
- **Lihat (owner):** `#kpi` (peringkat bulan terakhir), `#kpi Dena`, `#kpi 2026-09`. Karyawan nanti melihat nilainya sendiri lewat QR kartu + PIN.
- **File KPI KARYAWAN** di Drive diperbarui otomatis: Peringkat & Bonus, Nilai per Event, Riwayat Poin, Cara Hitung.
- **Tab Karyawan** (PEMBUKUAN): isi kode, nama (sama dengan nama di tim event), nomor WA, peran, keahlian, foto, mulai kerja, status.


## Pengiriman & stok awal event

Setelah grup tim didaftarkan (`#daftar event KODE` atau pilih 2 saat bot masuk grup), bot langsung bertanya (siapa pun boleh menjawab):
1. Penanggung jawab pengiriman ke lokasi
2. Dikirim pakai apa: 1 = Truk, 2 = Kereta (transit), 3 = lainnya
3. Jumlah koli bahan kering
4. Jumlah koli bahan baku (0 = pertanyaan 5 dilewati)
5. Isi bahan baku, contoh `keju 5 balok, bumbu garlic 3 pack, oyster 100 kg`

Bot menampilkan ringkasan; balas `ya` untuk menyimpan, angka 1–5 untuk mengubah, `batal` untuk berhenti. Mulai ulang kapan saja dengan `#kirim` (atau `#stokawal`).

- Bahan baku tercatat sebagai **keluar dari gudang** → masuk pembukuan event sebagai *Bahan baku (dari gudang)* dengan harga di tab **Harga Bahan** (contoh keju 5 × harga per balok/pack).
- **Harga tidak ditampilkan di grup mana pun.** Grup tim dan grup pengeluaran hanya mendapat jumlah barang; nilai rupiahnya hanya masuk pembukuan (spreadsheet).
- Bahan yang belum ada di tab Harga Bahan (misalnya packaging) tetap dicatat di tab **Pengiriman**, tapi belum dihitung nilainya.
- Akhir event: laporkan sisa (`sisa keju 2 balok`); sisa mengurangi biaya bahan baku.
