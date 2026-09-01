// Adapts aviationweather.gov (AWC) Data API JSON into the CheckWX-shaped objects
// that aviation-core.js and the widgets already expect. AWC is free, needs no
// API key, and is the authoritative NWS source; only its field names differ.

// AWC visibility is a string like "10+", "6+", "3", or a number of statute
// miles. Return a finite number of miles (the "+" means "greater than").
function parseVisibilityMiles(visib) {
  if (visib == null) return null;
  if (typeof visib === 'number') return visib;
  const m = String(visib).match(/[\d.]+/);
  return m ? Number(m[0]) : null;
}

function toWind(wdir, wspd, wgst) {
  if (wspd == null && wdir == null) return null;
  const wind = {};
  if (wdir === 'VRB') wind.direction = 'VRB';
  else if (Number.isFinite(wdir)) wind.degrees = wdir;
  if (Number.isFinite(wspd)) wind.speed = { kts: wspd };
  if (Number.isFinite(wgst)) wind.gust = { kts: wgst };
  return wind;
}

function toVisibility(visib) {
  const miles = parseVisibilityMiles(visib);
  if (miles == null) return undefined;
  const text = String(visib).includes('+') ? `>${miles} miles` : undefined;
  return text ? { miles, text } : { miles };
}

// AWC clouds: [{cover, base}] where cover is SKC/CLR/FEW/SCT/BKN/OVC/VV and base
// is feet AGL. CheckWX uses {code, feet}.
function toClouds(clouds) {
  if (!Array.isArray(clouds)) return [];
  return clouds
    .filter(c => c && c.cover)
    .map(c => ({ code: c.cover, feet: Number.isFinite(c.base) ? c.base : undefined }));
}

function isoFromEpochSeconds(sec) {
  return Number.isFinite(sec) ? new Date(sec * 1000).toISOString() : undefined;
}

export function normalizeMetar(awc) {
  if (!awc || !awc.icaoId) return null;
  const out = {
    icao: awc.icaoId,
    station: { name: awc.name || '' },
    raw_text: awc.rawOb || '',
    flight_category: awc.fltCat || undefined,
    wind: toWind(awc.wdir, awc.wspd, awc.wgst),
    visibility: toVisibility(awc.visib),
    clouds: toClouds(awc.clouds),
    observed: awc.reportTime || isoFromEpochSeconds(awc.obsTime),
  };
  if (Number.isFinite(awc.temp)) out.temperature = { celsius: awc.temp };
  if (Number.isFinite(awc.dewp)) out.dewpoint = { celsius: awc.dewp };
  return out;
}

// Maps an AWC forecast period's change info to the CheckWX section.change shape
// used by periodLabel().
function toChange(fcst) {
  const code = fcst.fcstChange || 'INITIAL';
  const from = isoFromEpochSeconds(fcst.timeBec || fcst.timeFrom);
  const to = fcst.timeTo ? isoFromEpochSeconds(fcst.timeTo) : undefined;
  const period = {};
  if (from) period.from = from;
  if (to && (code !== 'FM' && code !== 'BECMG')) period.to = to;
  return { code, period };
}

export function normalizeTaf(awc) {
  if (!awc || !awc.icaoId) return null;
  const forecast = (Array.isArray(awc.fcsts) ? awc.fcsts : []).map(f => ({
    change: toChange(f),
    wind: toWind(f.wdir, f.wspd, f.wgst),
    visibility: toVisibility(f.visib),
    clouds: toClouds(f.clouds),
    conditions: f.wxString ? [{ text: f.wxString, code: f.wxString }] : [],
  }));
  return {
    icao: awc.icaoId,
    station: { name: awc.name || '' },
    raw_text: awc.rawTAF || '',
    period: {
      from: isoFromEpochSeconds(awc.validTimeFrom),
      to: isoFromEpochSeconds(awc.validTimeTo),
    },
    forecast,
  };
}
