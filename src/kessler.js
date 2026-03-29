import * as THREE from 'three';
import { VISUAL_CONFIG, PALETTE } from './config.js';

// ─── KESSLER DENSITY OVERLAY ────────────────────────────────────────────────
// Altitude-band torus rings showing orbital debris density.
// ─────────────────────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

export function createKesslerOverlay(scene) {
  const { minAlt, maxAlt, bandWidth, color, maxOpacity } = VISUAL_CONFIG.kessler;
  const earthRadius = VISUAL_CONFIG.earth.radius;

  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // ── Build torus rings per altitude band ────────────────────────────────────

  const bandCount = Math.ceil((maxAlt - minAlt) / bandWidth);
  const bands = [];

  for (let i = 0; i < bandCount; i++) {
    const altLow = minAlt + i * bandWidth;
    const midAlt = altLow + bandWidth * 0.5;
    const majorRadius = earthRadius * (1 + midAlt / EARTH_RADIUS_KM);
    const tubeRadius = earthRadius * (bandWidth / EARTH_RADIUS_KM) * 0.5;

    const geometry = new THREE.TorusGeometry(majorRadius, tubeRadius, 16, 64);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotateX(Math.PI / 2);
    group.add(mesh);

    bands.push({ mesh, material, altLow, midAlt });
  }

  // ── Legend DOM element ─────────────────────────────────────────────────────

  const legend = document.createElement('div');
  legend.style.position = 'absolute';
  legend.style.bottom = '16px';
  legend.style.left = '16px';
  legend.style.fontFamily = VISUAL_CONFIG.ui.font;
  legend.style.fontSize = VISUAL_CONFIG.ui.fontSize;
  legend.style.color = VISUAL_CONFIG.ui.color;
  legend.style.textTransform = 'uppercase';
  legend.style.letterSpacing = VISUAL_CONFIG.ui.letterSpacing;
  legend.style.pointerEvents = 'none';
  legend.style.display = 'none';
  document.body.appendChild(legend);

  function renderLegend(bandCounts) {
    // Find top 3 bands by count
    const sorted = bandCounts
      .map((count, i) => ({ count, alt: bands[i].midAlt }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    let html = '<div style="margin-bottom:4px; color:rgba(0,229,255,0.8);">KESSLER DENSITY</div>';
    for (const entry of sorted) {
      html += `<div>${Math.round(entry.alt)} KM &mdash; ${entry.count.toLocaleString('en-US')}</div>`;
    }
    if (sorted.length === 0) {
      html += '<div>NO DATA</div>';
    }
    legend.innerHTML = html;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    group,

    toggle() {
      group.visible = !group.visible;
      legend.style.display = group.visible ? 'block' : 'none';
    },

    isVisible() {
      return group.visible;
    },

    updateDensity(altitudes) {
      // Count objects per altitude band across all categories
      const bandCounts = new Array(bandCount).fill(0);

      for (const category of Object.keys(altitudes)) {
        const altArray = altitudes[category];
        if (!altArray || !altArray.length) continue;

        for (let j = 0; j < altArray.length; j++) {
          const alt = altArray[j];
          if (alt < minAlt || alt >= maxAlt) continue;
          const bandIdx = Math.floor((alt - minAlt) / bandWidth);
          if (bandIdx >= 0 && bandIdx < bandCount) {
            bandCounts[bandIdx]++;
          }
        }
      }

      // Find max for normalisation
      let maxCount = 0;
      for (let i = 0; i < bandCount; i++) {
        if (bandCounts[i] > maxCount) maxCount = bandCounts[i];
      }

      // Set torus opacities
      for (let i = 0; i < bandCount; i++) {
        const opacity = maxCount > 0
          ? (bandCounts[i] / maxCount) * maxOpacity
          : 0;
        bands[i].material.opacity = opacity;
      }

      // Update legend
      renderLegend(bandCounts);
    },
  };
}
