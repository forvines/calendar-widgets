// Canned CheckWX-shaped data for previewing the aviation strip without using
// the API quota. Activated with ?mock=1 on the widget URL. Includes a VFR METAR
// and an MVFR TAF so category colors and both detail views are exercised.
export const MOCK_AVIATION = {
  metar: [{
    icao: 'KPLU',
    station: { name: 'Pierce County-Thun Field' },
    flight_category: 'VFR',
    wind: { degrees: 240, speed: { kts: 8 }, gust: { kts: 15 } },
    visibility: { miles: 10 },
    clouds: [{ code: 'FEW', feet: 25000 }],
    temperature: { celsius: 14 },
    dewpoint: { celsius: 9 },
    conditions: [],
    raw_text: 'KPLU 011853Z AUTO 24008G15KT 10SM FEW250 14/09 A3012 RMK AO2',
  }],
  taf: [{
    icao: 'KTCM',
    station: { name: 'McChord Field' },
    period: { from: '2026-09-01T18:00:00Z', to: '2026-09-02T18:00:00Z' },
    raw_text: 'KTCM 011720Z 0118/0218 24010KT 9999 BKN035 TEMPO 0118/0122 3SM BR',
    forecast: [
      { change: { code: 'INITIAL', period: { from: '2026-09-01T18:00:00Z' } },
        wind: { degrees: 240, speed: { kts: 10 } }, visibility: { miles: 6 },
        clouds: [{ code: 'BKN', feet: 3500 }] },
      { change: { code: 'TEMPO', period: { from: '2026-09-01T18:00:00Z', to: '2026-09-01T22:00:00Z' } },
        wind: { degrees: 240, speed: { kts: 8 } }, visibility: { miles: 3 },
        clouds: [{ code: 'BKN', feet: 1200 }], conditions: [{ code: 'BR', text: 'Mist' }] },
      { change: { code: 'FM', period: { from: '2026-09-02T02:00:00Z' } },
        wind: { degrees: 200, speed: { kts: 5 } }, visibility: { miles: 10 },
        clouds: [{ code: 'SCT', feet: 6000 }] },
    ],
  }],
};
