# Produksi Video dengan AI: Proses Lengkap
_Riset 8 Nov 2026. Harga dari blog pihak ketiga, **cek halaman harga resmi sebelum bayar**._

## 1. Tiga jenis video yang bisa dibuat
| Jenis | Contoh | Wajah George? | Alat |
|---|---|---|---|
| **A. Avatar AI (digital twin)** | George "ngomong" ke kamera tanpa syuting | ✅ dari 1x rekam | HeyGen, Captions, Synthesia |
| **B. Video generatif (sinematik / animasi)** | Oyster meledak keju slow-mo, adegan masa lalu, animasi kartun | Opsional (dari foto) | Kling, Veo, Runway (via fal.ai) |
| **C. Motion graphic / teks** | Teaser angka -Rp404 jt, poster bergerak, subtitle | ❌ | **Claude langsung (ffmpeg)**, Canva, CapCut |

👉 **Contoh jenis C sudah jadi:** `konten/demo/teaser-rugi-404-juta.mp4` (12 detik, 9:16).
Dibuat 100% oleh Claude di server ini. Tinggal tambah musik trending di Instagram.

## 2. "Cukup setor wajah": yang sebenarnya dibutuhkan
Untuk avatar yang meyakinkan (HeyGen / Captions), satu kali rekam:
- **Video 2–5 menit** ngomong ke kamera, HP di tripod, cahaya dari depan (jendela),
  background rapi, tidak ada orang lewat, mic clip-on.
- Ngomong natural, ada jeda diam & senyum sebentar (untuk "idle").
- **Video consent** (platform minta kamu baca kalimat izin, ini wajib & bagus: mencegah
  orang lain bikin avatar wajahmu).
- **Rekam suara** 1–3 menit bahasa Indonesia gaya kamu (untuk voice clone).
- Bagus juga: 10–20 foto wajah berbagai sudut (untuk video generatif jenis B).

## 3. Alur produksi (pipeline)
```
George: cerita (chat/voice note)
   ↓
Claude: script + hook + shot list + teks layar + caption
   ↓
 ┌─────────────── pilih jalur ───────────────┐
 │ Real (syuting HP)  │ Avatar AI   │ Generatif / Motion │
 │ George rekam       │ HeyGen API  │ Kling/Veo + ffmpeg │
 └────────────────────┴─────────────┴────────────────────┘
   ↓
Claude: rakit (ffmpeg): potong, subtitle, logo, cover, format 9:16
   ↓
George: cek di HP → tambah musik trending di IG → posting
   ↓
Claude: baca insight → perbaiki batch berikutnya
```

## 4. Supaya Claude bisa "bikin video" sendiri (bukan cuma script)
Claude bisa memanggil layanan AI video lewat API dari server ini, lalu merakit hasilnya.
Yang dibutuhkan dari kamu:
1. **Akun HeyGen** (avatar) → buat digital twin di aplikasinya, lalu buat **API key**.
2. **Akun fal.ai** (satu kunci untuk Kling / Veo / Runway, dll) → isi saldo kecil (mis. $10).
3. Kasih tahu Claude → Claude minta kuncinya lewat **form aman** (jangan paste di chat).
4. **Google Drive** connector → tempat kamu setor video mentah & ambil hasil jadi.

Perkiraan biaya (bisa berubah):
| Layanan | Kisaran |
|---|---|
| HeyGen Creator (web) | ±$24–29/bln |
| Captions Max (HP, ada twin) | ±$25/bln |
| Kling via API | ±$0,07–0,14 per detik video |
| Veo Lite/Fast | ±$0,03–0,12 per detik |
| Motion graphic (ffmpeg, Claude) | gratis |

Contoh: 1 reel 30 detik pakai 10 detik klip generatif Kling ≈ **$1** (±Rp16 rb).

## 5. ⚠️ Aturan penting (jangan dilewati)
- **Instagram 2026:** konten AI bisa diberi label **"AI info"**. Profil yang personanya AI tapi
  tidak dilabel bisa **diturunkan jangkauannya**. Wajah asli kamu + bantuan AI = aman, tapi
  **selalu centang label AI** kalau videonya avatar/generatif.
- **Brand kamu = "asli, dari nol, bersama Tuhan".** Kalau semua video avatar AI, orang bisa
  merasa dibohongi, dan itu merusak inti brand. Aturan saya:
  - Cerita emosional & kesaksian iman → **WAJIB rekam asli**.
  - Tips, pengumuman, promo, versi bahasa lain, B-roll, animasi masa lalu → **boleh AI**.
- Jangan pernah pakai wajah/suara orang lain (influencer, klien) tanpa izin tertulis.
