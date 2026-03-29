# Cinematic UI Overhaul — Cosmic Dread Aesthetic

## Problem

The current UI uses Satoshi (friendly geometric sans) with tight spacing and standard sizing. It reads as functional/dashboard, not cinematic. The goal is to make the HUD feel like readouts from a deep space probe — sparse, deliberate, lonely.

## Solution

Typography-driven overhaul. Replace the typeface, increase letter-spacing, reduce sizes, add breathing room. Keep the existing color palette and glass card structure.

## Design

### Typography

Replace Satoshi with **Space Grotesk** (Google Fonts, free, variable weight).

| Element | Current | New |
|---------|---------|-----|
| Font family | Satoshi | Space Grotesk |
| Default weight | 400 | 300 (light) |
| Emphasis weight | 500-700 | 400 |
| Letter-spacing (labels) | 0.02em | 0.12em |
| Letter-spacing (body) | 0.02em | 0.08em |
| Section labels | 10px, uppercase | 9px, uppercase, weight 300 |
| Title | 15px, weight 700 | 14px, weight 300, 0.15em tracking |
| Counts/values | default | font-feature-settings: 'tnum' for tabular numbers |

All section labels and headers remain uppercase (already the case for most).

### Glass Card

Darken the glass treatment:
- Background: `rgba(10, 12, 20, 0.6)` to `rgba(6, 8, 14, 0.7)`
- Border: `rgba(255, 255, 255, 0.08)` to `rgba(255, 255, 255, 0.05)`
- Blur: keep at 12px

### Spacing

- Divider margins: 10px to 14px
- Section gap: slightly more vertical breathing room between label and content

### Files Changed

| File | Change |
|------|--------|
| `index.html` | Replace Fontshare CDN link with Google Fonts Space Grotesk (weights 300, 400) |
| `src/config.js` | Update `ui` section: font family, letter-spacing, glass background/border |
| `src/ui.js` | Update inline styles: letter-spacing, font-weight, text-transform, font-size on title, labels, counts, date readout. Update divider margins. |

### Files Not Changed

- `src/particles.js`, `src/scene.js`, `src/earth.js`, `src/main.js`, `src/tooltip.js`, `src/data.js`, `src/propagator.js`, `src/kessler.js`, `src/loader.js`
