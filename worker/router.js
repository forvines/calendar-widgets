import { errorResponse, jsonResponse } from './response.js';

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function handleApiRequest(request, env = {}) {
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
        calendarConfigured: hasValues(env, [
          'GOOGLE_CLIENT_ID',
          'GOOGLE_CLIENT_SECRET',
          'GOOGLE_REFRESH_TOKEN',
        ]),
        aviationConfigured: hasValues(env, ['CHECKWX_API_KEY']),
      },
    }, { method: request.method });
  }

  return errorResponse(404, 'API_ROUTE_NOT_FOUND', 'The requested API route does not exist.', {}, {
    method: request.method,
  });
}

function hasValues(env, names) {
  return names.every(name => typeof env[name] === 'string' && env[name].trim().length > 0);
}
