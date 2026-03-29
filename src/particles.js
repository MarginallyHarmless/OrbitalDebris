import * as THREE from 'three';
import { VISUAL_CONFIG, PALETTE } from './config.js';

// ─── Category-specific shape textures (256x256, crisp at any zoom) ──────────

const TEX_SIZE = 256;

function createDiamondTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');
  const c = TEX_SIZE / 2;
  const r = TEX_SIZE * 0.38;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(c, c - r);       // top
  ctx.lineTo(c + r, c);       // right
  ctx.lineTo(c, c + r);       // bottom
  ctx.lineTo(c - r, c);       // left
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createCrossTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');
  const c = TEX_SIZE / 2;
  const arm = TEX_SIZE * 0.36;
  const thick = TEX_SIZE * 0.12;

  ctx.fillStyle = '#ffffff';
  // Rotated 45 degrees — X shape
  ctx.translate(c, c);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-arm, -thick, arm * 2, thick * 2);
  ctx.fillRect(-thick, -arm, thick * 2, arm * 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createTriangleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');
  const c = TEX_SIZE / 2;
  const r = TEX_SIZE * 0.38;

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(c, c - r);                           // top
  ctx.lineTo(c + r * 0.9, c + r * 0.7);           // bottom right
  ctx.lineTo(c - r * 0.9, c + r * 0.7);           // bottom left
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createStationTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');
  const c = TEX_SIZE / 2;

  ctx.fillStyle = '#ffffff';
  // Inner filled circle
  ctx.beginPath();
  ctx.arc(c, c, TEX_SIZE * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Outer ring
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = TEX_SIZE * 0.06;
  ctx.beginPath();
  ctx.arc(c, c, TEX_SIZE * 0.35, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

const TEXTURE_CREATORS = {
  active:     createDiamondTexture,
  debris:     createCrossTexture,
  rocketBody: createTriangleTexture,
  station:    createStationTexture,
};

// ─── Config ─────────────────────────────────────────────────────────────────

const OPACITY = {
  active:     0.7,
  debris:     0.85,
  rocketBody: 0.75,
  station:    1.0,
};

const MIN_PIXEL_SIZE = 3.0;

const CATEGORIES = ['active', 'debris', 'rocketBody', 'station'];

// ─── Custom shader with min-size clamping ───────────────────────────────────

function createPointMaterial(color, size, opacity, texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor:       { value: new THREE.Color(color) },
      uSize:        { value: size },
      uMinSize:     { value: MIN_PIXEL_SIZE },
      uOpacity:     { value: opacity },
      uMap:         { value: texture },
      uPixelRatio:  { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: `
      uniform float uSize;
      uniform float uMinSize;
      uniform float uPixelRatio;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float dist = -mvPosition.z;
        float attenSize = uSize * uPixelRatio * (500.0 / sqrt(dist));
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

// ─── Public API ─────────────────────────────────────────────────────────────

export function createParticleSystems(propagator, scene) {
  const positionBuffers = propagator.getPositionBuffers();
  const systems = {};

  for (const category of CATEGORIES) {
    const buffer = positionBuffers[category];

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffer, 3));

    const texture = TEXTURE_CREATORS[category]();

    const material = createPointMaterial(
      PALETTE[category],
      VISUAL_CONFIG.pointSizes[category],
      OPACITY[category],
      texture,
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
