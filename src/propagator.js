import * as satellite from 'satellite.js';
import { eciToScene, altitudeFromEci } from './utils.js';
import { VISUAL_CONFIG } from './config.js';

export function createPropagator(categorizedData) {
  const categories = ['active', 'debris', 'rocketBody', 'station'];

  // Pre-allocate typed arrays for each category
  const posBufferA = {};   // keyframe A (current propagation)
  const posBufferB = {};   // keyframe B (next propagation)
  const positionBuffers = {}; // interpolated output (what particles read)
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

  // Build a flat list of all satellites
  const allSats = [];
  for (const cat of categories) {
    const satList = categorizedData[cat] || [];
    for (let i = 0; i < satList.length; i++) {
      allSats.push({ sat: satList[i], category: cat, index: i });
    }
  }

  let batchIndex = 0;
  let keyframeTimeA = 0; // ms timestamp of keyframe A
  let keyframeTimeB = 0; // ms timestamp of keyframe B

  function propagateInto(targetBuffers, date) {
    const gmst = satellite.gstime(date);

    for (const entry of allSats) {
      const { sat, category, index } = entry;
      const buf = targetBuffers[category];
      const altArr = altitudeBuffers[category];
      const offset = index * 3;

      const pv = satellite.propagate(sat.satrec, date);
      const posEci = pv.position;

      if (!posEci || isNaN(posEci.x) || isNaN(posEci.y) || isNaN(posEci.z)) {
        buf[offset] = 0;
        buf[offset + 1] = 0;
        buf[offset + 2] = 0;
        altArr[index] = 0;
        continue;
      }

      const scenePos = eciToScene(posEci, gmst);
      buf[offset] = scenePos.x;
      buf[offset + 1] = scenePos.y;
      buf[offset + 2] = scenePos.z;

      altArr[index] = altitudeFromEci(posEci);
    }
  }

  // Initial propagation: fill both keyframes with the same data
  function propagateAll(date) {
    propagateInto(posBufferA, date);
    // Copy A into B and output so everything is consistent
    for (const cat of categories) {
      posBufferB[cat].set(posBufferA[cat]);
      positionBuffers[cat].set(posBufferA[cat]);
    }
    keyframeTimeA = date.getTime();
    keyframeTimeB = date.getTime();
  }

  // Compute next keyframe B at a future time
  function propagateNext(date) {
    // Swap: current B becomes A
    for (const cat of categories) {
      posBufferA[cat].set(posBufferB[cat]);
    }
    keyframeTimeA = keyframeTimeB;

    // Propagate new B
    propagateInto(posBufferB, date);
    keyframeTimeB = date.getTime();
  }

  // Linearly interpolate between keyframe A and B, write into positionBuffers
  function interpolate(currentTimeMs) {
    const duration = keyframeTimeB - keyframeTimeA;
    // Avoid division by zero; if keyframes are same time, just use B
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
    return {
      active: positionBuffers.active,
      debris: positionBuffers.debris,
      rocketBody: positionBuffers.rocketBody,
      station: positionBuffers.station,
    };
  }

  function getAltitudes() {
    return {
      active: altitudeBuffers.active,
      debris: altitudeBuffers.debris,
      rocketBody: altitudeBuffers.rocketBody,
      station: altitudeBuffers.station,
    };
  }

  function getCounts() {
    return { ...counts };
  }

  return {
    propagateAll,
    propagateNext,
    interpolate,
    getPositionBuffers,
    getAltitudes,
    getCounts,
  };
}
