export function renderCalendarFilters(container, calendars, state, onChange) {
  const sorted = [...calendars].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  container.innerHTML = '';

  for (const calendar of sorted) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'calendar-filter';
    button.dataset.calendarId = calendar.id;
    button.setAttribute('aria-pressed', state.isVisible(calendar.id) ? 'true' : 'false');

    const dot = document.createElement('span');
    dot.className = 'calendar-dot';
    dot.style.backgroundColor = calendar.color;

    const label = document.createElement('span');
    label.textContent = calendar.name;

    button.append(dot, label);
    updateButton(button, state.isVisible(calendar.id));

    button.addEventListener('click', () => {
      state.toggle(calendar.id);
      updateButton(button, state.isVisible(calendar.id));
      onChange(state.getVisibleIds());
    });

    container.appendChild(button);
  }
}

function updateButton(button, visible) {
  button.classList.toggle('is-hidden-calendar', !visible);
  button.setAttribute('aria-pressed', visible ? 'true' : 'false');
}
