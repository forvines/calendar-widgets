export const config = {
  week: {
    startHour: 6,
    endHour: 23,
    daysVisible: 7,
    slotMinutes: 60,
    slotMinHeight: 42,
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

  // After this many seconds without interaction, the calendar fades so the
  // DAKboard background photo shows through more; any touch/click/scroll/key
  // returns it to full opacity. Set idleFadeSeconds to 0 to disable.
  idle: {
    idleFadeSeconds: 120,
    fadedOpacity: 0.25, // ~twice as see-through (lower = more transparent)
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
