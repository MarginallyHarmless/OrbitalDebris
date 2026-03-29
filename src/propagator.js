import * as satellite from 'satellite.js';
import { eciToScene, altitudeFromEci } from './utils.js';
import { keplerToEci, altFromEci } from './kepler.js';
import { VISUAL_CONFIG } from './config.js';

export function createPropagator(categorizedData) {
  const categories = ['active', 'debris', 'rocketBody', 'station'];

  const posBufferA = {};
  const posBufferB = {};
  const positionBuffers = {};
  const altitudeBuffers = {};
  const counts = {};
  let total = 0;

  for (const cat of categories) {
    const satList = categorizedData[cat] || [];
    const count = satList.length;
    counts[cat] = count;
    total += count;
    posBufferA[cat] = new Float32Array(count * 3);
    posBufferB[cat] = new Float32Array(count * 3);
    positionBuffers[cat] = new Float32Array(count * 3);
    altitudeBuffers[cat] = new Float32Array(count);
  }
  counts.total = total;

  // Build flat list with launch year for filtering
  const allSats = [];
  for (const cat of categories) {
    const satList = categorizedData[cat] || [];
    for (let i = 0; i < satList.length; i++) {
      const sat = satList[i];
      let launchYear = 0;
      if (sat.launchDate) {
        launchYear = parseInt(sat.launchDate.substring(0, 4)) || 0;
      }
      allSats.push({ sat, category: cat, index: i, launchYear });
    }
  }

  let keyframeTimeA = 0;
  let keyframeTimeB = 0;

  // Year filter: null = show all, number = only show objects launched <= that year
  let yearFilter = null;
  // Per-object visibility mask based on year filter
  const visibleMask = {}; // category -> Uint8Array
  for (const cat of categories) {
    visibleMask[cat] = new Uint8Array((categorizedData[cat] || []).length).fill(1);
  }

  function propagateSingle(entry, date, gmst, targetBuffers) {
    const { sat, category, index } = entry;
    const buf = targetBuffers[category];
    const altArr = altitudeBuffers[category];
    const offset = index * 3;

    let posEci = null;

    if (sat.kepler) {
      const k = sat.kepler;
      try {
        posEci = keplerToEci(k.sma, k.ecc, k.inc, k.raan, k.argp, k.ma, k.epochMs, date.getTime());
      } catch {
        posEci = null;
      }
    } else if (sat.satrec && sat.satrec.no !== undefined) {
      try {
        const pv = satellite.propagate(sat.satrec, date);
        posEci = pv.position;
      } catch {
        posEci = null;
      }
    }

    if (!posEci || isNaN(posEci.x) || isNaN(posEci.y) || isNaN(posEci.z)) {
      buf[offset] = 0;
      buf[offset + 1] = 0;
      buf[offset + 2] = 0;
      altArr[index] = 0;
      return;
    }

    const scenePos = eciToScene(posEci, gmst);
    buf[offset] = scenePos.x;
    buf[offset + 1] = scenePos.y;
    buf[offset + 2] = scenePos.z;

    altArr[index] = altitudeFromEci(posEci);
  }

  function propagateInto(targetBuffers, date) {
    const gmst = satellite.gstime(date);
    for (const entry of allSats) {
      propagateSingle(entry, date, gmst, targetBuffers);
    }
  }

  function propagateAll(date) {
    propagateInto(posBufferA, date);
    for (const cat of categories) {
      posBufferB[cat].set(posBufferA[cat]);
      positionBuffers[cat].set(posBufferA[cat]);
    }
    keyframeTimeA = date.getTime();
    keyframeTimeB = date.getTime();
    applyYearFilter();
  }

  function propagateNext(date) {
    for (const cat of categories) {
      posBufferA[cat].set(posBufferB[cat]);
    }
    keyframeTimeA = keyframeTimeB;
    propagateInto(posBufferB, date);
    keyframeTimeB = date.getTime();
  }

  function interpolate(currentTimeMs) {
    const duration = keyframeTimeB - keyframeTimeA;
    const t = duration > 0
      ? Math.max(0, Math.min(1, (currentTimeMs - keyframeTimeA) / duration))
      : 1;

    for (const cat of categories) {
      const a = posBufferA[cat];
      const b = posBufferB[cat];
      const out = positionBuffers[cat];
      const mask = visibleMask[cat];
      const len = out.length / 3;

      for (let i = 0; i < len; i++) {
        const o = i * 3;
        if (mask[i]) {
          out[o]     = a[o]     + (b[o]     - a[o])     * t;
          out[o + 1] = a[o + 1] + (b[o + 1] - a[o + 1]) * t;
          out[o + 2] = a[o + 2] + (b[o + 2] - a[o + 2]) * t;
        } else {
          out[o] = 0;
          out[o + 1] = 0;
          out[o + 2] = 0;
        }
      }
    }
  }

  function applyYearFilter() {
    if (yearFilter === null) {
      // Show all
      for (const cat of categories) {
        visibleMask[cat].fill(1);
      }
    } else {
      for (const entry of allSats) {
        const { category, index, launchYear } = entry;
        // Show if launched on or before the selected year
        // Hide objects without launch data when filtering (only ~1.8% of catalog)
        visibleMask[category][index] = (launchYear > 0 && launchYear <= yearFilter) ? 1 : 0;
      }
    }
  }

  function setYearFilter(year) {
    yearFilter = year;
    applyYearFilter();
  }

  function getYearFilter() {
    return yearFilter;
  }

  function getFilteredCounts() {
    const fc = { active: 0, debris: 0, rocketBody: 0, station: 0, total: 0 };
    for (const cat of categories) {
      const mask = visibleMask[cat];
      let c = 0;
      for (let i = 0; i < mask.length; i++) {
        if (mask[i]) c++;
      }
      fc[cat] = c;
      fc.total += c;
    }
    return fc;
  }

  function getPositionBuffers() {
    return { active: positionBuffers.active, debris: positionBuffers.debris, rocketBody: positionBuffers.rocketBody, station: positionBuffers.station };
  }

  function getAltitudes() {
    return { active: altitudeBuffers.active, debris: altitudeBuffers.debris, rocketBody: altitudeBuffers.rocketBody, station: altitudeBuffers.station };
  }

  function getCounts() {
    return yearFilter !== null ? getFilteredCounts() : { ...counts };
  }

  return { propagateAll, propagateNext, interpolate, getPositionBuffers, getAltitudes, getCounts, setYearFilter, getYearFilter };
}
