import { describe, expect, it } from 'vitest';
import { config } from '../../public/src/config.js';

describe('calendar configuration', () => {
  it('keeps the rolling calendar data window ahead of the visible week', () => {
    expect(config.rolling.initialWeeks).toBeGreaterThan(0);
    expect(config.rolling.appendWeeks).toBeGreaterThan(0);
    expect(config.week.daysVisible).toBe(7);
  });
});
