// ─── VISUAL_CONFIG ──────────────────────────────────────────────────────────
// Single source of truth for all aesthetic parameters.
// Aesthetic: glassmorphism — frosted glass panels over dark 3D scene
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

  pointSizes: {
    station:    0.03,
    rocketBody: 0.015,
    active:     0.009,
    debris:     0.01,
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
    autoRotateSpeed: 0.3,
    minDistance: 1.5,
    maxDistance: 20,
  },

  grid: {
    opacity:    0.08,
    show:       true,
  },

  propagation: {
    interval:   120,
    batchSize:  5000,
    earthRadiusKm: 6371,
  },

  time: {
    defaultScale: 60,
    minScale:     1,
    maxScale:     3600,
  },

  kessler: {
    minAlt:     200,
    maxAlt:     2000,
    bandWidth:  50,
    color:      PALETTE.densityRing,
    maxOpacity: 0.35,
  },

  ui: {
    font:          "'Satoshi', sans-serif",
    fontSize:      '12px',
    color:         'rgba(255, 255, 255, 0.7)',
    colorDim:      'rgba(255, 255, 255, 0.4)',
    colorBright:   'rgba(255, 255, 255, 0.9)',
    accent:        '#00e5ff',
    border:        '1px solid rgba(255, 255, 255, 0.08)',
    letterSpacing: '0.02em',
    glass: {
      background:  'rgba(10, 12, 20, 0.6)',
      blur:        '12px',
      border:      '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '10px',
    },
  },
};
