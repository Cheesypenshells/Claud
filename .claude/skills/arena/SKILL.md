---
name: arena
description: Jalankan Arena, benchmark yang membandingkan kombinasi agent × model pada task baku. Dinilai buta oleh judge, hasilnya mengkalibrasi routing (model mana paling efisien tapi tetap presisi). Pakai tiap ~10 tugas, mingguan, atau saat diminta.
---

1. Baca `arena/README.md`. Pilih task dari `arena/tasks/`: mode **mini** = 2-3 task, mode **full** = semua.
2. Tentukan kandidat per task, biasanya agent yang relevan × {haiku, sonnet, opus}. Lewati kombinasi yang jelas mubazir.
3. Jalankan setiap kandidat dengan prompt yang **identik**, lewat Agent tool dengan override `model`. Yang menulis file pakai `isolation: worktree`. Catat token dan waktu kalau tersedia.
4. Kalau ada slot, jalankan 2 run per kandidat untuk mengukur konsistensi.
5. Acak label hasil jadi A/B/C, lalu kirim ke `judge`.
6. Tulis log ke `arena/runs/<YYYY-MM-DD>-<id>.md` (mapping label → model, skor, catatan).
7. Update `arena/scoreboard.md`.
8. Panggil `learner` untuk mengusulkan override routing. Orchestrator menerapkan yang memenuhi syarat, mencatat di CHANGELOG, lalu backup.

Hemat biaya: mode mini secara default, dan jangan jalankan opus di task yang W-nya ≤2.
