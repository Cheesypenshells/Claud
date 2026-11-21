#!/data/data/com.termux/files/usr/bin/bash
# Pemasangan bot Cheesy Pen Shells di HP Android lewat aplikasi Termux.
# Jalankan di Termux:
#   curl -fsSL https://raw.githubusercontent.com/Cheesypenshells/Claud/claude/cheesy-pen-shells-management-nq92xx/scripts/pasang-hp.sh | bash
set -euo pipefail

REPO="https://github.com/Cheesypenshells/Claud.git"
BRANCH="${CPS_BRANCH:-claude/cheesy-pen-shells-management-nq92xx}"
DIR="$HOME/cps-bot"

# Buang ketikan yang masuk selama proses pemasangan, supaya tidak terbaca sebagai jawaban.
buangKetikan() { while read -r -t 0.2 _ < /dev/tty; do :; done 2>/dev/null || true; }
tanya() { local var; buangKetikan; read -rp "$1" var < /dev/tty; echo "$var" | tr -cd '0-9A-Za-z_-'; }
# Nomor boleh ditulis 0877... atau 62877...; disimpan sebagai 62877...
tanyaNomor() { tanya "$1" | tr -cd '0-9' | sed 's/^0/62/'; }
judul() { echo; echo "=== $1 ==="; }

judul "1/5 Memasang Node.js dan git (beberapa menit)"
yes | pkg upgrade -y -o Dpkg::Options::="--force-confnew" >/dev/null 2>&1 || true
pkg install -y nodejs-lts git tesseract >/dev/null
echo "Node.js $(node -v) terpasang."

judul "2/5 Izin membaca folder Download"
if [ ! -d "$HOME/storage/downloads" ]; then
  echo "Akan muncul permintaan izin penyimpanan. Pilih IZINKAN."
  termux-setup-storage || true
  sleep 5
fi

judul "3/5 Mengunduh kode bot"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH"
  git -C "$DIR" checkout -q "$BRANCH"
  git -C "$DIR" reset -q --hard "origin/$BRANCH"
else
  git clone -q -b "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR"
npm ci --omit=dev --omit=peer --no-audit --no-fund --loglevel=error

judul "4/5 Pengaturan"
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

until [ -f "$DIR/credentials.json" ]; do
  for f in "$HOME"/storage/downloads/credentials*.json "$HOME"/storage/shared/Download/credentials*.json; do
    if [ -f "$f" ]; then cp "$f" "$DIR/credentials.json"; break; fi
  done
  [ -f "$DIR/credentials.json" ] && break
  echo "File credentials.json tidak ditemukan di folder Download HP."
  echo "Pindahkan/unduh credentials.json ke folder Download, lalu tekan Enter."
  read -rp "" _ < /dev/tty
done
if ! node -e "JSON.parse(require('fs').readFileSync('credentials.json','utf8')).client_email" >/dev/null 2>&1; then
  echo "credentials.json tidak valid. Unduh ulang dari Google Cloud lalu jalankan skrip ini lagi."
  rm -f credentials.json
  exit 1
fi
chmod 600 credentials.json .env
echo "credentials.json siap."

judul "5/5 Membuat perintah singkat 'bot'"
grep -q "alias bot=" "$HOME/.bashrc" 2>/dev/null || echo "alias bot='bash $DIR/scripts/jalankan-hp.sh'" >> "$HOME/.bashrc"
grep -q "alias perbarui-bot=" "$HOME/.bashrc" 2>/dev/null || echo "alias perbarui-bot='bash $DIR/scripts/perbarui-hp.sh'" >> "$HOME/.bashrc"

echo
echo "Pemasangan selesai. Bot dijalankan sekarang."
echo "Lain kali cukup buka Termux lalu ketik:  bot"
echo
exec bash "$DIR/scripts/jalankan-hp.sh"
