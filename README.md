# 🧀 Cheesy Pen Shells — Tutor Bahasa AI

Website tutor bahasa asing berbasis AI (Claude) untuk penutur Bahasa Indonesia.

**Desain mengikuti design system kasir Cheesy Pen Shells (oyster bakar mozzarella)**, dengan sentuhan robotik:
- Logo resmi (kerang pena berbentuk hati + uap) di `public/img/`, diambil dari aset sistem kasir.
- Warna navy `#22348C` + kuning `#F6B800`, latar kertas dengan pola teks "CHEESY PEN SHELLS · oyster bakar".
- Font Barlow Condensed (judul kapital), Nunito (isi), Caveat (aksen tulisan tangan), Share Tech Mono (aksen robot).
- Header navy dengan coretan kuas kuning, kartu & tombol tebal dengan bayangan bawah — sama seperti halaman kasir.
- Sentuhan robotik: LED status "CHEESY-BOT ONLINE", label mono di balasan AI, kode 01–05 di tombol tutor,
  dan Mode Robot dengan layar HUD (grid biru, bingkai sudut kuning).
- Maskot **Cheesy-Bot**: robot metal navy, visor LED kuning, telinga kerang pena, uap mengepul seperti logo, logo CPS di dada.

## 🔐 Akun — Ingatan Tiap Orang Terpisah

- Saat membuka website, pengguna **Masuk** atau **Daftar** (nama panggilan, username, password minimal 8 karakter).
- Setiap akun punya **riwayat chat dan ingatan Cheesy-Bot sendiri** (`data/users/<id>.json`) — tidak tercampur dengan orang lain.
- Password disimpan sebagai hash **scrypt** (bukan teks asli) di `data/auth.json`; sesi login memakai cookie `HttpOnly` + `SameSite=Lax`, berlaku 30 hari.
- Percobaan login/daftar yang gagal dibatasi: 10 kali per 15 menit per alamat IP.
- Tombol **Keluar** di kanan atas. "Lupakan semua" hanya menghapus data akun yang sedang login.
- Kalau dipasang di internet, jalankan di belakang HTTPS (reverse proxy yang mengirim `X-Forwarded-Proto: https`) supaya cookie ditandai `Secure`.

## 💘 Pendekatan — Latihan Kenalan & PDKT

Mode untuk melatih bahasa **sekaligus rasa percaya diri / jadi lebih ekstrovert**: kamu kenalan dengan karakter yang sedang jalan-jalan di kotanya.

- **16 karakter orisinal (fiksi, semua dewasa 25–29 th)** — cewek & cowok untuk tiap bahasa, masing-masing dengan kepribadian, pekerjaan,
  kota, latar adegan, dan tingkat kesulitan (Mudah/Sedang/Sulit). Contoh: Hannah (penyanyi-penulis lagu, Nashville), Yui (ilustrator, Tokyo),
  Min-jun (barista & fotografer, Seoul), Camille (pastry chef, Paris), Mateo (pelukis mural, Mexico City), Layla (arsitek, Amman).
  Data karakter: `characters.js` — tambah karakter baru di sana.
- **Animasi:** karakter digambar SVG (`public/avatar.js`), berjalan di latar kota yang bergeser (taman, jalan kota, pantai, pasar, tepi sungai),
  dengan 8 ekspresi wajah sesuai mood (senang, geli, malu, netral, penasaran, kesal, risih, pergi).
- **Kamu yang menyapa duluan.** Cheesy-Bot memberi 3 contoh pembuka sesuai levelmu.
- **💗 Meter ketertarikan (0–100):** naik kalau kamu sopan, lucu, penasaran pada dirinya, dan bahasamu bagus; turun kalau klise, sombong, memaksa.
- **Batasan & consent:** rayuan yang melecehkan / komentar seksual / memaksa setelah ditolak → karakter **menolak** (halus atau tegas),
  dan **pergi** kalau parah atau diulang. Percakapan dijaga setara PG-13.
- **🧀 Wingman Cheesy-Bot** di setiap giliran: koreksi bahasa, penilaian langkahmu (🔥 mantap … 🙈 cringe … 🚫 melewati batas),
  tips percaya diri, dan saran kalimat berikutnya (bisa diklik).
- **Misi:** berhasil diajak ketemu lagi / dapat kontaknya (butuh ketertarikan ≥ 70, ditegakkan di server) → 💘 **+50 XP**.
  Maksimal 30 giliran. Rekor berhasil/ditinggal tersimpan per karakter.
- Bisa pakai suara: balasan karakter dibacakan (nada suara cewek/cowok berbeda) dan Mode Suara tetap berfungsi.
- Obrolan di mode ini ikut dihitung untuk ingatan, XP, dan penilaian CEFR.
- **Tidak memakai orang sungguhan** (selebriti, dll.): semua karakter fiksi, untuk menghindari penyalahgunaan citra seseorang tanpa izin.

