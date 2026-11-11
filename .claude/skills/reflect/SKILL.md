---
name: reflect
description: Refleksi manual atas sesi atau tugas terakhir, lalu rapikan memori (lessons.md, user-profile.md) dan aturan core. Pakai saat user minta refleksi atau saat lessons.md sudah lebih dari ~60 entri.
---

1. Baca `.claude/docs/reflection.md`, `.claude/docs/memory/lessons.md`, dan `.claude/docs/memory/user-profile.md`.
2. Tinjau sesi ini: apa yang lancar, apa yang salah, dan preferensi user apa yang baru muncul.
3. Update memori:
   - Tambah pelajaran baru (1 baris per pelajaran, pakai format yang ada).
   - Gabung entri yang mirip, hapus yang usang atau bertentangan.
   - Pola yang muncul 3x atau lebih dipindah jadi aturan di `workflow.md` atau `sop.md`.
4. Pastikan CLAUDE.md tetap < 150 baris.
5. Catat perubahan di `.claude/docs/CHANGELOG.md`, commit, push, lalu jalankan langkah backup (`/backup-drive`).
6. Lapor ke user dalam 3-5 poin singkat.
