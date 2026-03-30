import { VISUAL_CONFIG, PALETTE } from './config.js';

// ─── DOM HUD OVERLAY ────────────────────────────────────────────────────────
// Glassmorphism UI panels over the 3D scene.
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'active',     label: 'Active Satellites' },
  { key: 'debris',     label: 'Debris' },
  { key: 'rocketBody', label: 'Rocket Bodies' },
  { key: 'station',    label: 'Stations' },
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
  width: 130px;
  height: 3px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  outline: none;
  margin: 6px 0;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: #00e5ff;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 6px rgba(0, 229, 255, 0.4);
}
`;
  document.head.appendChild(style);
}

const G = VISUAL_CONFIG.ui.glass;

function applyGlass(el) {
  el.style.background = G.background;
  el.style.backdropFilter = `blur(${G.blur})`;
  el.style.webkitBackdropFilter = `blur(${G.blur})`;
  el.style.border = G.border;
  el.style.borderRadius = G.borderRadius;
}

function baseStyle(el) {
  el.style.fontFamily = VISUAL_CONFIG.ui.font;
  el.style.fontSize = VISUAL_CONFIG.ui.fontSize;
  el.style.color = VISUAL_CONFIG.ui.color;
  el.style.letterSpacing = VISUAL_CONFIG.ui.letterSpacing;
}

function sectionLabel(text) {
  const el = document.createElement('div');
  baseStyle(el);
  el.style.fontSize = '9px';
  el.style.fontWeight = '300';
  el.style.textTransform = 'uppercase';
  el.style.letterSpacing = '0.12em';
  el.style.color = VISUAL_CONFIG.ui.colorDim;
  el.style.marginBottom = '8px';
  el.textContent = text;
  return el;
}

function createDivider() {
  const div = document.createElement('div');
  div.style.height = '1px';
  div.style.background = 'rgba(255, 255, 255, 0.04)';
  div.style.margin = '14px 0';
  return div;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function createUI(state, particleSystems, controls, propagator) {
  injectStyles();

  const hud = document.getElementById('hud');

  // Glass card container
  applyGlass(hud);
  baseStyle(hud);
  hud.style.padding = '16px 20px';
  hud.style.minWidth = '200px';
  hud.style.pointerEvents = 'auto';
  hud.style.userSelect = 'none';

  // ── Title row with collapse toggle ──────────────────────────────────────────
  const titleRow = document.createElement('div');
  titleRow.style.display = 'flex';
  titleRow.style.alignItems = 'center';
  titleRow.style.justifyContent = 'space-between';
  titleRow.style.cursor = 'pointer';

  const title = document.createElement('div');
  title.textContent = 'Crowded Sky';
  baseStyle(title);
  title.style.fontSize = '13px';
  title.style.fontWeight = '300';
  title.style.color = VISUAL_CONFIG.ui.colorBright;
  title.style.letterSpacing = '0.15em';
  title.style.textTransform = 'uppercase';

  const subtitle = document.createElement('div');
  baseStyle(subtitle);
  subtitle.textContent = 'Orbital debris field visualization';
  subtitle.style.fontSize = '9px';
  subtitle.style.fontWeight = '300';
  subtitle.style.color = VISUAL_CONFIG.ui.colorDim;
  subtitle.style.letterSpacing = '0.08em';
  subtitle.style.marginTop = '2px';

  const collapseBtn = document.createElement('span');
  baseStyle(collapseBtn);
  collapseBtn.style.fontSize = '14px';
  collapseBtn.style.color = VISUAL_CONFIG.ui.colorDim;
  collapseBtn.style.transition = 'transform 0.2s';
  collapseBtn.textContent = '▾';
  collapseBtn.style.marginLeft = '12px';

  titleRow.appendChild(title);
  titleRow.appendChild(collapseBtn);
  hud.appendChild(titleRow);
  hud.appendChild(subtitle);

  // ── Date readout (always visible) ─────────────────────────────────────────
  const dateReadout = document.createElement('div');
  dateReadout.id = 'sim-date';
  baseStyle(dateReadout);
  dateReadout.style.fontSize = '11px';
  dateReadout.style.color = VISUAL_CONFIG.ui.colorDim;
  dateReadout.style.marginTop = '2px';
  dateReadout.textContent = formatSimDate(state.simTime);
  hud.appendChild(dateReadout);

  // ── Collapsible content container ─────────────────────────────────────────
  const content = document.createElement('div');
  content.style.overflow = 'hidden';
  content.style.transition = 'max-height 0.3s ease, opacity 0.2s ease';
  content.style.maxHeight = '1000px';
  content.style.opacity = '1';
  hud.appendChild(content);

  let collapsed = false;
  titleRow.addEventListener('click', () => {
    collapsed = !collapsed;
    if (collapsed) {
      content.style.maxHeight = '0';
      content.style.opacity = '0';
      collapseBtn.style.transform = 'rotate(-90deg)';
    } else {
      content.style.maxHeight = '1000px';
      content.style.opacity = '1';
      collapseBtn.style.transform = 'rotate(0deg)';
    }
  });

  content.appendChild(createDivider());

  // ── Play / Pause toggle ────────────────────────────────────────────────────
  const playBtn = document.createElement('div');
  baseStyle(playBtn);
  playBtn.style.cursor = 'pointer';
  playBtn.style.padding = '4px 0';
  playBtn.style.transition = 'color 0.15s';
  let playing = state.timeScale > 0;
  let savedScale = state.timeScale || VISUAL_CONFIG.time.defaultScale;

  function updatePlayBtn() {
    if (playing) {
      playBtn.textContent = '⏸  Pause';
      playBtn.style.color = VISUAL_CONFIG.ui.color;
    } else {
      playBtn.textContent = '▶  Play';
      playBtn.style.color = VISUAL_CONFIG.ui.colorDim;
    }
  }
  updatePlayBtn();

  playBtn.addEventListener('click', () => {
    playing = !playing;
    state.timeScale = playing ? savedScale : 0;
    updatePlayBtn();
  });

  content.appendChild(playBtn);

  content.appendChild(createDivider());

  // ── Year slider ──────────────────────────────────────────────────────────
  const MIN_YEAR = 1957;
  const MAX_YEAR = new Date().getFullYear();

  content.appendChild(sectionLabel('Year'));

  const yearRow = document.createElement('div');
  yearRow.style.display = 'flex';
  yearRow.style.alignItems = 'center';
  yearRow.style.gap = '10px';

  const yearSlider = document.createElement('input');
  yearSlider.type = 'range';
  yearSlider.min = String(MIN_YEAR);
  yearSlider.max = String(MAX_YEAR);
  yearSlider.value = String(MAX_YEAR);

  const yearReadout = document.createElement('span');
  baseStyle(yearReadout);
  yearReadout.style.fontWeight = '500';
  yearReadout.style.minWidth = '32px';
  yearReadout.textContent = 'All';

  const yearResetBtn = document.createElement('span');
  baseStyle(yearResetBtn);
  yearResetBtn.textContent = '✕';
  yearResetBtn.style.cursor = 'pointer';
  yearResetBtn.style.opacity = '0.25';
  yearResetBtn.style.pointerEvents = 'auto';
  yearResetBtn.style.fontSize = '10px';
  yearResetBtn.style.transition = 'opacity 0.15s';

  let yearActive = false;
  let savedSimTime = null;
  let wasPlaying = false;

  let propagateDebounce = null;

  // Lightweight: just update filter + counts (instant)
  function applyYearFilter(year) {
    if (!propagator) return;
    propagator.setYearFilter(year);
    state.simTime = new Date(year, 6, 1);
    updateCountsInternal(propagator.getCounts());
  }

  // Heavyweight: re-propagate all orbits (debounced)
  function applyYearPropagate(year) {
    if (!propagator) return;
    state.simTime = new Date(year, 6, 1);
    propagator.propagateAll(state.simTime);
    if (state.resetPropTimer) state.resetPropTimer();
  }

  function applyYear(year) {
    // Instant: update visibility mask and counts
    applyYearFilter(year);

    // Debounced: re-propagate after user stops dragging (200ms)
    clearTimeout(propagateDebounce);
    propagateDebounce = setTimeout(() => applyYearPropagate(year), 200);
  }

  yearSlider.addEventListener('input', () => {
    const year = parseInt(yearSlider.value, 10);

    // If slider reaches max, auto-reset (same as clicking ✕)
    if (year >= MAX_YEAR) {
      clearTimeout(propagateDebounce);
      yearResetBtn.click();
      return;
    }

    yearReadout.textContent = String(year);
    yearResetBtn.style.opacity = '0.7';

    if (!yearActive) {
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
    yearReadout.textContent = 'All';
    yearResetBtn.style.opacity = '0.25';
    yearActive = false;

    if (propagator) {
      propagator.setYearFilter(null);
      state.simTime = savedSimTime || new Date();
      propagator.propagateAll(state.simTime);
      if (state.resetPropTimer) state.resetPropTimer();
      const fc = propagator.getCounts();
      updateCountsInternal(fc);
    }

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
  content.appendChild(yearRow);

  // ── Brightness slider ────────────────────────────────────────────────────
  content.appendChild(sectionLabel('Brightness'));

  const brightnessRow = document.createElement('div');
  brightnessRow.style.display = 'flex';
  brightnessRow.style.alignItems = 'center';
  brightnessRow.style.gap = '10px';

  const brightnessSlider = document.createElement('input');
  brightnessSlider.type = 'range';
  brightnessSlider.min = '10';
  brightnessSlider.max = '200';
  brightnessSlider.value = '100';

  const brightnessReadout = document.createElement('span');
  baseStyle(brightnessReadout);
  brightnessReadout.style.fontWeight = '500';
  brightnessReadout.style.minWidth = '32px';
  brightnessReadout.textContent = '100%';

  brightnessSlider.addEventListener('input', () => {
    const val = parseInt(brightnessSlider.value, 10);
    brightnessReadout.textContent = val + '%';
    const scale = val / 100;
    for (const cat of ['active', 'debris', 'rocketBody', 'station']) {
      const sys = particleSystems[cat];
      if (sys && sys.material && sys.material.uniforms && sys.material.uniforms.uOpacity) {
        sys.material.uniforms.uOpacity.value = sys.material._baseOpacity * scale;
      }
    }
  });

  // Store base opacity values for scaling
  for (const cat of ['active', 'debris', 'rocketBody', 'station']) {
    const sys = particleSystems[cat];
    if (sys && sys.material && sys.material.uniforms && sys.material.uniforms.uOpacity) {
      sys.material._baseOpacity = sys.material.uniforms.uOpacity.value;
    }
  }

  brightnessRow.appendChild(brightnessSlider);
  brightnessRow.appendChild(brightnessReadout);
  content.appendChild(brightnessRow);

  content.appendChild(createDivider());

  // ── Category toggles ──────────────────────────────────────────────────────
  content.appendChild(sectionLabel('Categories'));

  const countSpans = {};

  // SVG icons matching particle shapes
  const CATEGORY_ICONS = {
    active: (color) => `<svg width="10" height="10" viewBox="0 0 10 10"><polygon points="5,0.5 9.5,5 5,9.5 0.5,5" fill="${color}"/></svg>`,
    debris: (color) => `<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2,0.5 L5,3.5 L8,0.5 L9.5,2 L6.5,5 L9.5,8 L8,9.5 L5,6.5 L2,9.5 L0.5,8 L3.5,5 L0.5,2 Z" fill="${color}"/></svg>`,
    rocketBody: (color) => `<svg width="10" height="10" viewBox="0 0 10 10"><polygon points="5,0.5 9.5,8.5 0.5,8.5" fill="${color}"/></svg>`,
    station: (color) => `<svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="2" fill="${color}"/><circle cx="5" cy="5" r="4" fill="none" stroke="${color}" stroke-width="1.2"/></svg>`,
  };

  for (const cat of CATEGORIES) {
    const row = document.createElement('div');
    baseStyle(row);
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.cursor = 'pointer';
    row.style.padding = '3px 0';
    row.style.transition = 'opacity 0.15s';

    const icon = document.createElement('span');
    icon.style.display = 'inline-flex';
    icon.style.flexShrink = '0';
    icon.style.filter = `drop-shadow(0 0 3px ${PALETTE[cat.key]}60)`;
    icon.innerHTML = CATEGORY_ICONS[cat.key](PALETTE[cat.key]);

    const label = document.createElement('span');
    label.textContent = cat.label;

    const count = document.createElement('span');
    count.style.marginLeft = 'auto';
    count.style.color = VISUAL_CONFIG.ui.colorDim;
    count.style.fontSize = '11px';
    count.textContent = formatCount(state.counts[cat.key] || 0);
    countSpans[cat.key] = count;

    row.appendChild(icon);
    row.appendChild(label);
    row.appendChild(count);
    content.appendChild(row);

    let visible = true;
    row.addEventListener('click', () => {
      visible = !visible;
      if (particleSystems[cat.key] && particleSystems[cat.key].points) {
        particleSystems[cat.key].points.visible = visible;
      }
      row.style.opacity = visible ? '1' : '0.35';
    });
  }

  content.appendChild(createDivider());

  // ── Country filter ────────────────────────────────────────────────────────
  const COUNTRY_OPTIONS = [
    { code: 'US', label: 'United States', aliases: ['US', 'USA'] },
    { code: 'CIS', label: 'Russia / CIS', aliases: ['CIS', 'RUS'] },
    { code: 'PRC', label: 'China', aliases: ['PRC'] },
    { code: 'UK', label: 'United Kingdom', aliases: ['UK', 'United Kingdom'] },
    { code: 'JPN', label: 'Japan', aliases: ['JPN'] },
    { code: 'IND', label: 'India', aliases: ['IND'] },
    { code: 'FR', label: 'France', aliases: ['FR'] },
    { code: 'ESA', label: 'ESA', aliases: ['ESA'] },
  ];

  // Build a lookup: country string → group code
  const countryToGroup = new Map();
  for (const opt of COUNTRY_OPTIONS) {
    for (const alias of opt.aliases) {
      countryToGroup.set(alias, opt.code);
    }
  }

  // Country header — clickable to expand/collapse
  const countryHeader = sectionLabel('Country');
  countryHeader.style.cursor = 'pointer';
  countryHeader.style.display = 'flex';
  countryHeader.style.alignItems = 'center';
  countryHeader.style.justifyContent = 'space-between';

  const countryArrow = document.createElement('span');
  countryArrow.textContent = '▸';
  countryArrow.style.transition = 'transform 0.2s';
  countryArrow.style.fontSize = '10px';
  countryHeader.appendChild(countryArrow);
  content.appendChild(countryHeader);

  const countryContainer = document.createElement('div');
  countryContainer.style.overflow = 'hidden';
  countryContainer.style.maxHeight = '0';
  countryContainer.style.opacity = '0';
  countryContainer.style.transition = 'max-height 0.3s ease, opacity 0.2s ease';
  content.appendChild(countryContainer);

  let countryExpanded = false;
  countryHeader.addEventListener('click', () => {
    countryExpanded = !countryExpanded;
    if (countryExpanded) {
      countryContainer.style.maxHeight = '500px';
      countryContainer.style.opacity = '1';
      countryArrow.style.transform = 'rotate(90deg)';
    } else {
      countryContainer.style.maxHeight = '0';
      countryContainer.style.opacity = '0';
      countryArrow.style.transform = 'rotate(0deg)';
    }
  });

  const countryActiveSet = new Set();
  function applyCountryFilter() {
    if (!propagator) return;

    if (countryActiveSet.size === 0) {
      propagator.setCountryFilter(null);
    } else {
      // Pass group codes + lookup to propagator — it matches against its own country data
      propagator.setCountryFilter({ groups: countryActiveSet, lookup: countryToGroup });
    }
    updateCountsInternal(propagator.getCounts());
  }

  const countryRows = [];

  for (const opt of [...COUNTRY_OPTIONS, { code: 'OTHER', label: 'Other' }]) {
    const row = document.createElement('div');
    baseStyle(row);
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.cursor = 'pointer';
    row.style.padding = '2px 0';
    row.style.fontSize = '11px';
    row.style.transition = 'opacity 0.15s';
    row.style.opacity = '0.5';

    const check = document.createElement('span');
    check.style.display = 'inline-block';
    check.style.width = '8px';
    check.style.height = '8px';
    check.style.border = '1px solid rgba(255,255,255,0.3)';
    check.style.borderRadius = '2px';
    check.style.flexShrink = '0';
    check.style.transition = 'all 0.15s';

    const lbl = document.createElement('span');
    lbl.textContent = opt.label;

    row.appendChild(check);
    row.appendChild(lbl);
    countryContainer.appendChild(row);
    countryRows.push({ row, check, code: opt.code });

    let on = false;
    row.addEventListener('click', () => {
      on = !on;
      if (on) {
        countryActiveSet.add(opt.code);
        check.style.background = '#00e5ff';
        check.style.borderColor = '#00e5ff';
        row.style.opacity = '1';
      } else {
        countryActiveSet.delete(opt.code);
        check.style.background = 'transparent';
        check.style.borderColor = 'rgba(255,255,255,0.3)';
        row.style.opacity = '0.5';
      }
      applyCountryFilter();
    });
  }

  content.appendChild(createDivider());

  // ── Total count ────────────────────────────────────────────────────────────
  const totalDiv = document.createElement('div');
  baseStyle(totalDiv);
  totalDiv.style.fontWeight = '300';
  totalDiv.style.letterSpacing = '0.1em';
  totalDiv.textContent = formatCount(state.counts.total || 0) + ' tracked';
  content.appendChild(totalDiv);

  // ── Data source ───────────────────────────────────────────────────────────
  const SOURCE_LINKS = {
    'CELESTRAK': 'https://celestrak.org',
    'ASTRIAGRAPH / UT AUSTIN': 'http://astria.tacc.utexas.edu/AstriaGraph/',
    'ASTRIAGRAPH + CELESTRAK': null,
    'SPACE-TRACK.ORG': 'https://www.space-track.org',
  };

  const sourceDiv = document.createElement('div');
  baseStyle(sourceDiv);
  sourceDiv.style.marginTop = '4px';
  sourceDiv.style.fontSize = '10px';
  sourceDiv.style.color = VISUAL_CONFIG.ui.colorDim;

  sourceDiv.appendChild(document.createTextNode('Source: '));

  const sourceName = state.dataSource || '---';

  function makeLink(text, url) {
    const a = document.createElement('a');
    a.textContent = text;
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.color = VISUAL_CONFIG.ui.accent;
    a.style.textDecoration = 'none';
    a.style.transition = 'opacity 0.15s';
    a.style.pointerEvents = 'auto';
    a.addEventListener('mouseenter', () => a.style.opacity = '0.7');
    a.addEventListener('mouseleave', () => a.style.opacity = '1');
    return a;
  }

  if (sourceName === 'ASTRIAGRAPH + CELESTRAK') {
    sourceDiv.appendChild(makeLink('AstriaGraph', 'http://astria.tacc.utexas.edu/AstriaGraph/'));
    sourceDiv.appendChild(document.createTextNode(' + '));
    sourceDiv.appendChild(makeLink('Celestrak', 'https://celestrak.org'));
  } else {
    const sourceUrl = SOURCE_LINKS[sourceName];
    if (sourceUrl) {
      sourceDiv.appendChild(makeLink(sourceName, sourceUrl));
    } else {
      sourceDiv.appendChild(document.createTextNode(sourceName));
    }
  }

  content.appendChild(sourceDiv);

  // ── Audio toggle ────────────────────────────────────────────────────────────
  const audio = new Audio('./orbitBG.mp3');
  audio.loop = true;
  audio.volume = 0.4;
  let audioPlaying = true;

  const audioBtn = document.createElement('div');
  baseStyle(audioBtn);
  audioBtn.style.cursor = 'pointer';
  audioBtn.style.padding = '4px 0';
  audioBtn.style.fontSize = '11px';
  audioBtn.style.transition = 'opacity 0.15s';

  function updateAudioBtn() {
    if (audioPlaying) {
      audioBtn.innerHTML = '<span style="color:#00e5ff">♫</span>  Mute';
      audioBtn.style.opacity = '0.8';
    } else {
      audioBtn.innerHTML = '<span style="color:#00e5ff">♫</span>  Unmute';
      audioBtn.style.opacity = '0.5';
    }
  }
  updateAudioBtn();

  // Autoplay — browsers may block this, so retry on first user interaction
  const tryPlay = () => audio.play().catch(() => {
    const resume = () => {
      audio.play();
      document.removeEventListener('click', resume);
      document.removeEventListener('keydown', resume);
    };
    document.addEventListener('click', resume, { once: false });
    document.addEventListener('keydown', resume, { once: false });
  });
  tryPlay();

  audioBtn.addEventListener('click', () => {
    audioPlaying = !audioPlaying;
    if (audioPlaying) {
      audio.play();
    } else {
      audio.pause();
    }
    updateAudioBtn();
  });

  content.appendChild(audioBtn);

  content.appendChild(createDivider());

  // ── Kessler toggle hint ────────────────────────────────────────────────────
  const kesslerHint = document.createElement('div');
  baseStyle(kesslerHint);
  kesslerHint.style.marginTop = '8px';
  kesslerHint.style.fontSize = '10px';
  kesslerHint.style.color = VISUAL_CONFIG.ui.colorDim;
  kesslerHint.style.opacity = state.kesslerVisible ? '0.8' : '0.5';
  kesslerHint.style.transition = 'opacity 0.15s';
  kesslerHint.innerHTML = '<span style="color:#00e5ff">K</span> Kessler Overlay';
  content.appendChild(kesslerHint);

  // ── Shared count updater ───────────────────────────────────────────────────

  function updateCountsInternal(counts) {
    for (const cat of CATEGORIES) {
      countSpans[cat.key].textContent = formatCount(counts[cat.key] || 0);
    }
    totalDiv.textContent = formatCount(counts.total || 0) + ' tracked';
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
      kesslerHint.style.opacity = visible ? '0.8' : '0.5';
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSimDate(date) {
  if (!(date instanceof Date)) return '---';
  return date.toISOString().replace('T', '  ').replace(/\.\d+Z$/, ' UTC');
}
