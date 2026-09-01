import { describe, expect, it } from 'vitest';
import { DAY_MS, addDays, startOfWeek } from '../../public/src/date-utils.js';

describe('date-utils', () => {
  it('exposes the number of milliseconds in a day', () => {
    expect(DAY_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('returns the Sunday midnight on or before a mid-week date', () => {
    // 2026-09-02 is a Wednesday.
    const result = startOfWeek(new Date('2026-09-02T15:30:00'));
    expect(result.getDay()).toBe(0);
    expect(result.getDate()).toBe(30); // Sunday, Aug 30 2026
    expect(result.getMonth()).toBe(7); // August
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  it('leaves a date that is already Sunday midnight on its own day', () => {
    const sunday = new Date('2026-08-30T00:00:00');
    expect(startOfWeek(sunday).getDate()).toBe(30);
  });

  it('does not mutate the input date', () => {
    const input = new Date('2026-09-02T15:30:00');
    const before = input.getTime();
    startOfWeek(input);
    addDays(input, 5);
    expect(input.getTime()).toBe(before);
  });

  it('offsets by whole days across month boundaries', () => {
    const result = addDays(new Date('2026-08-30T12:00:00'), 5);
    expect(result.getMonth()).toBe(8); // September
    expect(result.getDate()).toBe(4);
    expect(result.getHours()).toBe(12);
  });

  it('offsets backwards with a negative count', () => {
    const result = addDays(new Date('2026-09-04T00:00:00'), -5);
    expect(result.getMonth()).toBe(7); // August
    expect(result.getDate()).toBe(30);
  });
});
