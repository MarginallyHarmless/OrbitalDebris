import * as satellite from 'satellite.js';
import * as THREE from 'three';
import { VISUAL_CONFIG } from './config.js';

export function parseTLE(text, category) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const results = [];

  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    // Validate TLE line format
    if (!line1 || !line2 || line1[0] !== '1' || line2[0] !== '2') continue;

    try {
      const satrec = satellite.twoline2satrec(line1, line2);
      if (satrec.error !== 0) continue;

      results.push({
        name: name.trim(),
        satrec,
        category
      });
    } catch {
      continue;
    }
  }

  return results;
}

export function eciToScene(eciPos, gmst) {
  const cosG = Math.cos(gmst);
  const sinG = Math.sin(gmst);

  const ecefX = eciPos.x * cosG + eciPos.y * sinG;
  const ecefY = -eciPos.x * sinG + eciPos.y * cosG;
  const ecefZ = eciPos.z;

  const scale = VISUAL_CONFIG.earth.radius / VISUAL_CONFIG.propagation.earthRadiusKm;

  // Three.js Y is up, so ECI Z maps to scene Y, ECI Y maps to scene Z
  return new THREE.Vector3(
    ecefX * scale,
    ecefZ * scale,
    ecefY * scale
  );
}

export function altitudeFromEci(eciPos) {
  const { x, y, z } = eciPos;
  return Math.sqrt(x * x + y * y + z * z) - 6371;
}

export function geoToVec3(lat, lng, altKm) {
  const R = VISUAL_CONFIG.earth.radius + (altKm / 6371) * VISUAL_CONFIG.earth.radius;
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lng + 180) * Math.PI / 180;

  return new THREE.Vector3(
    -R * Math.sin(phi) * Math.cos(theta),
     R * Math.cos(phi),
     R * Math.sin(phi) * Math.sin(theta)
  );
}
