// Karakter orisinal digambar sebagai SVG (tanpa foto/wajah orang sungguhan).
// renderAvatar(look, gender, mood) → string SVG; setMood(svgEl, mood) mengganti ekspresi.

const INK = "#2A1A12";
const LINE = `stroke="rgba(42,26,18,.28)" stroke-width="1.5"`;

function hairBack(style, c) {
  switch (style) {
    case "long": return `<path d="M66 62 Q62 18 100 20 Q138 18 134 62 L140 160 Q100 172 60 160 Z" fill="${c}"/>`;
    case "wavy": return `<path d="M66 62 Q62 18 100 20 Q138 18 134 62 L142 150 Q134 162 124 152 Q114 164 104 154 Q94 166 84 154 Q74 164 58 150 Z" fill="${c}"/>`;
    case "curlylong": return [[70, 40], [130, 40], [64, 70], [136, 70], [62, 100], [138, 100], [66, 128], [134, 128], [80, 146], [120, 146], [100, 150], [100, 22], [80, 26], [120, 26]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="17" fill="${c}"/>`).join("");
    case "bob": return `<path d="M64 64 Q62 20 100 20 Q138 20 136 64 L140 106 Q100 114 60 106 Z" fill="${c}"/>`;
    case "ponytail": return `<path d="M124 34 Q166 52 152 124 Q142 84 118 46 Z" fill="${c}"/>`;
    case "bun": return `<circle cx="100" cy="20" r="17" fill="${c}"/>`;
    case "hijab": return `<path d="M58 72 Q56 14 100 14 Q144 14 142 72 L150 136 Q100 158 50 136 Z" fill="${c}"/>`;
    default: return "";
  }
}

function hairFront(style, c) {
  const bangs = `<path d="M68 60 Q70 28 100 28 Q130 28 132 60 Q118 44 100 46 Q82 44 68 60 Z" fill="${c}"/>`;
  switch (style) {
    case "long": case "wavy": case "ponytail": case "bun": return bangs;
    case "bob": return `<path d="M66 62 Q66 26 100 26 Q134 26 134 62 L134 54 Q100 40 66 54 Z" fill="${c}"/>`;
    case "curlylong": case "curly": return [[76, 38], [92, 30], [108, 30], [124, 38], [70, 54], [130, 54]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="12" fill="${c}"/>`).join("");
    case "short": return `<path d="M68 64 Q64 26 100 26 Q136 26 132 64 Q130 46 118 42 Q100 50 82 42 Q70 46 68 64 Z" fill="${c}"/>`;
    case "wavyshort": return `<path d="M68 64 Q62 24 100 24 Q138 24 132 64 Q128 48 120 46 Q112 54 104 46 Q96 54 88 46 Q78 52 68 64 Z" fill="${c}"/>`;
    case "quiff": return `<path d="M68 64 Q64 30 100 28 Q136 30 132 64 Q130 48 118 44 Q100 50 82 44 Q70 48 68 64 Z" fill="${c}"/><path d="M76 42 Q96 4 134 32 Q116 26 98 36 Z" fill="${c}"/>`;
    case "curtain": return `<path d="M66 68 Q60 24 100 24 Q140 24 134 68 Q128 44 104 40 L100 54 L96 40 Q72 44 66 68 Z" fill="${c}"/>`;
    case "hijab": return `<path d="M70 54 Q100 30 130 54 Q100 42 70 54 Z" fill="${c}" opacity=".9"/><path d="M70 96 Q74 116 100 120 Q126 116 130 96 L134 112 Q100 134 66 112 Z" fill="${c}"/>`;
    default: return bangs;
  }
}

