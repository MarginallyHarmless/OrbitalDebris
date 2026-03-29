import * as THREE from 'three';
import { VISUAL_CONFIG } from './config.js';

export function createEarth(scene) {
  const textureLoader = new THREE.TextureLoader();

  // 1. Earth sphere — start dark, texture loads async
  const earthGeometry = new THREE.SphereGeometry(
    VISUAL_CONFIG.earth.radius,
    VISUAL_CONFIG.earth.segments,
    VISUAL_CONFIG.earth.segments
  );

  const earthMaterial = new THREE.MeshPhongMaterial({
    color: '#8aacc8',            // brighter tint — lets more texture through
    emissive: '#0a1520',
    emissiveIntensity: 0.5,
    shininess: 10,
    specular: '#334455',
  });

  const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
  scene.add(earthMesh);

  // Load Blue Marble texture — darkened via material color tint
  textureLoader.load('/textures/earth-blue-marble.jpg', (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    earthMaterial.map = texture;
    earthMaterial.needsUpdate = true;
  });

  // 2. Subtle wireframe grid lines
  const gridGeometry = new THREE.SphereGeometry(
    VISUAL_CONFIG.earth.radius * 1.005,
    24,
    24
  );
  const gridMaterial = new THREE.MeshBasicMaterial({
    wireframe: true,
    color: VISUAL_CONFIG.palette.grid,
    transparent: true,
    opacity: VISUAL_CONFIG.grid.opacity,
    depthWrite: false
  });
  const gridMesh = new THREE.Mesh(gridGeometry, gridMaterial);
  scene.add(gridMesh);

  // 3. Atmosphere glow with Fresnel-based rim effect
  const atmosphereGeometry = new THREE.SphereGeometry(
    VISUAL_CONFIG.atmosphere.radius,
    64,
    64
  );

  const vertexShader = `
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vViewDir = normalize(cameraPosition - worldPos.xyz);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform vec3 glowColor;
    uniform float opacity;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
      float intensity = pow(1.0 - abs(dot(vViewDir, vNormal)), 3.0);
      gl_FragColor = vec4(glowColor, intensity * opacity);
    }
  `;

  const atmosphereMaterial = new THREE.ShaderMaterial({
    uniforms: {
      glowColor: { value: new THREE.Color(VISUAL_CONFIG.atmosphere.color) },
      opacity: { value: VISUAL_CONFIG.atmosphere.opacity }
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
  scene.add(atmosphereMesh);

  return { earthMesh, gridMesh, atmosphereMesh };
}
