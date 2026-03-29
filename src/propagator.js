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

  const allSats = [];
  for (const cat of categories) {
    const satList = categorizedData[cat] || [];
    for (let i = 0; i < satList.length; i++) {
      allSats.push({ sat: satList[i], category: cat, index: i });
    }
  }

  let keyframeTimeA = 0;
  let keyframeTimeB = 0;

  function propagateSingle(entry, date, gmst, targetBuffers) {
    const { sat, category, index } = entry;
    const buf = targetBuffers[category];
    const altArr = altitudeBuffers[category];
    const offset = index * 3;

    let posEci = null;

    if (sat.kepler) {
      // Keplerian propagation (AstriaGraph data)
      const k = sat.kepler;
      try {
        posEci = keplerToEci(k.sma, k.ecc, k.inc, k.raan, k.argp, k.ma, k.epochMs, date.getTime());
      } catch {
        posEci = null;
      }
    } else if (sat.satrec && sat.satrec.no !== undefined) {
      // SGP4 propagation (TLE data)
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
      const len = out.length;

      for (let i = 0; i < len; i++) {
        out[i] = a[i] + (b[i] - a[i]) * t;
      }
    }
  }

  function getPositionBuffers() {
    return { active: positionBuffers.active, debris: positionBuffers.debris, rocketBody: positionBuffers.rocketBody, station: positionBuffers.station };
  }

  function getAltitudes() {
    return { active: altitudeBuffers.active, debris: altitudeBuffers.debris, rocketBody: altitudeBuffers.rocketBody, station: altitudeBuffers.station };
  }

  function getCounts() {
    return { ...counts };
  }

  return { propagateAll, propagateNext, interpolate, getPositionBuffers, getAltitudes, getCounts };
}
