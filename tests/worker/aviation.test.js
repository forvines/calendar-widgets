import { describe, expect, it, vi } from 'vitest';
import { fetchAviationData, hasCheckwxCredentials } from '../../worker/aviation.js';
import { ServiceError } from '../../worker/service.js';

const env = { CHECKWX_API_KEY: 'checkwx-test-key' };

describe('CheckWX aviation service', () => {
  it('reports whether the CheckWX key is configured', () => {
    expect(hasCheckwxCredentials(env)).toBe(true);
    expect(hasCheckwxCredentials({})).toBe(false);
    expect(hasCheckwxCredentials({ CHECKWX_API_KEY: '   ' })).toBe(false);
  });

  it('fetches decoded METAR and TAF using the server-held key', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ data: [{ icao: 'KPLU', raw_text: 'KPLU METAR' }] }))
      .mockResolvedValueOnce(json({ data: [{ icao: 'KTCM', raw_text: 'KTCM TAF' }] }));

    const result = await fetchAviationData(env, fetchMock);

    expect(result.metar).toEqual([{ icao: 'KPLU', raw_text: 'KPLU METAR' }]);
    expect(result.taf).toEqual([{ icao: 'KTCM', raw_text: 'KTCM TAF' }]);
    expect(result.stations).toEqual({ metar: ['KPLU'], taf: ['KTCM'] });

    // Key travels in the header, never the URL, and the request targets CheckWX.
    const [metarUrl, metarInit] = fetchMock.mock.calls[0];
    expect(metarUrl).toBe('https://api.checkwx.com/v2/metar/KPLU/decoded');
    expect(metarUrl).not.toContain('checkwx-test-key');
    expect(metarInit.headers['X-API-Key']).toBe('checkwx-test-key');
  });

  it('honors a server-side station list with multiple stations', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(json({ data: [{ icao: 'X' }] })));

    const result = await fetchAviationData(env, fetchMock, {
      metar: ['KPLU', 'KSEA'],
      taf: ['KTCM'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.metar).toHaveLength(2);
    expect(result.taf).toHaveLength(1);
  });

  it('throws AVIATION_NOT_CONFIGURED when the key is missing', async () => {
    const fetchMock = vi.fn();
    await expect(fetchAviationData({}, fetchMock)).rejects.toMatchObject({
      code: 'AVIATION_NOT_CONFIGURED',
      status: 503,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps an upstream CheckWX failure to a typed service error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ error: 'bad key' }, 401));
    await expect(fetchAviationData(env, fetchMock)).rejects.toMatchObject({
      code: 'AVIATION_UPSTREAM_FAILED',
      status: 502,
    });
    await expect(fetchAviationData(env, fetchMock)).rejects.toBeInstanceOf(ServiceError);
  });

  it('maps a network error to a typed service error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(fetchAviationData(env, fetchMock)).rejects.toMatchObject({
      code: 'AVIATION_UPSTREAM_FAILED',
    });
  });
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
