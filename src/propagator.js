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
      allSats.push({ sat, category: cat, index: i, launchYear, country: sat.country || '' });
    }
  }

  let keyframeTimeA = 0;
  let keyframeTimeB = 0;

  // Filters
  let yearFilter = null;    // null = show all, number = only show objects launched <= that year
  let countryFilter = null; // null = show all, Set = only show objects with country in set

  // Per-object visibility mask
  const visibleMask = {};
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
      // Skip propagation for objects hidden by filters
      if (hasActiveFilters() && !visibleMask[entry.category][entry.index]) continue;
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
    applyFilters();
  }

  function propagateNext(date) {
    for (const cat of categories) {
      posBufferA[cat].set(posBufferB[cat]);
    }
    keyframeTimeA = keyframeTimeB;
    propagateInto(posBufferB, date);
    keyframeTimeB = date.getTime();
  }

  // Track whether interpolation actually needs to run
  let lastT = -1;

  function interpolate(currentTimeMs) {
    const duration = keyframeTimeB - keyframeTimeA;
    const t = duration > 0
      ? Math.max(0, Math.min(1, (currentTimeMs - keyframeTimeA) / duration))
      : 1;

    // Skip only if t is truly identical (e.g. paused)
    if (t === lastT && !hasActiveFilters()) return false;
    lastT = t;

    for (const cat of categories) {
      const a = posBufferA[cat];
      const b = posBufferB[cat];
      const out = positionBuffers[cat];
      const mask = visibleMask[cat];
      const len = a.length;

      // Fast path: no filters active, skip mask check
      if (!hasActiveFilters()) {
        for (let i = 0; i < len; i++) {
          out[i] = a[i] + (b[i] - a[i]) * t;
        }
      } else {
        for (let i = 0, m = 0; i < len; i += 3, m++) {
          if (mask[m]) {
            out[i]     = a[i]     + (b[i]     - a[i])     * t;
            out[i + 1] = a[i + 1] + (b[i + 1] - a[i + 1]) * t;
            out[i + 2] = a[i + 2] + (b[i + 2] - a[i + 2]) * t;
          } else {
            out[i] = 0;
            out[i + 1] = 0;
            out[i + 2] = 0;
          }
        }
      }
    }
    return true;
  }

  function applyFilters() {
    const hasYear = yearFilter !== null;
    const hasCountry = countryFilter !== null;

    if (!hasYear && !hasCountry) {
      for (const cat of categories) {
        visibleMask[cat].fill(1);
      }
    } else {
      for (const entry of allSats) {
        const { category, index, launchYear, country } = entry;
        let visible = true;

        if (hasYear) {
          visible = launchYear > 0 && launchYear <= yearFilter;
        }
        if (visible && hasCountry) {
          const group = countryFilter.lookup.get(country);
          if (group) {
            visible = countryFilter.groups.has(group);
          } else {
            // Not in any named group — visible only if "OTHER" is selected
            visible = countryFilter.groups.has('OTHER');
          }
        }

        visibleMask[category][index] = visible ? 1 : 0;
      }
    }
  }

  function setYearFilter(year) {
    yearFilter = year;
    applyFilters();
  }

  function setCountryFilter(filter) {
    // filter: null (show all) or { groups: Set of group codes, lookup: Map of country→group }
    countryFilter = filter;
    applyFilters();
  }

  function getYearFilter() {
    return yearFilter;
  }

  function getCountryFilter() {
    return countryFilter;
  }

  function hasActiveFilters() {
    return yearFilter !== null || countryFilter !== null;
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
    return hasActiveFilters() ? getFilteredCounts() : { ...counts };
  }

  return { propagateAll, propagateNext, interpolate, getPositionBuffers, getAltitudes, getCounts, setYearFilter, getYearFilter, setCountryFilter, getCountryFilter };
}
