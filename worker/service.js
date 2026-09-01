// Shared building blocks for the Worker's backend service modules
// (google-calendar.js, aviation.js). Keeping the error type and the
// defensive JSON parse in one place avoids each service re-declaring an
// identical copy.

// A failure a service module wants surfaced to the client with a specific HTTP
// status and stable error code. The router maps these to a JSON error envelope;
// any other thrown value becomes a generic 502.
export class ServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Parse a response body as JSON, returning {} rather than throwing on empty or
// non-JSON bodies. Upstream error responses are frequently empty or HTML, and
// callers decide what to do based on response.ok, not on parse success.
export async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}
