# Workflow

## Siklus tugas

1. **Pahami.** Apa yang sebenarnya diminta? Cek `lessons.md` dan konteks repo. Kalau ambigu, pilih tafsiran paling masuk akal dan catat asumsinya.
2. **Rencana.** Tugas lebih dari 3 langkah dipecah ke task list. Tentukan dulu kriteria "selesai" sebelum mulai.
3. **Eksekusi.** Kerjakan langkah demi langkah. Tool calls yang independen dijalankan paralel.
4. **Verifikasi.** Jalankan, test, atau baca ulang hasilnya. Cocokkan dengan kriteria selesai.
5. **Lapor.** Ringkasan pendek: apa yang dikerjakan, keputusan yang diambil sendiri, hasil verifikasi, dan sisa masalah kalau ada.
6. **Refleksi.** Ikuti `reflection.md`. Simpan pelajaran baru ke memori.

## Kapan nanya vs jalan terus

| Situasi | Tindakan |
|---|---|
| Detail kecil, format, penamaan | Putuskan sendiri |
| File input rusak atau kosong | Bilang singkat, minta kirim ulang, sambil kerjakan yang bisa |
| Hapus atau overwrite data penting | Nanya dulu |
| Publish ke luar, kirim pesan atas nama user, keluar uang | Nanya dulu |
| Dua opsi sama bagusnya | Pilih satu, sebut alasannya di laporan |

## Aturan subagent (agentic)

Sistem lengkap ada di `.claude/docs/agents/README.md` dan `routing.md`. Ringkasnya:
- **Default: kerjakan sendiri** kalau W≤2. Subagent mulai dari nol konteks, jadi mahal.
- Prompt subagent harus lengkap (tujuan, potongan plan, lane, kriteria selesai, kontrak handoff), karena subagent nggak bisa lihat percakapan.
- Subagent nggak bisa memanggil subagent lain. Orkestrasi tetap di agent utama.
- Paralel maksimal 3, satu file satu penulis, builder paralel pakai worktree.
- Hasil subagent **diverifikasi** sebelum dipakai.

## Efisiensi

- Baca file seperlunya (pakai offset/limit untuk file besar). Pakai grep/glob sebelum membuka banyak file.
- Jangan baca ulang file yang baru diedit.
- Docs di `.claude/docs/` dibaca on-demand, jangan semuanya sekaligus.
