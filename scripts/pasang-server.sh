#!/usr/bin/env bash
# Pemasangan bot Cheesy Pen Shells di server Linux (Ubuntu/Debian): VPS lokal atau Google Cloud e2-micro.
# Jalankan dari jendela SSH:
#   curl -fsSL https://raw.githubusercontent.com/Cheesypenshells/Claud/claude/cheesy-pen-shells-management-nq92xx/scripts/pasang-server.sh | bash
set -euo pipefail

REPO="https://github.com/Cheesypenshells/Claud.git"
BRANCH="${CPS_BRANCH:-claude/cheesy-pen-shells-management-nq92xx}"
DIR="$HOME/cps-bot"
PENGGUNA="$(id -un)"

# VPS biasanya login sebagai root dan kadang tidak punya sudo.
if [ "$(id -u)" -eq 0 ]; then sudo() { if [ "$1" = "-E" ]; then shift; fi; "$@"; }; fi

tanya() { local var; read -rp "$1" var < /dev/tty; echo "$var" | tr -cd '0-9A-Za-z_-'; }
# Nomor boleh ditulis 0877... atau 62877...; disimpan sebagai 62877...
tanyaNomor() { tanya "$1" | tr -cd '0-9' | sed 's/^0/62/'; }
judul() { echo; echo "=== $1 ==="; }

judul "1/6 Menyiapkan memori tambahan (swap)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 1G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

judul "2/6 Memasang Node.js dan git"
sudo apt-get update -qq
sudo apt-get install -y -qq git curl ca-certificates >/dev/null
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
  sudo apt-get install -y -qq nodejs >/dev/null
fi
echo "Node.js $(node -v) terpasang."

judul "3/6 Mengunduh kode bot"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH"
  git -C "$DIR" checkout -q "$BRANCH"
  git -C "$DIR" reset -q --hard "origin/$BRANCH"
else
  git clone -q -b "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"
npm ci --omit=dev --no-audit --no-fund --loglevel=error

judul "4/6 Pengaturan"
if [ ! -f .env ]; then
  cp .env.example .env
  NOMOR_BOT=$(tanyaNomor "Nomor WhatsApp KHUSUS BOT (contoh 081234567890): ")
  NOMOR_OWNER=$(tanyaNomor "Nomor WhatsApp OWNER/Pak George (contoh 081234567890): ")
  SHEET=$(tanya "ID Google Spreadsheet (bagian URL di antara /d/ dan /edit): ")
  sed -i "s/^NOMOR_BOT=.*/NOMOR_BOT=${NOMOR_BOT}/" .env
  sed -i "s/^OWNER_IDS=.*/OWNER_IDS=${NOMOR_OWNER}/" .env
  sed -i "s/^SPREADSHEET_ID=.*/SPREADSHEET_ID=${SHEET}/" .env
else
  echo "File .env sudah ada, tidak diubah."
fi

judul "5/6 Kunci Google (credentials.json)"
until [ -f "$DIR/credentials.json" ]; do
  if [ -f "$HOME/credentials.json" ]; then
    mv "$HOME/credentials.json" "$DIR/credentials.json"
    break
  fi
  echo "File credentials.json belum ada. Pilih cara:"
  echo "  1) Sudah saya upload ke server (tombol Upload file di SSH Google Cloud / SFTP)"
  echo "  2) Saya tempel isinya di sini"
  read -rp "Ketik 1 atau 2 lalu Enter: " CARA < /dev/tty
  if [ "$CARA" = "2" ]; then
    echo "Buka credentials.json di tablet, salin SEMUA isinya, tempel di sini."
    echo "Masukan berhenti otomatis setelah isi file lengkap (tanda } terakhir)."
    : > "$DIR/credentials.json"
    while IFS= read -r baris < /dev/tty; do
      printf '%s\n' "$baris" >> "$DIR/credentials.json"
      case "$baris" in
        *"}"*) node -e "JSON.parse(require('fs').readFileSync('$DIR/credentials.json','utf8'))" 2>/dev/null && break ;;
      esac
    done
    if ! node -e "JSON.parse(require('fs').readFileSync('$DIR/credentials.json','utf8')).client_email" >/dev/null 2>&1; then
      echo "Isi credentials.json tidak valid, coba lagi."
      rm -f "$DIR/credentials.json"
    fi
  fi
done
chmod 600 "$DIR/credentials.json" "$DIR/.env"
echo "credentials.json siap."

judul "6/6 Menjalankan bot sebagai layanan (otomatis menyala lagi kalau server restart)"
sudo tee /etc/systemd/system/cps-bot.service >/dev/null <<EOF
[Unit]
Description=Bot WhatsApp Cheesy Pen Shells
After=network-online.target
Wants=network-online.target

[Service]
User=$PENGGUNA
WorkingDirectory=$DIR
ExecStart=$(command -v node) src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable -q cps-bot
sudo systemctl restart cps-bot

echo
echo "Bot sudah berjalan. Di bawah ini catatan bot (log)."
echo "Tunggu muncul 'Kode pairing: XXXX-XXXX', lalu di HP nomor bot buka:"
echo "  WhatsApp > Perangkat tertaut > Tautkan perangkat > Tautkan dengan nomor telepon"
echo "Setelah muncul '[WA] Tersambung. Bot siap.', tekan Ctrl+C untuk keluar dari log (bot tetap jalan)."
echo
sudo journalctl -u cps-bot -f -n 20 --no-pager
