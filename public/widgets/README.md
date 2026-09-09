# Standalone DAKboard Widgets

- `weather.html` — Bonney Lake weather/AQI (Open-Meteo + NWS, direct from the browser)
- `aviation-strip.html` — METAR/TAF strip for a wide, short tile: category pills
  for the METAR stations (KPLU, KRNT, KTIW, KCLS) and a KTCM TAF transition
  timeline. Data comes from the Worker's `/api/aviation` route
  (aviationweather.gov, server-side, no key). `?mock=1` previews without a
  network call.
- `lunch-menu.html` — compact McAlder lunch tile showing today and tomorrow.
  It reads `../data/lunch-menu.json`; a scheduled GitHub Action downloads the
  school's monthly PDF and refreshes that JSON only when the source PDF changes.

All pages load shared visual tokens from `../shared/dashboard-theme.css` but
otherwise remain standalone pages for easy iframe embedding. Browser entry
points live beside their HTML files.
