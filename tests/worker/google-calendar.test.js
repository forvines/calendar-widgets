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
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
