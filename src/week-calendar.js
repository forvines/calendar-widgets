function toFullCalendarEvent(event, calendarMap) {
  const calendar = calendarMap.get(event.calendarId);
  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
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

function formatRange(start, endExclusive) {
  const end = new Date(endExclusive);
  end.setDate(end.getDate() - 1);

  const sameMonth = start.getMonth() === end.getMonth();
  const monthStart = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(start);
  const monthEnd = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(end);

  if (sameMonth) {
    return `${monthStart} ${start.getDate()} – ${end.getDate()}`;
  }
  return `${monthStart} ${start.getDate()} – ${monthEnd} ${end.getDate()}`;
}

export function createWeekCalendar({
  element,
  rangeLabel,
  events,
  calendars,
  visibleIds,
  config,
  onEventClick,
}) {
  if (!window.FullCalendar?.Calendar) {
    throw new Error('FullCalendar did not load. Check the CDN connection.');
  }

  const calendarMap = new Map(calendars.map(c => [c.id, c]));
  let currentVisibleIds = new Set(visibleIds);

  const calendar = new window.FullCalendar.Calendar(element, {
    themeSystem: 'standard',
    initialView: 'timeGridRollingSeven',
    initialDate: startOfCurrentWeek(),
    views: {
      timeGridRollingSeven: {
        type: 'timeGrid',
        duration: { days: config.week.daysVisible },
      },
    },
    headerToolbar: false,
    firstDay: config.display.firstDay,
    timeZone: config.timeZone,
    height: '100%',
    expandRows: true,
    allDaySlot: config.display.showAllDayEvents,
    nowIndicator: config.display.showCurrentTime,
    slotMinTime: `${String(config.week.startHour).padStart(2, '0')}:00:00`,
    slotMaxTime: `${String(config.week.endHour).padStart(2, '0')}:00:00`,
    slotDuration: minutesToDuration(config.week.slotMinutes),
    slotLabelInterval: '01:00:00',
    scrollTime: `${String(config.week.initialScrollHour).padStart(2, '0')}:00:00`,
    scrollTimeReset: false,
    dayHeaderContent: renderDayHeader,
    slotLabelFormat: { hour: 'numeric' },
    eventTimeFormat: { hour: 'numeric', minute: '2-digit' },
    slotMinHeight: config.week.slotMinHeight,
    eventMinHeight: 18,
    eventShortHeight: 28,
    slotEventOverlap: true,
    eventOrderStrict: true,
    eventDidMount(info) {
      const color = info.event.extendedProps.calendarColor;
      if (!color) return;
      info.el.style.setProperty('--event-color', color);
      info.el.style.setProperty('background-color', hexToRgba(color, .88), 'important');
      info.el.style.setProperty('color', readableTextColor(color), 'important');
    },
    events: [],
    datesSet(info) {
      rangeLabel.textContent = formatRange(info.start, info.end);
    },
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
  installSwipeNavigation(element, calendar, config.week.swipeIncrementDays);

  return {
    nextDay() {
      calendar.incrementDate({ days: config.week.swipeIncrementDays });
    },
    previousDay() {
      calendar.incrementDate({ days: -config.week.swipeIncrementDays });
    },
    today() {
      calendar.gotoDate(startOfCurrentWeek());
    },
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

function hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== 'string') return `rgba(75, 95, 115, ${alpha})`;
  const value = hex.replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(value)) return hex;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function readableTextColor(hex) {
  if (!hex || typeof hex !== 'string') return '#eef5fb';
  const value = hex.replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(value)) return '#eef5fb';
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > .67 ? '#081018' : '#ffffff';
}

function minutesToDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
}

function startOfCurrentWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function installSwipeNavigation(element, calendar, incrementDays) {
  let pointerId = null;
  let startX = 0;
  let startY = 0;

  element.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
  }, { passive: true });

  element.addEventListener('pointerup', event => {
    if (pointerId !== event.pointerId) return;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    pointerId = null;

    // Only treat a deliberate horizontal gesture as navigation. Vertical
    // scrolling remains native inside FullCalendar's time grid.
    if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.35) return;

    calendar.incrementDate({ days: dx < 0 ? incrementDays : -incrementDays });
  }, { passive: true });

  element.addEventListener('pointercancel', () => {
    pointerId = null;
  }, { passive: true });
}
