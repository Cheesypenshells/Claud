# Checklist SOP untuk Bot

Terjemahan SOP Cheesy Pen Shells BAB 1–8 menjadi tugas yang bisa dicek bot di grup WhatsApp.
Setiap tugas punya: **tag WA**, **bukti**, **batas waktu**, dan **penanggung jawab** (yang di-TAG kalau belum ada).

Patokan waktu (contoh jam buka 11.00):
- `B` = jam buka booth
- `T` = jam tutup booth

---

## A. Persiapan Gudang — BAB 2 (grup `Gudang Pusat`)

Mulai **H-2 (Jawa) / H-5 (Sumatra) / H-30 (Kalimantan)**.

| Tag | Bukti | Batas | Penanggung jawab |
|---|---|---|---|
| `#keluar` | Format `[CPS \| BARANG KELUAR \| KODE EVENT]` + foto checklist, koli, label, bahan beku & suhu | Sebelum armada berangkat | Tim packing / senior |
| `#acc` | Balasan "ACC - sesuai daftar" atau "ACC dengan catatan" | Sebelum armada berangkat | PIC + senior |

Bot mengecek:
- Jumlah koli = kering + beku.
- Bahan beku dicatat dengan satuan baku: oyster kg, mozzarella pack 2,3 kg, bumbu pack 1,5 kg, saus keju pack 1 kg.
- Stok gudang dikurangi otomatis.

---

## B. Loading In — BAB 3 (grup `Event <Kota>`)

| Tag | Bukti foto wajib | Batas | Penanggung jawab |
|---|---|---|---|
| `#tiba` | Armada, muatan, seluruh koli, kerusakan (jika ada) + jam tiba | Saat barang tiba | Senior gudang belakang |
| `#booth` | Booth keseluruhan, area grill, plating, lampu, etalase | Selesai rakit | Senior booth depan |
| `#gudang` | Freezer, label koli, stok awal, kondisi bahan | Selesai tata | Senior gudang belakang |
| `#stokawal` | Angka stok awal per bahan (format bagian D) | Selesai tata | Senior gudang belakang |
| `#acc` | ACC PIC + senior (8 poin pemeriksaan akhir BAB 3) | Sebelum buka hari pertama | PIC |

Bot membandingkan koli yang tiba dengan `#keluar` dari gudang. Selisih → TAG PIC.

---

## C. Operasional Harian — BAB 4, 5, 6, 8 (grup `Event <Kota>`)

### C.1 Sebelum buka
| Tag | Bukti | Batas | Penanggung jawab |
|---|---|---|---|
| `#absen` | Foto tim di booth; tiap orang ketik `#masuk` | **B − 1 jam** | Masing-masing karyawan |
| `#posisi` | Daftar posisi hari ini: Kasir, Grill, Plating, Getok 1, Getok 2 | B − 1 jam | Senior / PIC |
| `#grill` | Grill, torch, gas, bumbu siap + tampak depan booth + display cangkang | B − 15 menit | Tim grill |
| `#cooler` | Cooler box berisi es cukup, tidak terendam air lelehan | B − 15 menit | Tim getok |
| `#nampan` | 10 nampan di freezer (7 mozza / 1 seafood / 2 garlic) | B − 15 menit | Tim plating |
| `#followers` | Screenshot jumlah followers IG saat buka | B | Kasir |

### C.2 Selama operasional
| Tag | Bukti | Batas | Penanggung jawab |
|---|---|---|---|
| `#temuan` | Foto + jenis temuan (serpihan / bau / busuk / alat rusak / komplain) + tindakan | **Segera**, jangan tunggu closing | Yang menemukan |
| `#restock` | Bahan + jumlah yang ditambah | Saat restock | Senior gudang belakang |

Bot meneruskan `#temuan` keamanan pangan langsung ke PIC dan owner.

### C.3 Setelah tutup
| Tag | Bukti | Batas | Penanggung jawab |
|---|---|---|---|
| `#omzet` | Format ringkasan harian BAB 6-H + **pcs per menu** + screenshot rekap aplikasi pembayaran | T + 1 jam | Kasir |
| `#followers` | Screenshot jumlah followers IG saat tutup | T + 1 jam | Kasir |
| `#stok` | Stock opname format bagian D + foto stok fisik | T + 1 jam | Tim plating, diperiksa senior |
| `#bersih` | Foto area depan, grill, wastafel, cooler box sudah dikuras | T + 1 jam | Grill, plating, getok (sesuai area) |
| `#pulang` | Tiap orang ketik `#pulang` | Saat pulang | Masing-masing karyawan |
| `#nilai` | Penilaian harian 5 aspek per orang (BAB 8-I) | T + 2 jam | Senior |
| `#acc` | ACC PIC atas laporan hari ini | T + 2 jam | PIC |

