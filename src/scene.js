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
