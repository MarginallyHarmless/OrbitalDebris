// ─── ORBIT PATH LINES ───────────────────────────────────────────────────────
// Shows the orbit path of a selected satellite as a gradient-fade Line2.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import * as satellite from 'satellite.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { PALETTE } from './config.js';
import { keplerToEci } from './kepler.js';
import { eciToScene } from './utils.js';

const MU = 3.986004418e14; // m³/s²
const TWO_PI = 2 * Math.PI;
const SAMPLE_POINTS = 180;
const LINE_WIDTH = 2;

let scene = null;
let selectedLine = null;
let selectedGroup = null;

function getOrbitalPeriodMs(satData) {
  if (satData.kepler) {
    const sma = satData.kepler.sma;
    return TWO_PI * Math.sqrt((sma * sma * sma) / MU) * 1000;
  }
  if (satData.satrec && satData.satrec.no !== undefined) {
    const periodMin = TWO_PI / satData.satrec.no;
    return periodMin * 60 * 1000;
  }
  return null;
}

function sampleOrbitPoints(satData, refTimeMs) {
  const periodMs = getOrbitalPeriodMs(satData);
  if (!periodMs || periodMs <= 0 || periodMs > 1e10) return null;

  const points = [];
  const step = periodMs / SAMPLE_POINTS;

  for (let i = 0; i < SAMPLE_POINTS; i++) {
    const t = refTimeMs + i * step;
    let eciPos = null;

    if (satData.kepler) {
      const k = satData.kepler;
      try {
        eciPos = keplerToEci(k.sma, k.ecc, k.inc, k.raan, k.argp, k.ma, k.epochMs, t);
      } catch { return null; }
    } else if (satData.satrec && satData.satrec.no !== undefined) {
      try {
        const pv = satellite.propagate(satData.satrec, new Date(t));
        eciPos = pv.position;
      } catch { return null; }
    }

    if (!eciPos || isNaN(eciPos.x)) return null;

    const gmst = satellite.gstime(new Date(t));
    points.push(eciToScene(eciPos, gmst));
  }

  return points;
}

export function initOrbits(sceneRef) {
  scene = sceneRef;
  selectedGroup = new THREE.Group();
  scene.add(selectedGroup);

  window.addEventListener('resize', () => {
    if (selectedLine && selectedLine.material.resolution) {
      selectedLine.material.resolution.set(window.innerWidth, window.innerHeight);
    }
  });
}

export function setSelectedOrbit(satData, category, refTimeMs) {
  clearSelectedOrbit();

  const points = sampleOrbitPoints(satData, refTimeMs);
  if (!points) return;

  // Close the loop
  points.push(points[0].clone());

  const positions = [];
  const colors = [];
  const color = new THREE.Color(PALETTE[category]);

  for (let i = 0; i < points.length; i++) {
    positions.push(points[i].x, points[i].y, points[i].z);

    // Gradient fade: bright near object, dim on far side
    const frac = i / (points.length - 1);
    const brightness = 1.0 - frac * 0.7;
    colors.push(color.r * brightness, color.g * brightness, color.b * brightness);
  }

  const geometry = new LineGeometry();
  geometry.setPositions(positions);
  geometry.setColors(colors);

  const material = new LineMaterial({
    color: 0xffffff,
    linewidth: LINE_WIDTH,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
  });

  selectedLine = new Line2(geometry, material);
  selectedGroup.add(selectedLine);
}

export function clearSelectedOrbit() {
  if (selectedLine) {
    selectedGroup.remove(selectedLine);
    selectedLine.geometry.dispose();
    selectedLine.material.dispose();
    selectedLine = null;
  }
}
