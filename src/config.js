// ─── VISUAL_CONFIG ──────────────────────────────────────────────────────────
// Single source of truth for all aesthetic parameters.
// Change the entire look by editing only this object.
// ─────────────────────────────────────────────────────────────────────────────

export const PALETTE = {
  background:   '#000000',
  earth:        '#0a0f1a',
  atmosphere:   '#1a3a5c',
  grid:         '#0d1f2d',
  active:       '#00e5ff',
  debris:       '#ff3d00',
  rocketBody:   '#ffd600',
  station:      '#ffffff',
  densityRing:  '#ff1744',
};

export const VISUAL_CONFIG = {
  palette: { ...PALETTE },

  // Point sizes in world units (sizeAttenuation: true)
  // Scaled to reflect relative physical size of objects
  pointSizes: {
    station:    0.04,    // ISS/CSS ~100m
    rocketBody: 0.02,    // spent upper stages ~5-10m
    active:     0.012,   // operational payloads ~1-5m
    debris:     0.014,   // fragments ~0.1-1m
  },

  earth: {
    radius:     1.0,
    segments:   64,
    color:      PALETTE.earth,
  },

  atmosphere: {
    radius:     1.02,
    opacity:    0.08,
    color:      PALETTE.atmosphere,
  },

  starfield: {
    count:      2000,
    radius:     50,
    opacity:    0.3,
    color:      '#4466aa',
  },

  camera: {
    fov:        45,
    near:       0.01,
    far:        200,
    distance:   3.5,
    autoRotateSpeed: 0.3,   // OrbitControls multiplier (2.0 = 30s/rev)
    minDistance: 1.5,
    maxDistance: 20,
  },

  grid: {
    opacity:    0.08,
    show:       true,
  },

  propagation: {
    interval:   120,      // frames between full propagation updates
    batchSize:  5000,     // satellites propagated per frame in round-robin
    earthRadiusKm: 6371,
  },

  time: {
    defaultScale: 1,
    minScale:     1,
    maxScale:     3600,
  },

  kessler: {
    minAlt:     200,      // km
    maxAlt:     2000,     // km
    bandWidth:  50,       // km per band
    color:      PALETTE.densityRing,
    maxOpacity: 0.35,
  },

  ui: {
    font:       "'Space Mono', monospace",
    fontSize:   '11px',
    color:      'rgba(0, 229, 255, 0.6)',
    border:     '1px solid rgba(0, 229, 255, 0.2)',
    letterSpacing: '0.15em',
  },
};
