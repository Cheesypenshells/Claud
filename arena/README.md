# Arena

Tempat menguji kombinasi **agent × model** pada task baku. Tujuannya cari setelan paling hemat token yang tetap presisi dan konsisten.

## Rubrik (total 100)

| Kriteria | Bobot | Arti |
|---|---|---|
| Benar | 40 | Memenuhi semua kriteria selesai task |
| Presisi | 20 | Nggak ada tambahan yang nggak diminta, detail tepat |
| Konsisten | 15 | Hasil stabil antar-run |
| Efisien | 15 | Token yang dipakai relatif terhadap kandidat lain |
| Cepat | 10 | Waktu selesai relatif |

## Aturan kalibrasi

- **De-eskalasi:** tier lebih murah skornya ≥95% tier mahal di ≥3 run → jadi default baru.
- **Eskalasi:** Benar < 80 di ≥2 run → naik tier.
- Perubahan masuk ke tabel "Override dari Arena" di `.claude/docs/agents/routing.md`.

## Struktur

- `tasks/T###-*.md`: task benchmark (prompt, kriteria, cara cek)
- `runs/`: log tiap run
- `scoreboard.md`: rekap skor terbaru per agent × model

Tambah task baru dari pekerjaan nyata yang pernah salah atau sering muncul. Itu task paling berharga.
