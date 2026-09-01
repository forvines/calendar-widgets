import { errorResponse, jsonResponse } from './response.js';
import {
  CalendarServiceError,
  fetchCalendarData,
  hasGoogleCredentials,
} from './google-calendar.js';
import {
  AviationServiceError,
  fetchAviationData,
  hasCheckwxCredentials,
} from './aviation.js';

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
    const range = parseRange(url.searchParams);
    if (!range) {
      return errorResponse(400, 'INVALID_DATE_RANGE', 'Provide valid start and end timestamps spanning no more than 90 days.', {}, {
        method: request.method,
      });
    }
    try {
      const loadCalendar = services.fetchCalendarData || fetchCalendarData;
      const data = await loadCalendar(env, range);
      return jsonResponse(data, { method: request.method });
    } catch (error) {
      if (error instanceof CalendarServiceError) {
        return errorResponse(error.status, error.code, error.message, {}, { method: request.method });
      }
      return errorResponse(502, 'CALENDAR_SERVICE_FAILED', 'Calendar data could not be loaded.', {}, {
        method: request.method,
      });
    }
  }

  if (url.pathname === '/api/aviation') {
    try {
      const loadAviation = services.fetchAviationData || fetchAviationData;
      const data = await loadAviation(env);
      return jsonResponse(data, { method: request.method });
    } catch (error) {
      if (error instanceof AviationServiceError) {
        return errorResponse(error.status, error.code, error.message, {}, { method: request.method });
      }
      return errorResponse(502, 'AVIATION_SERVICE_FAILED', 'Aviation weather data could not be loaded.', {}, {
        method: request.method,
      });
    }
  }

  return errorResponse(404, 'API_ROUTE_NOT_FOUND', 'The requested API route does not exist.', {}, {
    method: request.method,
  });
}

function parseRange(params) {
  const start = new Date(params.get('start') || '');
  const end = new Date(params.get('end') || '');
  const duration = end.getTime() - start.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 90 * 24 * 60 * 60 * 1000) return null;
  return { start, end };
}
