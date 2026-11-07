# Panduan Pemakaian Bot (Tahap 1: Pembukuan)

Ketik `#bantuan` di grup mana pun untuk melihat ringkasan perintah.

---

## 1. Membuka event baru (owner, di grup pengeluaran)

Buat grup WhatsApp baru, misalnya **Pengeluaran Jambi**, berisi owner, PIC, dan nomor bot. Lalu kirim:

```
#event
Kode: JMB26-11
Kota: Jambi
IO: Kepo Market
Tanggal: 1-14 Nov 2026
Wilayah harga: Sumatra
Target omzet: 150jt
Bagi hasil: 27%
Admin: 500rb
Jadwal trf: H+1, Jumat-Minggu ditransfer Senin
Jam buka: 11.00
PIC: Budi
Senior: Andi, Rudi
DW: Joko, Tono
Kasir: Budi
```

- **Wajib:** Kode, Kota, IO, Tanggal. Baris lain boleh dikosongkan atau dikirim belakangan.
- **Jadwal trf:** tulis `setelah event selesai` kalau IO mentransfer sekali di akhir.
- **Mengubah data:** kirim lagi blok `#event` dengan kode yang sama.

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
- `#restock ...` untuk tambahan di tengah event.
- `#kembali ...` untuk sisa yang dikembalikan ke gudang. **Pack yang sudah dibuka dianggap habis**, jadi tulis pack utuh saja.

Bahan yang dikenali dan harganya ada di tab **Harga Bahan** (bisa diubah).

### Porsi gratis
`#gratis 3 porsi mozzarella isi 4 untuk @influencer` → dicatat 12 pcs, dinilai dengan harga jual sesuai wilayah (tab **Harga Menu**).

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

## 9. Sheet Main

Tab **Main** (paling kiri) membedah satu event: untung atau rugi.
1. Pilih kode event di **kotak kuning** (sel C2).
2. Semua tabel terisi otomatis: ringkasan laba/rugi, omzet harian + grafik, rincian biaya, budget makan, tim & gaji, iklan, porsi gratis, dan sisa bahan baku.

Angka diperbarui oleh bot paling lambat 30 detik setelah ada laporan baru, selama bot menyala.
