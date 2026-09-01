export function round(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

export function formatTemperature(value) {
  const rounded = round(value);
  return rounded == null ? '—' : `${rounded}°`;
}

export function formatPercent(value) {
  const rounded = round(value);
  return rounded == null ? '—' : `${rounded}%`;
}

export function formatInches(value) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0 in';
  if (value < 0.01) return '<0.01 in';
  return `${value.toFixed(2)} in`;
}

export function windDirection(degrees) {
  if (!Number.isFinite(degrees)) return '';
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const normalized = ((degrees % 360) + 360) % 360;
  return directions[Math.round(normalized / 45) % directions.length];
}

export function weatherInfo(code, isDay = true) {
  const map = {
    0: ['Clear', isDay ? '☀️' : '🌙'],
    1: ['Mostly clear', isDay ? '🌤️' : '🌙☁️'],
    2: ['Partly cloudy', isDay ? '⛅' : '🌙☁️'],
    3: ['Overcast', '☁️'],
    45: ['Fog', '🌫️'],
    48: ['Rime fog', '🌫️'],
    51: ['Light drizzle', '🌦️'],
    53: ['Drizzle', '🌦️'],
    55: ['Heavy drizzle', '🌧️'],
    56: ['Freezing drizzle', '🌧️'],
    57: ['Heavy freezing drizzle', '🌧️'],
    61: ['Light rain', '🌦️'],
    63: ['Rain', '🌧️'],
    65: ['Heavy rain', '🌧️'],
    66: ['Freezing rain', '🌧️'],
    67: ['Heavy freezing rain', '🌧️'],
    71: ['Light snow', '🌨️'],
    73: ['Snow', '❄️'],
    75: ['Heavy snow', '❄️'],
    77: ['Snow grains', '❄️'],
    80: ['Rain showers', '🌦️'],
    81: ['Rain showers', '🌧️'],
    82: ['Heavy showers', '⛈️'],
    85: ['Snow showers', '🌨️'],
    86: ['Heavy snow showers', '❄️'],
    95: ['Thunderstorm', '⛈️'],
    96: ['Thunderstorm / hail', '⛈️'],
    99: ['Strong thunderstorm / hail', '⛈️'],
  };
  return map[code] || ['Weather', '🌡️'];
}

export function aqiInfo(aqi) {
  if (!Number.isFinite(aqi)) return { label: 'Unavailable', cls: '', value: '—' };
  if (aqi <= 50) return { label: 'Good', cls: 'aq-good', value: Math.round(aqi) };
  if (aqi <= 100) return { label: 'Moderate', cls: 'aq-moderate', value: Math.round(aqi) };
  if (aqi <= 150) return { label: 'Sensitive', cls: 'aq-usg', value: Math.round(aqi) };
  if (aqi <= 200) return { label: 'Unhealthy', cls: 'aq-unhealthy', value: Math.round(aqi) };
  if (aqi <= 300) return { label: 'Very unhealthy', cls: 'aq-very', value: Math.round(aqi) };
  return { label: 'Hazardous', cls: 'aq-hazard', value: Math.round(aqi) };
}

export function isDaylightAt(iso, daily) {
  if (!iso || !daily?.time?.length) return true;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return true;

  const localDate = iso.slice(0, 10);
  let dayIndex = daily.time.indexOf(localDate);

  if (dayIndex < 0) {
    dayIndex = daily.time.findIndex(date => date >= localDate);
    if (dayIndex < 0) dayIndex = daily.time.length - 1;
  }

  const rise = daily.sunrise?.[dayIndex] ? new Date(daily.sunrise[dayIndex]) : null;
  const set = daily.sunset?.[dayIndex] ? new Date(daily.sunset[dayIndex]) : null;

  if (!rise || !set || Number.isNaN(rise.getTime()) || Number.isNaN(set.getTime())) {
    return true;
  }

  return target >= rise && target < set;
}

export function moonPhaseInfo(date = new Date()) {
  // This approximation is suitable for a dashboard, not navigation or astronomy.
  const synodicMonth = 29.53058867;
  const epoch = Date.UTC(2000, 0, 6, 18, 14, 0);
  const days = (date.getTime() - epoch) / 86400000;
  const age = ((days % synodicMonth) + synodicMonth) % synodicMonth;
  const fraction = age / synodicMonth;
  const illumination = Math.round((1 - Math.cos(2 * Math.PI * fraction)) * 50);

  if (fraction < 0.0625 || fraction >= 0.9375) {
    return { name: 'New Moon', icon: '🌑', illumination };
  }
  if (fraction < 0.1875) return { name: 'Waxing Crescent', icon: '🌒', illumination };
  if (fraction < 0.3125) return { name: 'First Quarter', icon: '🌓', illumination };
  if (fraction < 0.4375) return { name: 'Waxing Gibbous', icon: '🌔', illumination };
  if (fraction < 0.5625) return { name: 'Full Moon', icon: '🌕', illumination };
  if (fraction < 0.6875) return { name: 'Waning Gibbous', icon: '🌖', illumination };
  if (fraction < 0.8125) return { name: 'Last Quarter', icon: '🌗', illumination };
  return { name: 'Waning Crescent', icon: '🌘', illumination };
}
