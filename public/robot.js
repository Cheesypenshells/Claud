// Tampilan "Mode Robot": karakter robot animasi seperti simulasi telepon dengan AI.
// Fase: idle | listening | thinking | speaking

const ROBOT_SVG = `
<svg viewBox="0 0 200 230" class="robot-svg" aria-hidden="true">
  <defs>
    <linearGradient id="cb-besi" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3A56C8"/><stop offset=".55" stop-color="#22348C"/><stop offset="1" stop-color="#121C58"/>
    </linearGradient>
    <linearGradient id="cb-kilap" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="cb-cangkang" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFE07A"/><stop offset="1" stop-color="#C98E00"/>
    </linearGradient>
  </defs>
  <g class="robot-float">
    <!-- uap seperti di logo Cheesy Pen Shells -->
    <g class="r-uap" fill="none" stroke="#F6B800" stroke-width="5" stroke-linecap="round">
      <path d="M70 30 q-8 -8 0 -16 q8 -8 0 -16"/>
      <path d="M130 30 q-8 -8 0 -16 q8 -8 0 -16"/>
      <path d="M100 18 q-8 -8 0 -16"/>
    </g>
    <!-- antena -->
    <rect x="96" y="26" width="8" height="18" rx="2" fill="#16226A"/>
    <circle cx="100" cy="26" r="7" class="r-antena" fill="#F6B800" stroke="#16226A" stroke-width="2"/>
    <!-- telinga kerang pena (setengah hati) -->
    <g stroke="#7A5A00" stroke-width="2">
      <path d="M34 80 C14 76 6 100 12 116 C18 128 30 126 34 118 Z" fill="url(#cb-cangkang)"/>
      <path d="M166 80 C186 76 194 100 188 116 C182 128 170 126 166 118 Z" fill="url(#cb-cangkang)"/>
    </g>
    <path d="M30 86 Q16 98 20 116 M30 96 Q22 106 26 118 M170 86 Q184 98 180 116 M170 96 Q178 106 174 118" stroke="#B07D00" stroke-width="1.6" fill="none"/>
    <!-- kepala metal -->
    <rect x="30" y="42" width="140" height="120" rx="26" fill="url(#cb-besi)" stroke="#0D1550" stroke-width="3"/>
    <rect x="44" y="46" width="112" height="8" rx="4" fill="url(#cb-kilap)"/>
    <g fill="#8A9BE0"><circle cx="42" cy="54" r="3"/><circle cx="158" cy="54" r="3"/><circle cx="42" cy="150" r="3"/><circle cx="158" cy="150" r="3"/></g>
    <!-- visor -->
    <rect x="46" y="64" width="108" height="80" rx="18" fill="#070C33" stroke="#F6B800" stroke-width="3"/>
    <g stroke="#F6B800" stroke-opacity=".08">
      <path d="M46 84 h108 M46 104 h108 M46 124 h108 M73 64 v80 M100 64 v80 M127 64 v80"/>
    </g>
    <g class="r-eyes">
      <rect x="66" y="84" width="22" height="22" rx="7" class="r-eye" fill="#F6B800"/>
      <rect x="112" y="84" width="22" height="22" rx="7" class="r-eye" fill="#F6B800"/>
    </g>
    <g class="r-mouth" fill="#F6B800">
      <rect x="76" y="120" width="6" height="7" rx="2"/>
      <rect x="86" y="120" width="6" height="7" rx="2"/>
      <rect x="96" y="120" width="6" height="7" rx="2"/>
      <rect x="106" y="120" width="6" height="7" rx="2"/>
      <rect x="116" y="120" width="6" height="7" rx="2"/>
    </g>
    <!-- leher & badan -->
    <rect x="84" y="162" width="32" height="10" fill="#16226A"/>
    <rect x="52" y="170" width="96" height="56" rx="16" fill="url(#cb-besi)" stroke="#0D1550" stroke-width="3"/>
    <rect x="72" y="178" width="56" height="40" rx="10" fill="#F6B800" stroke="#C99700" stroke-width="2"/>
    <image href="img/logo.png" x="80" y="180" width="40" height="36"/>
    <circle cx="62" cy="182" r="3.5" class="r-led" fill="#F6B800"/>
    <circle cx="138" cy="182" r="3.5" class="r-led" fill="#F6B800"/>
  </g>
</svg>`;

const PHASE_LABEL = {
  idle: "● Siaga · tekan 🎤 untuk bicara",
  listening: "◉ Mendengarkan…",
  thinking: "⟳ Memproses…",
  speaking: "▶ Berbicara…",
};

export function createRobot({ onMic, onClose }) {
  const el = document.createElement("div");
  el.className = "robot-overlay";
  el.hidden = true;
  el.innerHTML = `
    <div class="robot-top">
      <img src="img/logo-putih.png" alt="" />
      <div><div class="robot-name">CHEESY-BOT</div><span class="robot-sub">SYS · <span class="robot-sub-text"></span></span></div>
      <button class="robot-x" title="Tutup">✕</button>
    </div>
    <div class="robot-stage" data-phase="idle">
      <div class="robot-rings"><span></span><span></span></div>
      ${ROBOT_SVG}
    </div>
    <div class="robot-phase"></div>
    <div class="robot-captions">
      <p class="cap-ai"></p>
      <p class="cap-user"></p>
    </div>
    <div class="robot-controls">
      <button class="robot-mic" title="Bicara">🎤</button>
      <button class="robot-end" title="Akhiri">📞 Akhiri</button>
    </div>
    <div class="robot-brand">#oysterbakarfavoritmu</div>`;
  document.body.append(el);

  const stage = el.querySelector(".robot-stage");
  el.querySelector(".robot-mic").onclick = onMic;
  el.querySelector(".robot-end").onclick = onClose;
  el.querySelector(".robot-x").onclick = onClose;
  document.addEventListener("keydown", (e) => {
    if (!el.hidden && e.key === "Escape") onClose();
  });

  const api = {
    get isOpen() { return !el.hidden; },
    open(subtitle) {
      el.querySelector(".robot-sub-text").textContent = subtitle;
      el.querySelector(".cap-ai").textContent = "";
      el.querySelector(".cap-user").textContent = "";
      el.hidden = false;
      api.phase("idle");
    },
    close() { el.hidden = true; },
    phase(p, label) {
      stage.dataset.phase = p;
      el.querySelector(".robot-phase").textContent = label ?? PHASE_LABEL[p];
      el.querySelector(".robot-mic").classList.toggle("active", p === "listening");
    },
    captionAI(text) { el.querySelector(".cap-ai").textContent = text; },
    captionUser(text) { el.querySelector(".cap-user").textContent = text ? `Kamu: ${text}` : ""; },
  };
  return api;
}
