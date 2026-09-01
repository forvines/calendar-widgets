import { config } from './config.js';
import { loadCalendarData } from './calendar-data.js';
import { createCalendarState } from './state.js';
import { renderCalendarFilters } from './calendar-filters.js';
import { createWeekCalendar } from './week-calendar.js';
import { createRollingCalendar } from './rolling-calendar.js';
import { createEventPopup } from './event-popup.js';

const status = document.querySelector('#calendarStatus');
const retryButton = document.querySelector('#calendarRetry');
const content = document.querySelector('#calendarContent');

retryButton.addEventListener('click', start);
start();

async function start() {
  setLoadState('loading', 'Loading calendars…');
  try {
    const data = await loadCalendarData();
    initializeCalendar(data);
    setLoadState('ready', '');
    setSampleDataFlag(data.source === 'mock');
  } catch (error) {
    console.error('Calendar initialization failed:', error);
    setLoadState('error', error.message || 'Calendar data could not be loaded.');
  }
}

function initializeCalendar(data) {
  const calendars = applyCalendarOverrides(data.calendars, config.calendarOverrides);
  const events = data.events;
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

  document.querySelector('#prevDay').onclick = () => weekCalendar.previousDay();
  document.querySelector('#nextDay').onclick = () => weekCalendar.nextDay();
  document.querySelector('#todayButton').onclick = () => weekCalendar.today();
}

function setLoadState(state, message) {
  status.dataset.state = state;
  status.querySelector('.calendar-status-message').textContent = message;
  retryButton.hidden = state !== 'error';
  status.hidden = state === 'ready';
  content.hidden = state !== 'ready';
}

function setSampleDataFlag(isMock) {
  const badge = document.querySelector('#sampleDataBadge');
  if (badge) badge.hidden = !isMock;
}

function applyCalendarOverrides(sourceCalendars, overrides) {
  return sourceCalendars
    .map(calendar => ({
      ...calendar,
      ...(overrides[calendar.id] || {}),
    }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
