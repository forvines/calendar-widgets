export function pad2(value) {
  return String(value).padStart(2, '0');
}

export function periodLabel(section) {
  const change = section?.change || {};
  const code = change.code || 'INITIAL';
  const period = change.period || {};
  const from = period.from ? new Date(period.from) : null;
  const to = period.to ? new Date(period.to) : null;

  const dayHour = date => date && !Number.isNaN(date.getTime())
    ? `${pad2(date.getUTCDate())}/${pad2(date.getUTCHours())}Z`
    : '';

  if (code === 'INITIAL') return period.from ? `INIT ${dayHour(from)}` : 'INITIAL';
  if (code === 'FM') return `FM ${dayHour(from)}`;
  if (from && to) return `${code} ${dayHour(from)}–${dayHour(to)}`;
  return code;
}

export function windText(wind) {
  if (!wind) return '—';

  const direction = wind.direction === 'VRB' || wind.degrees == null
    ? wind.direction || 'VRB'
    : `${String(Math.round(wind.degrees)).padStart(3, '0')}°`;
  const speed = wind.speed?.kts;
  const gust = wind.gust?.kts;

  if (speed == null) return direction;
  return `${direction} ${speed}${gust != null ? `G${gust}` : ''} kt`;
}

export function ceilingFromClouds(clouds) {
  if (!Array.isArray(clouds)) return null;
  return clouds
    .filter(cloud => ['BKN', 'OVC', 'VV'].includes(cloud?.code) && Number.isFinite(cloud?.feet))
    .sort((a, b) => a.feet - b.feet)[0] || null;
}

export function categoryFromForecast(section) {
  const visibility = section?.visibility?.miles;
  const ceiling = ceilingFromClouds(section?.clouds)?.feet;
  let rank = 0;

  if (Number.isFinite(visibility)) {
    if (visibility < 1) rank = Math.max(rank, 3);
    else if (visibility < 3) rank = Math.max(rank, 2);
    else if (visibility <= 5) rank = Math.max(rank, 1);
  }

  if (Number.isFinite(ceiling)) {
    if (ceiling < 500) rank = Math.max(rank, 3);
    else if (ceiling < 1000) rank = Math.max(rank, 2);
    else if (ceiling <= 3000) rank = Math.max(rank, 1);
  }

  return ['VFR', 'MVFR', 'IFR', 'LIFR'][rank];
}

export function conditionsText(conditions) {
  if (!Array.isArray(conditions) || conditions.length === 0) return 'None';
  return conditions.map(condition => condition.text || condition.code).filter(Boolean).join(', ');
}

export function formatVisibility(visibility) {
  if (!visibility) return '—';
  if (visibility.text) {
    return visibility.text
      .replace('Greater than ', '>')
      .replace(' miles', ' SM')
      .replace(' mile', ' SM');
  }
  return Number.isFinite(visibility.miles) ? `${visibility.miles} SM` : '—';
}

// Compact category for a METAR: prefer the API's flight_category, else derive
// it the same way TAF sections are categorized.
export function metarCategory(report) {
  if (!report) return '—';
  return report.flight_category
    || categoryFromForecast({ visibility: report.visibility, clouds: report.clouds });
}
