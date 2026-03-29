import * as THREE from 'three';
import { VISUAL_CONFIG, PALETTE } from './config.js';

// Soft disc with radial falloff — avoids harsh square pixels
function createDiscTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size / 2;

  // Radial gradient: solid center → transparent edge
  const grad = ctx.createRadialGradient(center, center, 0, center, center, center);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  grad.addColorStop(0.7, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

const OPACITY = {
  active:     0.7,
  debris:     0.85,
  rocketBody: 0.75,
  station:    1.0,
};

const CATEGORIES = ['active', 'debris', 'rocketBody', 'station'];

export function createParticleSystems(propagator, scene) {
  const discTexture = createDiscTexture();
  const positionBuffers = propagator.getPositionBuffers();
  const systems = {};

  for (const category of CATEGORIES) {
    const buffer = positionBuffers[category];

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffer, 3));

    const material = new THREE.PointsMaterial({
      color: new THREE.Color(PALETTE[category]),
      size: VISUAL_CONFIG.pointSizes[category],
      map: discTexture,
      transparent: true,
      opacity: OPACITY[category],
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,   // sizes are in world units, scale with distance
      alphaTest: 0.01,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    systems[category] = { points, geometry, material };
  }

  return systems;
}

export function updateParticlePositions(systems, propagator) {
  for (const category of CATEGORIES) {
    systems[category].geometry.attributes.position.needsUpdate = true;
  }
}
