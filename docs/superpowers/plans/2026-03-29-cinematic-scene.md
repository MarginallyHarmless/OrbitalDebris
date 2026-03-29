# Cinematic Scene Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the orbital debris visualization from a clean data viz into a cinematic, "Interstellar"-inspired scene with realistic Earth rendering, sun-facing particle illumination, and post-processing bloom.

**Architecture:** Replace Earth's MeshPhongMaterial with a custom day/night ShaderMaterial driven by a shared `uSunDirection` uniform. Add cloud layer sphere. Upgrade atmosphere Fresnel to two-tone. Add sun-facing illumination + size variation to particle shaders. Wrap rendering in EffectComposer with UnrealBloomPass and film grain. All cinematic parameters controlled from VISUAL_CONFIG.

**Tech Stack:** Three.js r170, GLSL shaders, three/addons EffectComposer + UnrealBloomPass + ShaderPass + OutputPass

---

### Task 1: Download texture assets

**Files:**
- Create: `public/textures/earth-night.jpg`
- Create: `public/textures/earth-clouds.jpg`

These NASA textures are needed before any Earth shader work. Download from NASA Visible Earth (public domain).

- [ ] **Step 1: Download Earth night lights texture**

```bash
curl -L -o public/textures/earth-night.jpg "https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg"
```

If that URL is unavailable, search for "NASA Black Marble 2016" and download any 2048px+ equirectangular night lights image. Save as `public/textures/earth-night.jpg`.

- [ ] **Step 2: Download Earth clouds texture**

```bash
curl -L -o public/textures/earth-clouds.png "https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg"
```

If unavailable, search for "NASA cloud map equirectangular" and download any 2048px+ cloud transparency map. Save as `public/textures/earth-clouds.jpg`.

- [ ] **Step 3: Verify assets exist and are reasonable size**

```bash
ls -lh public/textures/earth-night.jpg public/textures/earth-clouds.*
```

Expected: Both files exist, each between 500KB and 15MB.

- [ ] **Step 4: Commit**

```bash
git add public/textures/earth-night.jpg public/textures/earth-clouds.*
git commit -m "feat: add NASA night lights and cloud textures"
```

---

### Task 2: Add cinematic config values

**Files:**
- Modify: `src/config.js`

Add sun, clouds, bloom, and filmGrain sections to VISUAL_CONFIG. Update atmosphere values.

- [ ] **Step 1: Add new config sections to VISUAL_CONFIG**

In `src/config.js`, add the following properties inside the `VISUAL_CONFIG` object, after the existing `kessler` block (before `ui`):

```js
sun: {
  color: '#fff5e0',
  intensity: 2.0,
  direction: [5, 3, 5],
  rotationSpeed: 0.01,
},

clouds: {
  radius: 1.005,
  opacity: 0.35,
  rotationSpeed: 0.002,
},

bloom: {
  strength: 0.8,
  radius: 0.6,
  threshold: 0.7,
},

filmGrain: {
  enabled: true,
  opacity: 0.04,
},
```

- [ ] **Step 2: Update atmosphere config values**

Change the existing `atmosphere` block from:

```js
atmosphere: {
  radius:     1.02,
  opacity:    0.08,
  color:      PALETTE.atmosphere,
},
```

to:

```js
atmosphere: {
  radius:     1.04,
  opacity:    0.45,
  color:      '#4488cc',
  sunsetColor: '#ff6633',
},
```

- [ ] **Step 3: Verify dev server starts without errors**

```bash
npm run dev
```

Expected: Vite compiles without errors. Scene loads normally (nothing uses the new config yet).

- [ ] **Step 4: Commit**

```bash
git add src/config.js
git commit -m "feat: add cinematic config (sun, clouds, bloom, filmGrain, atmosphere)"
```

---

### Task 3: Restructure lighting and set up EffectComposer

**Files:**
- Modify: `src/scene.js`

