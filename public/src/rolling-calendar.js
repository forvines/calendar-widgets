import { addDays, startOfWeek } from './date-utils.js';

function sameCalendarDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function eventTouchesDay(event, day) {
  if (event.allDay) {
    const end = event.end ? new Date(event.end) : addDays(event.start, 1);
    return event.start < addDays(day, 1) && end > day;
  }
  return sameCalendarDay(event.start, day);
}

function monthForWeek(weekStart) {
  // The middle of the week produces more intuitive month labels around
  // cross-month weeks than simply using Sunday's month.
  return addDays(weekStart, 3);
}

function monthKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function formatMonth(date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatEventTime(event) {
  if (event.allDay) return '';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: event.start.getMinutes() ? '2-digit' : undefined,
  }).format(event.start);
}

export function createRollingCalendar({
  container,
  events,
  calendars,
  visibleIds,
  config,
  onEventClick,
}) {
  const calendarMap = new Map(calendars.map(c => [c.id, c]));
  const today = new Date();
  const firstFutureWeek = addDays(startOfWeek(today), 7);
  let renderedWeeks = config.rolling.initialWeeks;
  let currentVisibleIds = new Set(visibleIds);
  let appending = false;

  function render({ preserveScroll = true } = {}) {
    const savedScroll = preserveScroll ? container.scrollTop : 0;
    container.innerHTML = '';

    const weekdayHeader = document.createElement('div');
    weekdayHeader.className = 'rolling-weekdays';
    for (const name of ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']) {
      const cell = document.createElement('div');
      cell.textContent = name;
      weekdayHeader.appendChild(cell);
    }
    container.appendChild(weekdayHeader);

    let previousMonth = null;

    for (let weekIndex = 0; weekIndex < renderedWeeks; weekIndex += 1) {
      const weekStart = addDays(firstFutureWeek, weekIndex * 7);
      const representativeMonth = monthForWeek(weekStart);
      const key = monthKey(representativeMonth);

      if (key !== previousMonth) {
        const month = document.createElement('div');
        month.className = 'rolling-month-label';
        month.textContent = formatMonth(representativeMonth);
        container.appendChild(month);
        previousMonth = key;
      }

      const weekRow = document.createElement('div');
      weekRow.className = 'rolling-week';

      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const day = addDays(weekStart, dayIndex);
        weekRow.appendChild(renderDay(day));
      }

      container.appendChild(weekRow);
    }

    if (preserveScroll) container.scrollTop = savedScroll;
  }

  function renderDay(day) {
    const dayCell = document.createElement('div');
    dayCell.className = 'rolling-day';

    if (sameCalendarDay(day, new Date())) dayCell.classList.add('is-today');

    const number = document.createElement('div');
    number.className = 'rolling-day-number';
    number.textContent = day.getDate();
    dayCell.appendChild(number);

    const dayEvents = events
      .filter(event => currentVisibleIds.has(event.calendarId))
      .filter(event => eventTouchesDay(event, day))
      .sort((a, b) => a.start - b.start);

    const shown = dayEvents.slice(0, config.rolling.maxEventsPerDay);
    for (const event of shown) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'rolling-event';
      const calendar = calendarMap.get(event.calendarId);
      pill.style.setProperty('--event-color', calendar?.color || '#7baaf7');

      const eventTime = formatEventTime(event);
      pill.innerHTML = eventTime
        ? `<span class="rolling-event-time">${escapeHtml(eventTime)}</span><span>${escapeHtml(event.title)}</span>`
        : `<span>${escapeHtml(event.title)}</span>`;

      pill.addEventListener('click', () => onEventClick(event));
      dayCell.appendChild(pill);
    }

    if (dayEvents.length > shown.length) {
      const more = document.createElement('div');
      more.className = 'rolling-more';
      more.textContent = `+${dayEvents.length - shown.length} more`;
      dayCell.appendChild(more);
    }

    return dayCell;
  }

  container.addEventListener('scroll', () => {
    if (appending) return;
    const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (remaining > 260) return;

    appending = true;
    renderedWeeks += config.rolling.appendWeeks;
    render({ preserveScroll: true });
    requestAnimationFrame(() => { appending = false; });
  }, { passive: true });

  render({ preserveScroll: false });

  return {
    setVisibleCalendars(ids) {
      currentVisibleIds = new Set(ids);
      render({ preserveScroll: true });
    },
    reset() {
      renderedWeeks = config.rolling.initialWeeks;
      render({ preserveScroll: false });
    },
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
