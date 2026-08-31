import { describe, expect, it } from 'vitest';
import { handleApiRequest } from '../../worker/router.js';

describe('Worker API router', () => {
  it('reports deployment and configured-service state', async () => {
    const response = handleApiRequest(new Request('https://example.test/api/health'), {
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
    const response = handleApiRequest(new Request('https://example.test/api/health', {
      method: 'HEAD',
    }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('rejects mutation methods', async () => {
    const response = handleApiRequest(new Request('https://example.test/api/health', {
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
    const response = handleApiRequest(new Request('https://example.test/api/missing'));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('API_ROUTE_NOT_FOUND');
  });
});
