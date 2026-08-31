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

`shared/dashboard-theme.css` contains the common visual tokens used by all three widgets:

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

The calendar has additional calendar-specific controls in `src/styles/theme.css`, including font sizes, event radius, week/month pane ratio, and hour-row height.

## Calendar — current phase

The calendar is still the static UI prototype and deliberately uses mock events. It currently supports:

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

`src/config.js` — behavior such as start/end hour, visible days, swipe increment, future weeks, and event limits.

`src/styles/theme.css` — calendar-specific typography and sizing.

`src/styles/fullcalendar.css` — hour-by-hour calendar presentation.

`src/styles/rolling-calendar.css` — rolling future-week presentation.

## Weather

`widgets/weather.html` is the current Bonney Lake weather widget. It includes current conditions, AQI, NWS alerts, 24-hour forecast, 7-day forecast, and moon information.

It uses Open-Meteo / Open-Meteo Air Quality and NWS endpoints directly from the browser. Secondary AQI/alert failures are designed not to blank the main weather display.

## Aviation

`widgets/aviation.html` contains the current KPLU METAR / KTCM TAF display using CheckWX.

The repository version intentionally leaves:

```js
const CHECKWX_API_KEY = "YOUR_CHECKWX_API_KEY";
```

Do not commit a private API credential to a public Git repository. We can move CheckWX access behind the Cloudflare Worker later so the browser never needs the credential.

## Local development

No build step is required yet. Because the calendar JavaScript uses ES modules, serve the repository over HTTP rather than opening `index.html` directly:

```bash
cd dakboard-widgets
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080/
http://localhost:8080/widgets/weather.html
http://localhost:8080/widgets/aviation.html
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

The Google Calendar backend in a later phase will normalize Google API responses into this same shape, keeping authentication/data access separate from rendering.
