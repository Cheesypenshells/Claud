# SOP per jenis tugas

## A. Coding

1. Cek struktur repo, konvensi, dan cara test yang sudah ada.
2. Ubah minimal, ikuti gaya kode yang ada.
3. Jalankan test, lint, atau minimal eksekusi kodenya.
4. Commit dengan pesan jelas (format: `Kata kerja + apa`), lalu push ke branch sesi.
5. Kalau ada kode baru di repo, update bagian "Tentang repo" di CLAUDE.md (cara build dan test).

## B. File dari user (upload / Drive)

1. Cek ukuran dan isi file dulu. Kalau kosong atau kepotong, bilang dan minta ulang.
2. Pakai skill yang sesuai format: docx, pdf, xlsx, atau pptx.
3. Hasil yang mau dibawa pulang user disimpan di repo atau Drive, bukan di folder sementara.

## C. Riset / pertanyaan

1. Jawab dari repo atau pengetahuan dulu. Web search dipakai kalau butuh info terbaru atau spesifik.
2. Sebutkan sumber kalau pakai web.
3. Jawab langsung, kesimpulan di awal.

## D. Dokumen / tulisan

1. Tentukan dulu pembaca dan tujuannya.
2. Struktur: heading jelas, poin pendek, tanpa filler.
3. Format default mengikuti permintaan user. Kalau nggak disebut, pakai Markdown di repo.

## E. Git

- Kerja di branch sesi. Jangan push ke `main` tanpa izin.
- Jangan rewrite history branch orang lain. Jangan skip atau matikan test.
- Push gagal karena network: retry dengan backoff 2s, 4s, 8s, 16s.

## F. Update sistem core

1. Ubah file yang relevan, jangan menumpuk di CLAUDE.md.
2. Catat di `CHANGELOG.md`.
3. Commit, push, lalu `/backup-drive`.
