#!/data/data/com.termux/files/usr/bin/bash
# Menjalankan bot di Termux. Biarkan Termux terbuka; untuk berhenti tekan Ctrl+C (atau tutup sesi Termux).
cd "$HOME/cps-bot"
termux-wake-lock 2>/dev/null || true
trap 'termux-wake-unlock 2>/dev/null; echo; echo "Bot dimatikan."; exit 0' INT TERM

echo "Bot berjalan. Biarkan Termux tetap terbuka (boleh di latar belakang)."
echo "Pesan yang masuk saat bot mati akan diproses sekarang."
echo "Untuk mematikan: tekan Ctrl+C."
echo

# Kalau bot berhenti karena error/koneksi, nyalakan ulang otomatis.
while true; do
  node src/index.js || true
  echo "Bot berhenti, menyalakan ulang dalam 10 detik... (Ctrl+C untuk keluar)"
  sleep 10
done
