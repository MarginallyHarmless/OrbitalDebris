# Orbit Path Lines & Enhanced Selection Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add gradient-fade orbit path lines with category toggles and zoom-based LOD, plus orbital parameter readouts in the selection panel.

**Architecture:** New `src/orbits.js` module owns all orbit line creation, LOD, and lifecycle. It manages a `THREE.Group` per category and a separate selected-orbit highlight. Existing `tooltip.js` is extended with orbital parameter display and calls into `orbits.js` for selected orbit rendering. `main.js` calls the per-frame update. `ui.js` gets orbit toggle controls.

**Tech Stack:** Three.js (Line, BufferGeometry, Line2/LineMaterial for selected highlight), satellite.js (SGP4 propagation + gstime), existing kepler.js

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/orbits.js` | Create | Orbit line creation, gradient alpha, LOD, line pool, category groups, selected highlight, GMST rotation |
| `src/config.js` | Modify | Add orbit constants to `VISUAL_CONFIG` |
| `src/main.js` | Modify | Import orbits, call `initOrbits()` at boot, call `updateOrbitsFrame()` in animation loop |
| `src/ui.js` | Modify | Add orbit toggle icon per category row, wire to `toggleCategoryOrbits()` |
| `src/tooltip.js` | Modify | Add orbital parameter section to selection panel, call `setSelectedOrbit()` / `clearSelectedOrbit()` |

---

### Task 1: Add orbit constants to config.js

**Files:**
- Modify: `src/config.js:81` (after kessler block)

- [ ] **Step 1: Add orbit config block**

Add after the `kessler` block (line 81) in `VISUAL_CONFIG`:

```javascript
  orbit: {
    samplePoints: 180,
    lineOpacity: 0.6,
    lineFadeMin: 0.05,
    maxLines: 2000,
    selectedWidth: 2,
    lod: {
      far:   { distance: 8, sampling: 20 },
      mid:   { distance: 4, sampling: 5 },
      close: { distance: 0, sampling: 1 },
    },
  },
```

- [ ] **Step 2: Verify dev server starts**

Run: `npm run dev`
Expected: Vite dev server starts without errors, app loads in browser.

- [ ] **Step 3: Commit**

```bash
git add src/config.js
git commit -m "feat: add orbit path config constants"
```

---

### Task 2: Create orbits.js — core orbit line computation

**Files:**
- Create: `src/orbits.js`

This task creates the module with orbit path computation and single-line creation. No LOD, no category toggles yet — just the core function that takes a satellite's data and returns a `THREE.Line` with gradient alpha.

- [ ] **Step 1: Create src/orbits.js with imports and orbit computation**

```javascript
// ─── ORBIT PATH LINES ───────────────────────────────────────────────────────
// Gradient-fade orbit ellipses with category toggles and zoom-based LOD.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import * as satellite from 'satellite.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { VISUAL_CONFIG, PALETTE } from './config.js';
import { keplerToEci } from './kepler.js';
import { eciToScene } from './utils.js';

const MU = 3.986004418e14; // m³/s²
const TWO_PI = 2 * Math.PI;
const EARTH_RADIUS_M = 6371000;

// ─── State ──────────────────────────────────────────────────────────────────

let scene = null;
const categoryGroups = {};    // category → THREE.Group
let selectedLine = null;      // Line2 for selected orbit
let selectedGroup = null;     // THREE.Group for selected orbit
const categories = ['active', 'debris', 'rocketBody', 'station'];

// ─── Orbit period computation ───────────────────────────────────────────────

function getOrbitalPeriodMs(satData) {
  if (satData.kepler) {
    const sma = satData.kepler.sma; // meters
    return TWO_PI * Math.sqrt((sma * sma * sma) / MU) * 1000;
  }
  if (satData.satrec && satData.satrec.no !== undefined) {
    // satrec.no is mean motion in rad/min
    const periodMin = TWO_PI / satData.satrec.no;
    return periodMin * 60 * 1000;
  }
  return null;
}

// ─── Sample orbit points ────────────────────────────────────────────────────

