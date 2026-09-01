export const config = {
  week: {
    startHour: 5,
    endHour: 23,
    daysVisible: 7,
    slotMinutes: 60,
    slotMinHeight: 28,
    initialScrollHour: 6,
  },

  rolling: {
    initialWeeks: 8,
    appendWeeks: 6,
  },

  display: {
    firstDay: 0, // Sunday
    showAllDayEvents: true,
    showCurrentTime: true,
  },

  // This object is intentionally keyed by stable calendar IDs.
  // Later, Google calendars can be discovered automatically and only calendars
  // that need overrides will need an entry here.
  calendarOverrides: {
    // Example for Phase 3+:
    // 'calendar-id@group.calendar.google.com': {
    //   label: 'Flight Instruction',
    //   color: '#64b5f6',
    //   defaultVisible: false,
    //   order: 30,
    // },
  },
};
