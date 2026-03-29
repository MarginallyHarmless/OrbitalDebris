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
  ctx.moveTo(c, c - r);
  ctx.lineTo(c + r, c);
  ctx.lineTo(c, c + r);
  ctx.lineTo(c - r, c);
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
  ctx.moveTo(c, c - r);
  ctx.lineTo(c + r * 0.9, c + r * 0.7);
  ctx.lineTo(c - r * 0.9, c + r * 0.7);
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
  ctx.beginPath();
  ctx.arc(c, c, TEX_SIZE * 0.2, 0, Math.PI * 2);
  ctx.fill();

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
  active:     0.5,
  debris:     0.6,
  rocketBody: 0.55,
  station:    0.9,
};

const IS_MOBILE = Math.min(window.innerWidth, window.innerHeight) < 768;
const MIN_PIXEL_SIZE = IS_MOBILE ? 1.5 : 3.0;
const SCREEN_SCALE = IS_MOBILE ? 0.5 : 1.0;

const CATEGORIES = ['active', 'debris', 'rocketBody', 'station'];

// ─── Custom shader with sun-facing illumination ─────────────────────────────

function createPointMaterial(color, size, opacity, texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor:        { value: new THREE.Color(color) },
      uSize:         { value: size },
      uMinSize:      { value: MIN_PIXEL_SIZE },
      uOpacity:      { value: opacity },
      uMap:          { value: texture },
      uPixelRatio:   { value: Math.min(window.devicePixelRatio, 2) },
      uScreenScale:  { value: SCREEN_SCALE },
      uSunDirection: { value: new THREE.Vector3(5, 3, 5).normalize() },
    },
    vertexShader: `
      attribute float aSizeScale;
      uniform float uSize;
      uniform float uMinSize;
      uniform float uPixelRatio;
      uniform float uScreenScale;
      uniform vec3 uSunDirection;
      varying float vSunFactor;
      varying float vDistance;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float dist = -mvPosition.z;
        vDistance = dist;

        // Size variation from per-particle attribute, scaled down on mobile
        float scaledSize = uSize * aSizeScale * uScreenScale;
        float attenSize = scaledSize * uPixelRatio * (500.0 / sqrt(dist));
        gl_PointSize = max(attenSize, uMinSize * uPixelRatio);

        // Sun-facing illumination
        vec3 posDir = normalize(position);
        vSunFactor = dot(posDir, normalize(uSunDirection));

        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform sampler2D uMap;
      varying float vSunFactor;
      varying float vDistance;
      void main() {
        vec4 texColor = texture2D(uMap, gl_PointCoord);

        // Sun-facing brightness: sun side bright, shadow side dims to 35%
        float brightness = smoothstep(-0.3, 0.5, vSunFactor) * 0.65 + 0.35;

        // Color temperature shift: warm on sun side, cool on shadow
        vec3 warmShift = vec3(1.1, 1.0, 0.9);
        vec3 coolShift = vec3(0.85, 0.9, 1.15);
        vec3 tempShift = mix(coolShift, warmShift, smoothstep(-0.2, 0.4, vSunFactor));

        vec3 color = uColor * brightness * tempShift;

        // Distance-based opacity fade (atmospheric depth cue)
        float distFade = smoothstep(20.0, 3.0, vDistance);
        float alpha = texColor.a * uOpacity * (0.6 + distFade * 0.4);

        gl_FragColor = vec4(color, alpha);
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
    const count = buffer.length / 3;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(buffer, 3));

    // Per-particle size variation: 0.7x to 1.5x, seeded from index
    const sizeScales = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Deterministic pseudo-random from index
      const hash = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      sizeScales[i] = 0.7 + (hash - Math.floor(hash)) * 0.8;
    }
    geometry.setAttribute('aSizeScale', new THREE.BufferAttribute(sizeScales, 1));

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
