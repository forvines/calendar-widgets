import { describe, expect, it } from 'vitest';
import { normalizeMetar, normalizeTaf } from '../../worker/aviation-awc.js';

describe('AWC METAR normalization', () => {
  it('maps AWC fields into the CheckWX shape', () => {
    const out = normalizeMetar({
      icaoId: 'KPLU', name: 'Thun Field', rawOb: 'METAR KPLU ...', fltCat: 'MVFR',
      wdir: 240, wspd: 8, wgst: 15, visib: '10+', temp: 14, dewp: 9,
      clouds: [{ cover: 'OVC', base: 2500 }],
    });
    expect(out).toMatchObject({
      icao: 'KPLU',
      station: { name: 'Thun Field' },
      raw_text: 'METAR KPLU ...',
      flight_category: 'MVFR',
      wind: { degrees: 240, speed: { kts: 8 }, gust: { kts: 15 } },
      clouds: [{ code: 'OVC', feet: 2500 }],
      temperature: { celsius: 14 },
      dewpoint: { celsius: 9 },
    });
    expect(out.visibility.miles).toBe(10);
    expect(out.visibility.text).toBe('>10 miles'); // the "+" is preserved as greater-than
  });

  it('handles variable wind and plain numeric visibility', () => {
    const out = normalizeMetar({ icaoId: 'KXXX', wdir: 'VRB', wspd: 3, visib: '3' });
    expect(out.wind).toEqual({ direction: 'VRB', speed: { kts: 3 } });
    expect(out.visibility).toEqual({ miles: 3 });
  });

  it('returns null for a report with no station id', () => {
    expect(normalizeMetar({})).toBeNull();
    expect(normalizeMetar(null)).toBeNull();
  });
});

describe('AWC TAF normalization', () => {
  it('maps validity period and forecast sections', () => {
    const out = normalizeTaf({
      icaoId: 'KTCM', name: 'McChord', rawTAF: 'TAF KTCM ...',
      validTimeFrom: 1788267600, validTimeTo: 1788375600,
      fcsts: [
        { fcstChange: null, timeFrom: 1788267600, wdir: 220, wspd: 5, visib: '6+', clouds: [{ cover: 'SCT', base: 2500 }] },
        { fcstChange: 'BECMG', timeBec: 1788285600, timeFrom: 1788282000, timeTo: 1788318000, wdir: 220, wspd: 12, wgst: 18, visib: '6+', clouds: [{ cover: 'BKN', base: 2500 }], wxString: '-SHRA' },
      ],
    });
    expect(out.icao).toBe('KTCM');
    expect(out.raw_text).toBe('TAF KTCM ...');
    expect(out.period.from).toBe(new Date(1788267600 * 1000).toISOString());
    expect(out.forecast).toHaveLength(2);
    expect(out.forecast[0].change.code).toBe('INITIAL');
    expect(out.forecast[0].wind).toEqual({ degrees: 220, speed: { kts: 5 } });
    expect(out.forecast[1].change.code).toBe('BECMG');
    expect(out.forecast[1].conditions).toEqual([{ text: '-SHRA', code: '-SHRA' }]);
  });

  it('returns null without a station id', () => {
    expect(normalizeTaf({})).toBeNull();
  });
});
