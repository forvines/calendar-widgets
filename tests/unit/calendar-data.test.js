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

    expect(data.source).toBe('live');
    expect(data.events[0].start).toBeInstanceOf(Date);
    expect(data.events[0].end).toBeInstanceOf(Date);
    expect(fetchImpl.mock.calls[0][0]).toMatch(/^\/api\/calendar\?start=/);
  });

  it('surfaces safe API errors for the loading state', async () => {
    // A genuine live failure (not a missing-credentials case) must reach the
    // caller so the retryable error state is shown rather than silently
    // masked by mock data.
    const fetchImpl = vi.fn().mockResolvedValue(json({
      error: { code: 'GOOGLE_AUTH_FAILED', message: 'Google rejected the credentials.' },
    }, 502));

    await expect(loadCalendarData({ fetchImpl })).rejects.toMatchObject({
      name: 'Error',
      code: 'GOOGLE_AUTH_FAILED',
      status: 502,
      message: 'Google rejected the credentials.',
    });
    await expect(loadCalendarData({
      fetchImpl: vi.fn().mockResolvedValue(json({ nope: true })),
    })).rejects.toBeInstanceOf(CalendarDataError);
  });

  it('falls back to mock data when calendar credentials are not configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({
      error: { code: 'CALENDAR_NOT_CONFIGURED', message: 'Calendar is not configured.' },
    }, 503));
    const mockProvider = vi.fn().mockReturnValue({
      calendars: [{ id: 'demo', name: 'Demo' }],
      events: [{ id: 'demo:1', calendarId: 'demo', title: 'Sample', start: new Date() }],
    });

    const data = await loadCalendarData({ fetchImpl, mockProvider });

    expect(data.source).toBe('mock');
    expect(data.calendars).toEqual([{ id: 'demo', name: 'Demo' }]);
    expect(data.events).toHaveLength(1);
    expect(mockProvider).toHaveBeenCalledOnce();
  });

  it('does not fall back to mock data for other calendar errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({
      error: { code: 'GOOGLE_CALENDAR_FAILED', message: 'Upstream failed.' },
    }, 502));
    const mockProvider = vi.fn();

    await expect(loadCalendarData({ fetchImpl, mockProvider }))
      .rejects.toMatchObject({ code: 'GOOGLE_CALENDAR_FAILED' });
    expect(mockProvider).not.toHaveBeenCalled();
  });
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
