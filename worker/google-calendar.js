import { ServiceError, readJson } from './service.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

const REQUIRED_CREDENTIALS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
];

export function hasGoogleCredentials(env = {}) {
  return REQUIRED_CREDENTIALS.every(name => (
    typeof env[name] === 'string' && env[name].trim().length > 0
  ));
}

export async function fetchCalendarData(env, range, fetchImpl = fetch) {
  if (!hasGoogleCredentials(env)) {
    throw new ServiceError(503, 'CALENDAR_NOT_CONFIGURED', 'Google Calendar credentials are not configured.');
  }

  // Auth and the calendar-list fetch are whole-request dependencies: if either
  // fails there is nothing meaningful to render, so they throw.
  const accessToken = await exchangeRefreshToken(env, fetchImpl);
  const googleCalendars = await fetchAllPages(
    `${CALENDAR_API}/users/me/calendarList?${new URLSearchParams({
      minAccessRole: 'reader',
      showDeleted: 'false',
      showHidden: 'false',
    })}`,
    accessToken,
    fetchImpl,
  );

  const calendars = googleCalendars.map(normalizeCalendar);

  // Per-calendar event fetches are isolated: one calendar becoming
  // inaccessible (permissions revoked, transient upstream error) must not blank
  // the whole dashboard. A failed calendar stays in the list (its filter chip
  // still works) but contributes no events, and its id is reported so the
  // client can indicate the partial result.
  const settled = await Promise.allSettled(
    calendars.map(calendar => fetchCalendarEvents(calendar.id, range, accessToken, fetchImpl)),
  );

  const events = [];
  const failedCalendarIds = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      events.push(...result.value);
    } else {
      failedCalendarIds.push(calendars[index].id);
    }
  });

  return {
    calendars,
    events,
    partial: failedCalendarIds.length > 0,
    failedCalendarIds,
  };
}

async function fetchCalendarEvents(calendarId, range, accessToken, fetchImpl) {
  const params = new URLSearchParams({
    timeMin: range.start.toISOString(),
    timeMax: range.end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    showDeleted: 'false',
    maxResults: '2500',
  });
  const items = await fetchAllPages(
    `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    accessToken,
    fetchImpl,
  );
  return items.map(item => normalizeEvent(item, calendarId)).filter(Boolean);
}

async function exchangeRefreshToken(env, fetchImpl) {
  const response = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const body = await readJson(response);
  if (!response.ok || !body.access_token) {
    throw new ServiceError(502, 'GOOGLE_AUTH_FAILED', 'Google rejected the calendar credentials.');
  }
  return body.access_token;
}

async function fetchAllPages(initialUrl, accessToken, fetchImpl) {
  const items = [];
  let url = initialUrl;
  do {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = await readJson(response);
    if (!response.ok) {
      throw new ServiceError(502, 'GOOGLE_CALENDAR_FAILED', 'Google Calendar data could not be loaded.');
    }
    items.push(...(Array.isArray(body.items) ? body.items : []));
    if (body.nextPageToken) {
      const nextUrl = new URL(url);
      nextUrl.searchParams.set('pageToken', body.nextPageToken);
      url = nextUrl.toString();
    } else {
      url = null;
    }
  } while (url);
  return items;
}

function normalizeCalendar(calendar, index) {
  return {
    id: calendar.id,
    name: calendar.summaryOverride || calendar.summary || 'Calendar',
    color: calendar.backgroundColor || '#7baaf7',
    defaultVisible: !calendar.hidden && calendar.selected !== false,
    order: index * 10 + 10,
  };
}

function normalizeEvent(event, calendarId) {
  const startValue = event.start?.dateTime || event.start?.date;
  if (!event.id || !startValue) return null;
  const allDay = Boolean(event.start.date && !event.start.dateTime);
  return {
    id: `${calendarId}:${event.id}`,
    calendarId,
    title: event.summary || '(No title)',
    start: startValue,
    end: event.end?.dateTime || event.end?.date || null,
    allDay,
    location: event.location || '',
  };
}
