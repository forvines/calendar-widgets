import { ServiceError, readJson } from './service.js';

const CHECKWX_API = 'https://api.checkwx.com/v2';

// Server-side station configuration. These are defined on the server, not taken
// from the client request: the Worker holds a paid CheckWX key, so accepting
// arbitrary station codes from the browser would turn this route into an open
// relay for that credential. To add or change stations, edit this list.
export const STATIONS = {
  metar: ['KPLU'],
  taf: ['KTCM'],
};

export function hasCheckwxCredentials(env = {}) {
  return typeof env.CHECKWX_API_KEY === 'string' && env.CHECKWX_API_KEY.trim().length > 0;
}

// Returns decoded METAR and TAF reports for the configured stations. The shape
// is { metar: [...], taf: [...], stations } so the widget can render one or
// many stations without another round trip.
export async function fetchAviationData(env, fetchImpl = fetch, stations = STATIONS) {
  if (!hasCheckwxCredentials(env)) {
    throw new ServiceError(503, 'AVIATION_NOT_CONFIGURED', 'CheckWX credentials are not configured.');
  }

  const [metar, taf] = await Promise.all([
    fetchReports('metar', stations.metar, env.CHECKWX_API_KEY, fetchImpl),
    fetchReports('taf', stations.taf, env.CHECKWX_API_KEY, fetchImpl),
  ]);

  return { metar, taf, stations };
}

async function fetchReports(kind, icaos, apiKey, fetchImpl) {
  const list = Array.isArray(icaos) ? icaos : [];
  const reports = await Promise.all(
    list.map(icao => fetchReport(`/${kind}/${encodeURIComponent(icao)}/decoded`, apiKey, fetchImpl)),
  );
  // Each CheckWX decoded response carries its report(s) under `data`.
  return reports.flatMap(body => (Array.isArray(body.data) ? body.data : []));
}

async function fetchReport(path, apiKey, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(`${CHECKWX_API}${path}`, {
      headers: { 'X-API-Key': apiKey },
    });
  } catch {
    throw new ServiceError(502, 'AVIATION_UPSTREAM_FAILED', 'Aviation weather data could not be loaded.');
  }

  if (!response.ok) {
    throw new ServiceError(502, 'AVIATION_UPSTREAM_FAILED', 'Aviation weather data could not be loaded.');
  }

  return readJson(response);
}
