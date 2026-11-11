---
name: backup-drive
description: Backup semua file core (CLAUDE.md, .claude/docs, .claude/agents, .claude/skills, arena) ke Google Drive sebagai satu file Markdown. Pakai setiap kali file core berubah atau saat user minta backup.
---

1. Gabungkan file core jadi satu file di scratchpad:
   ```bash
   for f in CLAUDE.md $(find .claude/docs .claude/agents .claude/skills arena -type f -name '*.md' | sort); do
     printf '\n===== FILE: %s =====\n' "$f"; cat "$f"; done > <scratchpad>/Claud-core-backup.md
   ```
2. Cari folder `Claud-core-backup` di Drive. Kalau belum ada, buat dulu.
3. Upload file hasil gabungan ke folder itu dengan judul `Claud-core-backup-YYYY-MM-DD.md`. Simpan sebagai `text/markdown` dan matikan konversi ke Google Docs.
4. Tambah baris "backup Drive YYYY-MM-DD" di `.claude/docs/CHANGELOG.md`.
5. Lapor singkat ke user: nama file dan foldernya.

Cara restore ada di `.claude/docs/backup.md`.
