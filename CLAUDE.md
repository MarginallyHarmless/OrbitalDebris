# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Browser-based 3D visualization of Earth's orbital debris field (~27,000 tracked objects) using real TLE data from Celestrak. Built with Vite + vanilla JS (no framework), Three.js for rendering, and satellite.js for SGP4 orbit propagation.

## Commands

- `npm run dev` — start Vite dev server with hot reload
- `npm run build` — production build to `dist/`
- `npm run preview` — preview production build

## Architecture

**Single aesthetic control surface:** All visual parameters live in `src/config.js` (`VISUAL_CONFIG` and `PALETTE`). Every module imports from this. To change the look, edit only this file.

**Data flow:** `data.js` fetches TLE text from Celestrak (5 groups) → `utils.js:parseTLE()` converts to satrec objects → `propagator.js` runs SGP4 on all satellites and fills `Float32Array` position buffers → `particles.js` binds those buffers directly to `THREE.BufferGeometry` attributes → Three.js renders 4 `Points` draw calls (one per category).

**Module responsibilities:**
- `main.js` — boot sequence orchestrator and animation loop
- `config.js` — VISUAL_CONFIG/PALETTE constants (the iteration surface)
- `scene.js` — Three.js scene, camera, renderer, OrbitControls, starfield
- `earth.js` — Earth sphere with Fresnel atmosphere shader
- `data.js` — Celestrak fetch with 3-tier fallback (direct → CORS proxy → local /data/)
- `propagator.js` — SGP4 batch propagation, ECI→ECEF→scene coordinate transform
- `particles.js` — 4x THREE.Points with additive blending and disc sprites
- `ui.js` — DOM HUD (time slider, category toggles, counts)
- `kessler.js` — altitude-band density torus rings, toggled with K key
- `loader.js` — loading screen progress bar
- `tooltip.js` — raycaster hover tooltips
- `utils.js` — coordinate transforms, TLE parsing

**Coordinate system:** Satellites come as ECI (Earth-Centered Inertial) from satellite.js. `eciToScene()` rotates to ECEF using GMST, then maps to Three.js coordinates (ECI-Z → scene-Y, ECI-Y → scene-Z). Earth stays static; objects orbit.

**Performance:** Propagation runs every 120 frames (~2s at 60fps), not every frame. Batch mode (`propagateBatch`) processes 5000 satellites per frame in round-robin for smoother frame times.

## Key Design Constraints

- Aesthetic: "deep space / cold precision / quiet dread" — dark, eerie, no bloom/glow effects
- All UI text: Space Mono, uppercase, letter-spacing 0.15em, cyan (rgba(0,229,255,0.6))
- No rounded corners on any UI element
- Additive blending on all particles for density glow
- Local TLE fallback: users can drop `.tle` files in `public/data/` if Celestrak is unreachable
