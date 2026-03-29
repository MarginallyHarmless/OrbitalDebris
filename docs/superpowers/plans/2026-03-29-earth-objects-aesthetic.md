# Earth & Objects Aesthetic Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Earth feel three-dimensional with normal-mapped terrain lighting, and make the orbital objects feel alive with subtle twinkling and specular sun glints.

**Architecture:** Pure shader modifications to existing `earth.js` and `particles.js` materials. One new texture asset (NASA normal map). Config constants added to `config.js`. Animation loop in `main.js` updated to pass time uniform to particle shaders. No new files, no new render passes, no new geometry.

**Tech Stack:** Three.js ShaderMaterial (GLSL), NASA Blue Marble normal map texture

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `public/textures/earth-normal.jpg` | Add | NASA Blue Marble normal map, 4096x2048 |
| `src/config.js` | Modify | Add `normalMapStrength` to earth, add `particles` config section with twinkle/glint constants |
| `src/earth.js` | Modify | Load normal map, add uniforms, modify fragment shader for normal-mapped lighting |
| `src/particles.js` | Modify | Add `uTime` uniform, modify vertex/fragment shaders for twinkling and glint |
| `src/main.js` | Modify | Update `uTime` on all 4 particle materials each frame |

---

### Task 1: Add config constants

**Files:**
- Modify: `src/config.js`

- [ ] **Step 1: Add normalMapStrength to earth config and new particles config section**

In `src/config.js`, add `normalMapStrength` to the `earth` block, and add a new `particles` block after the `clouds` block.

Add to the `earth` object (after `color`):

```javascript
    normalMapStrength: 1.5,
```

Add a new `particles` block after the `clouds` block (after line 94):

```javascript
  particles: {
    twinkleIntensity: 0.15,
    twinkleBaseSpeed: 1.5,
    twinkleSpeedVariation: 2.0,
    glintExponent: 64.0,
    glintStrength: 2.0,
  },
```

- [ ] **Step 2: Verify dev server starts**

Run: `npm run dev`
Expected: Vite dev server starts, app loads normally — no visual changes yet.

- [ ] **Step 3: Commit**

```bash
git add src/config.js
git commit -m "feat: add config constants for normal map, twinkling, and glints"
```

---

### Task 2: Download and add Earth normal map texture

**Files:**
- Add: `public/textures/earth-normal.jpg`

- [ ] **Step 1: Download NASA normal map**

Download the Earth normal/bump map. Use a reliable source — the 4096x2048 NASA topography-derived normal map:

```bash
curl -L -o public/textures/earth-normal.jpg "https://unpkg.com/three-globe@2.41.12/example/img/earth-topology.png"
```

If the download fails, use an alternative source. The texture should be an equirectangular normal map where RGB encodes XYZ normal direction, and neutral (flat surface) is approximately `rgb(128, 128, 255)`.

Note: this is a topology/bump map, not a strict normal map — the shader will treat it as a normal map by remapping from `[0,1]` to `[-1,1]`.

- [ ] **Step 2: Verify the file exists and has reasonable size**

```bash
ls -la public/textures/earth-normal.jpg
```

Expected: File exists, roughly 0.5-5MB depending on resolution.

- [ ] **Step 3: Commit**

```bash
git add public/textures/earth-normal.jpg
git commit -m "asset: add Earth normal map texture"
```

---

### Task 3: Earth normal-mapped lighting

**Files:**
- Modify: `src/earth.js`

- [ ] **Step 1: Add normal map uniform and texture loading**

In `src/earth.js`, add `uNormalMap` and `uNormalStrength` to the `earthUniforms` object (around line 15):

```javascript
  const earthUniforms = {
    uDayMap:          { value: null },
    uNightMap:        { value: null },
    uNormalMap:       { value: null },
    uNormalStrength:  { value: VISUAL_CONFIG.earth.normalMapStrength },
    uSunDirection:    { value: new THREE.Vector3(5, 3, 5).normalize() },
  };
```

Add normal map texture loading after the existing night map load (after line 86):

```javascript
  textureLoader.load(`${BASE}textures/earth-normal.jpg`, (texture) => {
    earthUniforms.uNormalMap.value = texture;
  });
```

Add a placeholder for the normal map (after the existing placeholders, around line 99). A flat normal is `(128, 128, 255)` in 0-255 — pointing straight out:

```javascript
  const placeholderNormal = new THREE.DataTexture(
    new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat
  );
  placeholderNormal.needsUpdate = true;
  earthUniforms.uNormalMap.value = placeholderNormal;
```

- [ ] **Step 2: Modify the fragment shader for normal mapping**

Replace the entire `fragmentShader` string in the earth `ShaderMaterial` with:

```glsl
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
```

