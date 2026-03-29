# Earth & Objects Aesthetic Enhancement

## Overview

Three shader-level enhancements to make the scene feel more alive and dimensional:
1. **Earth normal map** — terrain catches light, adds surface depth
2. **Particle twinkling** — subtle per-particle brightness oscillation
3. **Dynamic sun glints** — specular flares when sun-camera-particle geometry aligns

All changes are shader modifications only. No new geometry, no new render passes, one new texture load.

## Feature 1: Earth Normal Map

### Texture

NASA Blue Marble normal map (`public/textures/earth-normal.jpg`). Loaded asynchronously alongside existing day/night textures in `earth.js`. Target resolution: 4096x2048 (good balance of detail vs. file size).

### Shader Changes (earth.js fragment shader)

- Add `uniform sampler2D uNormalMap` and `uniform float uNormalStrength`
- Sample the normal map at the fragment's UV coordinates
- Transform the sampled normal from tangent space to world space using UV-derived tangent and bitangent vectors:
  - Tangent: derived from the sphere surface (dFdx of world position and UV)
  - Bitangent: cross product of normal and tangent
  - TBN matrix transforms the sampled normal to world space
- Replace the existing `NdotL = dot(vNormal, uSunDirection)` with `NdotL = dot(perturbedNormal, uSunDirection)`
- The perturbed normal feeds into ALL existing lighting calculations:
  - Day/night terminator blending (`smoothstep(-0.15, 0.25, NdotL)`)
  - Sunset glow gaussian
  - City lights threshold
  - Day side brightness

### Effect

Mountain ranges and continental edges catch sunlight at grazing angles. Ocean areas stay flat (normal map is neutral there). The terminator line becomes subtly irregular — no longer a perfect geometric circle. All existing visual features (city lights, sunset glow, desaturation) continue to work unchanged, just with more detailed lighting.

### Config

```javascript
earth: {
  // ... existing config ...
  normalMapStrength: 1.5,  // multiplier on sampled normal displacement
}
```

## Feature 2: Particle Twinkling

### Shader Changes (particles.js)

**New uniform:** `uTime` (float, updated each frame from `performance.now() * 0.001`)

**Vertex shader:**
- Use the existing `aSizeScale` attribute as a per-particle phase seed (already a deterministic pseudo-random value per particle, range 0.7-1.5)
- Pass it to the fragment shader as `vPhase`

**Fragment shader:**
- Compute twinkle factor: `float twinkle = 1.0 + uTwinkleIntensity * sin(uTime * (uTwinkleBaseSpeed + vPhase * uTwinkleSpeedVariation) + vPhase * 6.2831)`
- Multiply final color RGB by twinkle factor
- Each particle oscillates brightness at a unique rate (baseSpeed + phase * speedVariation) and starting phase (phase * 2pi)

### Effect

Gentle, organic brightness fluctuation. No two particles pulse in sync. Subtle enough to not be distracting — like distant lights shimmering through atmosphere. The ±15% default intensity means most particles barely change, but the cumulative effect across thousands of objects creates a living, breathing debris field.

### Config

```javascript
particles: {
  twinkleIntensity: 0.15,     // ±15% brightness oscillation
  twinkleBaseSpeed: 1.5,      // slowest twinkle rate (Hz-ish)
  twinkleSpeedVariation: 2.0, // additional speed range per particle
}
```

## Feature 3: Dynamic Sun Glints

### Shader Changes (particles.js)

**Vertex shader:**
- Compute the normalized camera-to-particle direction: `vec3 viewDir = normalize(cameraPosition - worldPos)` where `worldPos` is the particle's world position (available as `position` in the vertex shader since model matrix is identity for points)
- Compute the reflection of the sun direction around the particle's position normal (normalized position): `vec3 reflectDir = reflect(-normalize(uSunDirection), normalize(position))`
- Compute glint dot product: `float glintDot = dot(viewDir, reflectDir)`
- Pass `glintDot` to fragment shader as `vGlintFactor`

**Fragment shader:**
- Compute glint: `float glint = pow(max(0.0, vGlintFactor), uGlintExponent) * uGlintStrength`
- Add to final color: `color += glint` (additive white flash)
- The high exponent (default 64) ensures only near-perfect reflection angles produce visible flares

### Effect

As the sun slowly orbits the scene, different objects briefly flare bright white — like real satellite glints visible from the ground (Iridium flares). Most frames, most particles show no glint at all. But the occasional bright flash across the debris field creates dynamic visual interest. Combined with twinkling, the entire particle system feels responsive to light.

### Interaction with Existing Sun Shading

The glint is additive on top of the existing sun-facing brightness system:
- Existing: `brightness = smoothstep(-0.3, 0.5, vSunFactor) * 0.65 + 0.35` (diffuse-like, soft)
- New: `brightness += pow(max(0.0, vGlintFactor), 64.0) * 2.0` (specular-like, sharp)

The two complement each other — diffuse gives the general sun/shadow, specular adds the rare bright flares.

### Config

```javascript
particles: {
  // ... twinkle config above ...
  glintExponent: 64.0,   // sharpness of glint (higher = rarer, sharper flares)
  glintStrength: 2.0,    // brightness multiplier of glint flash
}
```

## Module Changes

| File | Change |
|------|--------|
| `src/earth.js` | Load normal map texture, add `uNormalMap` + `uNormalStrength` uniforms, modify fragment shader for normal-mapped NdotL |
| `src/particles.js` | Add `uTime` uniform, pass `aSizeScale` as `vPhase`, add twinkle factor + glint calculation to fragment shader, add glint reflection to vertex shader |
| `src/main.js` | Update `uTime` uniform on all 4 particle materials each frame (`performance.now() * 0.001`) |
| `src/config.js` | Add `normalMapStrength` to earth config, add `twinkleIntensity`, `twinkleBaseSpeed`, `twinkleSpeedVariation`, `glintExponent`, `glintStrength` to new `particles` config section |

### No Changes To

`propagator.js`, `kepler.js`, `scene.js`, `ui.js`, `tooltip.js`, `kessler.js`, `data.js`, `loader.js`, `utils.js`

### New Asset

`public/textures/earth-normal.jpg` — NASA Blue Marble normal map, 4096x2048. Free public domain asset from NASA Visible Earth (https://visibleearth.nasa.gov/).

## Performance

- Normal map: one additional texture sample per Earth fragment. Negligible — the Earth is a single 64-segment sphere.
- Twinkling: one `sin()` call per particle fragment. Effectively free.
- Glinting: one `reflect()` + `pow()` per particle vertex/fragment. Effectively free.
- Total new GPU cost: ~0.
