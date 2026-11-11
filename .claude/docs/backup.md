# Backup & restore

Tujuan: sistem core tetap aman walaupun akun atau repo GitHub bermasalah.

## Lokasi backup

- Google Drive, file `Claud-core-backup.md` di folder `Claud-core-backup`.
- Isinya: **semua** file core digabung jadi satu file. Tiap file diawali penanda `===== FILE: <path> =====`.

## Cara backup (Claude)

1. Gabungkan file core:
   `CLAUDE.md`, `.claude/docs/**`, `.claude/agents/**`, `.claude/skills/**`, `arena/**`
2. Upload ke Drive sebagai file baru `Claud-core-backup.md`, dengan tanggal di judul kalau versi lama mau disimpan. Simpan sebagai teks/Markdown, jangan di-convert ke Google Docs.
3. Catat tanggal backup di `CHANGELOG.md`.

## Cara restore

1. Buat repo baru, atau buka sesi Claude Code baru.
2. Bilang ke Claude: "restore core dari Drive file Claud-core-backup.md".
3. Claude membaca file itu, memecah per penanda `===== FILE: ... =====`, menulis ulang setiap file ke path-nya, lalu commit.

Bisa juga manual: buka file di Drive, copy setiap bagian ke file dengan nama yang sama.