## 📊 Level, Rapor & Peringkat (standar CEFR)

Cheesy-Bot menilai kemampuanmu dari obrolan memakai **CEFR** (*Common European Framework of Reference for Languages*, Dewan Eropa) —
standar kemampuan bahasa yang paling luas dipakai di dunia (A1 → C2) dan menjadi acuan IELTS, TOEFL, DELF/DALF, Goethe, DELE, dan lainnya.

- **Kapan dinilai:** otomatis setelah 4 pesan pertama dalam suatu bahasa, lalu dinilai ulang setiap 6 pesan baru. Bisa juga dipicu manual: **📊 Lihat rapor → ⚡ Nilai ulang sekarang**.
- **Apa yang dinilai:** 5 aspek kualitatif CEFR — *Range* (ragam & kosakata), *Accuracy* (ketepatan grammar), *Fluency* (kelancaran),
  *Interaction* (interaksi), *Coherence* (koherensi) — masing-masing diberi level A1–C2 plus bukti kutipan dari pesanmu.
  Penilai diinstruksikan ketat seperti ujian sungguhan (tidak menaikkan nilai). Pengucapan belum dinilai karena yang dibaca hanya teks/transkrip.
- **Rapor:** level keseluruhan, % progress menuju level berikutnya, kekuatan, kelemahan, fokus latihan berikutnya, dan riwayat level.
- **Gelar peringkat:** Pre-A1 🦪 Kerang Mentah · A1 🧂 Kerang Dicuci · A2 🧄 Kerang Berbumbu · B1 🧀 Kerang Bermozzarella ·
  B2 🔥 Kerang Dibakar · C1 ⭐ Kerang Juara Grill · C2 👑 Grand Master Oyster.
- **XP:** +10 per obrolan, +5 kalau pesannya panjang (≥ 8 kata), +100 saat naik level. Ada notifikasi saat naik/turun level.
- **🏆 Papan peringkat** per bahasa antar-pengguna (urut level → progress → XP; hanya nama panggilan yang ditampilkan).
- **Jadi patokan mengajar:** pilih Level **🤖 Otomatis** (default) — Cheesy-Bot mengajar di level hasil penilaianmu + sedikit di atasnya,
  dan fokus melatih aspek terlemahmu.

## 🧠 Cheesy-Bot Mengingat Kamu & Ngajar Seperti Manusia

- **Ingat semua obrolan:** riwayat chat setiap tutor + bahasa disimpan di server per akun, jadi tidak hilang saat halaman di-refresh atau server dimatikan.
- **Catatan tentang kamu (ingatan jangka panjang):** setiap 3 obrolan, AI memperbarui profilmu — nama, hal-hal tentang hidupmu,
  kesalahan yang sering diulang (dan yang sudah tidak lagi), kosakata yang sudah dipelajari, topik yang pernah dibahas,
  lelucon internal, dan **sikap belajarmu** (serius / santai / kurang serius). Catatan ini dipakai di semua tutor & bahasa.
  Lihat lewat tombol **🧠 Lihat ingatan**; hapus semuanya lewat **Lupakan semua**.
- **Ngobrol luwes, tidak kaku:** bahasa santai ala teman, bereaksi, bercanda, mengungkit hal yang pernah kamu ceritakan.
- **Berani meledek kalau kamu salah — menyesuaikan sikapmu:**
  - Kalau kamu **serius** (mencoba, bertanya, memperbaiki): ledekan ringan, penjelasan lengkap, pujian untuk kemajuan nyata.
  - Kalau kamu **asal-asalan** ("gatau", "males", kesalahan yang sama diulang): ledekan lebih pedas, ditegur, disuruh mengulang.
  - **Gaya ngajar** bisa dipilih: 😇 Lembut, 😏 Santai (default), 🌶️ Pedas (roasting tanpa ampun).
  - Batasnya: yang diledek kesalahan & kemalasannya, bukan pribadimu; kalau kamu terlihat benar-benar sedih, Cheesy-Bot jadi lembut.

## 5 Mode Tutor

| Tutor | Fungsi |
|---|---|
| **Teman Ngobrol** | Ngobrol bebas dalam bahasa target, kesalahan dikoreksi dengan lembut di akhir balasan |
| **Cek Grammar** | Kirim kalimat → dapat versi benar, daftar kesalahan + alasannya, dan versi yang lebih natural |
| **Roleplay Situasi** | Latihan situasi nyata (restoran, bandara, wawancara kerja, dll.) dengan tips di tiap giliran |
| **Kuis Kosakata** | Kuis per topik, satu soal sekali jalan, lengkap dengan skor dan contoh kalimat |
| **Penerjemah + Penjelasan** | Terjemahan formal/santai, pecahan kata, dan catatan grammar/budaya |

