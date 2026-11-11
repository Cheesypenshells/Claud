# Lessons learned

Append-only, satu baris per pelajaran, yang terbaru di bawah. Rangkum kalau lebih dari ~60 entri.
Format: `- [YYYY-MM-DD] [kategori] Pelajaran → tindakan`

- [2026-11-11] [komunikasi] User nggak suka ditanya hal kecil → putuskan sendiri, lapor di akhir.
- [2026-11-11] [file] Upload dari tablet bisa kepotong (cuma beberapa byte) → cek ukuran file dulu, minta upload ulang atau via Drive.
- [2026-11-11] [env] Claude nggak bisa akses storage tablet, cuma repo + upload + Drive → jangan janji bisa "detect" device.
- [2026-11-11] [sistem] Import `@file` tetap ikut dimuat saat start (nggak hemat token) → impor cuma file kecil yang wajib; sisanya dibaca on-demand.
- [2026-11-11] [git] CLAUDE.md cuma kebaca di sesi yang mulai dari branch yang punya file itu → core harus di-merge ke `main`.
- [2026-11-11] [agent] Model per subagent di-set lewat frontmatter `model:`; kalau tier nggak tersedia di akun bisa gagal/fallback → pakai tier terdekat, catat.
