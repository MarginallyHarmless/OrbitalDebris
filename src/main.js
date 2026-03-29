// ─── ORBITAL DEBRIS FIELD VISUALIZATION ─────────────────────────────────────
// Entry point. Bootstraps scene, fetches data, runs animation loop.
// ─────────────────────────────────────────────────────────────────────────────

import { VISUAL_CONFIG } from './config.js';
import { createScene } from './scene.js';
import { createEarth } from './earth.js';
import { fetchAllTLEs } from './data.js';
import { createPropagator } from './propagator.js';
import { createParticleSystems, updateParticlePositions } from './particles.js';
import { createUI } from './ui.js';
import { createKesslerOverlay } from './kessler.js';
import { updateProgress, hideLoader } from './loader.js';
import { createTooltip } from './tooltip.js';

// ─── STATE ──────────────────────────────────────────────────────────────────

const state = {
  timeScale: VISUAL_CONFIG.time.defaultScale,
  simTime: new Date(),
  counts: { active: 0, debris: 0, rocketBody: 0, station: 0, total: 0 },
  kesslerVisible: false,
};

let frameCount = 0;

// ─── BOOT ───────────────────────────────────────────────────────────────────

async function boot() {
  // 1. Initialize Three.js scene
  const { scene, camera, renderer, controls } = createScene();

  // 2. Create Earth + atmosphere
  const { earthMesh, gridMesh } = createEarth(scene);

  // 3. Fetch TLE data with progress
  updateProgress(0, 'CONNECTING TO CELESTRAK...');

  let catalogData;
  try {
    catalogData = await fetchAllTLEs((completed, total, label) => {
      updateProgress(completed / total, `ACQUIRING ${label}...`);
    });
  } catch (err) {
    console.error('Fatal: Could not load TLE data:', err);
    updateProgress(0, 'ACQUISITION FAILED — CHECK CONSOLE');
    return;
  }

  state.dataSource = catalogData.source || 'UNKNOWN';
  updateProgress(0.9, 'PROPAGATING ORBITS...');

  // 4. Create propagator and run initial propagation
  const propagator = createPropagator(catalogData);
  propagator.propagateAll(state.simTime);

  // 5. Store counts
  state.counts = propagator.getCounts();

  updateProgress(0.95, 'INITIALIZING RENDERER...');

  // 6. Create particle systems
  const particleSystems = createParticleSystems(propagator, scene);

  // 7. Create UI
  const ui = createUI(state, particleSystems, controls, propagator);
  ui.updateCounts(state.counts);
  ui.updateTime(state.simTime);

  // 8. Create Kessler overlay
  const kessler = createKesslerOverlay(scene);
  kessler.updateDensity(propagator.getAltitudes());

  // 9. Create tooltip (stretch goal)
  const tooltip = createTooltip(camera, scene, particleSystems, catalogData);

  // 10. Keyboard handler for Kessler toggle
  window.addEventListener('keydown', (e) => {
    if (e.key === 'k' || e.key === 'K') {
      kessler.toggle();
      state.kesslerVisible = kessler.isVisible();
      ui.setKesslerState(state.kesslerVisible);
    }
  });

  // 11. Hook up time scale changes from UI
  // The UI modifies state.timeScale directly via the slider

  updateProgress(1.0, 'CATALOG ACQUIRED');

  // 12. Hide loader after a brief moment
  setTimeout(() => hideLoader(), 400);

  // ─── ANIMATION LOOP ────────────────────────────────────────────────────

  const clock = { last: performance.now() };
  const PROP_INTERVAL_MS = 2000; // real-time ms between keyframe computations
  let nextPropAt = performance.now() + PROP_INTERVAL_MS;

  // Expose a way to reset the propagation timer (called after year slider reset)
  state.resetPropTimer = () => {
    nextPropAt = performance.now() + PROP_INTERVAL_MS;
  };

  // Pre-compute the first future keyframe so we have A=now, B=future
  const simIntervalMs = PROP_INTERVAL_MS * state.timeScale; // sim-time gap per interval
  propagator.propagateNext(
    new Date(state.simTime.getTime() + PROP_INTERVAL_MS * state.timeScale)
  );

  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dtReal = (now - clock.last) / 1000; // seconds
    clock.last = now;

    // Cap dt to avoid huge jumps on tab-switch
    const dt = Math.min(dtReal, 0.1);

    // Advance simulation time
    state.simTime = new Date(state.simTime.getTime() + dt * state.timeScale * 1000);

    // Update controls
    controls.update();

    // When we reach the next keyframe time, swap and compute a new future keyframe
    if (now >= nextPropAt) {
      nextPropAt = now + PROP_INTERVAL_MS;
      // B becomes the new future: current sim time + one interval ahead
      const futureSimTime = new Date(
        state.simTime.getTime() + PROP_INTERVAL_MS * state.timeScale
      );
      propagator.propagateNext(futureSimTime);

      if (state.kesslerVisible) {
        kessler.updateDensity(propagator.getAltitudes());
      }

      ui.updateCounts(propagator.getCounts());
    }

    // Earth rotation disabled — at 1x speed it's imperceptible and
    // any visible spin would be out of sync with orbital object movement

    // Interpolate positions every frame for smooth motion
    propagator.interpolate(state.simTime.getTime());
    updateParticlePositions(particleSystems, propagator);

    // Update time display every frame for smooth readout
    ui.updateTime(state.simTime);

    // Update selected object's live info
    tooltip.updateSelected(propagator);

    // Render
    renderer.render(scene, camera);
  }

  animate();
}

// ─── START ──────────────────────────────────────────────────────────────────

boot().catch((err) => {
  console.error('Boot failed:', err);
});
