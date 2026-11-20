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

## Catatan Teknis

- Model: `claude-opus-5-5` dengan `effort: "low"` supaya balasan chat cepat.
- Fallback otomatis di sisi server Anthropic jika model menolak permintaan.
- Riwayat percakapan disimpan di browser (hilang saat halaman di-refresh), maksimal 40 pesan per request.