Replace ambient + directional lights with a sun directional + hemisphere fill. Set up EffectComposer with RenderPass, UnrealBloomPass, film grain ShaderPass, and OutputPass. Export composer and sun light for use by main.js.

- [ ] **Step 1: Rewrite scene.js**

Replace the full content of `src/scene.js` with:

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VISUAL_CONFIG } from './config.js';

let renderer, camera;

export function createScene() {
  // ── Scene ──────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(VISUAL_CONFIG.palette.background);

  // ── Renderer ───────────────────────────────────────────────────────────────
  const canvas = document.getElementById('scene');
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // ── Camera ─────────────────────────────────────────────────────────────────
  const { fov, near, far, distance } = VISUAL_CONFIG.camera;
  camera = new THREE.PerspectiveCamera(
    fov,
    window.innerWidth / window.innerHeight,
    near,
    far,
  );
  camera.position.set(0, 0.8, distance);

  // ── Controls ───────────────────────────────────────────────────────────────
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.minDistance = VISUAL_CONFIG.camera.minDistance;
  controls.maxDistance = VISUAL_CONFIG.camera.maxDistance;
  controls.autoRotate = false;

  // ── Lights ─────────────────────────────────────────────────────────────────
  const sunCfg = VISUAL_CONFIG.sun;
  const sunLight = new THREE.DirectionalLight(sunCfg.color, sunCfg.intensity);
  sunLight.position.set(...sunCfg.direction);
  scene.add(sunLight);

  const hemiLight = new THREE.HemisphereLight('#0a1530', '#000000', 0.15);
  scene.add(hemiLight);

  // ── Starfield ──────────────────────────────────────────────────────────────
  const starCount = 12000;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  const starRadius = 50;

  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    starPositions[i * 3]     = starRadius * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = starRadius * Math.sin(phi) * Math.sin(theta);
    starPositions[i * 3 + 2] = starRadius * Math.cos(phi);

    const brightness = Math.pow(Math.random(), 2) * 0.6 + 0.15;
    const tint = Math.random();
    starColors[i * 3]     = brightness * (0.8 + tint * 0.2);
    starColors[i * 3 + 1] = brightness * (0.85 + tint * 0.15);
    starColors[i * 3 + 2] = brightness;

    starSizes[i] = Math.pow(Math.random(), 3) * 3.5 + 0.5;
  }

  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));

  const starMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    },
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      uniform float uPixelRatio;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        float alpha = 1.0 - smoothstep(0.3, 0.5, d);
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: true,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  // ── Post-Processing ────────────────────────────────────────────────────────
  const composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const bloomCfg = VISUAL_CONFIG.bloom;
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    bloomCfg.strength,
    bloomCfg.radius,
    bloomCfg.threshold,
  );
  composer.addPass(bloomPass);

  // Film grain pass
  const filmGrainCfg = VISUAL_CONFIG.filmGrain;
  const filmGrainShader = {
    uniforms: {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uOpacity: { value: filmGrainCfg.opacity },
      uEnabled: { value: filmGrainCfg.enabled ? 1.0 : 0.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uOpacity;
      uniform float uEnabled;
      varying vec2 vUv;
      void main() {
        vec4 color = texture2D(tDiffuse, vUv);
        if (uEnabled > 0.5) {
          float noise = fract(sin(dot(vUv + uTime, vec2(12.9898, 78.233))) * 43758.5453);
          color.rgb += (noise - 0.5) * uOpacity;
        }
        gl_FragColor = color;
      }
    `,
  };
  const filmGrainPass = new ShaderPass(filmGrainShader);
  composer.addPass(filmGrainPass);

  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // ── Resize handler ─────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, controls, composer, sunLight, filmGrainPass };
}

export function getRenderer() {
  return renderer;
}

export function getCamera() {
  return camera;
}
```

- [ ] **Step 2: Update main.js to use composer instead of renderer**

In `src/main.js`, update the destructuring on the `createScene()` call:

Change:
```js
const { scene, camera, renderer, controls } = createScene();
```
to:
```js
const { scene, camera, renderer, controls, composer, sunLight, filmGrainPass } = createScene();
```

Then replace the render call at the bottom of `animate()`:

Change:
```js
renderer.render(scene, camera);
```
to:
```js
// Update film grain time
filmGrainPass.uniforms.uTime.value = performance.now() * 0.001;

// Render through post-processing pipeline
composer.render();
```

- [ ] **Step 3: Verify the scene renders with bloom and film grain**

```bash
npm run dev
```

Expected: Scene loads. Bloom makes bright spots (stars, atmosphere) glow softly. Very subtle film grain visible on close inspection. No console errors.

- [ ] **Step 4: Commit**

```bash
git add src/scene.js src/main.js
git commit -m "feat: add EffectComposer with bloom, film grain, and cinematic lighting"
```

---

### Task 4: Earth day/night shader with specular

**Files:**
- Modify: `src/earth.js`

Replace MeshPhongMaterial with a custom ShaderMaterial that blends day texture, night city lights, and specular ocean glint based on `uSunDirection`.

- [ ] **Step 1: Rewrite earth.js with custom day/night shader**

Replace the full content of `src/earth.js` with:

```js
import * as THREE from 'three';
import { VISUAL_CONFIG } from './config.js';

export function createEarth(scene) {
  const textureLoader = new THREE.TextureLoader();
  const BASE = import.meta.env.BASE_URL || '/';

  // ── Earth sphere with custom day/night shader ─────────────────────────────
  const earthGeometry = new THREE.SphereGeometry(
    VISUAL_CONFIG.earth.radius,
    VISUAL_CONFIG.earth.segments,
    VISUAL_CONFIG.earth.segments,
  );

  const earthUniforms = {
    uDayMap:        { value: null },
    uNightMap:      { value: null },
    uSunDirection:  { value: new THREE.Vector3(5, 3, 5).normalize() },
  };

  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: earthUniforms,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uDayMap;
      uniform sampler2D uNightMap;
      uniform vec3 uSunDirection;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 sunDir = normalize(uSunDirection);

        // Sun-facing factor: 1 = fully lit, 0 = terminator, -1 = fully dark
        float NdotL = dot(normal, sunDir);

        // Day/night blend with soft terminator band
        float dayFactor = smoothstep(-0.15, 0.25, NdotL);

        // Sample textures
        vec3 dayColor = texture2D(uDayMap, vUv).rgb;
        vec3 nightColor = texture2D(uNightMap, vUv).rgb;

        // Night lights: boost city lights visibility
        nightColor *= 1.8;

        // Blend day and night
        vec3 color = mix(nightColor, dayColor, dayFactor);

        // Specular ocean glint — oceans are dark in Blue Marble (luminance < 0.25)
        float luminance = dot(dayColor, vec3(0.299, 0.587, 0.114));
        float isOcean = 1.0 - smoothstep(0.08, 0.25, luminance);
        vec3 viewDir = normalize(cameraPosition - vPosition);
        vec3 halfDir = normalize(sunDir + viewDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), 120.0);
        color += vec3(0.95, 0.9, 0.8) * spec * isOcean * dayFactor * 0.8;

        // Warm terminator glow — atmospheric scattering at the day/night boundary
        float terminatorGlow = exp(-pow((NdotL - 0.0) / 0.12, 2.0));
        color += vec3(0.8, 0.3, 0.1) * terminatorGlow * 0.15;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
  scene.add(earthMesh);

  // Load textures
  textureLoader.load(`${BASE}textures/earth-blue-marble.jpg`, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    earthUniforms.uDayMap.value = texture;
  });

  textureLoader.load(`${BASE}textures/earth-night.jpg`, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    earthUniforms.uNightMap.value = texture;
  });

  // Placeholder textures while loading (dark blue for day, black for night)
  const placeholderDay = new THREE.DataTexture(
    new Uint8Array([10, 21, 32, 255]), 1, 1, THREE.RGBAFormat
  );
  placeholderDay.needsUpdate = true;
  earthUniforms.uDayMap.value = placeholderDay;

  const placeholderNight = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat
  );
  placeholderNight.needsUpdate = true;
  earthUniforms.uNightMap.value = placeholderNight;

  // ── Wireframe grid ────────────────────────────────────────────────────────
  const gridGeometry = new THREE.SphereGeometry(
    VISUAL_CONFIG.earth.radius * 1.005,
    24,
    24,
  );
  const gridMaterial = new THREE.MeshBasicMaterial({
    wireframe: true,
    color: VISUAL_CONFIG.palette.grid,
    transparent: true,
    opacity: VISUAL_CONFIG.grid.opacity,
    depthWrite: false,
  });
  const gridMesh = new THREE.Mesh(gridGeometry, gridMaterial);
  scene.add(gridMesh);

  // ── Two-tone atmosphere ───────────────────────────────────────────────────
  const atmCfg = VISUAL_CONFIG.atmosphere;
  const atmosphereGeometry = new THREE.SphereGeometry(atmCfg.radius, 64, 64);

  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uSunDirection: { value: new THREE.Vector3(5, 3, 5).normalize() },
      uDayColor:     { value: new THREE.Color(atmCfg.color) },
      uSunsetColor:  { value: new THREE.Color(atmCfg.sunsetColor) },
      uOpacity:      { value: atmCfg.opacity },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDirection;
      uniform vec3 uDayColor;
      uniform vec3 uSunsetColor;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      varying vec3 vWorldNormal;
      void main() {
        float rim = pow(1.0 - abs(dot(vViewDir, vNormal)), 3.0);

        // Sun-facing factor for atmosphere color
        float NdotL = dot(normalize(vWorldNormal), normalize(uSunDirection));

        // Terminator zone gets warm sunset color
        float sunsetFactor = exp(-pow((NdotL - 0.0) / 0.3, 2.0));
        // Day side gets blue
        float dayFactor = smoothstep(-0.1, 0.5, NdotL);

        vec3 atmColor = mix(uDayColor * 0.3, uDayColor, dayFactor);
        atmColor = mix(atmColor, uSunsetColor, sunsetFactor * 0.6);

        gl_FragColor = vec4(atmColor, rim * uOpacity);
      }
    `,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
  scene.add(atmosphereMesh);

  // ── Cloud layer ───────────────────────────────────────────────────────────
  const cloudCfg = VISUAL_CONFIG.clouds;
  const cloudGeometry = new THREE.SphereGeometry(
    VISUAL_CONFIG.earth.radius * cloudCfg.radius,
    64,
    64,
  );

  const cloudMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: cloudCfg.opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    color: '#ffffff',
  });

  const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
  scene.add(cloudMesh);

  textureLoader.load(`${BASE}textures/earth-clouds.jpg`, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    cloudMaterial.map = texture;
    cloudMaterial.needsUpdate = true;
  });

  return { earthMesh, gridMesh, atmosphereMesh, cloudMesh, earthUniforms, atmosphereMaterial };
}
```

- [ ] **Step 2: Update main.js to handle new earth exports and sun direction**

In `src/main.js`, update the Earth creation call and add sun direction updates.

Change:
```js
const { earthMesh, gridMesh } = createEarth(scene);
```
to:
```js
const { earthMesh, gridMesh, atmosphereMesh, cloudMesh, earthUniforms, atmosphereMaterial } = createEarth(scene);
```

Then inside the `animate()` function, before the `controls.update()` call, add:

```js
// Rotate sun direction slowly
const sunAngle = performance.now() * 0.0001 * VISUAL_CONFIG.sun.rotationSpeed;
const sunDir = new THREE.Vector3(
  Math.cos(sunAngle) * 5,
  3,
  Math.sin(sunAngle) * 5,
).normalize();
sunLight.position.copy(sunDir.clone().multiplyScalar(10));
earthUniforms.uSunDirection.value.copy(sunDir);
atmosphereMaterial.uniforms.uSunDirection.value.copy(sunDir);

