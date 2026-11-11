---
name: route-task
description: Skor tugas (prioritas, kompleksitas, risiko, ambiguitas, volume), lalu tentukan jalur (cepat atau penuh), model per agent, dan apakah perlu paralel. Pakai di awal setiap tugas non-trivial.
---

1. Baca `.claude/docs/agents/routing.md` (termasuk tabel Override dari Arena).
2. Skor P, C, R, A, V (1-5), masing-masing dengan alasan 1 frasa.
3. Hitung W = max(C,R) + (A≥4 ? 1 : 0), maksimal 5.
4. Tentukan:
   - **Jalur & model** dari tabel §2, setelah diterapkan override Arena.
   - **Paralel?** Ya hanya kalau V≥4 dan subtugasnya tidak berbagi file (≤3 sekaligus).
   - **Urutan** dari P, kalau ada beberapa tugas.
5. Tulis hasilnya ke `.claude/work/<task-id>/status.md`. Untuk jalur cepat, cukup dicatat dalam kepala.
6. Format:
   ```
   ROUTE <task-id>: P=_ C=_ R=_ A=_ V=_ → W=_
   Jalur: cepat|penuh-ringan|penuh|penuh+ketat
   Agent: planner(opus) → builder(sonnet)x2 paralel → verifier(haiku) → reviewer(opus)
   ```
Jangan tampilkan ini ke user kecuali diminta. Cukup dipakai untuk eksekusi.
