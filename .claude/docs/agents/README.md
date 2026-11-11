# Sistem Agent End-to-End

Arsitektur multi-agent buat ngerjain tugas dari awal sampai akhir. Tujuannya presisi dan konsisten, tapi tetap hemat token.

> **Prinsip:** agent utama (sesi ini) = **Orchestrator**. Subagent **nggak bisa** memanggil subagent lain, jadi semua delegasi, pembagian kerja, dan penggabungan hasil dipegang Orchestrator.

## 1. Pipeline

```
Request
  │
  ▼
[Orchestrator] ── route-task → skor P/C/R/A/V → pilih jalur & model
  │
  ├─ Jalur CEPAT (skor ≤2): Orchestrator kerjakan sendiri → verify → lapor
  │
  └─ Jalur PENUH:
      planner ──► researcher(s) ──► builder(s) ──► verifier ──► reviewer
         ▲                                            │             │
         │                                            └── gagal ────┤
         │                                                          ▼
         └──────────── re-plan kalau 2x gagal ◄────────── fixer (loop ≤3)
                                                                    │
                                                         lolos ─────┤
                                                                    ▼
                                                   scribe ──► learner ──► Lapor
```

Gerbang kualitas (wajib lolos sebelum lapor "selesai"):
1. **Verifier:** hasil jalan, test/cek lolos, dan memenuhi kriteria selesai dari plan.
2. **Reviewer:** nggak ada temuan `parah` atau `sedang` yang tersisa.
3. **Self-review Orchestrator:** checklist di `reflection.md`.

"Zero mistake" itu **target**, bukan jaminan. Cara mengejarnya: gerbang di atas, loop perbaikan, dan pelajaran dari kesalahan yang dicatat.

## 2. Roster agent

| Agent | Peran | Model default | Effort | Skill internal | Skill eksternal |
|---|---|---|---|---|---|
| Orchestrator (sesi utama) | Routing, delegasi, gabung hasil, lapor | model sesi | – | route-task, plan-task, review-fix-loop | semua |
| `planner` | Pecah tugas, kriteria selesai, pembagian lane | opus | high | plan-task | – |
| `researcher` | Riset repo/web, read-only | sonnet | medium | – | WebSearch/WebFetch |
| `builder` | Implementasi kode/dokumen di lane-nya | sonnet | medium | – | docx, pdf, xlsx, pptx, simplify |
| `verifier` | Jalankan test/cek, cocokkan ke kriteria | haiku | low | – | run |
| `reviewer` | Review independen: bug, logika, kesesuaian | opus | high | – | code-review, security-review |
| `fixer` | Perbaiki temuan reviewer/verifier | sonnet | medium | review-fix-loop | – |
| `scribe` | Docs, changelog, laporan rapi | haiku | low | – | docs |
| `learner` | Rawat memori, usul upgrade routing | sonnet | medium | reflect, backup-drive | – |
| `judge` | Nilai hasil di Arena | opus | high | arena | – |

Model default bisa berubah berdasarkan hasil Arena (lihat `routing.md`, tabel "Override dari Arena").

## 3. Kolaborasi tanpa tabrakan

- **Lane ownership:** planner menetapkan siapa memegang file/folder mana. **Satu file hanya punya satu penulis** per fase.
- **Paralel ("belah diri"):** subtugas yang independen dan tidak berbagi file dijalankan paralel. Builder paralel yang menulis file pakai `isolation: worktree`, lalu Orchestrator merge hasilnya.
- **Batas paralel:** maksimal 3 subagent sekaligus. Lebih dari itu, biaya koordinasi lebih besar dari untungnya.
- **Blackboard:** state tugas disimpan di `.claude/work/<task-id>/` (di-gitignore):
  - `plan.md`: dari planner (langkah, lane, kriteria selesai)
  - `handoff-<agent>.md`: output tiap agent pakai kontrak di bawah
  - `status.md`: dipegang Orchestrator (fase, siapa sedang apa)
- **Kontrak handoff** (wajib di setiap output subagent):
  ```
  STATUS: done | blocked | partial
  HASIL: <ringkasan 1-3 kalimat>
  FILE: <path yang diubah/dibuat>
  BUKTI: <test/cek yang dijalankan + hasilnya>
  RISIKO/SISA: <yang belum beres atau asumsi>
  NEXT: <saran langkah berikut>
  ```
- **Kesinambungan:** setiap agent membaca `plan.md` dan handoff sebelumnya. Orchestrator yang menyuplai konteks itu di prompt, karena subagent nggak bisa lihat percakapan.

## 4. Siklus belajar & upgrade

1. Tiap tugas: learner (atau Orchestrator untuk jalur cepat) mencatat pelajaran ke `memory/lessons.md`.
2. Tiap ~10 tugas atau seminggu sekali: jalankan `/arena` (mini run) untuk mengukur ulang model per agent.
3. learner mengusulkan perubahan routing dari data Arena. Orchestrator menerapkan, mencatat di CHANGELOG, lalu backup.
4. Pola kesalahan yang muncul 3x atau lebih dijadikan aturan di prompt agent terkait.

## 5. File terkait

- `routing.md`: rubrik skor, pemilihan model, cadence per jenis sesi
- `.claude/agents/*.md`: definisi tiap agent
- `.claude/skills/{route-task,plan-task,review-fix-loop,arena}/`: skill internal
- `arena/`: benchmark, scoreboard, log run
