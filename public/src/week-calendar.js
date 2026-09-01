import { startOfWeek } from './date-utils.js';
import { hexToRgba, readableTextColor } from './color-utils.js';

function spansMultipleDays(event) {
  if (!event.end) return false;
  const startDay = new Date(event.start);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(event.end);
  endDay.setHours(0, 0, 0, 0);
  return endDay.getTime() > startDay.getTime();
}

function toFullCalendarEvent(event, calendarMap) {
  const calendar = calendarMap.get(event.calendarId);
  // All-day events, and timed events that span more than one calendar day, are
  // shown as bars in the top all-day row rather than inside the hour grid. The
  // original event (with real start/end times) is preserved for the popup.
  const displayAllDay = event.allDay || spansMultipleDays(event);
  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: displayAllDay,
    backgroundColor: calendar?.color,
    borderColor: calendar?.color,
    textColor: readableTextColor(calendar?.color),
    extendedProps: {
      calendarId: event.calendarId,
      originalEvent: event,
      calendarColor: calendar?.color,
    },
  };
}

// Widen the visible hour range so timed events that fall before the configured
// start hour or after the configured end hour are still shown for this week.
function weekHourRange(events, weekStart, config) {
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  let minHour = config.week.startHour;
  let maxHour = config.week.endHour;

  for (const event of events) {
    if (event.allDay || !event.start) continue;
    if (event.start >= end || (event.end || event.start) < start) continue;
    minHour = Math.min(minHour, event.start.getHours());
    if (event.end) {
      // Round the end hour up so an event ending at 23:15 still shows hour 24.
      const endHour = event.end.getHours() + (event.end.getMinutes() > 0 ? 1 : 0);
      maxHour = Math.max(maxHour, endHour);
    } else {
      maxHour = Math.max(maxHour, event.start.getHours() + 1);
    }
  }

  return {
    minHour: Math.max(0, Math.min(minHour, 24)),
    maxHour: Math.min(24, Math.max(maxHour, minHour + 1)),
  };
}

export function createWeekCalendar({
  element,
  events,
  calendars,
  visibleIds,
  config,
  onEventClick,
  weekStart,
}) {
  if (!window.FullCalendar?.Calendar) {
    throw new Error('FullCalendar did not load. Check the CDN connection.');
  }

  const calendarMap = new Map(calendars.map(c => [c.id, c]));
  let currentVisibleIds = new Set(visibleIds);
  const initialDate = weekStart || startOfWeek();
  const { minHour, maxHour } = weekHourRange(events, initialDate, config);

  const calendar = new window.FullCalendar.Calendar(element, {
    initialView: 'timeGridRollingSeven',
    initialDate,
    views: {
      timeGridRollingSeven: {
        type: 'timeGrid',
        duration: { days: config.week.daysVisible },
      },
    },
    headerToolbar: false,
    firstDay: config.display.firstDay,
    height: 'auto',
    expandRows: false,
    allDaySlot: config.display.showAllDayEvents,
    nowIndicator: config.display.showCurrentTime,
    slotMinTime: `${String(minHour).padStart(2, '0')}:00:00`,
    slotMaxTime: `${String(maxHour).padStart(2, '0')}:00:00`,
    slotDuration: minutesToDuration(config.week.slotMinutes),
    slotLabelInterval: '01:00:00',
    scrollTime: `${String(config.week.initialScrollHour).padStart(2, '0')}:00:00`,
    scrollTimeReset: false,
    dayHeaderContent: renderDayHeader,
    slotLabelFormat: { hour: '2-digit', hour12: false },
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    slotMinHeight: config.week.slotMinHeight,
    eventMinHeight: 18,
    eventShortHeight: 28,
    slotEventOverlap: false,
    eventOrderStrict: true,
    // FullCalendar 7 ships hashed CSS class names, so styling the default event
    // internals is unreliable. Render our own markup with stable classes
    // (wk-event-*) that fullcalendar.css can target directly.
    eventContent(arg) {
      const wrap = document.createElement('div');
      wrap.className = 'wk-event';

      if (arg.timeText) {
        const time = document.createElement('span');
        time.className = 'wk-event-time';
        time.textContent = arg.timeText;
        wrap.appendChild(time);
      }

      const title = document.createElement('span');
      title.className = 'wk-event-title';
      title.textContent = arg.event.title;
      wrap.appendChild(title);

      return { domNodes: [wrap] };
    },
    eventDidMount(info) {
      const color = info.event.extendedProps.calendarColor;
      if (!color) return;
      info.el.style.setProperty('--event-color', color);
      info.el.style.setProperty('background-color', hexToRgba(color, .88), 'important');
      info.el.style.setProperty('color', readableTextColor(color), 'important');
      // FullCalendar 7 hashes class names, so style the actual background-
      // carrying element here rather than relying on a .fc-event selector.
      info.el.style.setProperty('border-radius', '3px', 'important');
      info.el.style.setProperty('overflow', 'hidden', 'important');
    },
    events: [],
    eventClick(info) {
      info.jsEvent.preventDefault();
      const original = info.event.extendedProps.originalEvent;
      if (original) onEventClick(original);
    },
  });

  function visibleEvents() {
    return events
      .filter(event => currentVisibleIds.has(event.calendarId))
      .map(event => toFullCalendarEvent(event, calendarMap));
  }

  function refreshEvents() {
    calendar.removeAllEvents();
    calendar.addEventSource(visibleEvents());
  }

  calendar.render();
  refreshEvents();

  // v6's global build injects CSS asynchronously; the calendar may render
  // before its container has final dimensions. Force a re-layout once the
  // current frame settles so the grid paints correctly on first load.
  requestAnimationFrame(() => calendar.updateSize());

  return {
    setVisibleCalendars(ids) {
      currentVisibleIds = new Set(ids);
      refreshEvents();
    },
    destroy() {
      calendar.destroy();
    },
  };
}

function renderDayHeader(arg) {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(arg.date);
  const day = arg.date.getDate();
  return {
    html: `
      <span class="week-day-heading${arg.isToday ? ' is-today' : ''}">
        <span class="week-day-name">${weekday}</span>
        <span class="week-day-number">${day}</span>
      </span>
    `,
  };
}

function minutesToDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
}
