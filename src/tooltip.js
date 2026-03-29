import * as THREE from 'three';
import { VISUAL_CONFIG, PALETTE } from './config.js';

export function createTooltip(camera, scene, particleSystems, allSatData) {
  const isMobile = window.innerWidth < 768;
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = isMobile ? 0.06 : 0.02;

  const mouse = new THREE.Vector2();
  const categories = ['active', 'debris', 'rocketBody', 'station'];

  // ── Selection state ─────────────────────────────────────────────────────
  let selected = null;  // { category, index, satData }

  // ── Selection ring (3D, follows the selected object) ────────────────────
  const ringGeo = new THREE.RingGeometry(0.018, 0.022, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const selectionRing = new THREE.Mesh(ringGeo, ringMat);
  selectionRing.visible = false;
  selectionRing.renderOrder = 999;
  scene.add(selectionRing);

  // ── Hover tooltip (follows cursor) ──────────────────────────────────────
  const tooltip = document.createElement('div');
  Object.assign(tooltip.style, {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: '1000',
    background: 'rgba(10, 12, 20, 0.75)',
    backdropFilter: 'blur(12px)',
    webkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.1)',
    padding: '8px 12px',
    fontFamily: "'Satoshi', sans-serif",
    fontSize: '11px',
    letterSpacing: '0.02em',
    color: 'rgba(255,255,255,0.8)',
    display: 'none',
    borderRadius: '8px',
  });
  document.body.appendChild(tooltip);

  // ── Selection panel (defined in index.html CSS, just grab it) ──────────
  const panel = document.getElementById('selection-panel');

  // Clicks/taps on panel should not deselect
  panel.addEventListener('click', (e) => e.stopPropagation());
  panel.addEventListener('touchstart', (e) => e.stopPropagation());
  panel.addEventListener('touchend', (e) => e.stopPropagation());

  // ── Helpers ─────────────────────────────────────────────────────────────

  function raycast(clientX, clientY) {
    mouse.x = (clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    let closestHit = null;
    let closestCategory = null;
    let closestDistance = Infinity;

    for (const category of categories) {
      const system = particleSystems[category];
      if (!system || !system.points || !system.points.visible) continue;

      const intersects = raycaster.intersectObject(system.points);
      if (intersects.length > 0 && intersects[0].distance < closestDistance) {
        closestDistance = intersects[0].distance;
        closestHit = intersects[0];
        closestCategory = category;
      }
    }

    if (!closestHit) return null;

    const index = closestHit.index;
    const satData = allSatData[closestCategory]?.[index];
    if (!satData) return null;

    return { hit: closestHit, category: closestCategory, index, satData };
  }

  function computeAltitude(point) {
    const dist = Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z);
    return (dist - 1) * 6371;
  }

  function formatInfo(satData, category, altitudeKm, detailed) {
    const name = satData.name || 'UNKNOWN';
    const noradId = satData.satrec ? satData.satrec.satnum : '-----';
    const catLabel = category.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
    const color = PALETTE[category] || '#00e5ff';

    let nameHtml;
    if (detailed && noradId !== '-----') {
      const n2yoUrl = `https://www.n2yo.com/satellite/?s=${noradId}`;
      nameHtml = `<a href="${n2yoUrl}" target="_blank" rel="noopener" style="color:rgba(255,255,255,0.95);text-decoration:none;cursor:pointer;pointer-events:auto;transition:opacity 0.15s" onmouseenter="this.style.opacity='0.7'" onmouseleave="this.style.opacity='1'">${name} ↗</a>`;
    } else {
      nameHtml = `<span style="color:rgba(255,255,255,0.95)">${name}</span>`;
    }

    const dimStyle = 'color:rgba(255,255,255,0.45);font-size:10px';
    const dotHtml = `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${color};margin-right:6px;box-shadow:0 0 4px ${color}60"></span>`;

    let html =
      `<div style="font-size:13px;font-weight:500;margin-bottom:6px">${nameHtml}</div>` +
      `<div style="${dimStyle}">${dotHtml}${catLabel}</div>` +
      `<div style="${dimStyle}">NORAD ${noradId}</div>` +
      `<div style="${dimStyle}" data-alt>ALT ${Math.round(Math.max(0, altitudeKm))} km</div>`;

    if (detailed) {
      if (satData.country) {
        html += `<div style="${dimStyle};margin-top:6px">Origin: ${satData.country}</div>`;
      }
      if (satData.launchDate) {
        html += `<div style="${dimStyle}">Launched: ${satData.launchDate}</div>`;
      }
      if (satData.launchMass) {
        html += `<div style="${dimStyle}">Mass: ${satData.launchMass} kg</div>`;
      }
    }

    return html;
  }

  // ── Wikipedia image lookup ──────────────────────────────────────────────

  const imageCache = new Map(); // name → url | null
  let currentImageRequest = 0;  // cancel stale requests

  // Map TLE name prefixes/exact matches to Wikipedia page titles
  const EXACT_MAPPINGS = {
    'ISS':        'International Space Station',
    'CSS':        'Tiangong space station',
    'HST':        'Hubble Space Telescope',
    'TIANHE':     'Tiangong space station',
    'TIANGONG':   'Tiangong space station',
    'HUBBLE':     'Hubble Space Telescope',
    'TERRA':      'Terra (satellite)',
    'AQUA':       'Aqua (satellite)',
    'AURA':       'Aura (satellite)',
    'CALIPSO':    'CALIPSO',
    'CHANDRA':    'Chandra X-ray Observatory',
    'SWIFT':      'Neil Gehrels Swift Observatory',
    'FERMI':      'Fermi Gamma-ray Space Telescope',
    'NUSTAR':     'NuSTAR',
    'NROL':       null, // classified, skip
    'CYGNUS':     'Cygnus (spacecraft)',
    'DRAGON':     'SpaceX Dragon 2',
    'CREW DRAGON':'SpaceX Dragon 2',
    'PROGRESS':   'Progress (spacecraft)',
    'SOYUZ':      'Soyuz (spacecraft)',
    'ZARYA':      'International Space Station',
  };

  const PREFIX_MAPPINGS = [
    ['STARLINK',   'Starlink'],
    ['ONEWEB',     'OneWeb satellite constellation'],
    ['IRIDIUM',    'Iridium satellite constellation'],
    ['GLOBALSTAR', 'Globalstar'],
    ['ORBCOMM',    'Orbcomm'],
    ['GPS',        'Global Positioning System'],
    ['NAVSTAR',    'Global Positioning System'],
    ['GLONASS',    'GLONASS'],
    ['GALILEO',    'Galileo (satellite navigation)'],
    ['BEIDOU',     'BeiDou'],
    ['COSMOS',     'Kosmos (satellite)'],
    ['KOSMOS',     'Kosmos (satellite)'],
    ['FENGYUN',    'Fengyun'],
    ['GOES',       'Geostationary Operational Environmental Satellite'],
    ['NOAA',       'NOAA-19'],
    ['LANDSAT',    'Landsat program'],
    ['SENTINEL',   'Copernicus Programme'],
    ['METEOSAT',   'Meteosat'],
    ['INTELSAT',   'Intelsat'],
    ['SES',        'SES S.A.'],
    ['TDRS',       'Tracking and Data Relay Satellite'],
    ['MOLNIYA',    'Molniya (satellite)'],
    ['INMARSAT',   'Inmarsat'],
    ['EUTELSAT',   'Eutelsat'],
    ['ASTRA',      'SES Astra'],
    ['YAOGAN',     'Yaogan'],
    ['GAOFEN',     'Gaofen'],
    ['KUAIZHOU',   'Kuaizhou'],
    ['ELECTRON',   'Electron (rocket)'],
  ];

  function cleanNameForSearch(rawName) {
    let name = rawName.trim();
    name = name.replace(/^0\s+/, '');
    name = name.replace(/\s*\(.*\)/, '').trim();

    const upper = name.toUpperCase();

    // Skip debris and rocket bodies immediately
    if (upper.includes(' DEB') || upper.includes('DEBRIS')) return null;
    if (upper.includes(' R/B') || upper.includes('ROCKET BODY')) return null;

    // Exact match
    if (EXACT_MAPPINGS[upper] !== undefined) return EXACT_MAPPINGS[upper];

    // Prefix match
    for (const [prefix, wiki] of PREFIX_MAPPINGS) {
      if (upper.startsWith(prefix)) return wiki;
    }

    // Fallback: use the name directly for Wikipedia search
    return name;
  }

  async function fetchSatelliteImage(rawName, requestId) {
    const searchName = cleanNameForSearch(rawName);
    if (!searchName || searchName.length < 2) return null;

    // Check cache
    if (imageCache.has(searchName)) return imageCache.get(searchName);

    try {
      // Try direct page summary first (fast, exact match)
      const directUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(searchName)}`;
      let res = await fetch(directUrl);

      if (res.ok) {
        const data = await res.json();
        const thumb = data.thumbnail?.source || null;
        imageCache.set(searchName, thumb);
        if (requestId !== currentImageRequest) return null;
        return thumb;
      }

      // Fallback: search API
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchName + ' satellite')}&srlimit=1&format=json&origin=*`;
      res = await fetch(searchUrl);
      if (!res.ok) {
        imageCache.set(searchName, null);
        return null;
      }
      const searchData = await res.json();
      const title = searchData.query?.search?.[0]?.title;
      if (!title) {
        imageCache.set(searchName, null);
        return null;
      }

      // Get summary for the found page
      const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      res = await fetch(summaryUrl);
      if (!res.ok) {
        imageCache.set(searchName, null);
        return null;
      }
      const summaryData = await res.json();
      const thumb = summaryData.thumbnail?.source || null;
      imageCache.set(searchName, thumb);

      if (requestId !== currentImageRequest) return null;
      return thumb;
    } catch {
      imageCache.set(searchName, null);
      return null;
    }
  }

  // ── Panel image element ─────────────────────────────────────────────────

  const panelImage = document.createElement('img');
  Object.assign(panelImage.style, {
    width: '100%',
    maxHeight: '120px',
    objectFit: 'cover',
    marginBottom: '8px',
    display: 'none',
    opacity: '0',
    transition: 'opacity 0.3s ease',
    borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.08)',
  });
  panelImage.addEventListener('load', () => {
    panelImage.style.display = 'block';
    // Force reflow then fade in
    requestAnimationFrame(() => { panelImage.style.opacity = '1'; });
  });
  panelImage.addEventListener('error', () => {
    panelImage.style.display = 'none';
  });

  function getSelectedPosition(propagator) {
    if (!selected) return null;
    const buf = propagator.getPositionBuffers()[selected.category];
    if (!buf) return null;
    const i = selected.index * 3;
    return new THREE.Vector3(buf[i], buf[i + 1], buf[i + 2]);
  }

  function updateRing(position) {
    if (!position) {
      selectionRing.visible = false;
      return;
    }
    selectionRing.visible = true;
    selectionRing.position.copy(position);
    // Billboard: always face the camera
    selectionRing.lookAt(camera.position);

    // Set ring color to match selected category
    if (selected) {
      ringMat.color.set(PALETTE[selected.category] || '#00e5ff');
    }
  }

  // ── Hover ───────────────────────────────────────────────────────────────

  let lastInvokeTime = 0;

  function onMouseMove(event) {
    const now = performance.now();
    if (now - lastInvokeTime < 80) return;
    lastInvokeTime = now;

    // If something is selected, don't show hover tooltip
    if (selected) {
      tooltip.style.display = 'none';
      return;
    }

    const result = raycast(event.clientX, event.clientY);

    if (result) {
      const alt = computeAltitude(result.hit.point);
      tooltip.innerHTML = formatInfo(result.satData, result.category, alt);
      tooltip.style.display = 'block';
      tooltip.style.left = (event.clientX + 15) + 'px';
      tooltip.style.top = (event.clientY + 15) + 'px';
      document.body.style.cursor = 'pointer';
    } else {
      tooltip.style.display = 'none';
      document.body.style.cursor = 'default';
    }
  }

  // ── Drag detection — don't deselect after camera drag ──────────────────

  let mouseDownPos = null;
  const DRAG_THRESHOLD = 5; // pixels

  window.addEventListener('mousedown', (e) => {
    mouseDownPos = { x: e.clientX, y: e.clientY };
  });

  function wasDrag(event) {
    if (!mouseDownPos) return false;
    const dx = event.clientX - mouseDownPos.x;
    const dy = event.clientY - mouseDownPos.y;
    return Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD;
  }

  // ── Click to select / deselect ──────────────────────────────────────────

  // Persistent altitude element — updated every frame without rewriting the panel
  let altitudeSpan = null;

  function closePanel() {
    selected = null;
    panel.style.display = 'none';
    panelImage.style.display = 'none';
    selectionRing.visible = false;
  }

  function showPanel(satData, category, alt) {
    panel.innerHTML = '';

    // Close button (always visible, especially important on mobile)
    const closeBtn = document.createElement('div');
    Object.assign(closeBtn.style, {
      position: 'absolute',
      top: '10px',
      right: '12px',
      cursor: 'pointer',
      fontSize: '16px',
      color: 'rgba(255,255,255,0.4)',
      lineHeight: '1',
      padding: '4px',
      zIndex: '1',
    });
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closePanel(); });
    closeBtn.addEventListener('touchend', (e) => { e.stopPropagation(); e.preventDefault(); closePanel(); });
    panel.appendChild(closeBtn);

    // Reset and prepend image element
    panelImage.style.display = 'none';
    panelImage.style.opacity = '0';
    panel.appendChild(panelImage);

    // Text info
    const textDiv = document.createElement('div');
    textDiv.innerHTML =
      `<div style="color:rgba(255,255,255,0.3);margin-bottom:8px;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.08em">Selected Object</div>` +
      formatInfo(satData, category, alt, true);
    panel.appendChild(textDiv);

    // Grab reference to the altitude value for live updates
    altitudeSpan = textDiv.querySelector('[data-alt]');

    panel.style.display = 'block';

    // Fetch satellite image async (ISS Tracker → Wikipedia fallback)
    const requestId = ++currentImageRequest;
    fetchSatelliteImage(satData.name || '', requestId).then((imgUrl) => {
      if (imgUrl && requestId === currentImageRequest) {
        panelImage.src = imgUrl;
      } else {
        panelImage.style.display = 'none';
      }
    });
  }

  function onClick(event) {
    // Ignore drags (camera orbit)
    if (wasDrag(event)) return;

    const result = raycast(event.clientX, event.clientY);

    if (result) {
      selected = result;
      tooltip.style.display = 'none';

      const alt = computeAltitude(result.hit.point);
      showPanel(result.satData, result.category, alt);

      updateRing(result.hit.point);
    } else if (!isMobile) {
      // Desktop: click empty space to deselect
      // Mobile: only deselect via the close button (taps are too imprecise)
      closePanel();
    }
  }

  if (isMobile) {
    // Mobile: touch-based tap detection only (no hover, no click)
    let touchStart = null;

    window.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() };
      } else {
        touchStart = null;
      }
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      if (!touchStart) return;
      const dt = Date.now() - touchStart.time;
      if (dt > 300) { touchStart = null; return; }
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;
      if (Math.sqrt(dx * dx + dy * dy) > 15) { touchStart = null; return; }
      onClick({ clientX: touch.clientX, clientY: touch.clientY });
      touchStart = null;
    });
  } else {
    // Desktop: hover + click
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onClick);
  }

  return {
    // Called from animation loop — updates ring position and panel altitude
    updateSelected(propagator) {
      if (!selected) return;
      const pos = getSelectedPosition(propagator);
      if (!pos) return;

      updateRing(pos);

      // Only update the altitude value — don't rewrite the panel (preserves links)
      const dist = pos.length();
      const alt = (dist - 1) * 6371;
      if (altitudeSpan) {
        altitudeSpan.textContent = `ALT: ${Math.round(Math.max(0, alt))} KM`;
      }
    },

    dispose() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('click', onClick);
      if (tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
      panel.style.display = 'none';
      scene.remove(selectionRing);
    },
  };
}
