// Canned CheckWX-shaped data for previewing the aviation strip without using
// the API quota. Activated with ?mock=1 on the widget URL. Includes a VFR METAR
// and an MVFR TAF so category colors and both detail views are exercised.
export const MOCK_AVIATION = {
  metar: [
    { icao: 'KPLU', station: { name: 'Pierce County-Thun Field' }, flight_category: 'VFR',
      wind: { degrees: 240, speed: { kts: 8 } }, visibility: { miles: 10 },
      clouds: [{ code: 'FEW', feet: 25000 }], raw_text: 'KPLU 011853Z AUTO 24008KT 10SM FEW250 14/09 A3012' },
    { icao: 'KRNT', station: { name: 'Renton Municipal' }, flight_category: 'MVFR',
      wind: { degrees: 200, speed: { kts: 6 } }, visibility: { miles: 6 },
      clouds: [{ code: 'BKN', feet: 2500 }], raw_text: 'KRNT 011853Z 20006KT 6SM BKN025 13/10 A3011' },
    { icao: 'KTIW', station: { name: 'Tacoma Narrows' }, flight_category: 'VFR',
      wind: { degrees: 220, speed: { kts: 5 } }, visibility: { miles: 10 },
      clouds: [{ code: 'SCT', feet: 8000 }], raw_text: 'KTIW 011853Z 22005KT 10SM SCT080 15/08 A3012' },
    { icao: 'KCLS', station: { name: 'Chehalis-Centralia' }, flight_category: 'IFR',
      wind: { degrees: 180, speed: { kts: 4 } }, visibility: { miles: 2 },
      clouds: [{ code: 'OVC', feet: 800 }], raw_text: 'KCLS 011853Z 18004KT 2SM BR OVC008 12/11 A3010' },
  ],
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