// Rotate clouds independently
cloudMesh.rotation.y += dt * VISUAL_CONFIG.clouds.rotationSpeed;
```

Also add at the top of the file, after the existing imports:

```js
import * as THREE from 'three';
```

(If THREE is not already imported in main.js — check first. If it's already there, skip this.)

- [ ] **Step 3: Verify Earth renders with day/night, clouds, and atmosphere**

```bash
npm run dev
```

Expected: Earth shows Blue Marble on the sun-facing side, city lights on the dark side. Soft warm terminator band. Cloud layer visible and slowly rotating. Two-tone atmosphere (blue day, orange terminator). Specular glint on oceans.

- [ ] **Step 4: Commit**

```bash
git add src/earth.js src/main.js
git commit -m "feat: cinematic Earth with day/night shader, clouds, two-tone atmosphere"
```

---

### Task 5: Particle sun-facing illumination and size variation

**Files:**
- Modify: `src/particles.js`
- Modify: `src/main.js`

Add `uSunDirection` uniform to particle shaders for sun-facing brightness + color temperature shift. Add per-particle size variation. Reduce base opacity for bloom interaction.

- [ ] **Step 1: Update particles.js with sun-facing shader**

Replace the full content of `src/particles.js` with:

```js
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

const MIN_PIXEL_SIZE = 3.0;

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
      uSunDirection: { value: new THREE.Vector3(5, 3, 5).normalize() },
    },
    vertexShader: `
      attribute float aSizeScale;
      uniform float uSize;
      uniform float uMinSize;
      uniform float uPixelRatio;
      uniform vec3 uSunDirection;
      varying float vSunFactor;
      varying float vDistance;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float dist = -mvPosition.z;
        vDistance = dist;

        // Size variation from per-particle attribute
        float scaledSize = uSize * aSizeScale;
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

        // Sun-facing brightness: sun side bright, shadow side dims to 15%
        float brightness = smoothstep(-0.3, 0.5, vSunFactor) * 0.85 + 0.15;

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
```

