import { startOfWeek } from './date-utils.js';

export const mockCalendars = [
  { id: 'family', name: 'Family', color: '#7baaf7', defaultVisible: true, order: 10 },
  { id: 'caiden', name: 'Caiden', color: '#f28b82', defaultVisible: true, order: 20 },
  { id: 'emma', name: 'Emma', color: '#fbbc04', defaultVisible: true, order: 30 },
  { id: 'ryker', name: 'Ryker', color: '#34a853', defaultVisible: true, order: 40 },
  { id: 'kara', name: 'Kara', color: '#a78bfa', defaultVisible: true, order: 50 },
  { id: 'forrest', name: 'Forrest', color: '#46bdc6', defaultVisible: true, order: 60 },
  { id: 'flight', name: 'Flight Instruction', color: '#ff8a65', defaultVisible: true, order: 70 },
];

function atDay(weekStart, dayOffset, hour = 0, minute = 0) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function allDayDate(weekStart, dayOffset) {
  const d = atDay(weekStart, dayOffset, 0, 0);
  return d;
}

let sequence = 0;
function event(calendarId, title, start, end, options = {}) {
  sequence += 1;
  return {
    id: `mock-${sequence}`,
    calendarId,
    title,
    start,
    end,
    allDay: Boolean(options.allDay),
    location: options.location || '',
  };
}

export function createMockEvents(anchorDate = new Date()) {
  sequence = 0;
  const currentWeek = startOfWeek(anchorDate);
  const events = [];

  // Current week: deliberately includes overlaps, all-day items and short events.
  events.push(
    event('family', 'School starts', allDayDate(currentWeek, 1), allDayDate(currentWeek, 2), { allDay: true }),
    event('forrest', 'Team sync', atDay(currentWeek, 1, 9, 0), atDay(currentWeek, 1, 10, 0)),
    event('forrest', 'Project review', atDay(currentWeek, 1, 9, 30), atDay(currentWeek, 1, 11, 0)),
    event('emma', 'Gymnastics', atDay(currentWeek, 1, 16, 30), atDay(currentWeek, 1, 18, 30), { location: 'Gym' }),
    event('caiden', 'Practice', atDay(currentWeek, 2, 15, 30), atDay(currentWeek, 2, 17, 0)),
    event('family', 'Dentist', atDay(currentWeek, 2, 16, 0), atDay(currentWeek, 2, 17, 0), { location: 'Bonney Lake' }),
    event('kara', 'Flight lesson', atDay(currentWeek, 3, 8, 0), atDay(currentWeek, 3, 10, 0), { location: 'KPLU' }),
    event('ryker', 'Soccer', atDay(currentWeek, 3, 17, 0), atDay(currentWeek, 3, 18, 30)),
    event('family', 'Dinner', atDay(currentWeek, 4, 18, 0), atDay(currentWeek, 4, 19, 0)),
    event('flight', 'Discovery flight', atDay(currentWeek, 5, 10, 0), atDay(currentWeek, 5, 12, 0), { location: 'KPLU' }),
    event('emma', 'Meet', atDay(currentWeek, 6, 9, 0), atDay(currentWeek, 6, 13, 0)),
    event('family', 'Family movie', atDay(currentWeek, 6, 19, 0), atDay(currentWeek, 6, 21, 0)),
  );

  // Generate several weeks of realistic repeating/future items for rolling view.
  for (let week = 1; week <= 14; week += 1) {
    const w = new Date(currentWeek);
    w.setDate(w.getDate() + week * 7);

    events.push(
      event('forrest', 'Work', atDay(w, 1, 8, 30), atDay(w, 1, 17, 0)),
      event('emma', 'Gymnastics', atDay(w, 2, 16, 30), atDay(w, 2, 18, 30)),
      event('ryker', 'Practice', atDay(w, 3, 16, 0), atDay(w, 3, 17, 30)),
      event('caiden', 'Practice', atDay(w, 4, 15, 30), atDay(w, 4, 17, 0)),
      event('flight', week % 2 ? 'Flight instruction' : 'Aircraft time', atDay(w, 6, 9, 0), atDay(w, 6, 11, 0), { location: 'KPLU' }),
    );

    if (week % 2 === 0) {
      events.push(event('family', 'Recycle', allDayDate(w, 4), allDayDate(w, 5), { allDay: true }));
    }
    if (week % 3 === 0) {
      events.push(event('family', 'School event', atDay(w, 4, 18, 0), atDay(w, 4, 19, 30), { location: 'School' }));
    }
    if (week % 4 === 1) {
      events.push(event('kara', 'CFI schedule', atDay(w, 5, 11, 0), atDay(w, 5, 14, 0), { location: 'KPLU' }));
    }
  }

  return events;
}
