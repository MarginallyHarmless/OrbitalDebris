// ─── KEPLERIAN PROPAGATOR ────────────────────────────────────────────────────
// Simple two-body propagation from Keplerian orbital elements.
// Less accurate than SGP4 (no drag/perturbations) but works with
// AstriaGraph-style data that provides SMA/Ecc/Inc/RAAN/ArgP/MeanAnom.
// ─────────────────────────────────────────────────────────────────────────────

const MU = 3.986004418e14; // Earth gravitational parameter (m³/s²)
const EARTH_RADIUS_KM = 6371;
const TWO_PI = 2 * Math.PI;

// Solve Kepler's equation: M = E - e*sin(E)
// Newton-Raphson iteration
function solveKepler(M, e, tol = 1e-8) {
  let E = M; // initial guess
  for (let i = 0; i < 20; i++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

// Propagate a single object from Keplerian elements to ECI position
// sma: semi-major axis in meters
// ecc: eccentricity
// inc, raan, argp, ma: in radians
// epochMs: epoch as milliseconds since Unix epoch
// nowMs: current time as milliseconds since Unix epoch
export function keplerToEci(sma, ecc, inc, raan, argp, ma, epochMs, nowMs) {
  // Mean motion (rad/s)
  const n = Math.sqrt(MU / (sma * sma * sma));

  // Time since epoch in seconds
  const dt = (nowMs - epochMs) / 1000;

  // Current mean anomaly
  let M = (ma + n * dt) % TWO_PI;
  if (M < 0) M += TWO_PI;

  // Eccentric anomaly
  const E = solveKepler(M, ecc);

  // True anomaly
  const sinE = Math.sin(E);
  const cosE = Math.cos(E);
  const sinV = Math.sqrt(1 - ecc * ecc) * sinE / (1 - ecc * cosE);
  const cosV = (cosE - ecc) / (1 - ecc * cosE);
  const v = Math.atan2(sinV, cosV);

  // Distance from center of Earth
  const r = sma * (1 - ecc * cosE);

  // Position in orbital plane
  const xOrb = r * Math.cos(v);
  const yOrb = r * Math.sin(v);

  // Rotation to ECI
  const cosO = Math.cos(raan);
  const sinO = Math.sin(raan);
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);
  const cosW = Math.cos(argp);
  const sinW = Math.sin(argp);

  const x = xOrb * (cosO * cosW - sinO * sinW * cosI) - yOrb * (cosO * sinW + sinO * cosW * cosI);
  const y = xOrb * (sinO * cosW + cosO * sinW * cosI) - yOrb * (sinO * sinW - cosO * cosW * cosI);
  const z = xOrb * (sinW * sinI) + yOrb * (cosW * sinI);

  // Convert from meters to km (satellite.js convention)
  return { x: x / 1000, y: y / 1000, z: z / 1000 };
}

// Compute altitude in km from ECI position in km
export function altFromEci(eciKm) {
  const r = Math.sqrt(eciKm.x * eciKm.x + eciKm.y * eciKm.y + eciKm.z * eciKm.z);
  return r - EARTH_RADIUS_KM;
}
