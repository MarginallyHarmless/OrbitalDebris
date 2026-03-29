# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser-based 3D visualization of Earth's orbital debris field (~27,600 tracked objects) using Three.js for rendering, satellite.js for SGP4 orbit propagation, and a Keplerian propagator for AstriaGraph data. Built with Vite + vanilla JS (no framework).

## Commands

- `npm run dev` — start Vite dev server with hot reload
- `npm run build` — production build to `dist/`
- `npm run preview` — preview production build

## Architecture

### Data Sources (priority order)
1. `public/data/full-catalog.tle` — Space-Track.org full TLE dump (~33k objects, user must download with their account)
2. `public/data/astria-catalog.json` — Prebaked AstriaGraph data (~27.6k objects with Keplerian elements, included in repo). Contains intact satellites + debris from UT Austin's AstriaGraph. Fields: `[noradId, name, orbitType, sma, ecc, inc, raan, argp, ma, epoch, country, launchDate, launchMass]`
3. Celestrak live TLE groups — fetched at runtime as fallback (~17.5k objects). Uses CORS proxy fallback chain: direct → corsproxy.io → local `/data/*.tle` files

When AstriaGraph loads, Celestrak data is fetched as a supplement — new objects not in AstriaGraph are added. Deduplication by NORAD ID. Celestrak's curated "active" group is cross-referenced to reclassify defunct AstriaGraph satellites (old COSMOS, OPS, etc.) as debris — only Celestrak-confirmed objects count as "active".

### Dual Propagation System
- **SGP4** (satellite.js) — used for TLE-sourced objects (Celestrak, Space-Track). More accurate, includes drag model.
- **Keplerian** (`kepler.js`) — two-body propagation for AstriaGraph objects. Solves Kepler's equation via Newton-Raphson, converts orbital elements to ECI positions. Less accurate (no perturbations) but works with the SMA/Ecc/Inc/RAAN/ArgP/MeanAnom format.

The propagator (`propagator.js`) transparently handles both: checks for `sat.kepler` vs `sat.satrec` on each object.

### Animation & Interpolation
- Two keyframe buffers (A and B) per category. `propagateAll` fills both; `propagateNext` swaps A←B and computes new B.
- `interpolate()` lerps between A and B every frame for smooth motion.
- Keyframes are always 60 sim-seconds apart. At higher speeds, propagation runs more frequently in real time (adaptive interval, min 100ms).
- Simulation speed fixed at 60x (1 min/sec). At this speed a LEO orbit completes in ~90 seconds.

### Year Filter System
- Each satellite stores a `launchYear` (from AstriaGraph's launchDate field, gaps filled from Celestrak satcat).
- `setYearFilter(year)` updates a `visibleMask` (Uint8Array per category). `interpolate()` zeros positions for masked objects.
- When filter active: objects without launch date are hidden (~510 objects, 1.8%).
- When slider reaches max year, auto-resets to show all.
- Year slider is debounced: filter+counts update instantly, full propagation runs 200ms after user stops dragging.

### Module Responsibilities
- `main.js` — boot sequence, animation loop, wires everything together
- `config.js` — VISUAL_CONFIG + PALETTE constants (aesthetic control surface)
- `scene.js` — Three.js scene, camera, renderer, OrbitControls, starfield, lighting
- `earth.js` — Earth sphere with Blue Marble texture (async load) + Fresnel atmosphere shader
- `data.js` — data loading with priority chain, TLE parsing, AstriaGraph JSON parsing, categorization by name (DEB→debris, R/B→rocketBody, station IDs→station)
- `propagator.js` — SGP4 + Keplerian propagation, keyframe interpolation, year filter mask, position/altitude buffers
- `kepler.js` — two-body Keplerian propagator (solveKepler, keplerToEci, altFromEci)
- `particles.js` — 4x THREE.Points with custom ShaderMaterial (min-size clamping), category-specific shape textures (diamond/cross/triangle/ring at 256px)
- `ui.js` — glassmorphism HUD card: play/pause, year slider, category toggles with SVG shape icons, counts, data source links, Kessler hint
- `kessler.js` — altitude-band density torus rings (200-2000km, 50km bands), glass legend panel with explanation text, toggled with K key
- `tooltip.js` — raycaster hover tooltips, click-to-select with 3D ring, info panel with Wikipedia image lookup, drag detection, N2YO satellite link
- `loader.js` — loading screen progress bar
- `utils.js` — coordinate transforms (ECI→ECEF→scene), TLE parsing

### Coordinate System
ECI from satellite.js/kepler.js → rotate to ECEF using GMST → map to Three.js (ECI-Z → scene-Y, ECI-Y → scene-Z). Earth is static; objects orbit around it.

## UI Design

**Glassmorphism aesthetic**: frosted glass panels with `backdrop-filter: blur`, rounded corners (8-10px), subtle `rgba(255,255,255,0.08)` borders. Font: Satoshi (Fontshare CDN). Normal case text, white at varying opacities for hierarchy. Cyan accent (`#00e5ff`) only for interactive elements.

**Selection panel** (bottom-right): click an object to select, shows info + Wikipedia thumbnail. Satellite name links to N2YO. Dragging camera doesn't deselect. Panel clicks don't deselect.

**Category shapes**: diamond=active, cross=debris, triangle=rocketBody, ring=station. Both as 256px canvas textures on particles and SVG icons in the HUD.

## Real-World Reference Numbers (early 2026)

- **~13,000+ active satellites** in orbit (per CelesTrak / Dr. Jonathan McDowell). Celestrak's curated active group is the source of truth — AstriaGraph name-based categorization alone overcounts because defunct satellites without "DEB" in their name default to "active".
- **2 operational space stations**: ISS (NORAD 25544) and China's Tiangong/TSS (core module Tianhe, NORAD 48274). Tiangong's lab modules Wentian (53239) and Mengtian (54216) are docked to Tianhe and should NOT be tracked as separate stations — only the core module is in STATION_IDS.

## Key Gotchas

- AstriaGraph epochs are from 2023-2024. Propagating far from epoch (especially backwards) loses accuracy.
- Celestrak `rocket-body` group doesn't exist — rocket bodies come from AstriaGraph name categorization ("R/B" in name).
- The year slider debounces propagation (200ms) but updates visibility mask instantly for responsive feel.
- `propagateAll` must be followed by `state.resetPropTimer()` to prevent the animation loop from immediately overwriting fresh keyframes.
- Wikipedia image lookup uses name mappings (ISS→"International Space Station", STARLINK→"Starlink", etc.) with search API fallback. Debris/rocket bodies are skipped.
