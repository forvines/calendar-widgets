# Standalone DAKboard Widgets

- `weather.html` — Bonney Lake weather/AQI
- `aviation.html` — KPLU METAR + KTCM TAF

Both pages load shared visual tokens from `../shared/dashboard-theme.css` but
otherwise remain standalone pages for easy iframe embedding. Their browser
entry points are `weather.js` and `aviation.js`; reusable formatting and
classification logic lives in the adjacent `*-core.js` modules so it can be
tested without a DOM or network access.
