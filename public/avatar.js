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
    case "braids": return `<path d="M64 60 Q60 16 100 16 Q140 16 136 60 L144 176 Q100 186 56 176 Z" fill="${c}"/>` +
      Array.from({ length: 9 }, (_, i) => `<path d="M${62 + i * 9.5} 70 L${58 + i * 10.5} 176" stroke="#3A2A20" stroke-width="2" opacity=".55"/>`).join("");
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
    case "braids": return `<path d="M66 60 Q68 24 100 24 Q132 24 134 60 Q120 40 100 40 Q80 40 66 60 Z" fill="${c}"/>` +
      [76, 88, 100, 112, 124].map((x) => `<path d="M${x} 28 L${x} 46" stroke="#3A2A20" stroke-width="2" opacity=".5"/>`).join("");
    case "fade": return `<path d="M68 58 Q66 30 100 30 Q134 30 132 58 Q128 44 100 42 Q72 44 68 58 Z" fill="${c}"/><path d="M68 58 Q67 66 68 72 M132 58 Q133 66 132 72" stroke="${c}" stroke-width="4" opacity=".55"/>`;
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

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, "0")).join("")}`;
}

function accessories(look, layer) {
  const a = new Set(look.acc ?? []);
  const hijab = look.hair === "hijab";
  let out = "";
  if (layer === "back") {
    if (a.has("guitar")) out += `<g transform="rotate(-14 150 190)"><rect x="138" y="110" width="26" height="150" rx="13" fill="#3B2A20"/><ellipse cx="151" cy="230" rx="22" ry="30" fill="#3B2A20"/><rect x="143" y="120" width="16" height="4" fill="#C9A46A"/></g>`;
    if (a.has("backpack")) out += `<rect x="58" y="128" width="84" height="80" rx="16" fill="#3A5A7A"/>`;
  }
  if (layer === "body") {
    if (a.has("apron")) out += `<path d="M92 118 L84 150" stroke="#ddd" stroke-width="3"/><path d="M108 118 L116 150" stroke="#ddd" stroke-width="3"/><rect x="76" y="148" width="48" height="${look.skirt ? 110 : 96}" rx="6" fill="${look.style === "chef" ? "#F6B800" : look.top === "#FFFFFF" ? "#F6D046" : "#FAFAFA"}" ${LINE}/><rect x="88" y="182" width="24" height="16" rx="3" fill="rgba(0,0,0,.08)"/>`;
    if (a.has("scarf")) out += `<path d="M84 114 Q100 126 116 114 L118 124 Q100 136 82 124 Z" fill="${look.accent}"/><rect x="104" y="122" width="10" height="34" rx="4" fill="${look.accent}"/>`;
    if (a.has("necklace") && !a.has("scarf")) out += `<path d="M88 118 Q100 134 112 118" stroke="#F6B800" stroke-width="2" fill="none"/><circle cx="100" cy="132" r="3.2" fill="#F6B800"/>`;
    if (a.has("tie")) out += `<path d="M97 120 h6 l3 6 l-4 50 l-2 4 l-2 -4 l-4 -50 z" fill="#1F2A44"/>`;
    if (a.has("lanyard")) out += `<path d="M88 116 L98 160 M112 116 L102 160" stroke="#C0392B" stroke-width="2.5"/><rect x="91" y="158" width="18" height="24" rx="2" fill="#fff" stroke="#999"/><rect x="94" y="162" width="12" height="7" fill="#7FB3D5"/>`;
    if (a.has("stethoscope")) out += `<path d="M86 116 Q84 150 100 154 Q116 150 114 116" stroke="#333" stroke-width="2.5" fill="none"/><path d="M100 154 v14" stroke="#333" stroke-width="2.5"/><circle cx="100" cy="172" r="5" fill="#999" stroke="#333"/>`;
    if (a.has("camera")) out += `<path d="M80 122 L114 170" stroke="${INK}" stroke-width="2"/><rect x="104" y="160" width="26" height="18" rx="4" fill="#2B2B2B"/><circle cx="117" cy="169" r="5.5" fill="#888"/>`;
    if (a.has("bag")) out += `<path d="M76 124 L124 196" stroke="#5C3A1E" stroke-width="3"/><rect x="114" y="188" width="26" height="20" rx="4" fill="#8A5A34"/>`;
    if (a.has("backpack")) out += `<path d="M78 122 L80 200 M122 122 L120 200" stroke="#2A4560" stroke-width="5"/>`;
  }
  if (layer === "head") {
    if (a.has("beard")) out += `<path d="M74 82 Q76 108 100 112 Q124 108 126 82 Q122 98 100 100 Q78 98 74 82 Z" fill="${look.hairColor}" opacity=".85"/>`;
    if (a.has("glasses") && !a.has("sunglasses")) out += `<g stroke="${INK}" stroke-width="2.2" fill="rgba(255,255,255,.15)"><circle cx="88" cy="75" r="9"/><circle cx="112" cy="75" r="9"/><path d="M97 75 L103 75" fill="none"/></g>`;
    if (a.has("sunglasses")) out += `<g fill="#1A1A1A"><rect x="77" y="68" width="21" height="13" rx="5"/><rect x="102" y="68" width="21" height="13" rx="5"/></g><path d="M98 73 h4" stroke="#1A1A1A" stroke-width="2"/><rect x="80" y="70" width="6" height="3" rx="1" fill="#fff" opacity=".35"/>`;
    if (a.has("earrings") && !hijab) out += `<circle cx="68" cy="88" r="3" fill="#F6B800"/><circle cx="132" cy="88" r="3" fill="#F6B800"/>`;
  }
  if (layer === "top" && !hijab) {
    if (a.has("beret")) out += `<ellipse cx="94" cy="28" rx="34" ry="11" fill="${look.accent}" transform="rotate(-10 94 28)"/><circle cx="96" cy="17" r="3" fill="${look.accent}"/>`;
    if (a.has("headband")) out += `<rect x="66" y="40" width="68" height="9" rx="4" fill="${look.accent === "#FFFFFF" ? "#fff" : look.accent}" stroke="#ddd"/><circle cx="100" cy="44.5" r="3.4" fill="#C0392B"/>`;
    if (a.has("cap")) out += `<path d="M66 54 Q64 22 100 22 Q136 22 134 54 Z" fill="${look.accent === "#FFFFFF" ? "#22348C" : look.accent}"/><path d="M100 54 Q130 50 148 58 Q128 62 100 58 Z" fill="${shade(look.accent === "#FFFFFF" ? "#22348C" : look.accent, -30)}"/><circle cx="100" cy="23" r="3" fill="${shade(look.accent === "#FFFFFF" ? "#22348C" : look.accent, -40)}"/>`;
    if (a.has("beanie")) out += `<path d="M66 56 Q64 18 100 18 Q136 18 134 56 Z" fill="#B03A2E"/><rect x="64" y="46" width="72" height="12" rx="5" fill="#8E2B22"/><circle cx="100" cy="16" r="6" fill="#B03A2E"/>`;
    if (a.has("pilotcap")) out += `<path d="M62 46 Q62 24 100 22 Q138 24 138 46 Z" fill="#1F2A44"/><rect x="62" y="44" width="76" height="8" fill="#111"/><path d="M76 52 Q100 62 124 52 Z" fill="#111"/><circle cx="100" cy="34" r="5" fill="#F6B800"/>`;
    if (a.has("chefhat")) out += `<rect x="72" y="28" width="56" height="18" fill="#fff" stroke="#ddd"/>${[78, 92, 108, 122].map((x) => `<circle cx="${x}" cy="20" r="12" fill="#fff" stroke="#eee"/>`).join("")}`;
    if (a.has("headphones")) out += `<path d="M66 72 Q64 24 100 24 Q136 24 134 72" stroke="#2B2B2B" stroke-width="6" fill="none"/><rect x="58" y="66" width="14" height="22" rx="6" fill="#2B2B2B"/><rect x="128" y="66" width="14" height="22" rx="6" fill="#2B2B2B"/>`;
    if (a.has("hairflower")) out += `<g transform="translate(126 40)">${[0, 72, 144, 216, 288].map((d) => `<ellipse cx="0" cy="-6" rx="4" ry="6" fill="#F48FB1" transform="rotate(${d})"/>`).join("")}<circle r="3.5" fill="#F6B800"/></g>`;
    if (a.has("hairclip")) out += `<rect x="74" y="40" width="16" height="6" rx="3" fill="${look.accent}" transform="rotate(-20 82 43)"/>`;
  }
  return out;
}

