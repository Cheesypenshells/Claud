// Tampilan "Mode Robot": karakter robot animasi seperti simulasi telepon dengan AI.
// Fase: idle | listening | thinking | speaking

const ROBOT_SVG = `
<svg viewBox="0 0 200 220" class="robot-svg" aria-hidden="true">
  <g class="robot-float">
    <!-- antena berbentuk pena -->
    <line x1="100" y1="40" x2="100" y2="20" class="r-stroke" stroke-width="4"/>
    <path d="M100 2 L108 14 L100 22 L92 14 Z" class="r-antenna"/>
    <!-- telinga kerang pena -->
    <path d="M30 98 C22 90 12 78 10 70 C14 64 26 64 30 68 Z" class="r-ear"/>
    <path d="M170 98 C178 90 188 78 190 70 C186 64 174 64 170 68 Z" class="r-ear"/>
    <path d="M28 94 L16 70 M28 94 L24 66" class="r-ear-rib"/>
    <path d="M172 94 L184 70 M172 94 L176 66" class="r-ear-rib"/>
    <!-- kepala keju dengan lubang -->
    <rect x="30" y="38" width="140" height="122" rx="34" class="r-head"/>
    <circle cx="48" cy="54" r="6" class="r-hole"/>
    <circle cx="156" cy="146" r="5" class="r-hole"/>
    <circle cx="150" cy="52" r="3.5" class="r-hole"/>
    <circle cx="42" cy="146" r="3" class="r-hole"/>
    <rect x="48" y="62" width="104" height="78" rx="24" class="r-face"/>
    <g class="r-eyes">
      <ellipse cx="78" cy="92" rx="10" ry="12" class="r-eye"/>
      <ellipse cx="122" cy="92" rx="10" ry="12" class="r-eye"/>
    </g>
    <g class="r-mouth">
      <rect x="76" y="116" width="6" height="8" rx="3"/>
      <rect x="86" y="116" width="6" height="8" rx="3"/>
      <rect x="96" y="116" width="6" height="8" rx="3"/>
      <rect x="106" y="116" width="6" height="8" rx="3"/>
      <rect x="116" y="116" width="6" height="8" rx="3"/>
    </g>
    <rect x="62" y="166" width="76" height="46" rx="18" class="r-body"/>
    <circle cx="100" cy="189" r="9" class="r-heart"/>
  </g>
</svg>`;

const PHASE_LABEL = {
  idle: "Tekan 🎤 untuk bicara",
  listening: "🎙️ Mendengarkan…",
  thinking: "🤔 Sedang berpikir…",
  speaking: "🔊 Berbicara…",
};

export function createRobot({ onMic, onClose }) {
  const el = document.createElement("div");
  el.className = "robot-overlay";
  el.hidden = true;
  el.innerHTML = `
    <div class="robot-top">
      <div><div class="robot-name">🧀 Cheesy <span class="robot-sub">· <span class="robot-sub-text"></span></span></div></div>
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
    <div class="robot-brand"><img src="logo.svg" alt="" /> Cheesy Pen Shells</div>`;
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
