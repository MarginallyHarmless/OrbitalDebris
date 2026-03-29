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
    uDayMap:          { value: null },
    uNightMap:        { value: null },
    uNormalMap:       { value: null },
    uNormalStrength:  { value: VISUAL_CONFIG.earth.normalMapStrength },
    uSunDirection:    { value: new THREE.Vector3(5, 3, 5).normalize() },
  };

  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: earthUniforms,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        // World-space normal so terminator stays fixed regardless of camera
        vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uDayMap;
      uniform sampler2D uNightMap;
      uniform sampler2D uNormalMap;
      uniform float uNormalStrength;
      uniform vec3 uSunDirection;
      varying vec3 vNormal;
      varying vec3 vPosition;
      varying vec2 vUv;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 sunDir = normalize(uSunDirection);

        // Sample normal map and perturb the surface normal
        vec3 mapN = texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0;
        mapN.xy *= uNormalStrength;
        mapN = normalize(mapN);

        // Build TBN matrix from screen-space derivatives
        vec3 dp1 = dFdx(vPosition);
        vec3 dp2 = dFdy(vPosition);
        vec2 duv1 = dFdx(vUv);
        vec2 duv2 = dFdy(vUv);

        vec3 dp2perp = cross(dp2, normal);
        vec3 dp1perp = cross(normal, dp1);
        vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
        vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;

        float invmax = inversesqrt(max(dot(T, T), dot(B, B)));
        mat3 TBN = mat3(T * invmax, B * invmax, normal);

        vec3 perturbedNormal = normalize(TBN * mapN);

        // Sun-facing factor using perturbed normal
        float NdotL = dot(perturbedNormal, sunDir);

        // Day/night blend with soft terminator band
        float dayFactor = smoothstep(-0.15, 0.25, NdotL);

        // Sample textures
        vec3 dayColor = texture2D(uDayMap, vUv).rgb;
        vec3 nightColor = texture2D(uNightMap, vUv).rgb;

        // Darken and desaturate the day side — moody, not a geography lesson
        float dayLum = dot(dayColor, vec3(0.299, 0.587, 0.114));
        dayColor = mix(vec3(dayLum), dayColor, 0.5) * 0.55;
        // Tint slightly blue
        dayColor *= vec3(0.75, 0.85, 1.0);

        // Night lights: boost city lights visibility
        nightColor *= 1.8;

        // Blend day and night
        vec3 color = mix(nightColor, dayColor, dayFactor);

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

  textureLoader.load(`${BASE}textures/earth-normal.jpg`, (texture) => {
    earthUniforms.uNormalMap.value = texture;
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

  const placeholderNormal = new THREE.DataTexture(
    new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat
  );
  placeholderNormal.needsUpdate = true;
  earthUniforms.uNormalMap.value = placeholderNormal;

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
