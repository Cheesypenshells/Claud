#!/data/data/com.termux/files/usr/bin/bash
# Menjalankan bot di Termux. Biarkan Termux terbuka; untuk berhenti tekan Ctrl+C (atau tutup sesi Termux).
cd "$HOME/cps-bot"

# bot reset : hapus login WhatsApp lama (kalau pairing gagal), lalu jalankan
# bot qr    : login pakai QR code (di-scan dari HP nomor bot), bukan kode pairing
case "${1:-}" in
  reset) rm -rf auth; echo "Login WhatsApp lama dihapus." ;;
  qr) rm -rf auth; export NOMOR_BOT=""; echo "Mode QR: scan QR yang muncul dari HP nomor bot." ;;
esac
# Pembaca foto bukti trf (OCR gratis). Dipasang sekali kalau belum ada.
command -v tesseract >/dev/null || { echo "Memasang pembaca foto bukti trf (sekali saja, 1-2 menit)..."; pkg install -y tesseract >/dev/null 2>&1 || echo "Gagal memasang tesseract; cek foto bukti belum aktif."; }
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
