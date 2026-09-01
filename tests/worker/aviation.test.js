import { describe, expect, it, vi } from 'vitest';
import {
  FORCE_FLOOR_SECONDS,
  TTL_SECONDS,
  fetchAviationData,
  hasCheckwxCredentials,
} from '../../worker/aviation.js';
import { ServiceError } from '../../worker/service.js';

// aviationweather.gov needs no credential.
const env = {};

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

// AWC METAR array shape.
function awcMetar(icaoId = 'KPLU') {
  return [{
    icaoId, name: 'Test Field', rawOb: `METAR ${icaoId} ...`, fltCat: 'VFR',
    wdir: 240, wspd: 8, visib: '10+', clouds: [{ cover: 'FEW', base: 25000 }], temp: 14, dewp: 9,
  }];
}
function awcTaf(icaoId = 'KTCM') {
  return [{
    icaoId, name: 'Test AFB', rawTAF: `TAF ${icaoId} ...`,
    validTimeFrom: 1788267600, validTimeTo: 1788375600,
    fcsts: [{ fcstChange: 'INITIAL', timeFrom: 1788267600, wdir: 220, wspd: 5, visib: '6+', clouds: [{ cover: 'BKN', base: 3500 }] }],
  }];
}

describe('Aviation service (aviationweather.gov)', () => {
  it('requires no credential (a provided key is ignored)', () => {
    expect(hasCheckwxCredentials()).toBe(true);
    expect(hasCheckwxCredentials({})).toBe(true);
    expect(hasCheckwxCredentials({ CHECKWX_API_KEY: 'anything' })).toBe(true);
  });

  it('fetches and normalizes METAR + TAF on a cold cache', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(awcMetar()))
      .mockResolvedValueOnce(jsonResponse(awcTaf()));
    const store = makeStore();
    const now = 1_000_000_000_000;

    const result = await fetchAviationData(env, { store, now, fetchImpl, stations: { metar: ['KPLU'], taf: ['KTCM'] } });

    // Normalized to the CheckWX-shaped fields the widgets consume.
    expect(result.metar[0]).toMatchObject({
      icao: 'KPLU',
      flight_category: 'VFR',
      wind: { degrees: 240, speed: { kts: 8 } },
      raw_text: 'METAR KPLU ...',
    });
    expect(result.metar[0].visibility.miles).toBe(10);
    expect(result.metar[0].clouds).toEqual([{ code: 'FEW', feet: 25000 }]);
    expect(result.taf[0]).toMatchObject({ icao: 'KTCM', raw_text: 'TAF KTCM ...' });
    expect(result.taf[0].forecast[0].wind).toEqual({ degrees: 220, speed: { kts: 5 } });
    // hits the correct AWC URLs, no api key header
    expect(fetchImpl.mock.calls[0][0]).toContain('aviationweather.gov/api/data/metar?ids=KPLU');
    expect(fetchImpl.mock.calls[1][0]).toContain('aviationweather.gov/api/data/taf?ids=KTCM');
  });

  it('serves fresh cache without hitting upstream', async () => {
    const now = 1_000_000_000_000;
    const store = makeStore({
      'aviation:metar': { data: [{ icao: 'CACHED' }], cachedAt: now - 60 * 1000 },
      'aviation:taf': { data: [{ icao: 'CACHEDTAF' }], cachedAt: now - 60 * 1000 },
    });
    const fetchImpl = vi.fn();
    const result = await fetchAviationData(env, { store, now, fetchImpl });
    expect(result.metar).toEqual([{ icao: 'CACHED' }]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refetches METAR after its TTL expires', async () => {
    const now = 1_000_000_000_000;
    const store = makeStore({
      'aviation:metar': { data: [{ icao: 'OLD' }], cachedAt: now - (TTL_SECONDS.metar + 60) * 1000 },
    });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(awcMetar('KFRESH')));
    const result = await fetchAviationData(env, { type: 'metar', store, now, fetchImpl, stations: { metar: ['KPLU'], taf: ['KTCM'] } });
    expect(result.metar[0].icao).toBe('KFRESH');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('force refresh respects the floor', async () => {
    const now = 1_000_000_000_000;
    const store = makeStore({
      'aviation:metar': { data: [{ icao: 'FRESH' }], cachedAt: now - 60 * 1000 },
    });
    const fetchImpl = vi.fn();
    const result = await fetchAviationData(env, { type: 'metar', force: true, store, now, fetchImpl });
    expect(result.meta.metar.refetched).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('force refresh refetches once past the floor', async () => {
    const now = 1_000_000_000_000;
    const store = makeStore({
      'aviation:metar': { data: [{ icao: 'OLD' }], cachedAt: now - (FORCE_FLOOR_SECONDS + 60) * 1000 },
    });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(awcMetar('KFRESH')));
    const result = await fetchAviationData(env, { type: 'metar', force: true, store, now, fetchImpl });
    expect(result.meta.metar.refetched).toBe(true);
  });

  it('type=metar only fetches metar', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(awcMetar()));
    const result = await fetchAviationData(env, { type: 'metar', store: makeStore(), now: 1e12, fetchImpl, stations: { metar: ['KPLU'], taf: ['KTCM'] } });
    expect(result.metar).toBeDefined();
    expect(result.taf).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('treats a 204 (no data) as an empty report set', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const result = await fetchAviationData(env, { type: 'metar', store: makeStore(), now: 1e12, fetchImpl });
    expect(result.metar).toEqual([]);
  });

  it('serves stale cache when upstream fails', async () => {
    const now = 1_000_000_000_000;
    const store = makeStore({
      'aviation:metar': { data: [{ icao: 'STALE' }], cachedAt: now - (TTL_SECONDS.metar + 600) * 1000 },
    });
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'boom' }, 500));
    const result = await fetchAviationData(env, { type: 'metar', store, now, fetchImpl });
    expect(result.metar).toEqual([{ icao: 'STALE' }]);
  });

  it('propagates an upstream failure when there is no cache to fall back on', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'boom' }, 500));
    await expect(fetchAviationData(env, { type: 'metar', store: makeStore(), now: 1e12, fetchImpl }))
      .rejects.toBeInstanceOf(ServiceError);
  });
});
