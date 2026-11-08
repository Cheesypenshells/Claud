# ⚙️ Sistem: George x Claude
Sistem ini dibuat supaya **George cukup kasih target, cerita, dan rekaman**. Sisanya dikerjakan Claude.

## Komponen
| Komponen | Lokasi | Fungsi |
|---|---|---|
| Rencana & target | `00-RENCANA-INDUK.md`, `data/targets.json` | Target per akun & milestone |
| Pelacak angka | `data/metrics.csv` | 1 baris per akun tiap Senin (dari screenshot insight) |
| Laporan progres | `python3 tools/studio.py progress` → `laporan/progres-terbaru.md` | On track / tertinggal + butuh berapa follower/hari |
| Mesin video | `tools/studio.py` + `produksi/` | Spec teks + bahan → video 9:16 siap upload |
| Kalender | `konten/kalender-nov-des-2026.md` | Tema mingguan sampai 31 Des |
| Paket mingguan | `konten/minggu-XX-*.md` | Script, caption, jadwal, daftar rekam |
| Gaya visual | `konten/09-gaya-editorial.md` | Aturan look editorial B&W + prompt AI |
| Pengingat | Tiap **Senin 09.47 WIB** | Claude minta data → bikin paket minggu itu |

## Siklus mingguan
```
SENIN  George: kirim screenshot insight + 1 cerita + info kota
       Claude: isi data/metrics.csv → laporan progres → paket minggu ini
SELASA George: rekam (±2 jam) → kirim file asli (chat / Google Drive)
RABU   Claude: rakit video (studio.py) → kirim hasil
KAMIS  George: cek, jadwalkan upload 19.00 WIB
TIAP HARI George: balas komen & DM 15 menit
```

## Yang George kirim (cukup ini)
1. **Screenshot**: Dasbor → Insight (tayangan, pengikut baru) untuk 2 akun + 3 reel teratas
2. **Cerita**: voice note diketik / chat bebas
3. **File asli** rekaman (bukan screenshot, bukan hasil download IG)

## Batasan
- Claude tidak bisa posting/menjadwalkan ke IG langsung, tidak bisa menonton video/mendengar audio.
- Klip AI realistis diberi label AI; tidak ada "pencapaian palsu" (lihat `konten/09-gaya-editorial.md`).
