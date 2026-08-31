function formatEventRange(event) {
  if (event.allDay) return 'All day';

  const options = { hour: 'numeric', minute: '2-digit' };
  const start = new Intl.DateTimeFormat('en-US', options).format(event.start);
  const end = event.end
    ? new Intl.DateTimeFormat('en-US', options).format(event.end)
    : '';

  return end ? `${start} – ${end}` : start;
}

export function createEventPopup({ overlay, closeButton, calendars }) {
  const calendarMap = new Map(calendars.map(c => [c.id, c]));
  const title = overlay.querySelector('#eventTitle');
  const calendarName = overlay.querySelector('#eventCalendarName');
  const time = overlay.querySelector('#eventTime');
  const location = overlay.querySelector('#eventLocation');

  function close() {
    overlay.hidden = true;
  }

  closeButton.addEventListener('click', close);
  overlay.addEventListener('click', event => {
    if (event.target === overlay) close();
  });

  return {
    open(event) {
      const calendar = calendarMap.get(event.calendarId);
      title.textContent = event.title;
      calendarName.textContent = calendar?.name || '';
      calendarName.style.color = calendar?.color || '';
      time.textContent = formatEventRange(event);
      location.textContent = event.location || '';
      location.hidden = !event.location;
      overlay.hidden = false;
    },
    close,
  };
}
