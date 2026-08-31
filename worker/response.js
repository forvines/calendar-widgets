const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

export function jsonResponse(body, { status = 200, headers = {}, method = 'GET' } = {}) {
  return new Response(method === 'HEAD' ? null : JSON.stringify(body), {
    status,
    headers: {
      ...SECURITY_HEADERS,
      ...headers,
    },
  });
}

export function errorResponse(status, code, message, headers = {}, options = {}) {
  return jsonResponse({
    error: {
      code,
      message,
    },
  }, {
    status,
    headers,
    method: options.method,
  });
}
