import { describe, expect, it, vi } from 'vitest';
import {
  CalendarDataError,
  createCalendarRange,
  loadCalendarData,
} from '../../public/src/calendar-data.js';

describe('calendar API data loading', () => {
  it('requests a 90-day window beginning one week before the anchor date', () => {
    const range = createCalendarRange(new Date('2026-09-08T15:30:00'));

    expect(range.start.getHours()).toBe(0);
    expect(range.start.getDate()).toBe(1);
    expect(range.end.getTime() - range.start.getTime()).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it('converts API event timestamps to Dates for the calendar renderers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({
      calendars: [{ id: 'family', name: 'Family' }],
      events: [{
        id: 'family:event-1',
        calendarId: 'family',
        title: 'Dinner',
        start: '2026-09-08T18:00:00-07:00',
        end: '2026-09-08T19:00:00-07:00',
      }],
    }));

    const data = await loadCalendarData({
      fetchImpl,
      anchor: new Date('2026-09-08T12:00:00Z'),
    });

    expect(data.events[0].start).toBeInstanceOf(Date);
    expect(data.events[0].end).toBeInstanceOf(Date);
    expect(fetchImpl.mock.calls[0][0]).toMatch(/^\/api\/calendar\?start=/);
  });

  it('surfaces safe API errors for the loading state', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({
      error: { code: 'CALENDAR_NOT_CONFIGURED', message: 'Calendar is not configured.' },
    }, 503));

    await expect(loadCalendarData({ fetchImpl })).rejects.toMatchObject({
      name: 'Error',
      code: 'CALENDAR_NOT_CONFIGURED',
      status: 503,
      message: 'Calendar is not configured.',
    });
    await expect(loadCalendarData({
      fetchImpl: vi.fn().mockResolvedValue(json({ nope: true })),
    })).rejects.toBeInstanceOf(CalendarDataError);
  });
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
