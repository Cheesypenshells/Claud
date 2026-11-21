// Tampilan "Mode Robot": karakter robot animasi seperti simulasi telepon dengan AI.
// Fase: idle | listening | thinking | speaking

const ROBOT_SVG = `
<svg viewBox="0 0 200 220" class="robot-svg" aria-hidden="true">
  <g class="robot-float">
    <line x1="100" y1="38" x2="100" y2="14" class="r-stroke" stroke-width="4"/>
    <circle cx="100" cy="12" r="8" class="r-antenna"/>
    <rect x="20" y="78" width="14" height="40" rx="6" class="r-ear"/>
    <rect x="166" y="78" width="14" height="40" rx="6" class="r-ear"/>
    <rect x="32" y="38" width="136" height="120" rx="34" class="r-head"/>
    <rect x="48" y="58" width="104" height="80" rx="24" class="r-face"/>
    <g class="r-eyes">
      <ellipse cx="78" cy="90" rx="10" ry="12" class="r-eye"/>
      <ellipse cx="122" cy="90" rx="10" ry="12" class="r-eye"/>
    </g>
    <g class="r-mouth">
      <rect x="76" y="114" width="6" height="8" rx="3"/>
      <rect x="86" y="114" width="6" height="8" rx="3"/>
      <rect x="96" y="114" width="6" height="8" rx="3"/>
      <rect x="106" y="114" width="6" height="8" rx="3"/>
      <rect x="116" y="114" width="6" height="8" rx="3"/>
    </g>
    <rect x="62" y="164" width="76" height="46" rx="18" class="r-body"/>
    <circle cx="100" cy="187" r="9" class="r-heart"/>
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
      <div><div class="robot-name">🤖 Robo · <span class="robot-sub"></span></div></div>
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
    </div>`;
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
      el.querySelector(".robot-sub").textContent = subtitle;
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
