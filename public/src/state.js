const STORAGE_KEY = 'dakboard-calendar-visible-v1';

function readStoredIds() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function persist(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // DAKboard/browser storage can be unavailable. Filtering still works for
    // the current session, it simply will not persist across reloads.
  }
}

export function createCalendarState(calendars) {
  const defaults = calendars.filter(c => c.defaultVisible !== false).map(c => c.id);
  const stored = readStoredIds();
  const validIds = new Set(calendars.map(c => c.id));

  let visibleIds = new Set(
    (stored || defaults).filter(id => validIds.has(id))
  );

  return {
    isVisible(id) {
      return visibleIds.has(id);
    },
    toggle(id) {
      if (visibleIds.has(id)) visibleIds.delete(id);
      else visibleIds.add(id);
      persist(visibleIds);
      return new Set(visibleIds);
    },
    getVisibleIds() {
      return new Set(visibleIds);
    },
    showAll() {
      visibleIds = new Set(calendars.map(c => c.id));
      persist(visibleIds);
      return new Set(visibleIds);
    },
  };
}
