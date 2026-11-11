# Routing: prioritas, bobot, kompleksitas, dan model

## 1. Skor tugas (1-5 per dimensi)

| Dimensi | 1 | 3 | 5 |
|---|---|---|---|
| **P** Prioritas (urgensi × dampak) | bisa nanti | normal | blokir kerja user / urgent |
| **C** Kompleksitas | mekanis (rename, format) | multi-langkah, 1-3 file | arsitektur, banyak modul, algoritma |
| **R** Risiko | gampang di-undo | ubah perilaku | data hilang, keamanan, publik, uang |
| **A** Ambiguitas | jelas | ada asumsi | tujuan kabur |
| **V** Volume/lebar | 1 hal | beberapa bagian | banyak bagian independen |

- **P** menentukan **urutan** pengerjaan, bukan model.
- **Bobot (W) = max(C, R) + (A ≥ 4 ? 1 : 0)**, maksimal 5. Bobot menentukan model dan jalur.
- **V** menentukan **paralelisasi**.

## 2. Pemilihan jalur & model

| W | Jalur | Model | Effort | Contoh |
|---|---|---|---|---|
| 1-2 | Cepat (Orchestrator sendiri / haiku) | haiku | low | format, ringkas, cari file, rename |
| 3 | Penuh-ringan: builder → verifier | sonnet | medium | fitur kecil, dokumen standar, bugfix jelas |
| 4 | Penuh: planner → builder → verifier → reviewer | sonnet (build), opus (plan/review) | high | multi-file, desain fitur, migrasi |
| 5 | Penuh + riset + review ketat | opus | high | arsitektur, keamanan, aksi irreversible |

**Paralel:** V ≥ 4 **dan** subtugas tidak berbagi file → split ke ≤3 subagent paralel. Selain itu, jalankan serial.

## 3. Eskalasi & de-eskalasi

- Gagal verifikasi 2x di tier yang sama → naik satu tier (haiku → sonnet → opus).
- Gagal 2x di opus → re-plan dari awal, lalu catat ke lessons.
- **De-eskalasi** hanya dari data Arena: tier lebih murah skornya ≥95% tier mahal di ≥3 run.
- Kalau model nggak tersedia di akun, pakai tier tersedia terdekat dan catat di lessons.

## 4. Cadence per jenis sesi

| Jenis sesi | Agent yang jalan | Frekuensi |
|---|---|---|
| Semua sesi (awal) | Orchestrator baca core + lessons | 1x per sesi |
| Tanya-jawab / kecil | Orchestrator saja | per permintaan |
| Build (kode/dokumen) | sesuai tabel §2 | per tugas |
| Riset | researcher, ≤3 paralel kalau topik independen | per tugas |
| Maintenance | learner + `/reflect` | tiap ~10 tugas |
| Kalibrasi | `/arena` mini (2-3 task) | tiap ~10 tugas / mingguan |
| Backup | `/backup-drive` | tiap file core berubah |

## 5. Efisiensi token

- Prompt subagent cuma berisi yang dia butuhkan: tujuan, potongan plan, path file, dan kontrak output. Jangan tempel seluruh percakapan.
- Subagent membalas **ringkas** pakai kontrak handoff, bukan dump file.
- Docs dibaca on-demand. Jangan delegasi tugas yang lebih cepat dikerjakan sendiri.

## 6. Override dari Arena

Diisi oleh learner berdasarkan `arena/scoreboard.md`. Kosong berarti pakai default.

| Agent | Model sekarang | Sejak | Alasan (run id) |
|---|---|---|---|
| – | – | – | – |
