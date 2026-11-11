# Claud
Kantor cheesy pen shells

## Content Studio: agentic video creator, end to end

`studio/` berisi "perusahaan konten" yang dijalankan oleh tim agent AI. Isinya bank konten, Research agent, Creative Director, Editor, dan koneksi ke Adobe Premiere Pro. Semuanya bisa dipakai dari satu dashboard web di komputer lu.

```
Brief ─▶ Research (Style DNA) ─▶ Creative Director (konsep + 3 hook + script per beat)
      ─▶ LU rekam muka (teleprompter + kamera di browser, atau upload)
      ─▶ Editor (buang jeda & retake, jump-cut + punch-in, caption, title, b-roll, musik, render 1080x1920)
      ─▶ CD review (skor + revisi) ─▶ auto-import ke Premiere Pro (sequence XML + caption)
```

### Tim agent
| Agent | Kerjanya |
|---|---|
| **Producer** | Ngatur pipeline, jalan otomatis (autopilot) dari brief sampai export |
| **Research** | Download video referensi (IG/TikTok/YT), ngukur ritme editingnya pakai ffmpeg (cut per menit, panjang shot, kata per menit, jeda), transkrip hook, riset web gaya creator + format serupa dari luar negeri. Hasilnya **Style DNA** |
| **Creative Director** | Bikin konsep ORIGINAL: pesannya beda, tapi mood editing, hook, dan narasinya ngikutin Style DNA. Hasilnya 3 opsi hook, beat sheet, teks layar, b-roll, dan tips rekaman. Habis render, dia juga yang review hasilnya |
| **Editor** | Bikin EDL dari footage lu: buang silence & retake (kalimat yang lu ulang), jump-cut dengan punch-in zoom per beat, caption gaya word-pop (kata penting diwarnai), title hook, b-roll & musik dari bank (musik otomatis ducking pas lu ngomong), loudness -14 LUFS |
| **Librarian** | Index & analisa semua file di bank konten, termasuk folder hard disk lu tanpa copy |

### Jalanin dari tablet / HP (tanpa laptop): GitHub Codespaces
1. Buka link ini di browser tablet (login GitHub):
   **https://codespaces.new/cheesypenshells/claud/tree/claude/video-creator-agentic-dashboard-f0k4nt**
2. Klik **Create codespace**, terus tunggu sekitar 3–5 menit. Python, ffmpeg, dan semua dependensi ke-install otomatis.
3. Dashboard kebuka sendiri di tab baru. Kalau gak kebuka: buka tab **PORTS**, cari port **8787**, klik ikon 🌐.
4. (Opsional, biar agent pakai Claude) github.com → Settings → Codespaces → **New secret** `ANTHROPIC_API_KEY`, pilih repo `claud`, terus restart codespace.

Rekam muka dari kamera tablet bisa langsung di tab **Teleprompter & Rekam**, soalnya link Codespaces udah HTTPS. Video final tinggal di-download ke tablet. Premiere Pro gak ada di Android/Huawei, jadi file XML-nya baru kepake nanti kalau lu buka di PC.
Gratis 120 core-jam per bulan. Stop codespace kalau udah gak dipakai (github.com/codespaces).

### Jalanin di laptop/PC
```bash
cd studio
cp .env.example .env        # isi ANTHROPIC_API_KEY (+ STUDIO_COOKIES_BROWSER=chrome)
./scripts/run.sh            # Windows: .\scripts\run.ps1
# buka http://127.0.0.1:8787
```
Butuh Python 3.10+ dan **ffmpeg** di PATH (`brew install ffmpeg` / `winget install ffmpeg`).
Tanpa API key, studio tetap jalan pakai "offline playbook" (template bawaan). Dengan key, semua agent pakai Claude plus web search.

### Koneksi ke Premiere Pro
1. `./scripts/install_premiere_panel.sh` (Mac) atau `.\scripts\install_premiere_panel.ps1` (Windows), lalu restart Premiere.
2. Buka **Window → Extensions → Studio Bridge**.
3. Tiap edit yang selesai otomatis di-import ke project yang lagi kebuka: bin `Studio/…`, sequence vertikal (V1 talking head + punch-in, V2 b-roll, A3 musik), caption track dari SRT, dan MP4 final.

**Gak perlu kasih akun/password Adobe ke siapa pun**, termasuk ke gw. Panelnya jalan di dalam Premiere yang udah login di komputer lu, dan cuma ngobrol sama dashboard di `127.0.0.1`.

### Workflow contoh: gaya @theoderick_ → muka @geov10
1. **Content Bank → Download referensi**: `theoderick_`, platform instagram. Ini butuh browser yang udah login IG (`STUDIO_COOKIES_BROWSER`). Alternatifnya, save reels-nya manual ke satu folder, terus pakai **Index folder hard disk** dengan type `reference` dan tag `theoderick_`.
2. Index folder b-roll & musik lu dari hard disk (kasih tag, misalnya `city, money, gym`).
3. **Projects → + Video baru**: isi tema & pesan lu sendiri, lalu Jalankan.
4. Cek tab **Riset & Style DNA** dan **Konsep & Hook**, edit script kalau perlu, terus pilih hook.
5. Tab **Teleprompter & Rekam**: nyalain kamera, rekam (teleprompter auto-scroll), stop, dan footage langsung masuk ke Editor.
6. Tab **Hasil Edit**: preview, download MP4, atau buka di Premiere buat finishing.

### Test
```bash
cd studio && STUDIO_OFFLINE=1 python -m pytest -q tests
```
Test ini ngejalanin seluruh pipeline pakai footage sintetis: bank → research → konsep → footage → edit (render 1080x1920 + XML Premiere + SRT) → review → antrean Premiere.

### Struktur
```
studio/backend/agents/   researcher.py · creative_director.py · editor.py
studio/backend/media/    analyze.py (ffmpeg+whisper) · fetch.py (yt-dlp) · captions.py · render.py · premiere_xml.py
studio/backend/          app.py (API+dashboard) · pipeline.py (Producer) · llm.py (Claude) · db.py
studio/frontend/         dashboard (HTML/JS, tanpa build)
studio/premiere-panel/   panel CEP "Studio Bridge" untuk Premiere Pro
```
