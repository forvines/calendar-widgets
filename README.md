# DAKboard Widgets

This repository contains the custom widgets used on the DAKboard display. All widgets are plain HTML/CSS/JavaScript and are intended to run inside a DAKboard Widget/iframe.

## Routes

When the repository is deployed at the root of the Cloudflare site:

- `/` — custom calendar prototype
- `/widgets/weather.html` — Bonney Lake weather + AQI widget
- `/widgets/aviation.html` — KPLU METAR + KTCM TAF widget

This means a deployment such as:

```text
https://calendar-widgets.example.workers.dev/
https://calendar-widgets.example.workers.dev/widgets/weather.html
https://calendar-widgets.example.workers.dev/widgets/aviation.html
```

Each page is standalone and can be embedded in its own DAKboard widget with an iframe.

## Shared presentation

`public/shared/dashboard-theme.css` contains the common visual tokens used by all three widgets:

```css
--db-shell-bg       /* background between tiles */
--db-toolbar-bg
--db-tile-bg        /* individual tile surface */
--db-border
--db-grid-line
--db-text
--db-soft
--db-muted
--db-today-bg
--db-now-line
--db-font
--db-corner
```

Change this file first for site-wide appearance changes such as transparency, border contrast, text color, or corner radius.

The calendar has additional calendar-specific controls in `public/src/styles/theme.css`, including font sizes, event radius, week/month pane ratio, and hour-row height.

## Calendar — current phase

The calendar UI now loads normalized Google Calendar data from the Worker. It currently supports:

- 7-day hour-by-hour TimeGrid view
- horizontal swipe to advance the 7-day window by one day
- Today / previous / next touch controls
- native vertical scrolling in the hour grid
- rolling future weeks below the TimeGrid
- automatic future-week append while scrolling
- show/hide calendar filters shared by both views
- persistent filter state when localStorage is available
- touch-friendly event detail popup
- DAKboard iframe-safe layout

### Calendar customization

`public/src/config.js` — behavior such as start/end hour, visible days, swipe increment, future weeks, and event limits.

`public/src/styles/theme.css` — calendar-specific typography and sizing.

`public/src/styles/fullcalendar.css` — hour-by-hour calendar presentation.

`public/src/styles/rolling-calendar.css` — rolling future-week presentation.

## Weather

`public/widgets/weather.html` is the current Bonney Lake weather widget. It includes current conditions, AQI, NWS alerts, 24-hour forecast, 7-day forecast, and moon information. Its browser entry point is `public/widgets/weather.js`, while pure formatting and classification helpers live in `public/widgets/weather-core.js`.

It uses Open-Meteo / Open-Meteo Air Quality and NWS endpoints directly from the browser. Secondary AQI/alert failures are designed not to blank the main weather display.

## Aviation

`public/widgets/aviation.html` contains the current KPLU METAR / KTCM TAF display using CheckWX. Its browser entry point is `public/widgets/aviation.js`, with independently testable report helpers in `public/widgets/aviation-core.js`.

The repository version intentionally leaves:

```js
const CHECKWX_API_KEY = "YOUR_CHECKWX_API_KEY";
```

Do not commit a private API credential to a public Git repository. We can move CheckWX access behind the Cloudflare Worker later so the browser never needs the credential.

## Local development

The widgets do not require a production build. Node.js 22 or newer is used for
the local Cloudflare Worker server, linting, and automated tests. Install the
development dependencies and start the Worker:

```bash
npm ci
npm run dev
```

Then open:

```text
http://localhost:8787/
http://localhost:8787/widgets/weather.html
http://localhost:8787/widgets/aviation.html
```

The Worker currently provides a non-secret deployment check at
`http://localhost:8787/api/health`. Copy `.dev.vars.example` to `.dev.vars`
when local API credentials are needed in a later implementation phase. Never
commit `.dev.vars` or real credentials.

Run the automated checks with:

```bash
npm run lint
npm run test:unit
npm run test:worker
```

## Calendar data boundary

The UI consumes calendars shaped like:

```js
{
  id: 'emma',
  name: 'Emma',
  color: '#fbbc04',
  defaultVisible: true,
  order: 30,
}
```

and events shaped like:

```js
{
  id: 'event-123',
  calendarId: 'emma',
  title: 'Gymnastics',
  start: Date,
  end: Date,
  allDay: false,
  location: 'Gym',
}
```

The Worker now provides the first Google Calendar backend boundary at
`GET /api/calendar?start=<ISO timestamp>&end=<ISO timestamp>`. It exchanges the
configured refresh token only on the server, discovers readable calendars,
loads a date range of events, and normalizes Google responses into this same
shape. Requests are limited to 90 days. The browser displays an explicit
loading state while the request is active and a retryable error when Calendar
credentials or upstream data are unavailable.


## Weekly calendar visual tuning

The weekly event font sizes, event padding, and faint hour/day grid contrast are intentionally isolated in `public/src/styles/fullcalendar.css` so they can be adjusted without changing the weather or aviation widgets.


### Visual tuning
- The rolling/monthly calendar header has been removed to maximize usable space.
- Rolling day/month surfaces are lighter so the DAKboard background photo shows through similarly to the weekly view.
