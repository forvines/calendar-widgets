import { errorResponse, jsonResponse } from './response.js';
import { ServiceError } from './service.js';
import { fetchCalendarData, hasGoogleCredentials } from './google-calendar.js';
import { fetchAviationData, hasCheckwxCredentials } from './aviation.js';

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function handleApiRequest(request, env = {}, services = {}) {
  const url = new URL(request.url);

  if (!ALLOWED_METHODS.has(request.method)) {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'This API route is read-only.', {
      Allow: 'GET, HEAD, OPTIONS',
    });
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { Allow: 'GET, HEAD, OPTIONS' },
    });
  }

  if (url.pathname === '/api/health') {
    return jsonResponse({
      status: 'ok',
      version: env.DEPLOYMENT_VERSION || 'development',
      services: {
        calendarConfigured: hasGoogleCredentials(env),
        aviationConfigured: hasCheckwxCredentials(env),
      },
    }, { method: request.method });
  }

  if (url.pathname === '/api/calendar') {
    const denied = enforceAccess(request, env, url);
    if (denied) return denied;
    const range = parseRange(url.searchParams);
    if (!range) {
      return errorResponse(400, 'INVALID_DATE_RANGE', 'Provide valid start and end timestamps spanning no more than 90 days.', {}, {
        method: request.method,
      });
    }
    return runService(
      () => (services.fetchCalendarData || fetchCalendarData)(env, range),
      'CALENDAR_SERVICE_FAILED',
      'Calendar data could not be loaded.',
      request.method,
    );
  }

  if (url.pathname === '/api/aviation') {
    const denied = enforceAccess(request, env, url);
    if (denied) return denied;
    return runService(
      () => (services.fetchAviationData || fetchAviationData)(env),
      'AVIATION_SERVICE_FAILED',
      'Aviation weather data could not be loaded.',
      request.method,
    );
  }

  return errorResponse(404, 'API_ROUTE_NOT_FOUND', 'The requested API route does not exist.', {}, {
    method: request.method,
  });
}

// Access gate for the data routes. When ACCESS_TOKEN is configured (deployed),
// the request must carry a matching ?k=<token>; otherwise it is rejected. When
// ACCESS_TOKEN is unset (local development), the gate is disabled. /api/health
// is intentionally left open as a liveness probe. Returns a Response to send
// when access is denied, or null when the request may proceed.
function enforceAccess(request, env, url) {
  const expected = typeof env.ACCESS_TOKEN === 'string' ? env.ACCESS_TOKEN.trim() : '';
  if (!expected) return null; // gate disabled when no token configured

  const provided = url.searchParams.get('k') || '';
  if (constantTimeEquals(provided, expected)) return null;

  return errorResponse(403, 'ACCESS_DENIED', 'A valid access token is required.', {}, {
    method: request.method,
  });
}

// Length-independent constant-time string comparison to avoid leaking the
// token via response timing.
function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// Runs a backend service call and turns the outcome into a JSON response. A
// ServiceError becomes its own status/code; any other thrown value becomes a
// generic fallback so upstream internals never leak to the client.
async function runService(run, fallbackCode, fallbackMessage, method) {
  try {
    const data = await run();
    return jsonResponse(data, { method });
  } catch (error) {
    if (error instanceof ServiceError) {
      return errorResponse(error.status, error.code, error.message, {}, { method });
    }
    return errorResponse(502, fallbackCode, fallbackMessage, {}, { method });
  }
}

function parseRange(params) {
  const start = new Date(params.get('start') || '');
  const end = new Date(params.get('end') || '');
  const duration = end.getTime() - start.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 90 * 24 * 60 * 60 * 1000) return null;
  return { start, end };
}
