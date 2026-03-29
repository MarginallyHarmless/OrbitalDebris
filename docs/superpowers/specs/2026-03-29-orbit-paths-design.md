# Orbit Path Lines & Enhanced Selection Panel

## Overview

Add two complementary features to the orbital debris visualization:
1. **Orbit path lines** — gradient-fade ellipses showing object trajectories, with category toggles and zoom-based LOD
2. **Enhanced selection panel** — orbital parameter readouts (inclination, period, eccentricity, apogee/perigee) in the existing click-to-select info panel

## Feature 1: Orbit Path Lines

### Path Computation

- For **Kepler objects**: sample 180 points at equal time intervals over one orbital period (`T = 2π√(a³/μ)`)
- For **SGP4 objects**: sample 180 points using `satellite.propagate()` over one period derived from mean motion (`T = 2π / no`, where `no` is in rad/min)
- All points transformed to scene coordinates via `eciToScene(pos, gmst)`
- Computed once at creation time, not every frame

### Visual Style

- `THREE.Line` with `BufferGeometry` and per-vertex color attribute for gradient fade
- Color: category color from `PALETTE` (cyan=active, red=debris, yellow=rocketBody, white=station)
- Alpha gradient: 1.0 at the object's current position, fading to ~0.05 on the opposite side of the orbit
- Additive blending, depth write disabled (consistent with particles and starfield)
- Works with existing UnrealBloomPass — thin additive lines glow naturally
- **Selected orbit highlight**: uses `Line2` / `LineMaterial` from Three.js examples for 2px width, brighter opacity

### Interaction Modes

**Category toggle** (macro view):
- New UI toggle per category in the HUD (small icon or secondary control next to existing category checkboxes)
- Toggling on creates orbit lines for objects in that category, subject to LOD limits
- Toggling off disposes all orbit lines for that category

**Click-to-select** (micro view):
- Clicking an object shows its orbit as a thicker `Line2` highlight
- Deselecting clears the orbit line
- Works independently of category toggles — selected orbit is always visible

### LOD System

Zoom-based density control for category orbit toggles:

| Camera Distance | Label | Density | Sampling |
|----------------|-------|---------|----------|
| > 8 units | Far | ~5% | Every 20th object by index |
| 4–8 units | Mid | ~20% | Every 5th object by index |
| < 4 units | Close | Frustum | All objects with current position in camera frustum |

- **Transitions**: add/remove lines incrementally when crossing zoom thresholds, not full rebuild
- **Line pool**: pre-allocate and reuse `THREE.Line` geometries by updating vertex data
- **Frustum culling** (close zoom): check object positions against camera frustum on each propagation tick (~1/sec), not every frame
- **Hard cap**: maximum 2000 visible orbit lines regardless of zoom. At close zoom, prioritize objects nearest camera center
- **Stations exception**: station orbits (only 2) always shown at full detail when toggled on

### Frame Update

- Each frame: rotate all orbit line groups by current GMST angle to keep aligned with Earth's rotation
- The gradient "bright point" tracks the object's current position along its orbit. Implementation: store each orbit's base vertex index for the object's position at creation time. On each propagation tick (~1/sec), find the nearest vertex to the object's current interpolated position and rotate the alpha array accordingly. Not updated every frame — propagation tick frequency is sufficient for smooth visual.

## Feature 2: Enhanced Selection Panel

### New Orbital Parameters

Extend the existing selection panel in `tooltip.js` with an "Orbit" subsection:

| Field | Source (Kepler) | Source (SGP4) | Display Format |
|-------|----------------|---------------|----------------|
| Inclination | `kepler.inc` | `satrec.inclo` | Degrees, 1 decimal (e.g., "51.6°") |
| Period | `2π√(sma³/μ)` | `2π / satrec.no` | Minutes, 1 decimal (e.g., "92.4 min") |
| Eccentricity | `kepler.ecc` | `satrec.ecco` | 4 decimal places (e.g., "0.0007") |
| Apogee | `sma(1+ecc) - R_earth` | Same formula | km, integer (e.g., "418 km") |
| Perigee | `sma(1-ecc) - R_earth` | Same formula | km, integer (e.g., "408 km") |

For SGP4 objects, SMA is derived from mean motion: `sma = (μ / n²)^(1/3)`.

### Layout

- New "ORBIT" label (9px uppercase, `rgba(255,255,255,0.35)`) below existing info fields
- One line per parameter: label left-aligned, value right-aligned
- Same glassmorphic styling as existing panel content
- Apogee × Perigee shown on one line (e.g., "408 × 418 km")

## Module Structure

### New File: `src/orbits.js`

Exports:
- `initOrbits(scene)` — create category groups, add to scene
- `createOrbitLine(satData, category)` — compute and return a single orbit line
- `toggleCategoryOrbits(category, visible, allSatData)` — show/hide category orbits with LOD
- `updateOrbitsFrame(camera, gmst)` — per-frame GMST rotation + LOD recalculation on zoom change
- `setSelectedOrbit(satData, category)` — highlight orbit for selected object
- `clearSelectedOrbit()` — remove selected orbit highlight
- `dispose()` — clean up all geometries and materials

### Changes to Existing Files

| File | Change |
|------|--------|
| `main.js` | Call `updateOrbitsFrame(camera, gmst)` in animation loop |
| `ui.js` | Add orbit toggle controls per category |
| `tooltip.js` | Add orbital parameter section to selection panel; call `setSelectedOrbit()` / `clearSelectedOrbit()` |
| `config.js` | Add constants: `ORBIT_LINE_OPACITY`, `ORBIT_LOD_THRESHOLDS`, `ORBIT_MAX_LINES`, `ORBIT_SAMPLE_POINTS` |
| `scene.js` | No changes — orbit groups added via `initOrbits(scene)` in main.js |

### No Changes To

`propagator.js`, `kepler.js`, `particles.js`, `earth.js`, `kessler.js`, `loader.js`, `utils.js`

## Performance Considerations

- Line pool reuse avoids GC pressure from constant geometry allocation/disposal
- 180 sample points per orbit × 3 floats × 4 bytes = ~2.2KB per orbit line
- At hard cap of 2000 lines: ~4.4MB vertex data — well within GPU budget
- LOD prevents rendering 15,000+ lines at far zoom where they'd be indistinguishable anyway
- Frustum culling at close zoom limits work to visible region
- GMST rotation is a single group rotation, not per-line

## Constants (config.js)

```javascript
ORBIT_SAMPLE_POINTS: 180,
ORBIT_LINE_OPACITY: 0.6,        // max opacity at bright point
ORBIT_LINE_FADE_MIN: 0.05,      // min opacity at far side
ORBIT_MAX_LINES: 2000,          // hard cap on simultaneous orbit lines
ORBIT_LOD_THRESHOLDS: {
  far: { distance: 8, sampling: 20 },   // every 20th object
  mid: { distance: 4, sampling: 5 },    // every 5th object
  close: { distance: 0, sampling: 1 },  // all (frustum-culled)
},
ORBIT_SELECTED_WIDTH: 2,        // Line2 width for selected orbit
```