const FACES = {
  neutral: { eyes: "dot", brows: "flat", mouth: `<path d="M93 92 Q100 95 107 92" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`, blush: 0 },
  happy: { eyes: "arc", brows: "up", mouth: `<path d="M89 88 Q100 103 111 88 Q100 94 89 88 Z" fill="#8E2B2B"/>`, blush: .45 },
  amused: { eyes: "dot", brows: "raise", mouth: `<path d="M92 92 Q102 96 110 87" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`, blush: .2 },
  shy: { eyes: "down", brows: "up", mouth: `<path d="M95 92 Q100 96 105 92" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`, blush: .8 },
  curious: { eyes: "big", brows: "raise", mouth: `<ellipse cx="100" cy="93" rx="3.2" ry="3.8" fill="#8E2B2B"/>`, blush: .1 },
  annoyed: { eyes: "half", brows: "angry", mouth: `<path d="M93 95 Q100 91 107 95" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`, blush: 0 },
  uncomfortable: { eyes: "small", brows: "worried", mouth: `<path d="M91 94 Q95 90 100 94 Q105 98 109 94" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`, blush: 0, sweat: true },
  leaving: { eyes: "half", brows: "angry", mouth: `<path d="M93 96 Q100 92 107 96" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`, blush: 0 },
};

function eyes(kind, skin) {
  const pair = (fn) => fn(88) + fn(112);
  switch (kind) {
    case "arc": return pair((x) => `<path d="M${x - 5} 76 Q${x} 69 ${x + 5} 76" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`);
    case "down": return pair((x) => `<ellipse cx="${x}" cy="78" rx="3.2" ry="3.6" fill="${INK}"/>`);
    case "big": return pair((x) => `<ellipse cx="${x}" cy="74" rx="4.6" ry="5.6" fill="${INK}"/><circle cx="${x + 1.5}" cy="72" r="1.6" fill="#fff"/>`);
    case "half": return pair((x) => `<ellipse cx="${x}" cy="75" rx="4" ry="4.4" fill="${INK}"/><rect x="${x - 6}" y="69" width="12" height="5.5" fill="${skin}"/>`);
    case "small": return pair((x) => `<circle cx="${x}" cy="75" r="2.6" fill="${INK}"/>`);
    default: return pair((x) => `<ellipse cx="${x}" cy="75" rx="3.6" ry="4.6" fill="${INK}"/><circle cx="${x + 1.2}" cy="73.4" r="1.3" fill="#fff"/>`);
  }
}

function brows(kind, hairColor) {
  const s = `stroke="${hairColor}" stroke-width="2.8" fill="none" stroke-linecap="round"`;
  switch (kind) {
    case "up": return `<path d="M82 63 Q88 59 94 62" ${s}/><path d="M106 62 Q112 59 118 63" ${s}/>`;
    case "raise": return `<path d="M82 63 Q88 61 94 63" ${s}/><path d="M106 60 Q112 55 118 59" ${s}/>`;
    case "angry": return `<path d="M82 61 L94 65" ${s}/><path d="M106 65 L118 61" ${s}/>`;
    case "worried": return `<path d="M82 64 L94 60" ${s}/><path d="M106 60 L118 64" ${s}/>`;
    default: return `<path d="M82 63 Q88 61 94 63" ${s}/><path d="M106 63 Q112 61 118 63" ${s}/>`;
  }
}

export function faceMarkup(look, mood) {
  const f = FACES[mood] ?? FACES.neutral;
  return brows(f.brows, look.hair === "hijab" ? INK : look.hairColor) + eyes(f.eyes, look.skin) +
    `<ellipse cx="79" cy="86" rx="7" ry="4" fill="#F28B8B" opacity="${f.blush}"/><ellipse cx="121" cy="86" rx="7" ry="4" fill="#F28B8B" opacity="${f.blush}"/>` +
    f.mouth + (f.sweat ? `<path d="M128 54 q4 6 0 9 q-4 -3 0 -9z" fill="#7EC8F2"/>` : "");
}

