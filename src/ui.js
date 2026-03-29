import { VISUAL_CONFIG, PALETTE } from './config.js';

// ─── DOM HUD OVERLAY ────────────────────────────────────────────────────────
// Builds all control UI inside #hud. Pure DOM, no canvas.
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'active',     label: 'ACTIVE SATELLITES' },
  { key: 'debris',     label: 'DEBRIS' },
  { key: 'rocketBody', label: 'ROCKET BODIES' },
  { key: 'station',    label: 'STATIONS' },
];

function formatCount(n) {
  return n.toLocaleString('en-US');
}

function injectStyles() {
  // No additional styles needed currently
}

function baseStyle(el) {
  el.style.fontFamily = VISUAL_CONFIG.ui.font;
  el.style.fontSize = VISUAL_CONFIG.ui.fontSize;
  el.style.color = VISUAL_CONFIG.ui.color;
  el.style.textTransform = 'uppercase';
  el.style.letterSpacing = VISUAL_CONFIG.ui.letterSpacing;
}

function createSeparator() {
  const sep = document.createElement('div');
  sep.style.width = '150px';
  sep.style.height = '1px';
  sep.style.background = 'rgba(0, 229, 255, 0.15)';
  sep.style.margin = '8px 0';
  return sep;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function createUI(state, particleSystems, controls) {
  injectStyles();

  const hud = document.getElementById('hud');

  // Apply base styles to HUD container
  baseStyle(hud);
  hud.style.position = 'absolute';
  hud.style.top = '16px';
  hud.style.left = '16px';
  hud.style.pointerEvents = 'auto';
  hud.style.userSelect = 'none';

  // ── Title ──────────────────────────────────────────────────────────────────
  const title = document.createElement('div');
  title.textContent = 'ORBITAL DEBRIS FIELD';
  baseStyle(title);
  title.style.fontSize = '13px';
  title.style.color = 'rgba(0, 229, 255, 0.8)';
  hud.appendChild(title);

  // ── Date readout ───────────────────────────────────────────────────────────
  const dateReadout = document.createElement('div');
  dateReadout.id = 'sim-date';
  baseStyle(dateReadout);
  dateReadout.style.marginTop = '4px';
  dateReadout.textContent = formatSimDate(state.simTime);
  hud.appendChild(dateReadout);

  // ── Separator ──────────────────────────────────────────────────────────────
  hud.appendChild(createSeparator());

  // ── Play / Pause toggle ────────────────────────────────────────────────────
  const playBtn = document.createElement('div');
  baseStyle(playBtn);
  playBtn.style.cursor = 'pointer';
  playBtn.style.padding = '2px 0';
  let playing = state.timeScale > 0;
  const savedScale = state.timeScale || VISUAL_CONFIG.time.defaultScale;

  function updatePlayBtn() {
    playBtn.textContent = playing ? '▮▮ PAUSE' : '▶ PLAY';
    playBtn.style.color = playing ? VISUAL_CONFIG.ui.color : 'rgba(0, 229, 255, 0.3)';
  }
  updatePlayBtn();

  playBtn.addEventListener('click', () => {
    playing = !playing;
    state.timeScale = playing ? savedScale : 0;
    if (controls) controls.autoRotate = playing;
    updatePlayBtn();
  });

  hud.appendChild(playBtn);

  // ── Separator ──────────────────────────────────────────────────────────────
  hud.appendChild(createSeparator());

  // ── Category toggles ──────────────────────────────────────────────────────
  const categoryRows = {};
  const countSpans = {};

  for (const cat of CATEGORIES) {
    const row = document.createElement('div');
    baseStyle(row);
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '6px';
    row.style.cursor = 'pointer';
    row.style.padding = '2px 0';

    // Colored dot
    const dot = document.createElement('span');
    dot.style.display = 'inline-block';
    dot.style.width = '8px';
    dot.style.height = '8px';
    dot.style.background = PALETTE[cat.key];
    dot.style.flexShrink = '0';

    // Label
    const label = document.createElement('span');
    label.textContent = cat.label;

    // Count
    const count = document.createElement('span');
    count.style.marginLeft = 'auto';
    count.textContent = formatCount(state.counts[cat.key] || 0);
    countSpans[cat.key] = count;

    row.appendChild(dot);
    row.appendChild(label);
    row.appendChild(count);
    hud.appendChild(row);
    categoryRows[cat.key] = row;

    // Toggle visibility on click
    let visible = true;
    row.addEventListener('click', () => {
      visible = !visible;
      if (particleSystems[cat.key] && particleSystems[cat.key].points) {
        particleSystems[cat.key].points.visible = visible;
      }
      row.style.opacity = visible ? '1' : '0.3';
    });
  }

  // ── Separator ──────────────────────────────────────────────────────────────
  hud.appendChild(createSeparator());

  // ── Total count ────────────────────────────────────────────────────────────
  const totalDiv = document.createElement('div');
  baseStyle(totalDiv);
  totalDiv.textContent = 'TOTAL TRACKED: ' + formatCount(state.counts.total || 0);
  hud.appendChild(totalDiv);

  // ── Kessler toggle hint ────────────────────────────────────────────────────
  const kesslerHint = document.createElement('div');
  baseStyle(kesslerHint);
  kesslerHint.style.marginTop = '8px';
  kesslerHint.style.opacity = state.kesslerVisible ? '0.8' : '0.3';
  kesslerHint.textContent = '[K] KESSLER OVERLAY';
  hud.appendChild(kesslerHint);

  // ── Return update API ─────────────────────────────────────────────────────

  return {
    updateTime(simDate) {
      dateReadout.textContent = formatSimDate(simDate);
    },

    updateCounts(counts) {
      for (const cat of CATEGORIES) {
        countSpans[cat.key].textContent = formatCount(counts[cat.key] || 0);
      }
      totalDiv.textContent = 'TOTAL TRACKED: ' + formatCount(counts.total || 0);
    },

    setKesslerState(visible) {
      kesslerHint.style.opacity = visible ? '0.8' : '0.3';
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSimDate(date) {
  if (!(date instanceof Date)) return '---';
  return date.toISOString().replace('T', '  ').replace(/\.\d+Z$/, ' UTC');
}
