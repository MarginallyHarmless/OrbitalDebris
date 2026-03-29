import { parseTLE } from './utils.js';

const TLE_SOURCES = [
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle', category: 'active', label: 'ACTIVE SATELLITES' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-2251-debris&FORMAT=tle', category: 'debris', label: 'COSMOS-2251 DEBRIS' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-33-debris&FORMAT=tle', category: 'debris', label: 'IRIDIUM-33 DEBRIS' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=rocket-body&FORMAT=tle', category: 'rocketBody', label: 'ROCKET BODIES' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle', category: 'station', label: 'STATIONS' },
];

async function fetchWithFallback(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    console.warn(`Direct fetch failed for ${url}:`, err.message);
    try {
      const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
      console.warn('Trying CORS proxy...');
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
      return await res.text();
    } catch (proxyErr) {
      console.warn('CORS proxy also failed:', proxyErr.message);
      // Try local fallback
      const filename = url.split('GROUP=')[1]?.split('&')[0] || 'unknown';
      console.warn(`Attempting local fallback: /data/${filename}.tle`);
      const localRes = await fetch(`/data/${filename}.tle`);
      if (!localRes.ok) throw new Error(`Local fallback also failed for ${filename}`);
      return await localRes.text();
    }
  }
}

// localStorage cache with 4-hour TTL
const CACHE_TTL = 4 * 60 * 60 * 1000;
const CACHE_PREFIX = 'orbital_tle_';

function getCached(key) {
  try {
    const item = localStorage.getItem(CACHE_PREFIX + key);
    if (!item) return null;
    const { data, timestamp } = JSON.parse(item);
    if (Date.now() - timestamp > CACHE_TTL) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return data;
  } catch { return null; }
}

function setCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* localStorage full or unavailable */ }
}

function getCacheKey(source) {
  const group = source.url.split('GROUP=')[1]?.split('&')[0] || 'unknown';
  return `${source.category}_${group}`;
}

export async function fetchAllTLEs(onProgress) {
  const result = {
    active: [],
    debris: [],
    rocketBody: [],
    station: [],
    all: [],
  };

  const totalGroups = TLE_SOURCES.length;

  for (let i = 0; i < TLE_SOURCES.length; i++) {
    const source = TLE_SOURCES[i];
    const cacheKey = getCacheKey(source);

    let text = getCached(cacheKey);
    if (!text) {
      text = await fetchWithFallback(source.url);
      setCache(cacheKey, text);
    }

    const records = parseTLE(text, source.category);

    for (const record of records) {
      result[source.category].push(record);
      result.all.push(record);
    }

    if (onProgress) {
      onProgress(i + 1, totalGroups, source.label);
    }
  }

  return result;
}
