import { describe, expect, it } from 'vitest';
import {
  aqiInfo,
  formatInches,
  formatPercent,
  formatTemperature,
  isDaylightAt,
  moonPhaseInfo,
  weatherInfo,
  windDirection,
} from '../../public/widgets/weather-core.js';

describe('weather value formatting', () => {
  it('formats temperatures, percentages, and precipitation defensively', () => {
    expect(formatTemperature(47.6)).toBe('48°');
    expect(formatTemperature(undefined)).toBe('—');
    expect(formatPercent(63.5)).toBe('64%');
    expect(formatInches(0)).toBe('0 in');
    expect(formatInches(0.005)).toBe('<0.01 in');
    expect(formatInches(0.126)).toBe('0.13 in');
    expect(formatInches(Number.NaN)).toBe('—');
  });

  it.each([
    [0, 'N'],
    [45, 'NE'],
    [180, 'S'],
    [315, 'NW'],
    [360, 'N'],
    [-45, 'NW'],
  ])('maps %s degrees to %s', (degrees, direction) => {
    expect(windDirection(degrees)).toBe(direction);
  });
});

describe('weather classifications', () => {
  it('uses distinct clear-sky icons for daytime and nighttime', () => {
    expect(weatherInfo(0, true)).toEqual(['Clear', '☀️']);
    expect(weatherInfo(0, false)).toEqual(['Clear', '🌙']);
    expect(weatherInfo(999)).toEqual(['Weather', '🌡️']);
  });

  it.each([
    [50, 'Good'],
    [51, 'Moderate'],
    [101, 'Sensitive'],
    [151, 'Unhealthy'],
    [201, 'Very unhealthy'],
    [301, 'Hazardous'],
  ])('classifies AQI %s as %s', (aqi, label) => {
    expect(aqiInfo(aqi).label).toBe(label);
  });

  it('reports unavailable AQI values without producing NaN', () => {
    expect(aqiInfo(undefined)).toEqual({ label: 'Unavailable', cls: '', value: '—' });
  });
});

describe('weather time derivation', () => {
  const daily = {
    time: ['2026-08-31'],
    sunrise: ['2026-08-31T06:30:00-07:00'],
    sunset: ['2026-08-31T19:45:00-07:00'],
  };

  it('treats sunrise as daylight and sunset as nighttime', () => {
    expect(isDaylightAt('2026-08-31T06:30:00-07:00', daily)).toBe(true);
    expect(isDaylightAt('2026-08-31T19:44:59-07:00', daily)).toBe(true);
    expect(isDaylightAt('2026-08-31T19:45:00-07:00', daily)).toBe(false);
  });

  it('returns a new moon at the approximation epoch', () => {
    expect(moonPhaseInfo(new Date('2000-01-06T18:14:00Z'))).toEqual({
      name: 'New Moon',
      icon: '🌑',
      illumination: 0,
    });
  });
});
