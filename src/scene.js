import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
  const ambient = new THREE.AmbientLight(0x556677, 1.0);
  scene.add(ambient);

  const directional = new THREE.DirectionalLight(0xccddee, 1.2);
  directional.position.set(5, 3, 5);
  scene.add(directional);

  // ── Starfield ──────────────────────────────────────────────────────────────
  const { count, radius, opacity, color } = VISUAL_CONFIG.starfield;
  const starPositions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    // Uniform random distribution on a sphere surface
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = radius;

    starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPositions[i * 3 + 2] = r * Math.cos(phi);
  }

  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));

  const starMaterial = new THREE.PointsMaterial({
    color: new THREE.Color(color),
    size: 0.15,
    transparent: true,
    opacity,
    sizeAttenuation: false,
  });

  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);

  // ── Resize handler ─────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, controls };
}

export function getRenderer() {
  return renderer;
}

export function getCamera() {
  return camera;
}
