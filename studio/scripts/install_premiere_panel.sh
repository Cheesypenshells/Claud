#!/usr/bin/env bash
# macOS: install the Studio Bridge CEP panel into Premiere Pro (run once).
set -e
SRC="$(cd "$(dirname "$0")/../premiere-panel" && pwd)"
DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/com.studio.bridge"
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST" && cp -R "$SRC" "$DEST"
for v in 9 10 11 12 13; do defaults write com.adobe.CSXS.$v PlayerDebugMode 1; done
echo "Installed to $DEST. Restart Premiere Pro, then Window > Extensions > Studio Bridge."
