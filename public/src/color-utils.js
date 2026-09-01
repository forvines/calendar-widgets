// Shared color helpers for rendering event surfaces in the calendar colors.
// Used by both the week (FullCalendar) and rolling/month views so a light
// calendar color (e.g. yellow) gets dark text and a dark color gets light text.

export function hexToRgba(hex, alpha) {
  const rgb = parseHex(hex);
  if (!rgb) return typeof hex === 'string' ? hex : `rgba(75, 95, 115, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function readableTextColor(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return '#eef5fb';
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance > 0.67 ? '#081018' : '#ffffff';
}

function parseHex(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const value = hex.replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(value)) return null;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}
