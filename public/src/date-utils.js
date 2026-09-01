// Shared calendar date math.
//
// These helpers were previously duplicated across mock-data.js,
// rolling-calendar.js, week-calendar.js, and calendar-data.js. Keeping a single
// implementation avoids the copies drifting apart (for example if the week ever
// needs to start on a day other than Sunday).

const DAY_MS = 24 * 60 * 60 * 1000;

export { DAY_MS };

// Midnight (local time) of the Sunday on or before the given date.
export function startOfWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

// A new Date offset from the given date by whole days.
export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
