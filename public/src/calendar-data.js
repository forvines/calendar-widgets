import { DAY_MS, addDays } from './date-utils.js';

export function createCalendarRange(anchor = new Date()) {
  const midnight = new Date(anchor);
  midnight.setHours(0, 0, 0, 0);
  const start = addDays(midnight, -7);

  const end = new Date(start.getTime() + 90 * DAY_MS);
  return { start, end };
}

export async function loadCalendarData({ fetchImpl = fetch, anchor = new Date() } = {}) {
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

function normalizeEvent(event) {
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : null;
  if (!event.id || !event.calendarId || Number.isNaN(start.getTime())) return null;
  return {
    ...event,
    start,
    end: end && !Number.isNaN(end.getTime()) ? end : null,
    allDay: Boolean(event.allDay),
    location: event.location || '',
  };
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