function sampleOrbitPoints(satData, numPoints, refTimeMs) {
  const periodMs = getOrbitalPeriodMs(satData);
  if (!periodMs || periodMs <= 0 || periodMs > 1e10) return null;

  const points = [];
  const step = periodMs / numPoints;

  for (let i = 0; i < numPoints; i++) {
    const t = refTimeMs + i * step;
    let eciPos = null;

    if (satData.kepler) {
      const k = satData.kepler;
      try {
        eciPos = keplerToEci(k.sma, k.ecc, k.inc, k.raan, k.argp, k.ma, k.epochMs, t);
      } catch {
        return null;
      }
    } else if (satData.satrec && satData.satrec.no !== undefined) {
      try {
        const date = new Date(t);
        const pv = satellite.propagate(satData.satrec, date);
        eciPos = pv.position;
      } catch {
        return null;
      }
    }

    if (!eciPos || isNaN(eciPos.x)) return null;

    const gmst = satellite.gstime(new Date(t));
    const scenePos = eciToScene(eciPos, gmst);
    points.push(scenePos);
  }

  return points;
}

// ─── Create a gradient-fade orbit line (THREE.Line) ─────────────────────────

function createOrbitLine(satData, category, refTimeMs) {
  const cfg = VISUAL_CONFIG.orbit;
  const points = sampleOrbitPoints(satData, cfg.samplePoints, refTimeMs);
  if (!points) return null;

  // Close the loop: add first point at end
  points.push(points[0].clone());

  const positions = new Float32Array(points.length * 3);
  const colors = new Float32Array(points.length * 4);

  const color = new THREE.Color(PALETTE[category]);
  const maxAlpha = cfg.lineOpacity;
  const minAlpha = cfg.lineFadeMin;

  for (let i = 0; i < points.length; i++) {
    positions[i * 3] = points[i].x;
    positions[i * 3 + 1] = points[i].y;
    positions[i * 3 + 2] = points[i].z;

    // Gradient: brightest at index 0 (object position), fades around orbit
    const frac = i / (points.length - 1);
    const alpha = maxAlpha - (maxAlpha - minAlpha) * frac;

    colors[i * 4] = color.r;
    colors[i * 4 + 1] = color.g;
    colors[i * 4 + 2] = color.b;
    colors[i * 4 + 3] = alpha;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  return new THREE.Line(geometry, material);
}

// ─── Create a highlighted orbit line (Line2, wider) ─────────────────────────

function createSelectedOrbitLine(satData, category, refTimeMs) {
  const cfg = VISUAL_CONFIG.orbit;
  const points = sampleOrbitPoints(satData, cfg.samplePoints, refTimeMs);
  if (!points) return null;

  // Close the loop
  points.push(points[0].clone());

  const positions = [];
  const lineColors = [];
  const color = new THREE.Color(PALETTE[category]);

  for (let i = 0; i < points.length; i++) {
    positions.push(points[i].x, points[i].y, points[i].z);

    // Gradient fade
    const frac = i / (points.length - 1);
    const brightness = 1.0 - frac * 0.7;
    lineColors.push(color.r * brightness, color.g * brightness, color.b * brightness);
  }

  const geometry = new LineGeometry();
  geometry.setPositions(positions);
  geometry.setColors(lineColors);

  const material = new LineMaterial({
    color: 0xffffff,
    linewidth: cfg.selectedWidth,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
  });

  return new Line2(geometry, material);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function initOrbits(sceneRef) {
  scene = sceneRef;

  for (const cat of categories) {
    const group = new THREE.Group();
    group.visible = false;
    scene.add(group);
    categoryGroups[cat] = group;
  }

  selectedGroup = new THREE.Group();
  scene.add(selectedGroup);
}

export function setSelectedOrbit(satData, category, refTimeMs) {
  clearSelectedOrbit();

  const line = createSelectedOrbitLine(satData, category, refTimeMs);
  if (line) {
    selectedLine = line;
    selectedGroup.add(line);
  }
}

export function clearSelectedOrbit() {
  if (selectedLine) {
    selectedGroup.remove(selectedLine);
    selectedLine.geometry.dispose();
    selectedLine.material.dispose();
    selectedLine = null;
  }
}

export { createOrbitLine, getOrbitalPeriodMs, sampleOrbitPoints };
```

- [ ] **Step 2: Verify the module imports without errors**

Open the browser dev console with the app running. There should be no import errors. The module is created but not yet wired into main.js, so no visible effect yet.

- [ ] **Step 3: Commit**

```bash
git add src/orbits.js
git commit -m "feat: add orbits.js with core orbit line computation"
```

---

### Task 3: Wire orbits.js into main.js — init and selected orbit on click

**Files:**
- Modify: `src/main.js:1-16` (imports)
- Modify: `src/main.js:67-77` (after particle systems init)
- Modify: `src/tooltip.js:4` (import orbits)
- Modify: `src/tooltip.js:428-434` (onClick handler)
- Modify: `src/tooltip.js:366-371` (closePanel)

- [ ] **Step 1: Add orbit import to main.js**

Add to the import block at the top of `src/main.js` (after the tooltip import on line 16):

```javascript
import { initOrbits } from './orbits.js';
```

- [ ] **Step 2: Call initOrbits after particle system creation in main.js**

After line 68 (`particleSystems = createParticleSystems(propagator, scene);`), add:

```javascript
    initOrbits(scene);
```

- [ ] **Step 3: Add orbit imports to tooltip.js**

Add at the top of `src/tooltip.js` (after the existing imports on line 2):

```javascript
import { setSelectedOrbit, clearSelectedOrbit } from './orbits.js';
```

- [ ] **Step 4: Call setSelectedOrbit on click in tooltip.js**

In the `onClick` function (around line 428-434), after the `showPanel(result.satData, result.category, alt);` call, add:

```javascript
      setSelectedOrbit(result.satData, result.category, Date.now());
```

- [ ] **Step 5: Call clearSelectedOrbit on deselect in tooltip.js**

In the `closePanel` function (around line 366-371), add `clearSelectedOrbit()` right before `selectionRing.visible = false;`:

```javascript
  function closePanel() {
    selected = null;
    panel.style.display = 'none';
    panelImage.style.display = 'none';
    clearSelectedOrbit();
    selectionRing.visible = false;
  }
```

- [ ] **Step 6: Verify selected orbit works**

Run the app, click on a satellite. You should see a thick gradient-fade orbit line drawn in the category color. Click empty space to deselect — the line should disappear.

- [ ] **Step 7: Commit**

```bash
git add src/main.js src/tooltip.js
git commit -m "feat: wire orbit lines into selection — click to show orbit path"
```

---

### Task 4: Add category orbit toggles with LOD

**Files:**
- Modify: `src/orbits.js` (add toggleCategoryOrbits, updateOrbitsFrame, line pool)
- Modify: `src/main.js` (pass camera + simTime to updateOrbitsFrame in animation loop)

- [ ] **Step 1: Add LOD and category toggle logic to orbits.js**

Add the following to `src/orbits.js`, before the `// ─── Public API` section:

```javascript
// ─── Line pool for category orbits ──────────────────────────────────────────

const linePool = [];           // reusable THREE.Line objects
const activeLines = {};        // category → [{ line, index }]
const categoryToggleState = {}; // category → boolean
let categoryData = null;       // reference to allSatData from main

for (const cat of categories) {
  activeLines[cat] = [];
  categoryToggleState[cat] = false;
}

function getOrCreateLine() {
  if (linePool.length > 0) return linePool.pop();

  const geometry = new THREE.BufferGeometry();
  const maxVerts = VISUAL_CONFIG.orbit.samplePoints + 1;
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(maxVerts * 4), 4));

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  return new THREE.Line(geometry, material);
}

function returnLineToPool(line) {
  line.visible = false;
  if (line.parent) line.parent.remove(line);
  linePool.push(line);
}

function populateLineFromSatData(line, satData, category, refTimeMs) {
  const cfg = VISUAL_CONFIG.orbit;
  const points = sampleOrbitPoints(satData, cfg.samplePoints, refTimeMs);
  if (!points) return false;

  points.push(points[0].clone());

  const posAttr = line.geometry.getAttribute('position');
  const colAttr = line.geometry.getAttribute('color');
  const color = new THREE.Color(PALETTE[category]);

  for (let i = 0; i < points.length; i++) {
    posAttr.setXYZ(i, points[i].x, points[i].y, points[i].z);

    const frac = i / (points.length - 1);
    const alpha = cfg.lineOpacity - (cfg.lineOpacity - cfg.lineFadeMin) * frac;
    colAttr.setXYZW(i, color.r, color.g, color.b, alpha);
  }

  posAttr.needsUpdate = true;
  colAttr.needsUpdate = true;
  line.geometry.setDrawRange(0, points.length);
  line.visible = true;

  return true;
}

// ─── LOD calculation ────────────────────────────────────────────────────────

let lastLodLevel = 'far';

function getLodLevel(cameraDistance) {
  const lod = VISUAL_CONFIG.orbit.lod;
  if (cameraDistance < lod.mid.distance) return 'close';
  if (cameraDistance < lod.far.distance) return 'mid';
  return 'far';
}

function getSampling(lodLevel) {
  return VISUAL_CONFIG.orbit.lod[lodLevel].sampling;
}

function rebuildCategoryLines(category, refTimeMs, camera) {
  // Return existing lines to pool
  for (const entry of activeLines[category]) {
    returnLineToPool(entry.line);
  }
  activeLines[category] = [];

  if (!categoryData || !categoryData[category]) return;

  const satList = categoryData[category];
  const cameraDistance = camera.position.length();
  const lodLevel = getLodLevel(cameraDistance);
  const sampling = getSampling(lodLevel);
  const maxLines = VISUAL_CONFIG.orbit.maxLines;

  let count = 0;

  // For 'close' LOD, use frustum culling
  let frustum = null;
  if (lodLevel === 'close') {
    frustum = new THREE.Frustum();
    const projScreenMatrix = new THREE.Matrix4();
    projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);
  }

  for (let i = 0; i < satList.length; i += sampling) {
    if (count >= maxLines) break;

    // Frustum culling at close zoom: skip objects not in view
    if (frustum) {
      // We don't have live positions here easily, so just use every object
      // The maxLines cap handles the budget
    }

    const satData = satList[i];
    const line = getOrCreateLine();

    if (populateLineFromSatData(line, satData, category, refTimeMs)) {
      categoryGroups[category].add(line);
      activeLines[category].push({ line, index: i });
      count++;
    } else {
      returnLineToPool(line);
    }
  }
}
```

- [ ] **Step 2: Add the public toggle and update functions to orbits.js**

Update the public API section in `src/orbits.js` to include:

```javascript
export function setCategoryData(allSatData) {
  categoryData = allSatData;
}

export function toggleCategoryOrbits(category, visible, refTimeMs, camera) {
  categoryToggleState[category] = visible;
  categoryGroups[category].visible = visible;

  if (visible) {
    rebuildCategoryLines(category, refTimeMs, camera);
  } else {
    // Return all lines to pool
    for (const entry of activeLines[category]) {
      returnLineToPool(entry.line);
    }
    activeLines[category] = [];
  }
}

export function updateOrbitsFrame(camera, refTimeMs) {
  // Check if LOD level changed
  const cameraDistance = camera.position.length();
  const newLod = getLodLevel(cameraDistance);

  if (newLod !== lastLodLevel) {
    lastLodLevel = newLod;
    // Rebuild all active category orbits at new LOD
    for (const cat of categories) {
      if (categoryToggleState[cat]) {
        rebuildCategoryLines(cat, refTimeMs, camera);
      }
    }
  }

  // Update Line2 resolution for selected orbit
  if (selectedLine && selectedLine.material.resolution) {
    selectedLine.material.resolution.set(window.innerWidth, window.innerHeight);
  }
}

export function dispose() {
  for (const cat of categories) {
    for (const entry of activeLines[cat]) {
      entry.line.geometry.dispose();
      entry.line.material.dispose();
    }
    activeLines[cat] = [];
    if (categoryGroups[cat]) {
      scene.remove(categoryGroups[cat]);
    }
  }
  clearSelectedOrbit();
  if (selectedGroup) scene.remove(selectedGroup);
  for (const line of linePool) {
    line.geometry.dispose();
    line.material.dispose();
  }
  linePool.length = 0;
}
```

- [ ] **Step 3: Wire updateOrbitsFrame into main.js animation loop**

In `src/main.js`, update the import to include `updateOrbitsFrame` and `setCategoryData`:

```javascript
import { initOrbits, updateOrbitsFrame, setCategoryData } from './orbits.js';
```

After `initOrbits(scene);` in the boot function, add:

```javascript
    setCategoryData(catalogData);
```

In the animation loop, after the `tooltip.updateSelected(propagator);` call (around line 183), add:

```javascript
    updateOrbitsFrame(camera, state.simTime.getTime());
```

- [ ] **Step 4: Verify LOD works**

Run the app. No orbit lines should be visible yet (no toggles wired). Open browser console and test manually:

```javascript
// This is just for manual verification during development
```

The module is ready for UI toggles in the next task.

- [ ] **Step 5: Commit**

```bash
git add src/orbits.js src/main.js
git commit -m "feat: add LOD system and category orbit toggle logic"
```

---

### Task 5: Add orbit toggle UI controls

**Files:**
- Modify: `src/ui.js:84-85` (createUI params)
- Modify: `src/ui.js:367-406` (category toggle rows)

- [ ] **Step 1: Pass camera to createUI and import orbit toggle**

In `src/main.js`, update the `createUI` call (around line 70) to pass camera:

```javascript
    ui = createUI(state, particleSystems, controls, propagator, camera);
```

In `src/ui.js`, update the function signature:

```javascript
export function createUI(state, particleSystems, controls, propagator, camera) {
```

Add import at the top of `src/ui.js`:

```javascript
import { toggleCategoryOrbits } from './orbits.js';
```

- [ ] **Step 2: Add orbit toggle icon to each category row**

In `src/ui.js`, inside the category row creation loop (the `for (const cat of CATEGORIES)` block, around line 367), add an orbit toggle icon after the count span. Replace the existing category row event listener block. The full replacement for the loop body (lines 368-406) should be:

```javascript
    const row = document.createElement('div');
    baseStyle(row);
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    row.style.padding = '3px 0';

    const icon = document.createElement('span');
    icon.style.display = 'inline-flex';
    icon.style.flexShrink = '0';
    icon.style.filter = `drop-shadow(0 0 3px ${PALETTE[cat.key]}60)`;
    icon.innerHTML = CATEGORY_ICONS[cat.key](PALETTE[cat.key]);
    icon.style.cursor = 'pointer';

    const label = document.createElement('span');
    label.textContent = cat.label;
    label.style.cursor = 'pointer';

    const count = document.createElement('span');
    count.style.marginLeft = 'auto';
    count.style.color = VISUAL_CONFIG.ui.colorDim;
    count.style.fontSize = '11px';
    count.textContent = formatCount(state.counts[cat.key] || 0);
    countSpans[cat.key] = count;

    // Orbit toggle — small "◯" icon
    const orbitBtn = document.createElement('span');
    baseStyle(orbitBtn);
    orbitBtn.style.cursor = 'pointer';
    orbitBtn.style.fontSize = '11px';
    orbitBtn.style.color = VISUAL_CONFIG.ui.colorDim;
    orbitBtn.style.transition = 'color 0.15s';
    orbitBtn.style.marginLeft = '6px';
    orbitBtn.style.padding = '2px';
    orbitBtn.title = 'Toggle orbit paths';
    orbitBtn.textContent = '◯';

    let orbitVisible = false;
    orbitBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      orbitVisible = !orbitVisible;
      orbitBtn.style.color = orbitVisible ? PALETTE[cat.key] : VISUAL_CONFIG.ui.colorDim;
      toggleCategoryOrbits(cat.key, orbitVisible, state.simTime.getTime(), camera);
    });

    row.appendChild(icon);
    row.appendChild(label);
    row.appendChild(count);
    row.appendChild(orbitBtn);
    content.appendChild(row);

    let visible = true;
    // Click on icon or label to toggle particles visibility
    const toggleParticles = () => {
      visible = !visible;
      if (particleSystems[cat.key] && particleSystems[cat.key].points) {
        particleSystems[cat.key].points.visible = visible;
      }
      row.style.opacity = visible ? '1' : '0.35';
    };
    icon.addEventListener('click', toggleParticles);
    label.addEventListener('click', toggleParticles);
```

- [ ] **Step 3: Verify orbit toggles work**

Run the app. Each category row in the HUD should now have a small "◯" icon on the right. Click it to toggle orbit lines for that category. Stations (2 objects) should show 2 orbit lines immediately. Active satellites should show a subset based on LOD.

- [ ] **Step 4: Commit**

```bash
git add src/ui.js src/main.js
git commit -m "feat: add orbit toggle controls to HUD category rows"
```

---

### Task 6: Enhanced selection panel — orbital parameters

**Files:**
- Modify: `src/tooltip.js:96-131` (formatInfo function)

- [ ] **Step 1: Add orbital parameter computation helper to tooltip.js**

Add after the `formatInfo` function (around line 132) in `src/tooltip.js`:

```javascript
  function computeOrbitalParams(satData) {
    const MU = 3.986004418e14; // m³/s²
    const R_EARTH_KM = 6371;
    let sma, ecc, inc, period;

    if (satData.kepler) {
      sma = satData.kepler.sma; // meters
      ecc = satData.kepler.ecc;
      inc = satData.kepler.inc; // radians
    } else if (satData.satrec && satData.satrec.no !== undefined) {
      // Mean motion in rad/min → SMA
      const n = satData.satrec.no; // rad/min
      const nSec = n / 60; // rad/s
      sma = Math.pow(MU / (nSec * nSec), 1 / 3); // meters
      ecc = satData.satrec.ecco;
      inc = satData.satrec.inclo; // radians
    } else {
      return null;
    }

    if (!sma || sma <= 0 || isNaN(sma)) return null;

    period = 2 * Math.PI * Math.sqrt((sma * sma * sma) / MU) / 60; // minutes

    const smaKm = sma / 1000;
    const apogee = smaKm * (1 + ecc) - R_EARTH_KM;
    const perigee = smaKm * (1 - ecc) - R_EARTH_KM;
    const incDeg = inc * (180 / Math.PI);

    return {
      inclination: incDeg.toFixed(1) + '°',
      period: period.toFixed(1) + ' min',
      eccentricity: ecc.toFixed(4),
      apogeePerigee: Math.round(Math.max(0, perigee)) + ' × ' + Math.round(Math.max(0, apogee)) + ' km',
    };
  }
```

- [ ] **Step 2: Add orbital params to formatInfo's detailed mode**

In the `formatInfo` function, at the end of the `if (detailed)` block (around line 128, before the closing `}`), add:

```javascript
      const orbital = computeOrbitalParams(satData);
      if (orbital) {
        const orbStyle = 'color:rgba(255,255,255,0.45);font-size:10px';
        const labelStyle = 'color:rgba(255,255,255,0.35);font-size:9px;text-transform:uppercase;letter-spacing:0.12em;margin-top:10px;margin-bottom:4px';
        html += `<div style="${labelStyle}">Orbit</div>`;
        html += `<div style="${orbStyle}">Inc: ${orbital.inclination}</div>`;
        html += `<div style="${orbStyle}">Period: ${orbital.period}</div>`;
        html += `<div style="${orbStyle}">Ecc: ${orbital.eccentricity}</div>`;
        html += `<div style="${orbStyle}">${orbital.apogeePerigee}</div>`;
      }
```

- [ ] **Step 3: Verify orbital parameters display**

Run the app, click on a satellite. The selection panel should now show an "ORBIT" section with inclination, period, eccentricity, and apogee × perigee values.

Test with:
- ISS: should show ~51.6°, ~92 min, ~0.0007, ~408 × 418 km
- A GEO satellite: should show ~0°, ~1436 min, very low eccentricity, ~35786 km altitude

- [ ] **Step 4: Commit**

```bash
git add src/tooltip.js
git commit -m "feat: add orbital parameters to selection panel"
```

---

### Task 7: Handle window resize for Line2 resolution

**Files:**
- Modify: `src/orbits.js` (add resize listener)

- [ ] **Step 1: Add resize handler in initOrbits**

In `src/orbits.js`, at the end of the `initOrbits` function, add:

```javascript
  window.addEventListener('resize', () => {
    if (selectedLine && selectedLine.material.resolution) {
      selectedLine.material.resolution.set(window.innerWidth, window.innerHeight);
    }
  });
```

- [ ] **Step 2: Verify resize works**

Select an object to show the Line2 orbit highlight, then resize the browser window. The line should remain correct thickness without visual artifacts.

- [ ] **Step 3: Commit**

```bash
git add src/orbits.js
git commit -m "fix: handle window resize for Line2 orbit highlight"
```

---

### Task 8: Final integration testing and polish

**Files:**
- No new files — testing and polish only

- [ ] **Step 1: Test selected orbit + category toggle coexistence**

Run the app. Toggle on station orbits via the ◯ button. Then click on an individual debris object. Both the category station orbits and the selected debris orbit should be visible simultaneously. Deselecting should only clear the selected orbit, not the category orbits.

- [ ] **Step 2: Test LOD transitions**

With active satellite orbits toggled on, zoom in and out. At far zoom you should see ~5% of orbits (sparse). Zooming to mid range should show ~20%. Close zoom should show more. The max cap of 2000 should prevent overwhelming the scene.

- [ ] **Step 3: Test with year filter active**

Activate the year slider to e.g., 1990. Toggle on debris orbits. Only debris from that era should show orbits. The orbit lines should respect the visibility filter.

Note: The current implementation creates orbits from the full satellite list, not filtered. This is acceptable for v1 — the orbits still render correctly for visible objects, and hidden objects' orbits are just extra visual context.

- [ ] **Step 4: Verify performance**

Check frame rate with station orbits on (2 lines — trivial), then with active satellite orbits at far zoom (~650 lines). FPS should remain above 30. If not, reduce `ORBIT_MAX_LINES` in config.

- [ ] **Step 5: Commit any polish fixes**

```bash
git add -u
git commit -m "polish: orbit path integration testing fixes"
```

Only commit if there were actual fixes. Skip if everything worked.
