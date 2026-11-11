---
name: review-fix-loop
description: Loop otomatis verify → review → fix sampai semua kriteria lolos dan tidak ada temuan parah/sedang, maksimal 3 putaran, dengan eskalasi model kalau gagal berulang.
---

Putaran n (maksimal 3):
1. `verifier` mengecek kriteria selesai. Ada yang gagal → kirim ke `fixer` → ulang langkah 1.
2. Kalau semua lolos dan W≥4, `reviewer` jalan. Ada temuan `parah` atau `sedang` → kirim ke `fixer` → ulang dari langkah 1.
3. Semua lolos dan tidak ada temuan parah/sedang → **selesai**. Temuan `minor` boleh diperbaiki kalau murah, atau dicatat di laporan.

Eskalasi:
- Temuan yang sama gagal diperbaiki 2x → naikkan tier model `fixer` satu tingkat.
- Lewat 3 putaran belum lolos → stop. Re-plan lewat `planner`, catat ke lessons, dan laporkan apa yang masih gagal beserta buktinya.

Jangan pernah menandai lolos tanpa bukti dari verifier.
