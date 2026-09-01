# Standalone DAKboard Widgets

- `weather.html` — Bonney Lake weather/AQI (Open-Meteo + NWS, direct from the browser)
- `aviation-strip.html` — METAR/TAF strip for a wide, short tile: category pills
  for the METAR stations (KPLU, KRNT, KTIW, KCLS) and a KTCM TAF transition
  timeline. Data comes from the Worker's `/api/aviation` route
  (aviationweather.gov, server-side, no key). `?mock=1` previews without a
  network call.

Both pages load shared visual tokens from `../shared/dashboard-theme.css` but
otherwise remain standalone pages for easy iframe embedding. Their browser
entry points are `weather.js` and `aviation-strip.js`; reusable formatting and
classification logic lives in the adjacent `*-core.js` modules so it can be
tested without a DOM or network access. `aviation-mock.js` holds the preview
payload.
