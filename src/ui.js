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
  const style = document.createElement('style');
  style.textContent = `
input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 120px;
  height: 1px;
  background: rgba(0, 229, 255, 0.2);
  outline: none;
  margin: 6px 0;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 8px;
  height: 8px;
  background: #00e5ff;
  cursor: pointer;
}
`;
  document.head.appendChild(style);
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

export function createUI(state, particleSystems, controls, propagator) {
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

  // ── Year slider ──────────────────────────────────────────────────────────
  const MIN_YEAR = 1957;
  const MAX_YEAR = new Date().getFullYear();

  const yearLabel = document.createElement('div');
  baseStyle(yearLabel);
  yearLabel.textContent = 'TIME PERIOD';
  hud.appendChild(yearLabel);

  const yearRow = document.createElement('div');
  yearRow.style.display = 'flex';
  yearRow.style.alignItems = 'center';
  yearRow.style.gap = '8px';

  const yearSlider = document.createElement('input');
  yearSlider.type = 'range';
  yearSlider.min = String(MIN_YEAR);
  yearSlider.max = String(MAX_YEAR);
  yearSlider.value = String(MAX_YEAR);
  yearSlider.style.width = '120px';

  const yearReadout = document.createElement('span');
  baseStyle(yearReadout);
  yearReadout.textContent = 'ALL';

  const yearResetBtn = document.createElement('span');
  baseStyle(yearResetBtn);
  yearResetBtn.textContent = '✕';
  yearResetBtn.style.cursor = 'pointer';
  yearResetBtn.style.opacity = '0.3';
  yearResetBtn.style.pointerEvents = 'auto';
  yearResetBtn.style.fontSize = '9px';

  let yearActive = false;
  let savedSimTime = null; // real time before year slider was engaged
  let wasPlaying = false;

  function applyYear(year) {
    if (propagator) {
      propagator.setYearFilter(year);

      // Set simulation time to July 1st of the selected year
      state.simTime = new Date(year, 6, 1);

      // Force a full re-propagation at the new time
      propagator.propagateAll(state.simTime);

      const fc = propagator.getCounts();
      updateCountsInternal(fc);
    }
  }

  yearSlider.addEventListener('input', () => {
    const year = parseInt(yearSlider.value, 10);
    yearReadout.textContent = String(year);
    yearResetBtn.style.opacity = '0.8';

    if (!yearActive) {
      // First activation — save current state and pause
      yearActive = true;
      savedSimTime = new Date(state.simTime.getTime());
      wasPlaying = playing;
      if (playing) {
        playing = false;
        state.timeScale = 0;
        updatePlayBtn();
      }
    }

    applyYear(year);
  });

  yearResetBtn.addEventListener('click', () => {
    yearSlider.value = String(MAX_YEAR);
    yearReadout.textContent = 'ALL';
    yearResetBtn.style.opacity = '0.3';
    yearActive = false;

    if (propagator) {
      propagator.setYearFilter(null);

      // Restore real time
      state.simTime = savedSimTime || new Date();
      propagator.propagateAll(state.simTime);

      const fc = propagator.getCounts();
      updateCountsInternal(fc);
    }

    // Restore play state
    if (wasPlaying) {
      playing = true;
      state.timeScale = savedScale;
      updatePlayBtn();
    }
    savedSimTime = null;
  });

  yearRow.appendChild(yearSlider);
  yearRow.appendChild(yearReadout);
  yearRow.appendChild(yearResetBtn);
  hud.appendChild(yearRow);

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

  // ── Data source ───────────────────────────────────────────────────────────
  const SOURCE_LINKS = {
    'CELESTRAK': 'https://celestrak.org',
    'ASTRIAGRAPH / UT AUSTIN': 'http://astria.tacc.utexas.edu/AstriaGraph/',
    'ASTRIAGRAPH + CELESTRAK': null, // multiple links below
    'SPACE-TRACK.ORG': 'https://www.space-track.org',
  };

  const sourceDiv = document.createElement('div');
  baseStyle(sourceDiv);
  sourceDiv.style.marginTop = '6px';
  sourceDiv.style.fontSize = '10px';
  sourceDiv.style.opacity = '0.6';

  sourceDiv.appendChild(document.createTextNode('SOURCE: '));

  const sourceName = state.dataSource || '---';

  function makeLink(text, url) {
    const a = document.createElement('a');
    a.textContent = text;
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.color = VISUAL_CONFIG.ui.color;
    a.style.textDecoration = 'none';
    a.style.borderBottom = '1px solid rgba(0, 229, 255, 0.3)';
    a.style.pointerEvents = 'auto';
    return a;
  }

  if (sourceName === 'ASTRIAGRAPH + CELESTRAK') {
    sourceDiv.appendChild(makeLink('ASTRIAGRAPH', 'http://astria.tacc.utexas.edu/AstriaGraph/'));
    sourceDiv.appendChild(document.createTextNode(' + '));
    sourceDiv.appendChild(makeLink('CELESTRAK', 'https://celestrak.org'));
  } else {
    const sourceUrl = SOURCE_LINKS[sourceName];
    if (sourceUrl) {
      sourceDiv.appendChild(makeLink(sourceName, sourceUrl));
    } else {
      sourceDiv.appendChild(document.createTextNode(sourceName));
    }
  }

  hud.appendChild(sourceDiv);

  // ── Kessler toggle hint ────────────────────────────────────────────────────
  const kesslerHint = document.createElement('div');
  baseStyle(kesslerHint);
  kesslerHint.style.marginTop = '8px';
  kesslerHint.style.opacity = state.kesslerVisible ? '0.8' : '0.3';
  kesslerHint.textContent = '[K] KESSLER OVERLAY';
  hud.appendChild(kesslerHint);

  // ── Shared count updater ───────────────────────────────────────────────────

  function updateCountsInternal(counts) {
    for (const cat of CATEGORIES) {
      countSpans[cat.key].textContent = formatCount(counts[cat.key] || 0);
    }
    totalDiv.textContent = 'TOTAL TRACKED: ' + formatCount(counts.total || 0);
  }

  // ── Return update API ─────────────────────────────────────────────────────

  return {
    updateTime(simDate) {
      dateReadout.textContent = formatSimDate(simDate);
    },

    updateCounts(counts) {
      updateCountsInternal(counts);
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
