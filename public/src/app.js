import { config } from './config.js';
import { mockCalendars, createMockEvents } from './mock-data.js';
import { createCalendarState } from './state.js';
import { renderCalendarFilters } from './calendar-filters.js';
import { createWeekCalendar } from './week-calendar.js';
import { createRollingCalendar } from './rolling-calendar.js';
import { createEventPopup } from './event-popup.js';

const calendars = applyCalendarOverrides(mockCalendars, config.calendarOverrides);
const events = createMockEvents(new Date());
const state = createCalendarState(calendars);

const popup = createEventPopup({
  overlay: document.querySelector('#eventOverlay'),
  closeButton: document.querySelector('#eventClose'),
  calendars,
});

const weekCalendar = createWeekCalendar({
  element: document.querySelector('#weekCalendar'),
  rangeLabel: document.querySelector('#weekRange'),
  events,
  calendars,
  visibleIds: state.getVisibleIds(),
  config,
  onEventClick: event => popup.open(event),
});

const rollingCalendar = createRollingCalendar({
  container: document.querySelector('#rollingCalendar'),
  events,
  calendars,
  visibleIds: state.getVisibleIds(),
  config,
  onEventClick: event => popup.open(event),
});

renderCalendarFilters(
  document.querySelector('#calendarFilters'),
  calendars,
  state,
  visibleIds => {
    weekCalendar.setVisibleCalendars(visibleIds);
    rollingCalendar.setVisibleCalendars(visibleIds);
  },
);

document.querySelector('#prevDay').addEventListener('click', () => weekCalendar.previousDay());
document.querySelector('#nextDay').addEventListener('click', () => weekCalendar.nextDay());
document.querySelector('#todayButton').addEventListener('click', () => weekCalendar.today());

function applyCalendarOverrides(sourceCalendars, overrides) {
  return sourceCalendars
    .map(calendar => ({
      ...calendar,
      ...(overrides[calendar.id] || {}),
    }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