function accessories(look, layer) {
  const a = new Set(look.acc ?? []);
  let out = "";
  if (layer === "back" && a.has("guitar")) {
    out += `<g transform="rotate(-14 150 190)"><rect x="138" y="110" width="26" height="150" rx="13" fill="#3B2A20"/><ellipse cx="151" cy="230" rx="22" ry="30" fill="#3B2A20"/><rect x="143" y="120" width="16" height="4" fill="#C9A46A"/></g>`;
  }
  if (layer === "body") {
    if (a.has("scarf")) out += `<path d="M84 114 Q100 126 116 114 L118 124 Q100 136 82 124 Z" fill="${look.accent}"/><rect x="104" y="122" width="10" height="34" rx="4" fill="${look.accent}"/>`;
    if (a.has("camera")) out += `<path d="M80 122 L114 170" stroke="${INK}" stroke-width="2"/><rect x="104" y="160" width="26" height="18" rx="4" fill="#2B2B2B"/><circle cx="117" cy="169" r="5.5" fill="#888"/>`;
  }
  if (layer === "head") {
    if (a.has("beard")) out += `<path d="M74 82 Q76 108 100 112 Q124 108 126 82 Q122 98 100 100 Q78 98 74 82 Z" fill="${look.hairColor}" opacity=".85"/>`;
    if (a.has("glasses")) out += `<g stroke="${INK}" stroke-width="2.2" fill="rgba(255,255,255,.15)"><circle cx="88" cy="75" r="9"/><circle cx="112" cy="75" r="9"/><path d="M97 75 L103 75" fill="none"/></g>`;
    if (a.has("earrings")) out += `<circle cx="68" cy="88" r="3" fill="#F6B800"/><circle cx="132" cy="88" r="3" fill="#F6B800"/>`;
  }
  if (layer === "top") {
    if (a.has("beret")) out += `<ellipse cx="94" cy="28" rx="34" ry="11" fill="${look.accent}" transform="rotate(-10 94 28)"/><circle cx="96" cy="17" r="3" fill="${look.accent}"/>`;
    if (a.has("headband")) out += `<rect x="66" y="40" width="68" height="9" rx="4" fill="${look.accent}" stroke="#ddd"/><circle cx="100" cy="44.5" r="3.4" fill="#C0392B"/>`;
  }
  return out;
}

/** Gambar karakter lengkap. opts.portrait = potong sampai dada (untuk kartu). */
export function renderAvatar(look, gender, mood = "neutral", opts = {}) {
  const { skin, top, bottom, shoes } = look;
  const female = gender === "F";
  const torso = female
    ? `<path d="M68 120 Q100 110 132 120 L128 176 L138 224 L62 224 L72 176 Z" fill="${top}" ${LINE}/>`
    : `<path d="M60 122 Q100 110 140 122 L144 224 L56 224 Z" fill="${top}" ${LINE}/>`;
  const legs = look.skirt
    ? `<g class="leg leg-l"><rect x="76" y="230" width="18" height="90" rx="8" fill="${skin}"/><ellipse cx="84" cy="322" rx="14" ry="7" fill="${shoes}"/></g>
       <g class="leg leg-r"><rect x="106" y="230" width="18" height="90" rx="8" fill="${skin}"/><ellipse cx="116" cy="322" rx="14" ry="7" fill="${shoes}"/></g>
       <path d="M60 214 L140 214 L154 268 L46 268 Z" fill="${bottom}" ${LINE}/>`
    : `<g class="leg leg-l"><rect x="70" y="214" width="26" height="106" rx="10" fill="${bottom}" ${LINE}/><ellipse cx="82" cy="322" rx="16" ry="7" fill="${shoes}"/></g>
       <g class="leg leg-r"><rect x="104" y="214" width="26" height="106" rx="10" fill="${bottom}" ${LINE}/><ellipse cx="118" cy="322" rx="16" ry="7" fill="${shoes}"/></g>`;
  const arm = (side) => {
    const x = side === "l" ? (female ? 56 : 48) : (female ? 128 : 136);
    return `<g class="arm arm-${side}"><rect x="${x}" y="122" width="16" height="80" rx="8" fill="${top}" ${LINE}/><circle cx="${x + 8}" cy="206" r="8.5" fill="${skin}"/></g>`;
  };
  const vb = opts.portrait ? "40 4 120 150" : "0 0 200 340";
  return `<svg class="avatar" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <ellipse class="shadow" cx="100" cy="328" rx="54" ry="8" fill="#000" opacity=".18"/>
    <g class="avatar-body">
      ${accessories(look, "back")}
      ${hairBack(look.hair, look.hairColor)}
      ${legs}
      ${torso}
      <rect x="91" y="98" width="18" height="22" rx="6" fill="${skin}"/>
      ${accessories(look, "body")}
      ${arm("l")}${arm("r")}
      ${look.hair === "hijab" ? "" : `<ellipse cx="67" cy="78" rx="6" ry="9" fill="${skin}"/><ellipse cx="133" cy="78" rx="6" ry="9" fill="${skin}"/>`}
      <ellipse cx="100" cy="72" rx="${look.hair === "hijab" ? 29 : 33}" ry="${look.hair === "hijab" ? 33 : 37}" fill="${skin}"/>
      <g class="face">${faceMarkup(look, mood)}</g>
      ${accessories(look, "head")}
      ${hairFront(look.hair, look.hairColor)}
      ${accessories(look, "top")}
    </g>
  </svg>`;
}

