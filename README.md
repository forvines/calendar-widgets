# DAKboard Custom Calendar — Phase 1

This is the static UI prototype. It deliberately uses mock calendar data and has no Google authentication yet.

## What Phase 1 proves

- 7-day hour-by-hour TimeGrid view
- horizontal swipe advances the 7-day window by one day
- Today / previous / next touch controls
- independent vertical scrolling in the hour grid
- rolling future weeks below the TimeGrid
- future weeks append automatically while scrolling
- show/hide calendar filters apply to both views
- filter state persists with localStorage when available
- touch-friendly event detail popup
- DAKboard iframe-safe layout: 100% container sizing, no `100vh`, no parent-frame access
- styling isolated from rendering logic

## Run it

This project is plain static HTML/JS. It does not require a build step.

Because the JavaScript uses ES modules, serve the directory over HTTP rather than opening `index.html` directly from Finder.

Examples:

```bash
cd dakboard-calendar-phase1
python3 -m http.server 8080
```

Then browse to:

```text
http://localhost:8080
```

For DAKboard, deploy this directory to any HTTPS static host such as Cloudflare Pages and use that URL in a Website/iframe block.

## Main customization files

### `src/config.js`
Behavior:

- timezone
- start/end hour
- visible day count
- swipe increment
- number of future weeks
- events per day
- calendar overrides

### `src/styles/theme.css`
Global appearance:

- tile/background transparency
- colors
- text colors
- font sizes
- corner radius
- week/month pane sizing
- hour slot height

### `src/styles/fullcalendar.css`
Hour-by-hour view presentation.

### `src/styles/rolling-calendar.css`
Future-week presentation.

## Calendar data boundary

The UI consumes calendars like:

```js
{
  id: 'emma',
  name: 'Emma',
  color: '#fbbc04',
  defaultVisible: true,
  order: 30,
}
```

and events like:

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

The Google backend in a later phase will normalize Google API responses into the same shape. That keeps Google/authentication code out of the rendering components.
