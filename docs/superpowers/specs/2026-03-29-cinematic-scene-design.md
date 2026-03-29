# Cinematic & Eerie Scene Overhaul

**Date**: 2026-03-29
**Vibe**: "Interstellar" — grand, sweeping, melancholic. Beautiful but sad.
**Performance target**: Showcase piece, modern desktop GPUs. Mobile not a concern.
**Approach**: Shader-heavy with post-processing bloom pipeline.

---

## 1. Earth Overhaul

Replace `MeshPhongMaterial` with a custom `ShaderMaterial` driven by a shared `uSunDirection` uniform.

### Day/Night Blending
- Day side: Blue Marble texture with specular highlights on oceans.
- Night side: City lights texture (`earth-night.jpg` in `public/textures/`). Crossfades at the terminator.
- Terminator band: Soft warm glow (atmospheric scattering effect) where day meets night.

### Cloud Layer
- Second sphere at `radius * 1.005` with a semi-transparent clouds texture.
- Additive blending. Slowly rotates independently from Earth.
- Brightens the day side, subtly glows at the terminator edge.

### Specular Ocean Glint
- Sharp sun reflection on ocean areas. Use a specular map texture if available, otherwise approximate by checking Blue Marble luminance (oceans are darker than land) and applying specular only where luminance is below a threshold.
- "ISS footage" look — a bright specular hotspot that moves with sun direction.

### Atmosphere Upgrade
- Replace current Fresnel rim (barely visible at 0.08 opacity, radius 1.02).
- New: radius 1.04, significantly higher opacity.
- Two-tone: blue on the day-lit limb, warm orange/red on the terminator.
- Thicker, more dramatic — visible even when zoomed out.

### Sun Direction
- Shared `uSunDirection` vec3 uniform used by Earth shader and particle shaders.
- Slowly rotates to give a day/night cycle feel. Configurable rate in `VISUAL_CONFIG`.

---

## 2. Particle System Overhaul

### Sun-Facing Illumination
- Same `uSunDirection` uniform as Earth.
- Brightness: `dot(normalize(position), uSunDirection)` — sun-facing particles bright, shadow-side particles dim to ~15%.
- Subtle color temperature shift: sun-lit side gets ~10-15% warmer, shadow side cooler/bluer.

### Size Variation
- Per-particle random size attribute seeded from vertex index (stable across frames).
- Range: 0.7x to 1.5x base size.
- Distance-based opacity: closer particles slightly more opaque, distant ones fade. Atmospheric depth cue.

### Bloom Interaction
- Base opacity drops to ~0.5-0.6 (from current 0.7-0.85).
- Bloom pass recovers brightness in dense regions, creating collective glow.
- Individual particles: subtle sunlit fragments. Dense bands: luminous veil.
- Station category stays bright (few objects, should pop).

### Unchanged
- Shape textures (diamond/cross/triangle/ring) stay as-is for category distinction.
- Additive blending stays.

---

## 3. Post-Processing Pipeline

### EffectComposer Chain
1. `RenderPass` — standard scene render.
2. `UnrealBloomPass` — strength ~0.8, radius ~0.6, threshold ~0.7. Only brightest spots bloom (sun-lit particles, atmosphere limb, city lights).
3. Custom film grain fragment shader (fullscreen quad): generates noise from `fract(sin(dot(uv, vec2(12.9898,78.233))) * 43758.5453)` seeded with time uniform. Composited at opacity ~0.03-0.05. Breaks CG cleanness, adds "shot from orbit" texture.

### Lighting Restructure
- Remove current ambient light (`0x556677`, 1.0) and directional light (`0xccddee`, 1.2).
- Add single strong directional "sun": warm white `#fff5e0`, intensity ~2.0, position matches `uSunDirection`.
- Add dim hemisphere light for fill: sky `#0a1530`, ground `#000000`, intensity ~0.15.

### Background
- Stays pure black. Starfield unchanged. Bloom makes bright stars subtly glow (free bonus).

---

## 4. New Assets Required

| Asset | Path | Source |
|-------|------|--------|
| City lights texture | `public/textures/earth-night.jpg` | NASA Black Marble |
| Cloud layer texture | `public/textures/earth-clouds.jpg` | NASA Visible Earth |

---

## 5. Files Modified

| File | Changes |
|------|---------|
| `src/config.js` | Add sun direction, bloom, film grain, atmosphere, and cloud config values |
| `src/earth.js` | Replace MeshPhong with custom day/night shader, add cloud sphere, upgrade atmosphere |
| `src/particles.js` | Add `uSunDirection` uniform, sun-facing brightness, size variation, distance fade |
| `src/scene.js` | Replace lights with sun + hemisphere, set up EffectComposer pipeline |
| `src/main.js` | Pass sun direction to shaders each frame, update cloud rotation, use composer.render() |

---

## 6. Config Additions to VISUAL_CONFIG

```js
sun: {
  color: '#fff5e0',
  intensity: 2.0,
  direction: [5, 3, 5],  // initial
  rotationSpeed: 0.01,    // radians per sim-second
},
clouds: {
  opacity: 0.35,
  rotationSpeed: 0.002,   // relative to Earth
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
