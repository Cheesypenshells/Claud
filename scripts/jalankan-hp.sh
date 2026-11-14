#!/data/data/com.termux/files/usr/bin/bash
# Menjalankan bot di Termux. Biarkan Termux terbuka; untuk berhenti tekan Ctrl+C (atau tutup sesi Termux).
#
# Pembaruan otomatis: setiap 10 menit bot mengecek GitHub. Kalau ada versi baru, bot memperbarui diri
# (sama seperti perbarui-bot) lalu menyala ulang sendiri. Tidak perlu mengetik perbarui-bot lagi.
#
# bot reset : hapus login WhatsApp lama (kalau pairing gagal), lalu jalankan
# bot qr    : login pakai QR code (di-scan dari HP nomor bot), bukan kode pairing
#
# Seluruh isi skrip dibungkus fungsi supaya bash membacanya sekaligus: skrip ini ikut tertimpa saat
# pembaruan, dan bash tidak boleh membaca sisa file yang sudah berubah di tengah jalan.

utama() {
  cd "$HOME/cps-bot" || exit 1
  local CEK_DETIK=${CPS_CEK_DETIK:-600}

  case "${1:-}" in
    reset) rm -rf auth; echo "Login WhatsApp lama dihapus." ;;
    qr) rm -rf auth; export NOMOR_BOT=""; echo "Mode QR: scan QR yang muncul dari HP nomor bot." ;;
  esac
  # Pembaca foto bukti trf (OCR gratis). Dipasang sekali kalau belum ada.
  command -v tesseract >/dev/null || { echo "Memasang pembaca foto bukti trf (sekali saja, 1-2 menit)..."; pkg install -y tesseract >/dev/null 2>&1 || echo "Gagal memasang tesseract; cek foto bukti belum aktif."; }
  termux-wake-lock 2>/dev/null || true

  local PID=""
  trap 'kill "$PID" 2>/dev/null; termux-wake-unlock 2>/dev/null; echo; echo "Bot dimatikan."; exit 0' INT TERM

  # Ambil versi terbaru dari GitHub. Mengembalikan 0 kalau ada pembaruan yang terpasang.
  perbarui() {
    local BRANCH LAMA BARU KUNCI_LAMA
    BRANCH=$(git rev-parse --abbrev-ref HEAD)
    git fetch -q origin "$BRANCH" 2>/dev/null || return 1 # internet mati: coba lagi nanti
    LAMA=$(git rev-parse HEAD)
    BARU=$(git rev-parse "origin/$BRANCH")
    [ "$LAMA" = "$BARU" ] && return 1
    KUNCI_LAMA=$(md5sum package-lock.json 2>/dev/null)
    git reset -q --hard "origin/$BRANCH" || return 1
    # Paket hanya dipasang ulang kalau daftar paketnya berubah (hemat kuota & waktu).
    if [ "$KUNCI_LAMA" != "$(md5sum package-lock.json 2>/dev/null)" ]; then
      echo "Memasang paket baru..."
      npm ci --omit=dev --omit=peer --no-audit --no-fund --loglevel=error || { echo "Gagal memasang paket, kembali ke versi lama."; git reset -q --hard "$LAMA"; npm ci --omit=dev --omit=peer --no-audit --no-fund --loglevel=error; return 1; }
    fi
    echo "🔄 Bot diperbarui ke versi $(git log -1 --format='%h %s')"
    return 0
  }

  echo "Mengecek versi terbaru..."
  perbarui || true
  # Skrip ini sendiri mungkin ikut berubah: jalankan versi barunya.
  if [ -z "${CPS_SUDAH_DIPERBARUI:-}" ]; then export CPS_SUDAH_DIPERBARUI=1; exec bash "$HOME/cps-bot/scripts/jalankan-hp.sh"; fi

  echo "Bot berjalan. Biarkan Termux tetap terbuka (boleh di latar belakang)."
  echo "Pesan yang masuk saat bot mati akan diproses sekarang."
  echo "Pembaruan dari GitHub dipasang otomatis (dicek tiap 10 menit)."
  echo "Untuk mematikan: tekan Ctrl+C."
  echo

  while true; do
    node src/index.js &
    PID=$!
    # Selama bot menyala: cek pembaruan berkala. Ada versi baru -> matikan bot, lalu menyala ulang.
    while kill -0 "$PID" 2>/dev/null; do
      local i=0
      while [ $i -lt $CEK_DETIK ] && kill -0 "$PID" 2>/dev/null; do sleep 5; i=$((i + 5)); done
      kill -0 "$PID" 2>/dev/null || break
      if perbarui; then
        echo "Menyalakan ulang bot dengan versi baru..."
        kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null
        export CPS_SUDAH_DIPERBARUI=1
        exec bash "$HOME/cps-bot/scripts/jalankan-hp.sh"
      fi
    done
    wait "$PID" 2>/dev/null
    echo "Bot berhenti, menyalakan ulang dalam 10 detik... (Ctrl+C untuk keluar)"
    sleep 10
    perbarui || true
  done
}

utama "$@"
exit