Bahasa: Inggris, Jepang, Korea, Mandarin, Arab, Prancis, Jerman, Spanyol — dengan level Pemula / Menengah / Mahir.
Untuk huruf non-Latin, tutor menambahkan romanisasi (untuk level pemula & menengah).

## 🗣️ Bisa Teks, Bisa Ngobrol (Suara)

- **🎤 Mikrofon** — tekan, lalu bicara. Ucapanmu otomatis jadi teks (bisa diedit dulu sebelum dikirim).
- **Tombol EN / ID** di sebelah mikrofon — pilih bahasa yang kamu ucapkan: bahasa target atau Bahasa Indonesia.
- **🔊 di setiap balasan AI** — dengarkan pengucapannya. Kalimat bahasa asing dibacakan dengan suara penutur bahasa itu, penjelasan Bahasa Indonesia dengan suara Indonesia.
- **Mode Suara** (di sidebar) — ngobrol tanpa mengetik: kamu bicara → AI menjawab dengan suara → mikrofon menyala lagi otomatis. Balasan AI juga dibuat lebih singkat supaya enak didengar.
- **Kecepatan suara AI** bisa diatur (lebih lambat cocok untuk pemula).

### 🤖 Mode Robot "Cheesy-Bot" (simulasi ngobrol dengan AI)

Tekan **"🤖 Ngobrol dengan Cheesy-Bot"** di atas chat. Muncul robot "Cheesy-Bot" layar penuh, seperti telepon dengan AI:
- Robot menyapa, lalu mikrofon otomatis menyala.
- Robot **beranimasi sesuai keadaan**: cincin & mata hijau saat mendengar, uap mengepul & mata melirik saat memproses, mulut LED bergerak saat bicara.
- Ucapanmu dan ucapan robot tampil sebagai **subtitle**.
- Tekan 🎤 untuk bicara / memotong robot, **📞 Akhiri** (atau Esc) untuk kembali ke chat. Riwayat percakapan tetap tersimpan di chat.
- Mode Robot memakai tutor, bahasa, dan level yang sedang dipilih.

Fitur suara memakai Web Speech API bawaan browser — **gratis, tanpa API key tambahan**.
Mikrofon berfungsi di **Chrome, Edge, dan Safari** (Firefox belum mendukung; di Firefox tetap bisa mendengar suara AI).
Browser hanya mengizinkan mikrofon di `http://localhost` atau situs `https://`.
Kualitas dan pilihan suara tergantung suara yang terpasang di perangkat/browser.

## Cara Menjalankan

Butuh Node.js 20+ dan API key Anthropic (https://platform.claude.com).

```bash
npm install
cp .env.example .env      # lalu isi ANTHROPIC_API_KEY
npm start                 # buka http://localhost:3000
```

## Struktur

- `server.js` — server Node (tanpa framework), endpoint `/api/chat` yang men-stream jawaban AI
- `tutors.js` — kepribadian Cheesy-Bot, gaya ngajar, dan 5 mode tutor. **Ubah sifat/tutor di sini.**
- `memory.js` — ingatan jangka panjang (profil murid)
- `store.js` — penyimpanan riwayat chat & ingatan per pengguna (`data/users/`)
- `characters.js`, `date.js` — karakter & mesin mode Pendekatan (structured output per giliran)
- `public/dating.js`, `public/avatar.js` — tampilan & animasi mode Pendekatan
- `assess.js` — penilaian kemampuan CEFR, gelar peringkat, patokan level mengajar
- `auth.js` — akun, password (scrypt), sesi login, pembatasan percobaan login
- `public/login.html`, `public/login.js` — halaman Masuk/Daftar
- `public/` — tampilan web (HTML/CSS/JS biasa, mendukung mode gelap dan HP)
- `public/voice.js` — fitur suara (ucapan → teks, teks → suara)
- `public/robot.js` — karakter robot animasi untuk Mode Robot

## Catatan Teknis

- Model: `claude-opus-5-5` dengan `effort: "low"` supaya balasan chat cepat.
- Fallback otomatis di sisi server Anthropic jika model menolak permintaan.
- 60 pesan terakhir dikirim apa adanya ke AI; obrolan yang lebih lama diwakili oleh ingatan (profil murid).
- Ingatan diperbarui di latar belakang dengan structured output (`memory.js`); penyimpanan di `store.js`.
- Data disimpan di folder `data/` (tidak ikut ke git). **Backup folder ini** — isinya akun, riwayat, dan ingatan semua pengguna.
