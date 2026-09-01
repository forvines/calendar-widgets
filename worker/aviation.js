import { ServiceError, readJson } from './service.js';

const CHECKWX_API = 'https://api.checkwx.com/v2';

// Server-side station configuration. These are defined on the server, not taken
// from the client request: the Worker holds a paid CheckWX key, so accepting
// arbitrary station codes from the browser would turn this route into an open
// relay for that credential. To add or change stations, edit this list.
export const STATIONS = {
  metar: ['KPLU'],
  taf: ['KTCM'],
};

// CheckWX allows only 200 requests/day, so each report type is cached and only
// refetched when its cached copy is older than its TTL. METAR changes hourly
// (30-min freshness is plenty); TAF is issued every ~6 hours (4-hr is plenty).
// An interaction-triggered force refresh still will not refetch a copy younger
// than FORCE_FLOOR_SECONDS, so rapid taps cannot burn the daily budget.
export const TTL_SECONDS = { metar: 30 * 60, taf: 4 * 60 * 60 };
export const FORCE_FLOOR_SECONDS = 5 * 60;

export function hasCheckwxCredentials(env = {}) {
  return typeof env.CHECKWX_API_KEY === 'string' && env.CHECKWX_API_KEY.trim().length > 0;
}

// Loads aviation data, using the cache to stay within the CheckWX quota.
// options:
//   type    'metar' | 'taf' | undefined (both)
//   force   bypass TTL for the requested type(s), still bounded by FORCE_FLOOR
//   store   { get(key) -> {data, cachedAt}|null, put(key, entry) } (injectable)
//   now     current epoch ms (injectable for tests)
//   fetchImpl, stations
export async function fetchAviationData(env, options = {}) {
  if (!hasCheckwxCredentials(env)) {
    throw new ServiceError(503, 'AVIATION_NOT_CONFIGURED', 'CheckWX credentials are not configured.');
  }

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
    jobs.push(resolveReports('metar', stations.metar, env.CHECKWX_API_KEY, { force, store, now, fetchImpl })
      .then(({ data, cachedAt, refetched }) => { result.metar = data; meta.metar = { cachedAt, ageSeconds: Math.round((now - cachedAt) / 1000), refetched }; }));
  }
  if (wantTaf) {
    jobs.push(resolveReports('taf', stations.taf, env.CHECKWX_API_KEY, { force, store, now, fetchImpl })
      .then(({ data, cachedAt, refetched }) => { result.taf = data; meta.taf = { cachedAt, ageSeconds: Math.round((now - cachedAt) / 1000), refetched }; }));
  }
  await Promise.all(jobs);

  result.meta = meta;
  return result;
}

// Returns cached reports for a type when fresh, otherwise refetches and stores.
async function resolveReports(kind, icaos, apiKey, { force, store, now, fetchImpl }) {
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
    const data = await fetchReports(kind, icaos, apiKey, fetchImpl);
    await store.put(key, { data, cachedAt: now });
    return { data, cachedAt: now, refetched: true };
  } catch (err) {
    // On an upstream failure, serve stale cache if we have any rather than error.
    if (cached) return { data: cached.data, cachedAt: cached.cachedAt, refetched: false };
    throw err;
  }
}

async function fetchReports(kind, icaos, apiKey, fetchImpl) {
  const list = Array.isArray(icaos) ? icaos : [];
  const reports = await Promise.all(
    list.map(icao => fetchReport(`/${kind}/${encodeURIComponent(icao)}/decoded`, apiKey, fetchImpl)),
  );
  return reports.flatMap(body => (Array.isArray(body.data) ? body.data : []));
}

async function fetchReport(path, apiKey, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(`${CHECKWX_API}${path}`, {
      headers: { 'X-API-Key': apiKey },
    });
  } catch {
    throw new ServiceError(502, 'AVIATION_UPSTREAM_FAILED', 'Aviation weather data could not be loaded.');
  }

  if (!response.ok) {
    throw new ServiceError(502, 'AVIATION_UPSTREAM_FAILED', 'Aviation weather data could not be loaded.');
  }

  return readJson(response);
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
