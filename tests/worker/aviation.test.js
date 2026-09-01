import { describe, expect, it, vi } from 'vitest';
import {
  FORCE_FLOOR_SECONDS,
  TTL_SECONDS,
  fetchAviationData,
  hasCheckwxCredentials,
} from '../../worker/aviation.js';
import { ServiceError } from '../../worker/service.js';

const env = { CHECKWX_API_KEY: 'checkwx-test-key' };

// Simple in-memory store matching the { get, put } interface.
function makeStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async get(key) { return map.get(key) || null; },
    async put(key, entry) { map.set(key, entry); },
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// A fetch mock that returns decoded data for any metar/taf path.
function upstream(icao = 'X') {
  return vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ data: [{ icao }] })));
}

describe('CheckWX aviation service', () => {
  it('reports whether the CheckWX key is configured', () => {
    expect(hasCheckwxCredentials(env)).toBe(true);
    expect(hasCheckwxCredentials({})).toBe(false);
    expect(hasCheckwxCredentials({ CHECKWX_API_KEY: '   ' })).toBe(false);
  });

  it('fetches both reports on a cold cache and stores them', async () => {
    const store = makeStore();
    const fetchImpl = upstream();
    const now = 1_000_000_000_000;

    const result = await fetchAviationData(env, { store, now, fetchImpl });

    expect(result.metar).toEqual([{ icao: 'X' }]);
    expect(result.taf).toEqual([{ icao: 'X' }]);
    expect(result.meta.metar.refetched).toBe(true);
    expect(result.meta.taf.refetched).toBe(true);
    // metar (1 station) + taf (1 station) = 2 upstream calls
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(store.map.get('aviation:metar').cachedAt).toBe(now);
  });

  it('serves fresh cache without hitting upstream', async () => {
    const now = 1_000_000_000_000;
    const store = makeStore({
      'aviation:metar': { data: [{ icao: 'CACHED' }], cachedAt: now - 60 * 1000 }, // 1 min old
      'aviation:taf': { data: [{ icao: 'CACHEDTAF' }], cachedAt: now - 60 * 1000 },
    });
    const fetchImpl = upstream();

    const result = await fetchAviationData(env, { store, now, fetchImpl });

    expect(result.metar).toEqual([{ icao: 'CACHED' }]);
    expect(result.meta.metar.refetched).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refetches METAR after its TTL expires', async () => {
    const now = 1_000_000_000_000;
    const store = makeStore({
      'aviation:metar': { data: [{ icao: 'OLD' }], cachedAt: now - (TTL_SECONDS.metar + 60) * 1000 },
    });
    const fetchImpl = upstream('FRESH');

    const result = await fetchAviationData(env, { type: 'metar', store, now, fetchImpl });

    expect(result.metar).toEqual([{ icao: 'FRESH' }]);
    expect(result.meta.metar.refetched).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps TAF cached long after the METAR TTL (independent cadence)', async () => {
    const now = 1_000_000_000_000;
    const store = makeStore({
      'aviation:taf': { data: [{ icao: 'TAF' }], cachedAt: now - (TTL_SECONDS.metar + 600) * 1000 },
    });
    const fetchImpl = upstream();

    const result = await fetchAviationData(env, { type: 'taf', store, now, fetchImpl });

    expect(result.meta.taf.refetched).toBe(false); // still within 4h TAF TTL
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('force refresh respects the floor (does not refetch a very fresh copy)', async () => {
    const now = 1_000_000_000_000;
    const store = makeStore({
      'aviation:metar': { data: [{ icao: 'FRESH' }], cachedAt: now - 60 * 1000 }, // 1 min < 5 min floor
    });
    const fetchImpl = upstream();

    const result = await fetchAviationData(env, { type: 'metar', force: true, store, now, fetchImpl });

    expect(result.meta.metar.refetched).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('force refresh refetches once past the floor', async () => {
    const now = 1_000_000_000_000;
    const store = makeStore({
      'aviation:metar': { data: [{ icao: 'OLD' }], cachedAt: now - (FORCE_FLOOR_SECONDS + 60) * 1000 },
    });
    const fetchImpl = upstream('FRESH');

    const result = await fetchAviationData(env, { type: 'metar', force: true, store, now, fetchImpl });

    expect(result.meta.metar.refetched).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('type=metar only fetches metar', async () => {
    const store = makeStore();
    const fetchImpl = upstream();
    const result = await fetchAviationData(env, { type: 'metar', store, now: 1e12, fetchImpl });
    expect(result.metar).toBeDefined();
    expect(result.taf).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('serves stale cache when upstream fails', async () => {
    const now = 1_000_000_000_000;
    const store = makeStore({
      'aviation:metar': { data: [{ icao: 'STALE' }], cachedAt: now - (TTL_SECONDS.metar + 600) * 1000 },
    });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'bad' }, 500));

    const result = await fetchAviationData(env, { type: 'metar', store, now, fetchImpl });

    expect(result.metar).toEqual([{ icao: 'STALE' }]); // fell back to stale
  });

  it('throws AVIATION_NOT_CONFIGURED when the key is missing', async () => {
    await expect(fetchAviationData({}, { store: makeStore(), fetchImpl: vi.fn() }))
      .rejects.toMatchObject({ code: 'AVIATION_NOT_CONFIGURED' });
  });

  it('propagates an upstream failure when there is no cache to fall back on', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'bad' }, 401));
    await expect(fetchAviationData(env, { type: 'metar', store: makeStore(), now: 1e12, fetchImpl }))
      .rejects.toBeInstanceOf(ServiceError);
  });
});
