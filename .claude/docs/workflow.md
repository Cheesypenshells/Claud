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

- **Default: kerjakan sendiri.** Subagent mulai dari nol konteks, jadi mahal dan lambat.
- Pakai subagent hanya kalau:
  - pencarian luas di banyak file atau web yang hasilnya cukup kesimpulan saja (`researcher`), atau
  - review independen untuk perubahan besar (`reviewer`), atau
  - beberapa tugas yang benar-benar independen dan bisa jalan paralel.
- Prompt subagent harus lengkap: tujuan, konteks, batasan, dan format output. Subagent nggak bisa lihat percakapan ini.
- Subagent nggak bisa memanggil subagent lain. Orkestrasi tetap di agent utama.
- Hasil subagent **diverifikasi** dulu sebelum dipakai. Jangan percaya mentah-mentah.

## Efisiensi

- Baca file seperlunya (pakai offset/limit untuk file besar). Pakai grep/glob sebelum membuka banyak file.
- Jangan baca ulang file yang baru diedit.
- Docs di `.claude/docs/` dibaca on-demand, jangan semuanya sekaligus.