The key changes from the original shader:
- Three new uniforms: `uNormalMap`, `uNormalStrength`
- Normal map sampling: `texture2D(uNormalMap, vUv).rgb * 2.0 - 1.0` remaps from [0,1] to [-1,1]
- TBN matrix construction from screen-space derivatives (`dFdx`/`dFdy`)
- `perturbedNormal` replaces `normal` in the `NdotL` calculation
- Everything downstream (dayFactor, sunset, city lights) uses the perturbed NdotL automatically

- [ ] **Step 3: Verify normal mapping works**

Run the app. Look at the Earth:
- Mountain ranges (Himalayas, Andes, Rockies) should catch sunlight at the terminator
- Ocean areas should look smooth
- The terminator line should appear subtly irregular
- Day/night blending and city lights should still work correctly

- [ ] **Step 4: Commit**

```bash
git add src/earth.js
git commit -m "feat: add normal-mapped terrain lighting to Earth"
```

---

### Task 4: Particle twinkling

**Files:**
- Modify: `src/particles.js`
- Modify: `src/main.js`

- [ ] **Step 1: Add uTime and twinkle uniforms to particle shader material**

In `src/particles.js`, modify the `createPointMaterial` function. Add new uniforms to the uniforms object (after `uSunDirection`):

```javascript
      uTime:                  { value: 0 },
      uTwinkleIntensity:      { value: VISUAL_CONFIG.particles.twinkleIntensity },
      uTwinkleBaseSpeed:      { value: VISUAL_CONFIG.particles.twinkleBaseSpeed },
      uTwinkleSpeedVariation: { value: VISUAL_CONFIG.particles.twinkleSpeedVariation },
```

- [ ] **Step 2: Modify the vertex shader to pass phase to fragment**

Replace the entire `vertexShader` string in `createPointMaterial` with:

```glsl
      attribute float aSizeScale;
      uniform float uSize;
      uniform float uMinSize;
      uniform float uPixelRatio;
      uniform float uScreenScale;
      uniform vec3 uSunDirection;
      varying float vSunFactor;
      varying float vDistance;
      varying float vPhase;
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

        // Per-particle phase for twinkling (reuse aSizeScale as deterministic seed)
        vPhase = aSizeScale;

        gl_Position = projectionMatrix * mvPosition;
      }
```

Changes from original: added `varying float vPhase`, set `vPhase = aSizeScale`.

- [ ] **Step 3: Modify the fragment shader to apply twinkling**

Replace the entire `fragmentShader` string in `createPointMaterial` with:

```glsl
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform sampler2D uMap;
      uniform float uTime;
      uniform float uTwinkleIntensity;
      uniform float uTwinkleBaseSpeed;
      uniform float uTwinkleSpeedVariation;
      varying float vSunFactor;
      varying float vDistance;
      varying float vPhase;
      void main() {
        vec4 texColor = texture2D(uMap, gl_PointCoord);

        // Sun-facing brightness: sun side bright, shadow side dims to 35%
        float brightness = smoothstep(-0.3, 0.5, vSunFactor) * 0.65 + 0.35;

        // Color temperature shift: warm on sun side, cool on shadow
        vec3 warmShift = vec3(1.1, 1.0, 0.9);
        vec3 coolShift = vec3(0.85, 0.9, 1.15);
        vec3 tempShift = mix(coolShift, warmShift, smoothstep(-0.2, 0.4, vSunFactor));

        // Twinkling: subtle per-particle brightness oscillation
        float twinkle = 1.0 + uTwinkleIntensity * sin(uTime * (uTwinkleBaseSpeed + vPhase * uTwinkleSpeedVariation) + vPhase * 6.2831);

        vec3 color = uColor * brightness * tempShift * twinkle;

        // Distance-based opacity fade (atmospheric depth cue)
        float distFade = smoothstep(20.0, 3.0, vDistance);
        float alpha = texColor.a * uOpacity * (0.6 + distFade * 0.4);

        gl_FragColor = vec4(color, alpha);
      }
```

Changes from original: added twinkle uniforms, `vPhase` varying, twinkle factor computed and multiplied into color.

- [ ] **Step 4: Add uTime update to main.js animation loop**

In `src/main.js`, in the animation loop, after the block that updates `uSunDirection` on particle systems (after line 146), add:

```javascript
    // Update particle time for twinkling
    const particleTime = performance.now() * 0.001;
    for (const key of ['active', 'debris', 'rocketBody', 'station']) {
      particleSystems[key].material.uniforms.uTime.value = particleTime;
    }
```

- [ ] **Step 5: Verify twinkling works**

Run the app. Watch the particles closely:
- Each particle should gently fluctuate in brightness
- The fluctuation should be subtle (±15%), not a strobe
- Different particles should twinkle at different rates
- Pausing and watching a single particle should show smooth oscillation

- [ ] **Step 6: Commit**

```bash
git add src/particles.js src/main.js
git commit -m "feat: add particle twinkling effect"
```

---

### Task 5: Dynamic sun glints

**Files:**
- Modify: `src/particles.js`