// Detail gaya atasan (digambar di atas torso)
function styleDetail(look, female) {
  const t = look.top, d = shade(t, -35), l = shade(t, 30);
  const s = look.style ?? "tee";
  switch (s) {
    case "shirt": return `<path d="M88 116 L100 132 L112 116 L106 112 L100 124 L94 112 Z" fill="${l}"/><path d="M100 132 V220" stroke="${d}" stroke-width="1.5"/>${[146, 166, 186, 206].map((y) => `<circle cx="100" cy="${y}" r="1.8" fill="${d}"/>`).join("")}`;
    case "blouse": return `<path d="M88 116 Q100 134 112 116" fill="${look.skin}"/><path d="M84 124 Q100 140 116 124" stroke="${d}" stroke-width="1.5" fill="none"/>`;
    case "sweater": return `<path d="M88 116 Q100 126 112 116" stroke="${d}" stroke-width="4" fill="none"/><rect x="${female ? 62 : 56}" y="212" width="${female ? 76 : 88}" height="12" fill="${d}" opacity=".6"/>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<path d="M${74 + i * 9} 150 v8" stroke="${d}" stroke-width="1" opacity=".5"/>`).join("")}`;
    case "jacket": return `<path d="M92 116 L96 224 L104 224 L108 116 Z" fill="${look.accent === t ? "#F2F2F2" : look.accent}" opacity=".95"/><path d="M92 116 L86 150 M108 116 L114 150" stroke="${d}" stroke-width="2"/><path d="M96 116 V224 M104 116 V224" stroke="${d}" stroke-width="1.5"/>`;
    case "hoodie": return `<path d="M80 116 Q100 134 120 116 Q118 104 100 104 Q82 104 80 116 Z" fill="${d}"/><path d="M95 124 v26 M105 124 v26" stroke="#eee" stroke-width="2"/><path d="M80 180 h40 l4 26 h-48 z" fill="${d}" opacity=".5"/>`;
    case "blazer": return `<path d="M90 116 L100 170 L110 116 Z" fill="#F7F7F7"/><path d="M90 116 L82 146 L100 170 Z M110 116 L118 146 L100 170 Z" fill="${d}"/>${[182, 200].map((y) => `<circle cx="100" cy="${y}" r="2.5" fill="${shade(t, -60)}"/>`).join("")}`;
    case "scrubs": return `<path d="M88 116 L100 140 L112 116" fill="${look.skin}" stroke="${d}" stroke-width="2"/><rect x="70" y="150" width="20" height="16" rx="2" fill="${d}" opacity=".5"/>`;
    case "chef": return `<rect x="90" y="112" width="20" height="8" rx="2" fill="#E8E8E8"/>${[136, 156, 176, 196].map((y) => `<circle cx="92" cy="${y}" r="2.4" fill="#BBB"/><circle cx="108" cy="${y}" r="2.4" fill="#BBB"/>`).join("")}`;
    case "kimono": return `<path d="M86 116 L112 200 M114 116 L94 160" stroke="${d}" stroke-width="3"/><path d="M88 116 L100 136 L112 116" fill="#F2E6D0"/><rect x="${female ? 70 : 60}" y="168" width="${female ? 60 : 80}" height="18" fill="#C99700"/><rect x="${female ? 70 : 60}" y="175" width="${female ? 60 : 80}" height="3" fill="#8E2B22"/>`;
    case "wetsuit": return `<path d="M100 116 V210" stroke="${shade(t, 60)}" stroke-width="2"/><path d="M${female ? 70 : 62} 140 L${female ? 72 : 64} 220 M${female ? 130 : 138} 140 L${female ? 128 : 136} 220" stroke="${look.accent}" stroke-width="4"/>`;
    case "overalls": return `<rect x="78" y="146" width="44" height="78" rx="4" fill="${look.bottom}" ${LINE}/><path d="M80 148 L76 118 M120 148 L124 118" stroke="${look.bottom}" stroke-width="6"/><circle cx="82" cy="150" r="2.5" fill="#C9A46A"/><circle cx="118" cy="150" r="2.5" fill="#C9A46A"/>${[[86, 170, "#E8710A"], [110, 160, "#2F8FD0"], [96, 196, "#F6B800"], [120, 205, "#4E9E55"]].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="3" fill="${c}"/>`).join("")}`;
    case "dress": return `<path d="M88 116 Q100 130 112 116" fill="${look.skin}"/><rect x="${female ? 70 : 60}" y="176" width="${female ? 60 : 80}" height="5" fill="${d}"/>`;
    default: return `<path d="M88 116 Q100 126 112 116" stroke="${d}" stroke-width="3" fill="none"/>`; // tee
  }
}

/** Gambar karakter lengkap. opts.portrait = potong sampai dada (untuk kartu). */
export function renderAvatar(look, gender, mood = "neutral", opts = {}) {
  const { skin, top, shoes } = look;
  const bottom = look.bottom ?? "#2B2B2B";
  const female = gender === "F";
  const style = look.style ?? "tee";
  const longSkirt = style === "kimono";
  const skirt = look.skirt || style === "dress" || longSkirt;
  const shortSleeve = ["tee", "scrubs", "dress"].includes(style) || (style === "overalls");
  const torso = female
    ? `<path d="M68 120 Q100 110 132 120 L128 176 L138 224 L62 224 L72 176 Z" fill="${top}" ${LINE}/>`
    : `<path d="M60 122 Q100 110 140 122 L144 224 L56 224 Z" fill="${top}" ${LINE}/>`;
  const legColor = style === "wetsuit" ? top : bottom;
  let legs;
  if (skirt) {
    legs = `<g class="leg leg-l"><rect x="76" y="230" width="18" height="90" rx="8" fill="${longSkirt ? bottom : skin}"/><ellipse cx="84" cy="322" rx="14" ry="7" fill="${shoes}"/></g>
       <g class="leg leg-r"><rect x="106" y="230" width="18" height="90" rx="8" fill="${longSkirt ? bottom : skin}"/><ellipse cx="116" cy="322" rx="14" ry="7" fill="${shoes}"/></g>
       ${longSkirt ? `<path d="M60 214 L140 214 L146 312 L54 312 Z" fill="${bottom}" ${LINE}/>` : `<path d="M60 214 L140 214 L154 268 L46 268 Z" fill="${style === "dress" ? top : bottom}" ${LINE}/>`}`;
  } else if (look.shorts) {
    const leg = (x, cls) => `<g class="leg ${cls}"><rect x="${x + 2}" y="250" width="22" height="70" rx="9" fill="${skin}"/><rect x="${x}" y="214" width="26" height="46" rx="8" fill="${legColor}" ${LINE}/><ellipse cx="${x + 12}" cy="322" rx="16" ry="7" fill="${shoes}"/></g>`;
    legs = leg(70, "leg-l") + leg(104, "leg-r");
  } else {
    legs = `<g class="leg leg-l"><rect x="70" y="214" width="26" height="106" rx="10" fill="${legColor}" ${LINE}/><ellipse cx="82" cy="322" rx="16" ry="7" fill="${shoes}"/></g>
       <g class="leg leg-r"><rect x="104" y="214" width="26" height="106" rx="10" fill="${legColor}" ${LINE}/><ellipse cx="118" cy="322" rx="16" ry="7" fill="${shoes}"/></g>`;
  }
  const acc = new Set(look.acc ?? []);
  const armTop = style === "overalls" ? "#FFFFFF" : top;
  const arm = (side) => {
    const x = side === "l" ? (female ? 56 : 48) : (female ? 128 : 136);
    const sleeve = shortSleeve ? `<rect x="${x}" y="122" width="16" height="80" rx="8" fill="${skin}"/><rect x="${x}" y="122" width="16" height="34" rx="8" fill="${armTop}" ${LINE}/>`
      : `<rect x="${x}" y="122" width="16" height="80" rx="8" fill="${armTop}" ${LINE}/>`;
    const watch = side === "l" && acc.has("watch") ? `<rect x="${x - 1}" y="190" width="18" height="6" rx="2" fill="#2B2B2B"/>` : "";
    const bracelet = side === "r" && acc.has("bracelet") ? `<rect x="${x - 1}" y="191" width="18" height="4" rx="2" fill="#F6B800"/>` : "";
    return `<g class="arm arm-${side}">${sleeve}${watch}${bracelet}<circle cx="${x + 8}" cy="206" r="8.5" fill="${skin}"/></g>`;
  };
  const vb = opts.portrait ? "40 4 120 150" : "0 0 200 340";
  return `<svg class="avatar" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <ellipse class="shadow" cx="100" cy="328" rx="54" ry="8" fill="#000" opacity=".18"/>
    <g class="avatar-body">
      ${accessories(look, "back")}
      ${hairBack(look.hair, look.hairColor)}
      ${legs}
      ${torso}
      ${styleDetail(look, female)}
      <rect x="91" y="98" width="18" height="22" rx="6" fill="${skin}"/>
      ${style === "blouse" || style === "scrubs" || style === "dress" ? "" : `<path d="M91 112 h18 v6 q-9 6 -18 0 z" fill="${top}"/>`}
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
  kitchen: { sky: "linear-gradient(#DDE3E8, #F2F4F6)", tile: `
    <rect y="0" width="600" height="300" fill="#E9EDF0"/>${Array.from({ length: 15 }, (_, i) => Array.from({ length: 5 }, (_, r) => `<rect x="${i * 40}" y="${r * 30 + 20}" width="38" height="28" fill="#F7F9FA" stroke="#D3DADF"/>`).join("")).join("")}
    <rect y="170" width="600" height="14" fill="#9AA5AE"/><rect y="184" width="600" height="60" fill="#B8C2C9"/>${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${i * 100 + 10}" y="190" width="80" height="48" rx="4" fill="#C9D1D7" stroke="#8C979F"/>`).join("")}
    ${[60, 260, 460].map((x) => `<rect x="${x}" y="140" width="70" height="30" rx="4" fill="#5F6B75"/><ellipse cx="${x + 35}" cy="138" rx="30" ry="6" fill="#3E4850"/><path d="M${x + 20} 128 q5 -14 0 -24 M${x + 40} 128 q5 -14 0 -24" stroke="#fff" stroke-width="2" fill="none" opacity=".6"/>`).join("")}
    <rect y="244" width="600" height="56" fill="#6E7A84"/>${[140, 340, 540].map((x) => `<path d="M${x} 20 v30" stroke="#555" stroke-width="2"/><path d="M${x - 14} 50 h28 l-6 10 h-16z" fill="#C0392B"/>`).join("")}` },
  studio: { sky: "linear-gradient(#2F3550, #3E4566)", tile: `
    <rect y="0" width="600" height="230" fill="#3E4566"/><rect x="20" y="30" width="560" height="160" fill="#9FB4D8" opacity=".22" stroke="#C9D3EA" stroke-width="3"/>
    ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${i * 90 + 30}" y="10" width="40" height="8" rx="3" fill="#F6D776"/><path d="M${i * 90 + 50} 18 l-24 60 h48z" fill="#F6D776" opacity=".08"/>`).join("")}
    <rect y="230" width="600" height="70" fill="#8A6A4A"/>${Array.from({ length: 20 }, (_, i) => `<rect x="${i * 30}" y="230" width="2" height="70" fill="#6E5236"/>`).join("")}
    <rect x="470" y="150" width="70" height="80" rx="6" fill="#222"/><circle cx="505" cy="175" r="14" fill="#444"/><circle cx="505" cy="210" r="9" fill="#444"/>
    <path d="M80 230 v-60" stroke="#999" stroke-width="3"/><circle cx="80" cy="166" r="8" fill="#333"/>` },
  office: { sky: "linear-gradient(#BFD9EE, #E9F1F8)", tile: `
    <rect y="0" width="600" height="300" fill="#EEF1F4"/>${[0, 1, 2].map((i) => `<rect x="${i * 200 + 15}" y="20" width="170" height="130" fill="#A9CBEA" stroke="#7D8A96" stroke-width="5"/>${[0, 1, 2, 3].map((k) => `<rect x="${i * 200 + 30 + k * 38}" y="${60 + (k % 2) * 20}" width="24" height="${90 - (k % 2) * 20}" fill="#7E9FC0"/>`).join("")}`).join("")}
    <rect y="200" width="600" height="12" fill="#C9A46A"/>${[60, 260, 460].map((x) => `<rect x="${x}" y="160" width="70" height="40" rx="3" fill="#2B2F40"/><rect x="${x + 4}" y="164" width="62" height="30" fill="#5DA9E9"/><rect x="${x + 30}" y="200" width="10" height="6" fill="#555"/>`).join("")}
    <rect y="212" width="600" height="88" fill="#9AA3AD"/>${[180, 400].map((x) => `<rect x="${x}" y="150" width="16" height="50" rx="4" fill="#7CBF6B"/><circle cx="${x + 8}" cy="146" r="16" fill="#5DB063"/>`).join("")}` },
  clinic: { sky: "linear-gradient(#DFF2EE, #F6FBFA)", tile: `
    <rect y="0" width="600" height="300" fill="#F3FAF8"/><rect y="0" width="600" height="18" fill="#7CC8B8"/>
    ${[0, 1, 2].map((i) => `<rect x="${i * 200 + 30}" y="40" width="140" height="100" rx="6" fill="#CDEBF5" stroke="#9CC7C0" stroke-width="4"/>`).join("")}
    ${[100, 300, 500].map((x) => `<rect x="${x - 16}" y="150" width="32" height="32" rx="6" fill="#fff" stroke="#E57373" stroke-width="2"/><rect x="${x - 4}" y="156" width="8" height="20" fill="#E57373"/><rect x="${x - 10}" y="162" width="20" height="8" fill="#E57373"/>`).join("")}
    <rect y="200" width="600" height="10" fill="#9CC7C0"/><rect y="210" width="600" height="90" fill="#DCE8E5"/>${Array.from({ length: 12 }, (_, i) => `<rect x="${i * 50}" y="210" width="49" height="90" fill="#E5EFEC"/>`).join("")}
    <rect x="420" y="190" width="90" height="20" rx="4" fill="#B0BEC5"/>` },
  library: { sky: "linear-gradient(#E8DCC8, #F5EDE0)", tile: `
    <rect y="0" width="600" height="300" fill="#6B4A2E"/>
    ${[0, 1, 2].map((i) => `<rect x="${i * 200 + 10}" y="10" width="180" height="220" fill="#8A5A34"/>${[0, 1, 2, 3, 4].map((r) => `<rect x="${i * 200 + 14}" y="${18 + r * 42}" width="172" height="6" fill="#5C3A1E"/>${Array.from({ length: 13 }, (_, k) => `<rect x="${i * 200 + 18 + k * 13}" y="${26 + r * 42}" width="11" height="${28 + (k * 7) % 8}" fill="${["#C0392B", "#22348C", "#F6B800", "#2E8B57", "#E8E0D0", "#7A1F2A"][(k + r + i) % 6]}"/>`).join("")}`).join("")}`).join("")}
    <rect y="230" width="600" height="70" fill="#A57C52"/>${[140, 440].map((x) => `<rect x="${x}" y="196" width="100" height="10" fill="#5C3A1E"/><rect x="${x + 10}" y="206" width="6" height="30" fill="#4A2E18"/><rect x="${x + 84}" y="206" width="6" height="30" fill="#4A2E18"/><path d="M${x + 40} 196 v-18" stroke="#333" stroke-width="2"/><path d="M${x + 28} 178 h24 l-4 -10 h-16z" fill="#2E8B57"/>`).join("")}` },
  airport: { sky: "linear-gradient(#8EC5EE, #E3F1FB)", tile: `
    <rect y="0" width="600" height="190" fill="#CFE6F7"/>${Array.from({ length: 6 }, (_, i) => `<rect x="${i * 100}" y="0" width="6" height="190" fill="#9AA5AE"/>`).join("")}<rect y="0" width="600" height="8" fill="#9AA5AE"/>
    <g transform="translate(180 70)"><path d="M0 30 h220 q20 0 20 10 q0 10 -20 10 h-220 q-10 0 -10 -10 q0 -10 10 -10z" fill="#fff" stroke="#9AA5AE"/><path d="M90 30 l40 -30 h20 l-20 30z" fill="#22348C"/><path d="M90 50 l40 30 h20 l-20 -30z" fill="#22348C"/><path d="M200 30 l20 -22 h12 l-8 22z" fill="#F6B800"/>${[30, 50, 70, 110, 130, 150, 170].map((x) => `<circle cx="${x}" cy="38" r="3" fill="#7DA7D8"/>`).join("")}</g>
    <rect y="190" width="600" height="50" fill="#22348C"/>${[40, 240, 440].map((x) => `<rect x="${x}" y="198" width="120" height="30" rx="3" fill="#0D1550"/><text x="${x + 8}" y="218" font-family="monospace" font-size="12" fill="#F6B800">CAI ✈ CGK 14:20</text>`).join("")}
    <rect y="240" width="600" height="60" fill="#D9D4CB"/>${Array.from({ length: 10 }, (_, i) => `<rect x="${i * 60}" y="240" width="58" height="60" fill="#E2DED6"/>`).join("")}` },
};

export function sceneStyle(scene) {
  const s = SCENES[scene] ?? SCENES.park;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300">${s.tile}</svg>`;
  return `background-image:url("data:image/svg+xml,${encodeURIComponent(svg)}"),${s.sky};`;
}
