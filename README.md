# 🌏 LinguaTutor AI

Website tutor bahasa asing berbasis AI (Claude) untuk penutur Bahasa Indonesia.

## 5 Mode Tutor

| Tutor | Fungsi |
|---|---|
| **Teman Ngobrol** | Ngobrol bebas dalam bahasa target, kesalahan dikoreksi dengan lembut di akhir balasan |
| **Cek Grammar** | Kirim kalimat → dapat versi benar, daftar kesalahan + alasannya, dan versi yang lebih natural |
| **Roleplay Situasi** | Latihan situasi nyata (restoran, bandara, wawancara kerja, dll.) dengan tips di tiap giliran |
| **Kuis Kosakata** | Kuis per topik, satu soal sekali jalan, lengkap dengan skor dan contoh kalimat |
| **Penerjemah + Penjelasan** | Terjemahan formal/santai, pecahan kata, dan catatan grammar/budaya |

Bahasa: Inggris, Jepang, Korea, Mandarin, Arab, Prancis, Jerman, Spanyol — dengan level Pemula / Menengah / Mahir.
Untuk huruf non-Latin, tutor menambahkan romanisasi (untuk level pemula & menengah).

## 🗣️ Bisa Teks, Bisa Ngobrol (Suara)

- **🎤 Mikrofon** — tekan, lalu bicara. Ucapanmu otomatis jadi teks (bisa diedit dulu sebelum dikirim).
- **Tombol EN / ID** di sebelah mikrofon — pilih bahasa yang kamu ucapkan: bahasa target atau Bahasa Indonesia.
- **🔊 di setiap balasan AI** — dengarkan pengucapannya. Kalimat bahasa asing dibacakan dengan suara penutur bahasa itu, penjelasan Bahasa Indonesia dengan suara Indonesia.
- **Mode Suara** (di sidebar) — ngobrol tanpa mengetik: kamu bicara → AI menjawab dengan suara → mikrofon menyala lagi otomatis. Balasan AI juga dibuat lebih singkat supaya enak didengar.
- **Kecepatan suara AI** bisa diatur (lebih lambat cocok untuk pemula).

### 🤖 Mode Robot (simulasi ngobrol dengan AI)

Tekan **"🤖 Ngobrol dengan Robot"** di atas chat. Muncul karakter robot "Robo" layar penuh, seperti telepon dengan AI:
- Robot menyapa, lalu mikrofon otomatis menyala.
- Robot **beranimasi sesuai keadaan**: cincin hijau saat mendengar, antena berkedip & mata melirik saat berpikir, mulut bergerak saat bicara.
- Ucapanmu dan ucapan robot tampil sebagai **subtitle**.
- Tekan 🎤 untuk bicara / memotong robot, **📞 Akhiri** (atau Esc) untuk kembali ke chat. Riwayat percakapan tetap tersimpan di chat.
- Mode Robot memakai tutor, bahasa, dan level yang sedang dipilih.

Fitur suara memakai Web Speech API bawaan browser — **gratis, tanpa API key tambahan**.
Mikrofon berfungsi di **Chrome, Edge, dan Safari** (Firefox belum mendukung; di Firefox tetap bisa mendengar suara AI).
Browser hanya mengizinkan mikrofon di `http://localhost` atau situs `https://`.
Kualitas dan pilihan suara tergantung suara yang terpasang di perangkat/browser.

## Cara Menjalankan

Butuh Node.js 20+ dan API key Anthropic (https://platform.claude.com).

```bash
npm install
cp .env.example .env      # lalu isi ANTHROPIC_API_KEY
npm start                 # buka http://localhost:3000
```

## Struktur

- `server.js` — server Node (tanpa framework), endpoint `/api/chat` yang men-stream jawaban AI
- `tutors.js` — definisi 5 mode tutor (system prompt). **Tambah/ubah tutor di sini.**
- `public/` — tampilan web (HTML/CSS/JS biasa, mendukung mode gelap dan HP)
- `public/voice.js` — fitur suara (ucapan → teks, teks → suara)
- `public/robot.js` — karakter robot animasi untuk Mode Robot

## Catatan Teknis

- Model: `claude-opus-5-5` dengan `effort: "low"` supaya balasan chat cepat.
- Fallback otomatis di sisi server Anthropic jika model menolak permintaan.
- Riwayat percakapan disimpan di browser (hilang saat halaman di-refresh), maksimal 40 pesan per request.
