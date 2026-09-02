import { ServiceError, readJson } from './service.js';
import { normalizeMetar, normalizeTaf } from './aviation-awc.js';

// Aviation weather comes from aviationweather.gov (NWS Aviation Weather Center):
// free, no API key, 100 requests/minute, and the authoritative source. Requests
// are made server-to-server from the Worker (AWC does not allow browser CORS)
// and normalized to the shape aviation-core.js expects.
const AWC_API = 'https://aviationweather.gov/api/data';

// Server-side station configuration. Defined on the server so the widget cannot
// request arbitrary stations. To add or change stations, edit this list.
export const STATIONS = {
  metar: ['KPLU', 'KRNT', 'KTIW', 'KOLM', 'KCLS'],
  taf: ['KTCM'],
};

// Per-report caching keeps the widget a polite API citizen (and would cap usage
// even if the source ever imposed a hard quota). METAR changes hourly (30-min
// freshness is plenty); TAF is issued every ~6 hours (4-hr is plenty). A forced
// (interaction) refresh will not refetch a copy younger than FORCE_FLOOR.
export const TTL_SECONDS = { metar: 30 * 60, taf: 4 * 60 * 60 };
export const FORCE_FLOOR_SECONDS = 5 * 60;

// Aviation needs no credential. A CHECKWX_API_KEY, if present, is ignored.
export function hasCheckwxCredentials() {
  return true;
}

// Loads aviation data, using the cache to stay within the CheckWX quota.
// options:
//   type    'metar' | 'taf' | undefined (both)
//   force   bypass TTL for the requested type(s), still bounded by FORCE_FLOOR
//   store   { get(key) -> {data, cachedAt}|null, put(key, entry) } (injectable)
//   now     current epoch ms (injectable for tests)
//   fetchImpl, stations
export async function fetchAviationData(env, options = {}) {
  const {
    type,
    force = false,
    store = memoryStore,
    now = Date.now(),
    fetchImpl = fetch,
    stations = STATIONS,
  } = options;

  const wantMetar = !type || type === 'metar';
  const wantTaf = !type || type === 'taf';

  const result = { stations };
  const meta = {};

  const jobs = [];
  if (wantMetar) {
    jobs.push(resolveReports('metar', stations.metar, { force, store, now, fetchImpl })
      .then(({ data, cachedAt, refetched }) => { result.metar = data; meta.metar = { cachedAt, ageSeconds: Math.round((now - cachedAt) / 1000), refetched }; }));
  }
  if (wantTaf) {
    jobs.push(resolveReports('taf', stations.taf, { force, store, now, fetchImpl })
      .then(({ data, cachedAt, refetched }) => { result.taf = data; meta.taf = { cachedAt, ageSeconds: Math.round((now - cachedAt) / 1000), refetched }; }));
  }
  await Promise.all(jobs);

  result.meta = meta;
  return result;
}

// Returns cached reports for a type when fresh, otherwise refetches and stores.
async function resolveReports(kind, icaos, { force, store, now, fetchImpl }) {
  const key = `aviation:${kind}`;
  const ttlMs = TTL_SECONDS[kind] * 1000;
  const floorMs = FORCE_FLOOR_SECONDS * 1000;

  const cached = await store.get(key);
  if (cached) {
    const age = now - cached.cachedAt;
    // Use the cache when within TTL, or when a force refresh is inside the floor
    // (so interaction cannot exceed the quota).
    if ((!force && age < ttlMs) || (force && age < floorMs)) {
      return { data: cached.data, cachedAt: cached.cachedAt, refetched: false };
    }
  }

  try {
    const data = await fetchReports(kind, icaos, fetchImpl);
    await store.put(key, { data, cachedAt: now });
    return { data, cachedAt: now, refetched: true };
  } catch (err) {
    // On an upstream failure, serve stale cache if we have any rather than error.
    if (cached) return { data: cached.data, cachedAt: cached.cachedAt, refetched: false };
    throw err;
  }
}

// Fetches one report type from AWC for the given stations (one request per
// station) and normalizes each into the CheckWX-shaped object.
async function fetchReports(kind, icaos, fetchImpl) {
  const list = Array.isArray(icaos) ? icaos : [];
  const normalize = kind === 'metar' ? normalizeMetar : normalizeTaf;
  const groups = await Promise.all(
    list.map(icao => fetchReport(kind, icao, fetchImpl)),
  );
  return groups.flat().map(normalize).filter(Boolean);
}

async function fetchReport(kind, icao, fetchImpl) {
  const url = `${AWC_API}/${kind}?ids=${encodeURIComponent(icao)}&format=json`;
  let response;
  try {
    response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new ServiceError(502, 'AVIATION_UPSTREAM_FAILED', 'Aviation weather data could not be loaded.');
  }

  // 204 = valid request, no data currently available for the station.
  if (response.status === 204) return [];
  if (!response.ok) {
    throw new ServiceError(502, 'AVIATION_UPSTREAM_FAILED', 'Aviation weather data could not be loaded.');
  }

  const body = await readJson(response);
  return Array.isArray(body) ? body : [];
}

// Default in-process store. On a Worker this persists only for the isolate's
// lifetime; createCacheStore (below) wraps the durable Cache API in production.
const memoryMap = new Map();
const memoryStore = {
  async get(key) { return memoryMap.get(key) || null; },
  async put(key, entry) { memoryMap.set(key, entry); },
};

// Wraps the Cloudflare Cache API as a { get, put } store. Entries are stored as
// JSON responses with the cachedAt timestamp embedded.
export function createCacheStore(cache) {
  const base = 'https://aviation-cache.local/';
  return {
    async get(key) {
      const res = await cache.match(base + key);
      if (!res) return null;
      try { return await res.json(); } catch { return null; }
    },
    async put(key, entry) {
      const res = new Response(JSON.stringify(entry), {
        headers: { 'Content-Type': 'application/json' },
      });
      await cache.put(base + key, res);
    },
  };
}

// A two-tier store: a process-lifetime memory map in front of a durable backing
// store (the Cache API in production). The memory tier makes repeated requests
// to the same isolate cache-hit even where the Cache API is a no-op (e.g.
// `wrangler dev`); the backing tier persists across isolates at the edge.
export function createLayeredStore(backing) {
  return {
    async get(key) {
      const mem = memoryMap.get(key);
      if (mem) return mem;
      if (backing) {
        const b = await backing.get(key);
        if (b) { memoryMap.set(key, b); return b; }
      }
      return null;
    },
    async put(key, entry) {
      memoryMap.set(key, entry);
      if (backing) await backing.put(key, entry);
    },
  };
}
