import { addDays, startOfWeek } from './date-utils.js';
import { hexToRgba, readableTextColor } from './color-utils.js';

function sameCalendarDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function dayStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Inclusive last calendar day an event covers. All-day events use an exclusive
// end (Google convention), so the last covered day is end - 1 day.
function eventEndDay(event) {
  if (!event.end) return dayStart(event.start);
  if (event.allDay) return dayStart(addDays(event.end, -1));
  return dayStart(event.end);
}

// An event is a "spanning" bar when it is all-day or covers more than one
// calendar day. These render as continuous bars across the week grid.
function isSpanning(event) {
  if (event.allDay) return true;
  return eventEndDay(event).getTime() > dayStart(event.start).getTime();
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
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
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

  function styleEventEl(el, event) {
    const color = calendarMap.get(event.calendarId)?.color || '#7baaf7';
    el.style.setProperty('--event-color', color);
    el.style.setProperty('background-color', hexToRgba(color, 0.88));
    el.style.setProperty('color', readableTextColor(color));
  }

  function eventInner(event) {
    const time = formatEventTime(event);
    return time
      ? `<span class="rolling-event-time">${escapeHtml(time)}</span><span>${escapeHtml(event.title)}</span>`
      : `<span>${escapeHtml(event.title)}</span>`;
  }

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

      container.appendChild(renderWeek(weekStart));
    }

    if (preserveScroll) container.scrollTop = savedScroll;
  }

  function renderWeek(weekStart) {
    const weekRow = document.createElement('div');
    weekRow.className = 'rolling-week';

    const days = [];
    for (let i = 0; i < 7; i += 1) days.push(addDays(weekStart, i));
    const weekEnd = days[6];
    const dayMs = 86400000;

    const visible = events.filter(e => currentVisibleIds.has(e.calendarId));

    // Assign spanning (all-day / multi-day) events to lanes so overlapping bars
    // stack. Compute this first so day cells can reserve the right top padding.
    const spanning = visible
      .filter(isSpanning)
      .filter(e => dayStart(e.start) <= weekEnd && eventEndDay(e) >= days[0])
      .sort((a, b) => (dayStart(a.start) - dayStart(b.start))
        || (eventEndDay(b) - eventEndDay(a)));

    const laneEnds = []; // last occupied column index per lane
    const placed = [];
    for (const event of spanning) {
      const startCol = Math.max(0, Math.round((dayStart(event.start) - days[0]) / dayMs));
      const endCol = Math.min(6, Math.round((eventEndDay(event) - days[0]) / dayMs));
      let lane = laneEnds.findIndex(end => end < startCol);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = endCol;
      placed.push({ event, startCol, endCol, lane });
    }
    const laneCount = laneEnds.length;

    // Day cells (normal grid flow). Each reserves top space for the bar lanes
    // so its single-day events begin below any spanning bars.
    for (let i = 0; i < 7; i += 1) {
      const dayCell = document.createElement('div');
      dayCell.className = 'rolling-day';
      dayCell.style.setProperty('--span-lanes', String(laneCount));
      if (sameCalendarDay(days[i], new Date())) dayCell.classList.add('is-today');

      const number = document.createElement('div');
      number.className = 'rolling-day-number';
      number.textContent = days[i].getDate();
      dayCell.appendChild(number);

      const dayTimed = visible
        .filter(e => !isSpanning(e) && sameCalendarDay(e.start, days[i]))
        .sort((a, b) => a.start - b.start);
      if (dayTimed.length) {
        const stack = document.createElement('div');
        stack.className = 'rolling-day-events';
        for (const event of dayTimed) {
          const pill = document.createElement('button');
          pill.type = 'button';
          pill.className = 'rolling-event';
          styleEventEl(pill, event);
          pill.innerHTML = eventInner(event);
          pill.addEventListener('click', () => onEventClick(event));
          stack.appendChild(pill);
        }
        dayCell.appendChild(stack);
      }
      weekRow.appendChild(dayCell);
    }

    // Spanning-bar overlay: one continuous bar per event, positioned over the
    // day columns by percentage width and lane offset. Decoupled from the day-
    // cell flow so bars never collide with numbers or per-day events.
    if (placed.length) {
      const layer = document.createElement('div');
      layer.className = 'rolling-span-layer';
      for (const { event, startCol, endCol, lane } of placed) {
        const bar = document.createElement('button');
        bar.type = 'button';
        bar.className = 'rolling-span';
        if (dayStart(event.start) < days[0]) bar.classList.add('is-continued-left');
        if (eventEndDay(event) > weekEnd) bar.classList.add('is-continued-right');
        bar.style.left = `${(startCol / 7) * 100}%`;
        bar.style.width = `${((endCol - startCol + 1) / 7) * 100}%`;
        bar.style.top = `calc(var(--rolling-day-number-h) + ${lane} * var(--rolling-span-h))`;
        styleEventEl(bar, event);
        bar.innerHTML = eventInner(event);
        bar.addEventListener('click', () => onEventClick(event));
        layer.appendChild(bar);
      }
      weekRow.appendChild(layer);
    }

    return weekRow;
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
