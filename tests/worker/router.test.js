import { describe, expect, it, vi } from 'vitest';
import { handleApiRequest } from '../../worker/router.js';
import { ServiceError } from '../../worker/service.js';

describe('Worker API router', () => {
  it('reports deployment and configured-service state', async () => {
    const response = await handleApiRequest(new Request('https://example.test/api/health'), {
      DEPLOYMENT_VERSION: 'test-commit',
      CHECKWX_API_KEY: 'configured-for-test',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      version: 'test-commit',
      services: {
        calendarConfigured: false,
        aviationConfigured: true,
      },
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('returns headers without a body for a HEAD health check', async () => {
    const response = await handleApiRequest(new Request('https://example.test/api/health', {
      method: 'HEAD',
    }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('rejects mutation methods', async () => {
    const response = await handleApiRequest(new Request('https://example.test/api/health', {
      method: 'POST',
    }));

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD, OPTIONS');
    expect(await response.json()).toEqual({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'This API route is read-only.',
      },
    });
  });

  it('returns a JSON error for unknown API routes', async () => {
    const response = await handleApiRequest(new Request('https://example.test/api/missing'));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('API_ROUTE_NOT_FOUND');
  });

  it('validates calendar ranges before loading data', async () => {
    const response = await handleApiRequest(new Request('https://example.test/api/calendar?start=bad&end=worse'));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_DATE_RANGE');
  });

  it('returns normalized calendar data from the calendar service', async () => {
    const data = { calendars: [{ id: 'family' }], events: [{ id: 'family:event' }] };
    const fetchCalendarData = vi.fn().mockResolvedValue(data);
    const response = await handleApiRequest(new Request(
      'https://example.test/api/calendar?start=2026-09-01T00:00:00Z&end=2026-10-01T00:00:00Z',
    ), {}, { fetchCalendarData });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(data);
    expect(fetchCalendarData).toHaveBeenCalledOnce();
  });

  it('serves aviation data from the injected service', async () => {
    const aviation = {
      metar: [{ icao: 'KPLU' }],
      taf: [{ icao: 'KTCM' }],
      stations: { metar: ['KPLU'], taf: ['KTCM'] },
    };
    const fetchAviationData = vi.fn().mockResolvedValue(aviation);
    const response = await handleApiRequest(
      new Request('https://example.test/api/aviation'),
      {},
      { fetchAviationData },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(aviation);
    expect(fetchAviationData).toHaveBeenCalledOnce();
  });

  it('maps an aviation service error to its status and code', async () => {
    const fetchAviationData = vi.fn().mockRejectedValue(
      new ServiceError(503, 'AVIATION_NOT_CONFIGURED', 'CheckWX credentials are not configured.'),
    );
    const response = await handleApiRequest(
      new Request('https://example.test/api/aviation'),
      {},
      { fetchAviationData },
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('AVIATION_NOT_CONFIGURED');
  });

  describe('access token gate', () => {
    const calRange = 'start=2026-09-01T00:00:00Z&end=2026-10-01T00:00:00Z';
    const data = { calendars: [], events: [] };

    it('allows data routes when no ACCESS_TOKEN is configured (local dev)', async () => {
      const fetchCalendarData = vi.fn().mockResolvedValue(data);
      const response = await handleApiRequest(
        new Request(`https://example.test/api/calendar?${calRange}`),
        {},
        { fetchCalendarData },
      );
      expect(response.status).toBe(200);
    });

    it('rejects a data route with a missing token when ACCESS_TOKEN is set', async () => {
      const fetchCalendarData = vi.fn();
      const response = await handleApiRequest(
        new Request(`https://example.test/api/calendar?${calRange}`),
        { ACCESS_TOKEN: 'secret-token' },
        { fetchCalendarData },
      );
      expect(response.status).toBe(403);
      expect((await response.json()).error.code).toBe('ACCESS_DENIED');
      expect(fetchCalendarData).not.toHaveBeenCalled();
    });

    it('rejects a data route with a wrong token', async () => {
      const response = await handleApiRequest(
        new Request(`https://example.test/api/calendar?${calRange}&k=wrong`),
        { ACCESS_TOKEN: 'secret-token' },
        { fetchCalendarData: vi.fn() },
      );
      expect(response.status).toBe(403);
    });

    it('allows a data route with the correct token', async () => {
      const fetchCalendarData = vi.fn().mockResolvedValue(data);
      const response = await handleApiRequest(
        new Request(`https://example.test/api/calendar?${calRange}&k=secret-token`),
        { ACCESS_TOKEN: 'secret-token' },
        { fetchCalendarData },
      );
      expect(response.status).toBe(200);
      expect(fetchCalendarData).toHaveBeenCalledOnce();
    });

    it('gates the aviation route the same way', async () => {
      const denied = await handleApiRequest(
        new Request('https://example.test/api/aviation'),
        { ACCESS_TOKEN: 'secret-token' },
        { fetchAviationData: vi.fn() },
      );
      expect(denied.status).toBe(403);
    });

    it('leaves /api/health open even when ACCESS_TOKEN is set', async () => {
      const response = await handleApiRequest(
        new Request('https://example.test/api/health'),
        { ACCESS_TOKEN: 'secret-token' },
      );
      expect(response.status).toBe(200);
    });
  });
});
