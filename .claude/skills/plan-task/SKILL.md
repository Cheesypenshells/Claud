---
name: plan-task
description: Jalankan pipeline penuh untuk tugas berbobot ≥3, dari plan, build (bisa paralel), verify, review-fix, scribe, sampai learner. Orchestrator yang memakai skill ini.
---

1. Jalankan `route-task` kalau belum. Buat folder `.claude/work/<task-id>/`.
2. **Plan:** untuk W≥4, panggil `planner`. Untuk W=3, Orchestrator menulis `plan.md` singkat sendiri.
3. **Riset** (kalau plan butuh): `researcher`, paralel ≤3 kalau topiknya independen.
4. **Build:** panggil `builder` per langkah. Langkah paralel yang menulis file pakai `isolation: worktree`. Prompt berisi langkah, lane, kriteria selesai, dan path handoff sebelumnya.
5. **Gabung:** Orchestrator merge hasil worktree dan selesaikan konflik.
6. **Verify → Review → Fix:** jalankan skill `review-fix-loop`.
7. **Scribe** (kalau ada docs/changelog yang perlu diupdate).
8. **Learner:** catat pelajaran.
9. Commit, push, lalu `/backup-drive` kalau file core berubah.
10. Lapor ke user: hasil, keputusan yang diambil sendiri, bukti verifikasi, dan sisa masalah.

Setiap kali status berubah, update `status.md`.
