// ─── ORBITAL DEBRIS FIELD VISUALIZATION ─────────────────────────────────────
// Entry point. Bootstraps scene, fetches data, runs animation loop.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
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
  const { scene, camera, renderer, controls, composer, sunLight, filmGrainPass } = createScene();

  // 2. Create Earth + atmosphere
  const { earthMesh, gridMesh, atmosphereMesh, cloudMesh, earthUniforms, atmosphereMaterial } = createEarth(scene);

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
  state._catalogData = catalogData;
  updateProgress(0.9, 'PROPAGATING ORBITS...');

  // Yield to let the browser paint the progress update before heavy work
  await new Promise(r => setTimeout(r, 0));

  // 4. Create propagator and run initial propagation
  let propagator, particleSystems, ui, kessler, tooltip;
  try {
    propagator = createPropagator(catalogData);
    propagator.propagateAll(state.simTime);

    state.counts = propagator.getCounts();
    updateProgress(0.95, 'INITIALIZING RENDERER...');
    await new Promise(r => setTimeout(r, 0));

    particleSystems = createParticleSystems(propagator, scene);

    ui = createUI(state, particleSystems, controls, propagator);
    ui.updateCounts(state.counts);
    ui.updateTime(state.simTime);

    kessler = createKesslerOverlay(scene);
    kessler.updateDensity(propagator.getAltitudes());

    tooltip = createTooltip(camera, scene, particleSystems, catalogData);
  } catch (err) {
    console.error('Initialization error:', err);
    updateProgress(0, 'INIT FAILED — CHECK CONSOLE');
    return;
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'k' || e.key === 'K') {
      kessler.toggle();
      state.kesslerVisible = kessler.isVisible();
      ui.setKesslerState(state.kesslerVisible);
    }
  });

  updateProgress(1.0, 'CATALOG ACQUIRED');
  setTimeout(() => hideLoader(), 400);

  // ─── ANIMATION LOOP ────────────────────────────────────────────────────

  const clock = { last: performance.now() };
  // Max sim-time gap between keyframes: 60 seconds
  // At higher speeds we propagate more often in real time to keep orbits smooth
  const MAX_SIM_GAP_MS = 60 * 1000; // 60 seconds of sim time between keyframes
  const MIN_PROP_INTERVAL = 100;     // never propagate faster than 10x/sec real time

  function getPropInterval() {
    if (state.timeScale <= 0) return 2000;
    // How many real ms until we'd accumulate MAX_SIM_GAP_MS of sim time?
    const interval = MAX_SIM_GAP_MS / state.timeScale;
    return Math.max(MIN_PROP_INTERVAL, Math.min(2000, interval));
  }

  let nextPropAt = performance.now() + getPropInterval();

  state.resetPropTimer = () => {
    nextPropAt = performance.now() + getPropInterval();
  };

  // Pre-compute the first future keyframe
  propagator.propagateNext(
    new Date(state.simTime.getTime() + MAX_SIM_GAP_MS)
  );

  function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    const dtReal = (now - clock.last) / 1000;
    clock.last = now;

    const dt = Math.min(dtReal, 0.1);

    state.simTime = new Date(state.simTime.getTime() + dt * state.timeScale * 1000);

    // Rotate sun direction slowly
    const sunAngle = performance.now() * 0.0001 * VISUAL_CONFIG.sun.rotationSpeed;
    const sunDir = new THREE.Vector3(
      Math.cos(sunAngle) * 5,
      3,
      Math.sin(sunAngle) * 5,
    ).normalize();
    sunLight.position.copy(sunDir.clone().multiplyScalar(10));
    earthUniforms.uSunDirection.value.copy(sunDir);
    atmosphereMaterial.uniforms.uSunDirection.value.copy(sunDir);

    // Update particle sun direction
    for (const key of ['active', 'debris', 'rocketBody', 'station']) {
      particleSystems[key].material.uniforms.uSunDirection.value.copy(sunDir);
    }

    // Update particle time for twinkling
    const particleTime = performance.now() * 0.001;
    for (const key of ['active', 'debris', 'rocketBody', 'station']) {
      particleSystems[key].material.uniforms.uTime.value = particleTime;
    }

    // Rotate clouds independently
    cloudMesh.rotation.y += dt * VISUAL_CONFIG.clouds.rotationSpeed;

    controls.update();

    const propInterval = getPropInterval();
    if (now >= nextPropAt) {
      nextPropAt = now + propInterval;
      // Future keyframe is always MAX_SIM_GAP_MS ahead in sim time
      const futureSimTime = new Date(
        state.simTime.getTime() + MAX_SIM_GAP_MS
      );
      propagator.propagateNext(futureSimTime);

      if (state.kesslerVisible) {
        kessler.updateDensity(propagator.getAltitudes());
      }

      ui.updateCounts(propagator.getCounts());
    }

    // Earth rotation disabled — at 1x speed it's imperceptible and
    // any visible spin would be out of sync with orbital object movement

    // Interpolate positions — skip GPU upload if nothing changed
    const didUpdate = propagator.interpolate(state.simTime.getTime());
    if (didUpdate) {
      updateParticlePositions(particleSystems, propagator);
    }

    // Update time display every frame for smooth readout
    ui.updateTime(state.simTime);

    // Update selected object's live info
    tooltip.updateSelected(propagator);

    // Update film grain time
    filmGrainPass.uniforms.uTime.value = performance.now() * 0.001;

    // Render through post-processing pipeline
    composer.render();
  }

  animate();
}

// ─── START ──────────────────────────────────────────────────────────────────

boot().catch((err) => {
  console.error('Boot failed:', err);
});
