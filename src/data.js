import { parseTLE } from './utils.js';

// ─── STATION NORAD IDs ─────────────────────────────────────────────────────
// Known space stations — always categorized as 'station' regardless of source
const STATION_IDS = new Set([
  25544,  // ISS
  48274,  // CSS (Tianhe)
  53239,  // CSS (Wentian)
  54216,  // CSS (Mengtian)
]);

// ─── Categorize by TLE object name ──────────────────────────────────────────
function categorizeByName(name, noradId) {
  if (STATION_IDS.has(noradId)) return 'station';

  const upper = name.toUpperCase();

  // Debris: names containing DEB, DEBRIS, or "OBJECT" fragments
  if (upper.includes(' DEB') || upper.includes('DEBRIS')) return 'debris';

  // Rocket bodies
  if (upper.includes(' R/B') || upper.includes('ROCKET BODY') || upper.endsWith(' R/B')) return 'rocketBody';

  // Analyst / unknown objects
  if (upper.startsWith('ANALYST') || upper.startsWith('TBA ')) return 'debris';

  return 'active';
}

// ─── Celestrak fallback groups ──────────────────────────────────────────────
const TLE_SOURCES = [
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle', category: 'active', label: 'ACTIVE SATELLITES' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=fengyun-1c-debris&FORMAT=tle', category: 'debris', label: 'FENGYUN-1C DEBRIS' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-2251-debris&FORMAT=tle', category: 'debris', label: 'COSMOS-2251 DEBRIS' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-33-debris&FORMAT=tle', category: 'debris', label: 'IRIDIUM-33 DEBRIS' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=cosmos-1408-debris&FORMAT=tle', category: 'debris', label: 'COSMOS-1408 DEBRIS' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=analyst&FORMAT=tle', category: 'debris', label: 'ANALYST OBJECTS' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=last-30-days&FORMAT=tle', category: 'active', label: 'RECENTLY LAUNCHED' },
  { url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle', category: 'station', label: 'STATIONS' },
];

// ─── Fetch helpers ──────────────────────────────────────────────────────────

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

// ─── Main fetch ─────────────────────────────────────────────────────────────

export async function fetchAllTLEs(onProgress) {
  const result = {
    active: [],
    debris: [],
    rocketBody: [],
    station: [],
    all: [],
  };

  // 1. Try local full TLE catalog (pre-downloaded from Space-Track.org)
  const fullCatalog = await tryLoadFullCatalog(onProgress);
  if (fullCatalog) { fullCatalog.source = 'SPACE-TRACK.ORG'; return fullCatalog; }

  // 2. Try AstriaGraph catalog, then supplement with Celestrak live data
  const astriaCatalog = await tryLoadAstriaCatalog(onProgress);

  // 3. Fetch Celestrak groups (as primary if no Astria, or supplement if Astria loaded)
  const baseResult = astriaCatalog || result;
  const seenIds = new Set();

  // Index existing IDs from AstriaGraph
  if (astriaCatalog) {
    for (const rec of astriaCatalog.all) {
      const id = rec.satrec?.satnum;
      if (id) seenIds.add(id);
    }
    console.log(`AstriaGraph loaded ${astriaCatalog.all.length} objects, supplementing with Celestrak...`);
  }

  const totalGroups = TLE_SOURCES.length;
  let celestrakAdded = 0;

  for (let i = 0; i < TLE_SOURCES.length; i++) {
    const source = TLE_SOURCES[i];
    const cacheKey = getCacheKey(source);

    let text = getCached(cacheKey);
    if (!text) {
      try {
        text = await fetchWithFallback(source.url);
        setCache(cacheKey, text);
      } catch (err) {
        console.warn(`Failed to fetch ${source.label}:`, err.message);
        if (onProgress) onProgress((i + 1) / totalGroups, 1, source.label);
        continue;
      }
    }

    const records = parseTLE(text, source.category);

    for (const record of records) {
      const noradId = record.satrec?.satnum;
      if (noradId && seenIds.has(noradId)) continue; // skip if already from Astria
      if (noradId) seenIds.add(noradId);

      baseResult[source.category].push(record);
      baseResult.all.push(record);
      celestrakAdded++;
    }

    if (onProgress) {
      const astriaSteps = astriaCatalog ? 1 : 0;
      onProgress((i + 1 + astriaSteps) / (totalGroups + astriaSteps), 1, source.label);
    }
  }

  console.log(`Total: ${baseResult.all.length} objects (Celestrak added ${celestrakAdded} new)`);
  baseResult.source = astriaCatalog ? 'ASTRIAGRAPH + CELESTRAK' : 'CELESTRAK';
  return baseResult;
}

// ─── Full catalog loader ────────────────────────────────────────────────────

async function tryLoadFullCatalog(onProgress) {
  try {
    if (onProgress) onProgress(0, 1, 'CHECKING LOCAL CATALOG...');

    const res = await fetch('/data/full-catalog.tle');
    if (!res.ok) return null;

    const text = await res.text();
    // Validate it's actually TLE data (not an HTML error page)
    if (!text || text.length < 200 || !text.includes('1 ') || text.includes('<!DOCTYPE')) return null;

    console.log('Found local full-catalog.tle, parsing...');
    if (onProgress) onProgress(0.3, 1, 'PARSING FULL CATALOG...');

    // Parse all TLEs without a preset category
    const allRecords = parseTLE(text, 'active'); // temporary category

    const result = {
      active: [],
      debris: [],
      rocketBody: [],
      station: [],
      all: [],
    };

    // Re-categorize each object by its name
    for (const record of allRecords) {
      const noradId = record.satrec?.satnum || 0;
      const category = categorizeByName(record.name, noradId);
      record.category = category;

      result[category].push(record);
      result.all.push(record);
    }

    if (onProgress) onProgress(1, 1, 'FULL CATALOG LOADED');

    console.log(
      `Full catalog: ${result.all.length} objects ` +
      `(${result.active.length} active, ${result.debris.length} debris, ` +
      `${result.rocketBody.length} rocket bodies, ${result.station.length} stations)`
    );

    return result;
  } catch {
    return null;
  }
}

// ─── AstriaGraph catalog loader ─────────────────────────────────────────────
// Format: array of [noradId, name, orbitType, sma(m), ecc, inc(rad), raan(rad), argp(rad), ma(rad), epoch, country, launchDate, launchMass]

async function tryLoadAstriaCatalog(onProgress) {
  try {
    if (onProgress) onProgress(0, 1, 'CHECKING ASTRIA CATALOG...');

    const res = await fetch('/data/astria-catalog.json');
    if (!res.ok) return null;

    const data = await res.json();
    if (!Array.isArray(data) || data.length < 100) return null;

    console.log(`Found astria-catalog.json with ${data.length} objects, parsing...`);
    if (onProgress) onProgress(0.3, 1, 'PARSING ASTRIA CATALOG...');

    const result = {
      active: [],
      debris: [],
      rocketBody: [],
      station: [],
      all: [],
    };

    for (const entry of data) {
      const [noradId, name, orbitType, sma, ecc, inc, raan, argp, ma, epoch, country, launchDate, launchMass] = entry;

      const category = categorizeByName(name, noradId);

      const record = {
        name,
        category,
        country: country || '',
        launchDate: launchDate || '',
        launchMass: launchMass || '',
        satrec: { satnum: noradId },
        kepler: {
          sma, ecc, inc, raan, argp, ma,
          epochMs: new Date(epoch).getTime(),
        },
      };

      result[category].push(record);
      result.all.push(record);
    }

    if (onProgress) onProgress(1, 1, 'ASTRIA CATALOG LOADED');

    console.log(
      `AstriaGraph: ${result.all.length} objects ` +
      `(${result.active.length} active, ${result.debris.length} debris, ` +
      `${result.rocketBody.length} rocket bodies, ${result.station.length} stations)`
    );

    return result;
  } catch (err) {
    console.warn('AstriaGraph catalog load failed:', err);
    return null;
  }
}
