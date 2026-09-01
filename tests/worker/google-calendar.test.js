import { describe, expect, it, vi } from 'vitest';
import { fetchCalendarData } from '../../worker/google-calendar.js';

const env = {
  GOOGLE_CLIENT_ID: 'client',
  GOOGLE_CLIENT_SECRET: 'secret',
  GOOGLE_REFRESH_TOKEN: 'refresh',
};

describe('Google Calendar service', () => {
  it('exchanges the refresh token and normalizes calendars and events', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'access' }))
      .mockResolvedValueOnce(json({ items: [{
        id: 'family@example.com',
        summary: 'Family',
        backgroundColor: '#123456',
        selected: true,
      }] }))
      .mockResolvedValueOnce(json({ items: [{
        id: 'event-1',
        summary: 'Dentist',
        start: { dateTime: '2026-09-02T16:00:00-07:00' },
        end: { dateTime: '2026-09-02T17:00:00-07:00' },
        location: 'Bonney Lake',
      }] }));

    const result = await fetchCalendarData(env, {
      start: new Date('2026-09-01T00:00:00Z'),
      end: new Date('2026-10-01T00:00:00Z'),
    }, fetchMock);

    expect(result.calendars).toEqual([{
      id: 'family@example.com',
      name: 'Family',
      color: '#123456',
      defaultVisible: true,
      order: 10,
    }]);
    expect(result.events).toEqual([{
      id: 'family@example.com:event-1',
      calendarId: 'family@example.com',
      title: 'Dentist',
      start: '2026-09-02T16:00:00-07:00',
      end: '2026-09-02T17:00:00-07:00',
      allDay: false,
      location: 'Bonney Lake',
    }]);
    expect(fetchMock.mock.calls[0][1].body.get('grant_type')).toBe('refresh_token');
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer access');
  });

  it('follows Google result pagination', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'access' }))
      .mockResolvedValueOnce(json({
        items: [{ id: 'one', summary: 'One' }],
        nextPageToken: 'next page',
      }))
      .mockResolvedValueOnce(json({ items: [{ id: 'two', summary: 'Two' }] }))
      .mockResolvedValueOnce(json({ items: [] }))
      .mockResolvedValueOnce(json({ items: [] }));

    const result = await fetchCalendarData(env, {
      start: new Date('2026-09-01T00:00:00Z'),
      end: new Date('2026-09-02T00:00:00Z'),
    }, fetchMock);

    expect(result.calendars.map(calendar => calendar.id)).toEqual(['one', 'two']);
    expect(fetchMock.mock.calls[2][0]).toContain('pageToken=next+page');
  });

  it('isolates a single calendar failure instead of failing the whole request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'access' }))
      .mockResolvedValueOnce(json({ items: [
        { id: 'ok@example.com', summary: 'OK' },
        { id: 'broken@example.com', summary: 'Broken' },
      ] }))
      // Events for ok@example.com succeed.
      .mockResolvedValueOnce(json({ items: [{
        id: 'event-ok',
        summary: 'Present',
        start: { dateTime: '2026-09-02T10:00:00-07:00' },
        end: { dateTime: '2026-09-02T11:00:00-07:00' },
      }] }))
      // Events for broken@example.com fail (e.g. permissions revoked).
      .mockResolvedValueOnce(json({ error: 'forbidden' }, 403));

    const result = await fetchCalendarData(env, {
      start: new Date('2026-09-01T00:00:00Z'),
      end: new Date('2026-10-01T00:00:00Z'),
    }, fetchMock);

    // Both calendars remain listed so their filter chips still render.
    expect(result.calendars.map(c => c.id)).toEqual(['ok@example.com', 'broken@example.com']);
    // Only the healthy calendar's events are present.
    expect(result.events.map(e => e.id)).toEqual(['ok@example.com:event-ok']);
    // The failure is reported, not hidden.
    expect(result.partial).toBe(true);
    expect(result.failedCalendarIds).toEqual(['broken@example.com']);
  });

  it('reports a healthy result as not partial', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'access' }))
      .mockResolvedValueOnce(json({ items: [{ id: 'only@example.com', summary: 'Only' }] }))
      .mockResolvedValueOnce(json({ items: [] }));

    const result = await fetchCalendarData(env, {
      start: new Date('2026-09-01T00:00:00Z'),
      end: new Date('2026-10-01T00:00:00Z'),
    }, fetchMock);

    expect(result.partial).toBe(false);
    expect(result.failedCalendarIds).toEqual([]);
  });

  it('still fails the whole request when auth is rejected', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ error: 'invalid_grant' }, 400));

    await expect(fetchCalendarData(env, {
      start: new Date('2026-09-01T00:00:00Z'),
      end: new Date('2026-10-01T00:00:00Z'),
    }, fetchMock)).rejects.toMatchObject({ code: 'GOOGLE_AUTH_FAILED' });
  });

  it('still fails the whole request when the calendar list cannot be loaded', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ access_token: 'access' }))
      .mockResolvedValueOnce(json({ error: 'backend' }, 500));

    await expect(fetchCalendarData(env, {
      start: new Date('2026-09-01T00:00:00Z'),
      end: new Date('2026-10-01T00:00:00Z'),
    }, fetchMock)).rejects.toMatchObject({ code: 'GOOGLE_CALENDAR_FAILED' });
  });
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
