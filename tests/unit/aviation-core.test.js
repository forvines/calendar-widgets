import { describe, expect, it } from 'vitest';
import {
  categoryFromForecast,
  ceilingFromClouds,
  conditionsText,
  formatVisibility,
  metarCategory,
  metarSummary,
  periodLabel,
  windText,
} from '../../public/widgets/aviation-core.js';

describe('aviation flight categories', () => {
  it.each([
    [{ visibility: { miles: 10 }, clouds: [] }, 'VFR'],
    [{ visibility: { miles: 5 }, clouds: [] }, 'MVFR'],
    [{ visibility: { miles: 3 }, clouds: [] }, 'MVFR'],
    [{ visibility: { miles: 2.99 }, clouds: [] }, 'IFR'],
    [{ visibility: { miles: 0.99 }, clouds: [] }, 'LIFR'],
    [{ visibility: { miles: 10 }, clouds: [{ code: 'BKN', feet: 3000 }] }, 'MVFR'],
    [{ visibility: { miles: 10 }, clouds: [{ code: 'OVC', feet: 999 }] }, 'IFR'],
    [{ visibility: { miles: 10 }, clouds: [{ code: 'VV', feet: 499 }] }, 'LIFR'],
  ])('classifies %# as %s', (forecast, category) => {
    expect(categoryFromForecast(forecast)).toBe(category);
  });

  it('uses the worst of visibility and ceiling', () => {
    expect(categoryFromForecast({
      visibility: { miles: 0.5 },
      clouds: [{ code: 'BKN', feet: 5000 }],
    })).toBe('LIFR');
  });
});

describe('aviation report formatting', () => {
  it('selects the lowest broken, overcast, or vertical-visibility layer', () => {
    expect(ceilingFromClouds([
      { code: 'SCT', feet: 800 },
      { code: 'OVC', feet: 2200 },
      { code: 'BKN', feet: 1400 },
    ])).toEqual({ code: 'BKN', feet: 1400 });
  });

  it('formats fixed and variable winds with optional gusts', () => {
    expect(windText({ degrees: 90, speed: { kts: 8 }, gust: { kts: 16 } }))
      .toBe('090° 8G16 kt');
    expect(windText({ direction: 'VRB', speed: { kts: 4 } })).toBe('VRB 4 kt');
    expect(windText(null)).toBe('—');
  });

  it('formats visibility text, numeric visibility, and missing values', () => {
    expect(formatVisibility({ text: 'Greater than 6 miles' })).toBe('>6 SM');
    expect(formatVisibility({ miles: 2.5 })).toBe('2.5 SM');
    expect(formatVisibility()).toBe('—');
  });

  it('summarizes a METAR into a compact one-line string', () => {
    expect(metarSummary({
      wind: { degrees: 240, speed: { kts: 8 } },
      visibility: { miles: 10 },
      clouds: [{ code: 'FEW', feet: 25000 }],
    })).toBe('240° 8 kt · 10 SM · CLR');
    expect(metarSummary({
      wind: { degrees: 90, speed: { kts: 6 } },
      visibility: { miles: 3 },
      clouds: [{ code: 'OVC', feet: 1200 }],
    })).toBe('090° 6 kt · 3 SM · 1,200ft');
    expect(metarSummary(null)).toBe('—');
  });

  it('derives a METAR category, preferring the API flight_category', () => {
    expect(metarCategory({ flight_category: 'IFR' })).toBe('IFR');
    expect(metarCategory({ visibility: { miles: 10 }, clouds: [] })).toBe('VFR');
    expect(metarCategory({ visibility: { miles: 0.5 }, clouds: [] })).toBe('LIFR');
    expect(metarCategory(null)).toBe('—');
  });

  it('combines decoded conditions and handles empty reports', () => {
    expect(conditionsText([{ text: 'Light rain' }, { code: 'BR' }]))
      .toBe('Light rain, BR');
    expect(conditionsText([])).toBe('None');
  });

  it('formats initial, from, and temporary TAF periods in Zulu time', () => {
    expect(periodLabel({ change: { code: 'INITIAL' } })).toBe('INITIAL');
    expect(periodLabel({ change: {
      code: 'FM',
      period: { from: '2026-08-31T18:00:00Z' },
    } })).toBe('FM 31/18Z');
    expect(periodLabel({ change: {
      code: 'TEMPO',
      period: {
        from: '2026-08-31T20:00:00Z',
        to: '2026-09-01T00:00:00Z',
      },
    } })).toBe('TEMPO 31/20Z–01/00Z');
  });
});
