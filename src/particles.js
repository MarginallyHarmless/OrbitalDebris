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

// Minimum pixel size so distant objects (GEO etc.) stay visible
const MIN_PIXEL_SIZE = 1.5;

const CATEGORIES = ['active', 'debris', 'rocketBody', 'station'];

// Custom ShaderMaterial that attenuates point size with distance
// but clamps to a minimum pixel size
function createPointMaterial(color, size, opacity, discTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor:       { value: new THREE.Color(color) },
      uSize:        { value: size },
      uMinSize:     { value: MIN_PIXEL_SIZE },
      uOpacity:     { value: opacity },
      uMap:         { value: discTexture },
      uPixelRatio:  { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: `
      uniform float uSize;
      uniform float uMinSize;
      uniform float uPixelRatio;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        // Size attenuation: scale by inverse distance
        float attenSize = uSize * uPixelRatio * (300.0 / -mvPosition.z);
        // Clamp to minimum pixel size
        gl_PointSize = max(attenSize, uMinSize * uPixelRatio);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform sampler2D uMap;
      void main() {
        vec4 texColor = texture2D(uMap, gl_PointCoord);
        gl_FragColor = vec4(uColor, texColor.a * uOpacity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

export function createParticleSystems(propagator, scene) {
  const discTexture = createDiscTexture();
  const positionBuffers = propagator.getPositionBuffers();
  const systems = {};

  for (const category of CATEGORIES) {
    const buffer = positionBuffers[category];

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffer, 3));

    const material = createPointMaterial(
      PALETTE[category],
      VISUAL_CONFIG.pointSizes[category],
      OPACITY[category],
      discTexture,
    );

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