### Format penilaian harian senior (`#nilai`)
Urutan aspek: Kehadiran, Kebersihan & keamanan pangan, Ketelitian/kualitas, Kecepatan & kerja sama, Kejujuran & pelaporan.
`B` = Baik, `P` = Perlu perbaikan.
```
#nilai
Joko B B P B B
Tono B B B B B
Andi B B B B B catatan: bantu getok saat ramai
```

---

## D. Format Stock Opname (`#stokawal`, `#stok`, `#restock`)

Mengikuti form BAB 6-E. Satuan wajib konsisten.
```
#stok
Oyster (kg): awal 100 | masuk 0 | terpakai 18 | rusak 0,5 | akhir 81,5
Mozzarella (pack): awal 20 | masuk 0 | terpakai 1,5 | rusak 0 | akhir 18,5
Bumbu (pack): awal 10 | masuk 0 | terpakai 0,5 | rusak 0 | akhir 9,5
Saus keju (pack): ...
Topping seafood (pack): ...
Nampan dibuat: mozza 4 | seafood 1 | garlic 1
Pcs ditolak QC: 6
Restock besok: ...
```
Bot memeriksa:
- `awal + masuk − terpakai − rusak = akhir`.
- Stok akhir hari ini = stok awal besok.
- Pemakaian vs teoritis (lihat Rancangan bagian 6).

---

## E. Loading Out — BAB 7 (grup `Event <Kota>` + `Gudang Pusat`)

| Tag | Bukti | Batas | Penanggung jawab |
|---|---|---|---|
| `#stokakhir` | Stock opname akhir + foto stok dingin per kelompok | Sebelum bongkar | Tim stok / senior |
| `#bongkar` | Foto booth, area depan-belakang, peralatan, freezer sebelum dikemas | Sebelum bongkar | Senior |
| `#koli` | Jumlah koli kering per kategori + koli dingin + foto label | Sebelum muat | Senior |
| `#kirim` | Nama sopir/ekspedisi, nomor kendaraan, jam berangkat, tujuan, foto muatan | Saat berangkat | PIC |
| `#terima` | Hitung ulang di tujuan (kota berikutnya / gudang Jakarta) | Saat barang tiba | Penerima |

Bot memindahkan sisa stok ke event berikutnya atau mengembalikannya ke saldo gudang. Pemakaian event dihitung final saat `#terima`.

---

## F. Aturan Eskalasi Bot

```
Batas waktu lewat, bukti belum ada
  └─► TAG penanggung jawab + senior   "@Joko foto #cooler belum masuk (batas 10.45)"
       └─► +1 jam belum ada
            └─► TAG PIC, usulan poin −10 ke PIC  →  PIC balas #acc / #tolak
                 └─► berulang / ada barang rusak karena lalai
                      └─► usulan catatan pelanggaran / denda senilai barang  →  owner balas #acc / #tolak
```
Sesuai SOP BAB 4 dan BAB 8, bot **tidak menjatuhkan sanksi sendiri**. Bot hanya mencatat fakta dan mengusulkan. Karyawan diberi kesempatan klarifikasi sebelum PIC/owner memutuskan.

---

## G. Catatan dari Pembacaan SOP

1. **Denda:** BAB 8 menyatakan tidak ada denda tanpa dasar hukum yang sah. Supaya denda bisa diterapkan, aturan denda (telat, kelalaian bahan) sebaiknya **dituliskan dalam perjanjian kerja / peraturan perusahaan yang ditandatangani karyawan**.
2. **Takaran mozzarella:** BAB 4/5 menulis 10–15 g, owner menyebut 10 g. Perlu satu angka resmi untuk deteksi stok.
3. **Takaran bumbu:** SOP menulis ±1 sendok teh per oyster, owner menyebut 1 pack per Rp 10 juta omzet. Bot memakai patokan owner.
4. **Kasir non-tunai saja** (BAB 6), jadi omzet bisa dicocokkan dengan rekap aplikasi pembayaran dan transfer IO.
5. Status semua BAB masih **draft / belum disahkan**. Checklist ini bisa diperbarui setelah SOP disahkan.
