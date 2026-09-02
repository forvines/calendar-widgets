import { config } from './config.js';
import { loadCalendarData } from './calendar-data.js';
import { createCalendarState } from './state.js';
import { renderCalendarFilters } from './calendar-filters.js';
import { createMonthAccordion } from './rolling-calendar.js';
import { createEventPopup } from './event-popup.js';
import { installIdleFade } from './idle-fade.js';

const status = document.querySelector('#calendarStatus');
const retryButton = document.querySelector('#calendarRetry');
const content = document.querySelector('#calendarContent');
const reloadButton = document.querySelector('#reloadButton');

// How often the calendar silently re-fetches from the backend so edits made in
// Google Calendar appear on a passive wall display without manual interaction.
const AUTO_REFRESH_MINUTES = 10;

let currentMonth = null; // live accordion instance, so reloads can replace it

// Fade the calendar toward the background photo after inactivity. On going idle,
// snap the accordion to the current week so the idle view always shows the week
// containing today (the idle CSS isolates and bottom-anchors that week).
installIdleFade(document.querySelector('#app'), config.idle, {
  onIdle: () => { if (currentMonth) currentMonth.goToToday(); },
});

retryButton.addEventListener('click', () => start());
if (reloadButton) reloadButton.addEventListener('click', () => start({ isReload: true }));
start();
window.setInterval(() => start({ isReload: true, silent: true }), AUTO_REFRESH_MINUTES * 60 * 1000);

async function start({ isReload = false, silent = false } = {}) {
  // On the first load (and non-silent reloads) show the loading state. A silent
  // auto-refresh keeps the current view up while fetching so the display does
  // not flash.
  if (!silent) setLoadState('loading', isReload ? 'Reloading…' : 'Loading calendars…');
  if (reloadButton) reloadButton.classList.add('is-busy');
  try {
    const data = await loadCalendarData();
    initializeCalendar(data);
    setLoadState('ready', '');
    setSampleDataFlag(data.source === 'mock');
  } catch (error) {
    console.error('Calendar initialization failed:', error);
    // A failed silent refresh leaves the existing view in place rather than
    // replacing it with an error screen.
    if (!silent) setLoadState('error', error.message || 'Calendar data could not be loaded.');
  } finally {
    if (reloadButton) reloadButton.classList.remove('is-busy');
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

  // Replace any prior instance (e.g. from a reload) so FullCalendar instances
  // inside expanded weeks are not leaked.
  if (currentMonth && typeof currentMonth.destroy === 'function') currentMonth.destroy();

  currentMonth = createMonthAccordion({
    container: document.querySelector('#monthAccordion'),
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
    visibleIds => currentMonth.setVisibleCalendars(visibleIds),
  );
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