- [ ] **Step 1: Add glint uniforms to createPointMaterial**

In `src/particles.js`, add glint uniforms to the `createPointMaterial` function's uniforms object (after the twinkle uniforms added in Task 4):

```javascript
      uGlintExponent: { value: VISUAL_CONFIG.particles.glintExponent },
      uGlintStrength: { value: VISUAL_CONFIG.particles.glintStrength },
```

- [ ] **Step 2: Add glint computation to vertex shader**

Replace the vertex shader string with this version that adds glint calculation:

```glsl
      attribute float aSizeScale;
      uniform float uSize;
      uniform float uMinSize;
      uniform float uPixelRatio;
      uniform float uScreenScale;
      uniform vec3 uSunDirection;
      varying float vSunFactor;
      varying float vDistance;
      varying float vPhase;
      varying float vGlintFactor;
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

        // Per-particle phase for twinkling
        vPhase = aSizeScale;

        // Specular glint: reflection of sun off particle toward camera
        vec3 reflectDir = reflect(-normalize(uSunDirection), posDir);
        vec3 viewDir = normalize(cameraPosition - position);
        vGlintFactor = dot(viewDir, reflectDir);

        gl_Position = projectionMatrix * mvPosition;
      }
```

Changes from Task 4 vertex shader: added `varying float vGlintFactor`, computed `reflectDir` and `viewDir`, set `vGlintFactor`.

- [ ] **Step 3: Add glint to fragment shader**

Replace the fragment shader string with this version that adds the glint flash:

```glsl
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform sampler2D uMap;
      uniform float uTime;
      uniform float uTwinkleIntensity;
      uniform float uTwinkleBaseSpeed;
      uniform float uTwinkleSpeedVariation;
      uniform float uGlintExponent;
      uniform float uGlintStrength;
      varying float vSunFactor;
      varying float vDistance;
      varying float vPhase;
      varying float vGlintFactor;
      void main() {
        vec4 texColor = texture2D(uMap, gl_PointCoord);

        // Sun-facing brightness: sun side bright, shadow side dims to 35%
        float brightness = smoothstep(-0.3, 0.5, vSunFactor) * 0.65 + 0.35;

        // Color temperature shift: warm on sun side, cool on shadow
        vec3 warmShift = vec3(1.1, 1.0, 0.9);
        vec3 coolShift = vec3(0.85, 0.9, 1.15);
        vec3 tempShift = mix(coolShift, warmShift, smoothstep(-0.2, 0.4, vSunFactor));

        // Twinkling: subtle per-particle brightness oscillation
        float twinkle = 1.0 + uTwinkleIntensity * sin(uTime * (uTwinkleBaseSpeed + vPhase * uTwinkleSpeedVariation) + vPhase * 6.2831);

        vec3 color = uColor * brightness * tempShift * twinkle;

        // Specular glint: rare bright flash when sun reflects toward camera
        float glint = pow(max(0.0, vGlintFactor), uGlintExponent) * uGlintStrength;
        color += glint;

        // Distance-based opacity fade (atmospheric depth cue)
        float distFade = smoothstep(20.0, 3.0, vDistance);
        float alpha = texColor.a * uOpacity * (0.6 + distFade * 0.4);

        gl_FragColor = vec4(color, alpha);
      }
```

Changes from Task 4 fragment shader: added `uGlintExponent`, `uGlintStrength`, `vGlintFactor`, computed glint and added to color.

- [ ] **Step 4: Verify glints work**

Run the app. Watch the debris field:
- As the sun slowly orbits, occasional particles should flash bright white
- The flashes should be rare and brief (only at near-perfect reflection angles)
- Rotating the camera should cause different particles to glint
- The effect should be most visible on the sun-facing side of Earth

- [ ] **Step 5: Commit**

```bash
git add src/particles.js
git commit -m "feat: add dynamic sun glint effect to particles"
```

---

### Task 6: Verify build and final polish

**Files:**
- No changes expected — verification only

- [ ] **Step 1: Run production build**

```bash
npm run build
```

Expected: Build succeeds with no errors. The chunk size warning about satellite.js is pre-existing and expected.

- [ ] **Step 2: Visual verification checklist**

Run `npm run dev` and verify:

1. **Earth normal map**: Mountains visible at terminator, ocean smooth, irregular terminator edge
2. **Twinkling**: Subtle brightness fluctuation on all particles, different rates per particle
3. **Glints**: Occasional bright flashes as sun orbits, more visible near sun-facing side
4. **No regressions**: Day/night blending, city lights, sunset glow, cloud rotation, bloom, film grain all still work
5. **Mobile**: Check at narrow viewport (~375px) — effects should still work, no performance issues

- [ ] **Step 3: Commit any polish fixes if needed**

Only commit if there were actual fixes needed. Skip if everything worked.

```bash
git add -u
git commit -m "polish: aesthetic enhancement final adjustments"
```
