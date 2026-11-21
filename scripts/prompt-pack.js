// Membuat docs/prompt-pack-karakter.md: prompt untuk membuat FOTO REALISTIS karakter fiksi
// dengan pembuat gambar AI (Midjourney, Flux, Ideogram, dll). Jalankan: npm run prompts
import fs from "node:fs";
import { CHARACTERS, MOOD_FILES } from "../characters.js";

const MOOD_PROMPT = {
  neutral: "relaxed neutral expression, looking at the camera as if someone just said hi",
  happy: "genuine warm smile, eyes crinkling, looking at the camera",
  amused: "playful smirk, one eyebrow slightly raised, amused",
  shy: "shy smile, glancing slightly down and away, light blush",
  curious: "curious interested expression, head slightly tilted, eyebrows raised",
  annoyed: "unimpressed annoyed expression, slight frown, arms crossed",
  uncomfortable: "uncomfortable expression, leaning back slightly, polite but tense, hand raised in a 'stop' gesture",
  leaving: "turning away and walking off, looking back over the shoulder with a disapproving look",
};
const SCENE_PROMPT = {
  city: "on a lively city street in", park: "in a green park in", beach: "on a sunny beach promenade in",
  market: "in a busy colourful street market in", riverside: "on a riverside walkway at golden hour in",
};

let md = `# Paket Prompt Foto Realistis — Karakter Fiksi Cheesy Pen Shells

> File ini dibuat otomatis oleh \`npm run prompts\` dari \`characters.js\`. Jangan diedit manual.

Semua karakter adalah **orang fiksi** (tidak ada di dunia nyata). Jangan memakai foto orang sungguhan, jangan membuat
wajah yang menyerupai selebriti/orang tertentu, dan beri label "karakter AI" bila dipublikasikan.

## Cara pakai
1. Buat dulu foto **neutral** sebuah karakter. Simpan hasil terbaik sebagai **referensi wajah** (character reference / seed).
2. Buat 7 ekspresi lain dengan referensi wajah yang sama, supaya orangnya konsisten.
3. Format: **lanskap 16:9** (mis. 1600×900), orang di tengah, terlihat dari pinggang/lutut ke atas, kepala tidak terpotong.
4. Simpan ke \`public/characters/<id>/<mood>.jpg\` (atau .webp/.png). Nama mood: ${MOOD_FILES.map((m) => `\`${m}\``).join(", ")}.
   Minimal \`neutral.jpg\` — mood yang tidak ada otomatis memakai foto terdekat.
5. Opsional: \`portrait.jpg\` (potret 4:5 untuk kartu), \`walk.mp4\` (video 5–10 detik dia berjalan, tanpa suara, ditampilkan sebelum kamu menyapa),
   dan foto latar \`public/scenes/<scene>.jpg\`.
6. Refresh website — mode Pendekatan otomatis memakai foto.

**Prompt dasar (tambahkan di depan setiap prompt):**
\`photorealistic candid street photo, natural light, 35mm lens, shallow depth of field, realistic skin texture, fully clothed, non-suggestive, adult\`

**Negative prompt:** \`cartoon, anime, illustration, celebrity, famous person, lookalike, nsfw, revealing clothing, extra fingers, distorted face, text, watermark\`

`;

for (const [id, c] of Object.entries(CHARACTERS)) {
  const city = c.city.split(",")[0];
  md += `\n---\n\n## ${c.flag} ${c.name} — \`${id}\`\n${c.age} th · ${c.job} · ${c.city} · ${c.personality}\n\nFolder: \`public/characters/${id}/\`\n\n`;
  for (const m of MOOD_FILES) {
    md += `- **${m}.jpg** — \`${c.appearance}, ${SCENE_PROMPT[c.scene]} ${city}, ${MOOD_PROMPT[m]}\`\n`;
  }
}
fs.writeFileSync(new URL("../docs/prompt-pack-karakter.md", import.meta.url), md);
console.log(`docs/prompt-pack-karakter.md dibuat (${Object.keys(CHARACTERS).length} karakter × ${MOOD_FILES.length} ekspresi).`);