- [ ] **Step 2: Add sun direction updates for particles in main.js**

In `src/main.js`, inside the `animate()` function, after the sun direction block you added in Task 4, add:

```js
// Update particle sun direction
for (const key of ['active', 'debris', 'rocketBody', 'station']) {
  particleSystems[key].material.uniforms.uSunDirection.value.copy(sunDir);
}
```

- [ ] **Step 3: Verify particles show sun-facing illumination**

```bash
npm run dev
```

Expected: Particles on the sun-facing side are brighter and warmer. Shadow-side particles are dimmed and bluish. Size varies slightly between particles. Dense regions bloom into a soft collective glow. Stations remain bright.

- [ ] **Step 4: Commit**

```bash
git add src/particles.js src/main.js
git commit -m "feat: sun-facing particle illumination with size variation and bloom interaction"
```

---

### Task 6: Final tuning and verification

**Files:**
- Possibly tweak: `src/config.js`, `src/scene.js`, `src/earth.js`, `src/particles.js`

Run the full scene, verify all cinematic features work together, and tune any values that look off.

- [ ] **Step 1: Run dev server and verify all features**

```bash
npm run dev
```

Verify checklist:
- Earth shows day/night with city lights
- Specular ocean glint visible when zoomed in
- Warm terminator band at the day/night boundary
- Cloud layer visible and rotating
- Two-tone atmosphere (blue day, orange sunset)
- Sun direction slowly rotates
- Particles bright on sun side, dim on shadow side
- Particle sizes vary
- Bloom makes dense debris bands and atmosphere glow
- Film grain visible on close inspection
- Starfield unchanged, bright stars bloom slightly
- No console errors or performance issues

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Expected: Build completes without errors or warnings.

- [ ] **Step 3: Commit any tuning adjustments**

If any config values were tweaked during verification:

```bash
git add -u
git commit -m "feat: tune cinematic scene parameters"
```

If no changes needed, skip this step.
