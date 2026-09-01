import { DAY_MS, addDays } from './date-utils.js';
import { createMockEvents, mockCalendars } from './mock-data.js';

export function createCalendarRange(anchor = new Date()) {
  const midnight = new Date(anchor);
  midnight.setHours(0, 0, 0, 0);
  const start = addDays(midnight, -7);

  const end = new Date(start.getTime() + 90 * DAY_MS);
  return { start, end };
}

// Loads calendar data from the Worker. When the Worker reports that Google
// Calendar credentials are not configured, this falls back to bundled mock data
// so the UI is still usable for local development and design work. Every other
// failure (auth rejected, upstream error, invalid response, network) is
// surfaced to the caller so a genuinely broken live deployment is not masked by
// mock events.
export async function loadCalendarData({
  fetchImpl = fetch,
  anchor = new Date(),
  mockProvider = defaultMockProvider,
} = {}) {
  try {
    const data = await fetchLiveCalendarData({ fetchImpl, anchor });
    return { ...data, source: 'live' };
  } catch (error) {
    if (error instanceof CalendarDataError && error.code === 'CALENDAR_NOT_CONFIGURED') {
      return { ...mockProvider(anchor), source: 'mock' };
    }
    throw error;
  }
}

async function fetchLiveCalendarData({ fetchImpl, anchor }) {
  const range = createCalendarRange(anchor);
  const params = new URLSearchParams({
    start: range.start.toISOString(),
    end: range.end.toISOString(),
  });
  const response = await fetchImpl(`/api/calendar?${params}`, {
    headers: { Accept: 'application/json' },
  });
  const body = await readJson(response);

  if (!response.ok) {
    throw new CalendarDataError(
      body.error?.message || 'Calendar data could not be loaded.',
      body.error?.code || 'CALENDAR_REQUEST_FAILED',
      response.status,
    );
  }

  if (!Array.isArray(body.calendars) || !Array.isArray(body.events)) {
    throw new CalendarDataError('The calendar service returned an invalid response.');
  }

  return {
    calendars: body.calendars,
    events: body.events.map(normalizeEvent).filter(Boolean),
  };
}

function defaultMockProvider(anchor) {
  // createMockEvents already returns Date objects, matching normalizeEvent's
  // output, so the renderers receive an identical event shape either way.
  return {
    calendars: mockCalendars,
    events: createMockEvents(anchor),
  };
}

function normalizeEvent(event) {
  const start = parseEventDate(event.start, event.allDay);
  const end = event.end ? parseEventDate(event.end, event.allDay) : null;
  if (!event.id || !event.calendarId || !start || Number.isNaN(start.getTime())) return null;
  return {
    ...event,
    start,
    end: end && !Number.isNaN(end.getTime()) ? end : null,
    allDay: Boolean(event.allDay),
    location: event.location || '',
  };
}

// Timed events carry a full timestamp with offset and parse to an absolute
// instant. All-day events are date-only (e.g. "2026-09-07"); parsing that
// string directly yields UTC midnight, which in a negative-offset local zone
// lands on the previous evening and makes the event appear on the wrong (and an
// extra) day. Appending a local time component forces local-midnight parsing.
function parseEventDate(value, allDay) {
  if (value == null) return null;
  if (allDay && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }
  return new Date(value);
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export class CalendarDataError extends Error {
  constructor(message, code = 'INVALID_CALENDAR_RESPONSE', status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