export function setMood(container, look, mood) {
  const face = container.querySelector(".face");
  if (face) face.innerHTML = faceMarkup(look, mood);
}

// ---------- Latar adegan (SVG berulang, digeser untuk efek berjalan) ----------
const SCENES = {
  park: { sky: "linear-gradient(#9FD3F5, #E3F3FF)", tile: `
    <rect y="210" width="600" height="90" fill="#7CBF6B"/><rect y="252" width="600" height="26" fill="#E8D8B0"/>
    ${[40, 220, 420].map((x) => `<rect x="${x + 22}" y="130" width="14" height="90" fill="#7A5230"/><circle cx="${x + 29}" cy="118" r="44" fill="#4E9E55"/><circle cx="${x + 2}" cy="140" r="28" fill="#5DB063"/><circle cx="${x + 58}" cy="138" r="30" fill="#4A9450"/>`).join("")}
    <rect x="320" y="222" width="70" height="8" rx="3" fill="#8A5A34"/><rect x="326" y="230" width="6" height="18" fill="#5C3A1E"/><rect x="378" y="230" width="6" height="18" fill="#5C3A1E"/>` },
  city: { sky: "linear-gradient(#A9C8F0, #F2E9D8)", tile: `
    ${[[0, 80, 90, "#22348C"], [100, 120, 70, "#B0563F"], [180, 60, 100, "#5F6690"], [290, 100, 80, "#C99A5B"], [380, 70, 110, "#16226A"], [500, 110, 100, "#9E4A3A"]]
      .map(([x, y, w, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${260 - y}" fill="${c}"/>` +
        Array.from({ length: Math.floor((240 - y) / 30) }, (_, r) => Array.from({ length: Math.floor(w / 26) }, (_, k) => `<rect x="${x + 8 + k * 26}" y="${y + 12 + r * 30}" width="12" height="16" fill="#F6D776" opacity=".85"/>`).join("")).join("")).join("")}
    <rect y="240" width="600" height="60" fill="#B9B6AE"/><rect y="236" width="600" height="6" fill="#8D8A84"/>
    ${[60, 300, 540].map((x) => `<rect x="${x}" y="150" width="5" height="90" fill="#2B2B2B"/><circle cx="${x + 2.5}" cy="148" r="8" fill="#F6D776"/>`).join("")}` },
  beach: { sky: "linear-gradient(#7CC6F2, #EAF7FF)", tile: `
    <rect y="150" width="600" height="80" fill="#2F8FD0"/><path d="M0 160 q25 -8 50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0 t50 0" stroke="#BFE6FF" stroke-width="3" fill="none"/>
    <rect y="220" width="600" height="80" fill="#F1D9A6"/>
    <path d="M120 230 Q112 170 132 120" stroke="#8A5A2B" stroke-width="9" fill="none"/>${[[-40, 0], [40, 0], [-30, 20], [30, 20]].map(([dx, dy]) => `<path d="M132 120 q${dx} ${-10 + dy} ${dx * 1.4} ${18 + dy}" stroke="#3E9E5A" stroke-width="10" fill="none" stroke-linecap="round"/>`).join("")}
    <path d="M420 200 l40 -50 l40 50 z" fill="#E8710A"/><rect x="458" y="150" width="4" height="80" fill="#5C3A1E"/>` },
  market: { sky: "linear-gradient(#F7C98B, #FCEBD2)", tile: `
    <rect y="240" width="600" height="60" fill="#C9A37A"/>
    ${[[10, "#F6B800"], [160, "#22348C"], [310, "#C0392B"], [460, "#2E8B57"]].map(([x, c]) => `
      <rect x="${x + 6}" y="150" width="6" height="92" fill="#6B4A2E"/><rect x="${x + 122}" y="150" width="6" height="92" fill="#6B4A2E"/>
      ${Array.from({ length: 7 }, (_, i) => `<path d="M${x + i * 20} 150 h20 v-30 h-20 z" fill="${i % 2 ? "#fff" : c}"/><path d="M${x + i * 20} 150 q10 14 20 0" fill="${i % 2 ? "#fff" : c}"/>`).join("")}
      <rect x="${x}" y="200" width="134" height="40" fill="#8A5A34"/>${[0, 1, 2, 3, 4].map((k) => `<circle cx="${x + 16 + k * 25}" cy="198" r="9" fill="${["#E8710A", "#C0392B", "#F6B800", "#7CBF6B", "#E8710A"][k]}"/>`).join("")}`).join("")}` },
  riverside: { sky: "linear-gradient(#F4A58A, #FBD6A6 60%, #FFE9C7)", tile: `
    ${[[0, 120], [60, 90], [110, 140], [200, 100], [260, 130], [330, 80], [400, 120], [470, 95], [540, 135]].map(([x, y]) => `<rect x="${x}" y="${y}" width="50" height="${200 - y}" fill="#6E5A7A" opacity=".55"/>`).join("")}
    <rect y="190" width="600" height="46" fill="#5C83B5"/><path d="M0 200 q30 -6 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0" stroke="#A9C8F0" stroke-width="2" fill="none"/>
    <path d="M300 236 Q380 150 460 236" stroke="#8D8A84" stroke-width="10" fill="none"/>
    <rect y="236" width="600" height="64" fill="#B9B6AE"/><rect y="232" width="600" height="5" fill="#2B2B2B"/>${Array.from({ length: 30 }, (_, i) => `<rect x="${i * 20}" y="214" width="3" height="20" fill="#2B2B2B"/>`).join("")}<rect y="212" width="600" height="4" fill="#2B2B2B"/>` },
  lake: { sky: "linear-gradient(#BFE3F7, #F4EEDC)", tile: `
    <path d="M0 150 L80 90 L150 140 L230 70 L320 140 L400 95 L480 150 L560 100 L600 130 L600 170 L0 170 Z" fill="#7C9A8A"/>
    <rect y="160" width="600" height="80" fill="#4F8FB8"/>${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${i * 100 + 10} 190 q20 -6 40 0" stroke="#A9D4EE" stroke-width="2" fill="none"/>`).join("")}
    <rect y="236" width="600" height="64" fill="#7CAF6B"/><path d="M0 236 q300 -14 600 0" fill="#7CAF6B"/>
    <rect x="360" y="196" width="160" height="10" fill="#8A5A34"/>${[370, 420, 470, 510].map((x) => `<rect x="${x}" y="206" width="6" height="40" fill="#5C3A1E"/>`).join("")}
    ${[60, 150, 250].map((x) => `<path d="M${x} 236 l6 -26 l6 26z" fill="#4E7A3A"/>`).join("")}` },
  pool: { sky: "linear-gradient(#9FD8F5, #EAF7FF)", tile: `
    <rect y="120" width="600" height="60" fill="#E9E4DA"/>${Array.from({ length: 12 }, (_, i) => `<rect x="${i * 50}" y="120" width="2" height="60" fill="#D4CEC2"/>`).join("")}
    <rect y="180" width="600" height="70" fill="#38B6E8"/>${[195, 215, 235].map((y) => `<path d="M0 ${y} h600" stroke="#fff" stroke-width="2" stroke-dasharray="14 10" opacity=".7"/>`).join("")}
    ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${i * 100 + 20} 200 q15 -5 30 0" stroke="#BDEBFF" stroke-width="2" fill="none"/>`).join("")}
    <rect y="250" width="600" height="50" fill="#F1EDE4"/><rect x="420" y="130" width="6" height="50" fill="#BDBDBD"/><rect x="450" y="130" width="6" height="50" fill="#BDBDBD"/>
    ${[140, 156, 172].map((y) => `<rect x="420" y="${y}" width="36" height="3" fill="#BDBDBD"/>`).join("")}` },
  gym: { sky: "linear-gradient(#3A3F55, #555B75)", tile: `
    <rect y="0" width="600" height="230" fill="#4A4F66"/>${[0, 1, 2].map((i) => `<rect x="${i * 200 + 20}" y="30" width="160" height="90" fill="#7FA7D9" opacity=".35" stroke="#2B2F40" stroke-width="4"/>`).join("")}
    <rect y="230" width="600" height="70" fill="#2B2B2B"/>${Array.from({ length: 12 }, (_, i) => `<rect x="${i * 50}" y="230" width="48" height="70" fill="#333"/>`).join("")}
    <rect x="40" y="200" width="10" height="34" fill="#888"/><rect x="20" y="196" width="70" height="6" fill="#999"/>${[16, 86].map((x) => `<rect x="${x}" y="186" width="10" height="26" rx="2" fill="#111"/>`).join("")}
    <rect x="300" y="170" width="120" height="60" rx="6" fill="#222"/><rect x="310" y="150" width="8" height="30" fill="#555"/><rect x="300" y="146" width="40" height="8" rx="3" fill="#555"/>
    ${[480, 510, 540].map((x, i) => `<rect x="${x}" y="${200 - i * 6}" width="22" height="${34 + i * 6}" rx="3" fill="${["#C0392B", "#F6B800", "#2F6FB2"][i]}"/>`).join("")}` },
  cafe: { sky: "linear-gradient(#F3E3CF, #FBF3E8)", tile: `
    <rect y="0" width="600" height="300" fill="#EADBC6"/>${[0, 1, 2].map((i) => `<rect x="${i * 200 + 30}" y="40" width="140" height="110" rx="6" fill="#BFD8EA" stroke="#8A5A34" stroke-width="6"/><path d="M${i * 200 + 100} 40 v110 M${i * 200 + 30} 95 h140" stroke="#8A5A34" stroke-width="4"/>`).join("")}
    ${[0, 1, 2, 3, 4].map((i) => `<path d="M${i * 120 + 20} 10 v20" stroke="#5C3A1E" stroke-width="2"/><path d="M${i * 120 + 8} 30 h24 l-6 12 h-12z" fill="#F6B800"/>`).join("")}
    <rect y="230" width="600" height="70" fill="#B98A5E"/>${Array.from({ length: 10 }, (_, i) => `<rect x="${i * 60}" y="230" width="58" height="70" fill="#C49668"/>`).join("")}
    ${[110, 330, 520].map((x) => `<ellipse cx="${x}" cy="205" rx="40" ry="8" fill="#6B4A2E"/><rect x="${x - 3}" y="205" width="6" height="30" fill="#5C3A1E"/><rect x="${x - 12}" y="190" width="12" height="14" rx="2" fill="#fff"/><path d="M${x} 193 q6 0 6 5 q0 5 -6 5" stroke="#fff" stroke-width="2" fill="none"/>`).join("")}` },
};

export function sceneStyle(scene) {
  const s = SCENES[scene] ?? SCENES.park;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300">${s.tile}</svg>`;
  return `background-image:url("data:image/svg+xml,${encodeURIComponent(svg)}"),${s.sky};`;
}
