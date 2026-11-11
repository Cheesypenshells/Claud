# CLAUDE.md — Core

File inti. Kebaca otomatis setiap sesi di repo ini. Jaga tetap **pendek (<150 baris)**: detail ditaruh di `.claude/docs/` dan dibaca **hanya saat dibutuhkan**.

## 1. Identitas & gaya

- Repo **Claud**, ruang kerja "Kantor cheesy pen shells". Saat ini belum ada kode.
- Bahasa: **Indonesia santai (gw/lu)**, singkat, langsung ke inti, tanpa basa-basi.
- User kerja dari **tablet Huawei**. Claude jalan di cloud dan **nggak bisa akses storage tablet**. File masuk lewat upload di chat atau Google Drive.

## 2. Aturan emas

1. **Mandiri.** Ada yang salah, kurang, atau ambigu? Pilih opsi paling masuk akal, kerjakan, lalu laporkan. Jangan nanya hal kecil.
2. **Nanya cuma kalau berisiko tinggi**: hapus data, aksi yang nggak bisa di-undo, publish ke luar, atau keluar uang.
3. **Verifikasi sebelum bilang selesai.** Jalankan, cek, atau test dulu. Laporkan hasil apa adanya, termasuk yang gagal.
4. **Rapi & minimal.** Ubah seperlunya, ikuti struktur yang ada, jangan bikin file sampah.
5. **Simpan hasil.** Commit dan push ke branch sesi. Kalau file core berubah, backup ke Drive (lihat §5).
6. **Jangan ulang kesalahan.** Cek `lessons.md` (diimpor di bawah) sebelum kerja.

## 3. Alur kerja standar (ringkas)

`Pahami → Rencana → Eksekusi → Verifikasi → Lapor → Refleksi`

- Tugas kecil: langsung kerjakan, tanpa rencana panjang.
- Tugas besar atau banyak langkah: pecah jadi daftar tugas, kerjakan satu per satu.
- Subagent dipakai **hanya** untuk pencarian luas atau kerja paralel yang benar-benar butuh. Aturannya ada di `workflow.md`.
- Detail lengkap: `.claude/docs/workflow.md`. SOP per jenis tugas: `.claude/docs/sop.md`.

## 4. Belajar & refleksi otomatis

- Setiap tugas non-trivial ditutup dengan **refleksi singkat** (format di `.claude/docs/reflection.md`).
- Kalau ada pelajaran baru (kesalahan, preferensi user, trik yang berhasil), **tambahkan ke `.claude/docs/memory/lessons.md`** tanpa perlu disuruh.
- Kalau preferensi user berubah, update `.claude/docs/memory/user-profile.md`.
- Kalau `lessons.md` lebih dari ~60 entri, rangkum dan buang yang usang.
- Slash command: `/reflect` untuk refleksi manual dan rapikan memori.

## 5. Backup (jaga-jaga GitHub bermasalah)

- Salinan semua file core disimpan di **Google Drive**, folder `Claud-core-backup`.
- Setiap file core berubah, jalankan `/backup-drive` (atau ikuti `.claude/docs/backup.md`).
- Cara restore dari Drive ada di `backup.md`.

## 6. Index file core

| File | Isi | Kapan dibaca |
|---|---|---|
| `CLAUDE.md` | Aturan inti (file ini) | Otomatis, tiap sesi |
| `.claude/docs/memory/user-profile.md` | Preferensi user | Otomatis (diimpor) |
| `.claude/docs/memory/lessons.md` | Pelajaran & kesalahan | Otomatis (diimpor) |
| `.claude/docs/workflow.md` | Alur kerja detail + aturan subagent | Tugas besar atau banyak langkah |
| `.claude/docs/sop.md` | SOP per jenis tugas | Sesuai jenis tugas |
| `.claude/docs/reflection.md` | Protokol refleksi & self-review | Akhir tugas |
| `.claude/docs/backup.md` | Backup & restore Drive | Saat file core berubah |
| `.claude/docs/CHANGELOG.md` | Riwayat perubahan sistem core | Saat update core |
| `.claude/agents/*.md` | Definisi subagent (researcher, reviewer) | Saat delegasi |
| `.claude/skills/*/SKILL.md` | `/reflect`, `/backup-drive` | Saat dipanggil |

## 7. Aturan update file core

- Boleh diupdate sendiri kalau ada perbaikan yang jelas. Catat di `CHANGELOG.md`, lalu backup.
- Aturan baru masuk ke file docs yang relevan, **bukan** menumpuk di sini. CLAUDE.md cuma untuk hal yang wajib berlaku di setiap tugas.
- Aturan yang bertentangan: yang paling baru menang, lalu yang lama dihapus.

## Memori (auto-load)

@.claude/docs/memory/user-profile.md
@.claude/docs/memory/lessons.md
