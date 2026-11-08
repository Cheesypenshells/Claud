# Produksi: Mesin Video
Setiap video = 1 folder berisi `bahan/` (foto/klip) + `spec.json` (teks & urutan).

```bash
python3 tools/studio.py editorial produksi/<folder>/spec.json   # gaya B&W @geov10
python3 tools/studio.py promo     produksi/<folder>/spec.json   # promo @cheesypenshells
```
Hasil: `produksi/<folder>/hasil.mp4` (1080x1920, siap upload). Musik tambahkan di Instagram.

## spec editorial
```json
{
  "output": "hasil.mp4",
  "audio": "bahan/voiceover.m4a",            // opsional (suara George)
  "scenes": [
    {"media": "bahan/klip1.mp4", "start": 2, "duration": 5,
     "line1": "baris biasa,", "line2": "baris miring."}
  ],
  "signature": {"name": "George Vallentino", "title": "FOUNDER  ·  CHEESY PEN SHELLS"}
}
```
Opsi scene: `photo_height` (tinggi foto, default 1150), `grade` (mis. `contrast=1.1:brightness=0.08`),
`size1`, `size2`, `soften` (true/false).

## spec promo
```json
{
  "output": "hasil.mp4",
  "scenes": [
    {"media": "bahan/keju.mp4", "start": 1, "duration": 2.8,
     "top": "OYSTER BAKAR", "bottom": "KEJU LUMER", "color": "#ffd400", "fit": "fit"}
  ],
  "endcard": {"headline": "CUMA 15 RIBUAN", "sub": "Lokasi lengkap di bio", "handle": "@cheesypenshells"}
}
```
`fit: "fill"` = klip vertikal penuh layar; `"fit"` = klip ditaruh di tengah dengan latar blur.

## Contoh
- `contoh-editorial/`: dari foto lama (low-res)
- `contoh-promo/`: dari foto feed (low-res)
Dengan klip asli 4K dari HP, hasilnya tajam.
