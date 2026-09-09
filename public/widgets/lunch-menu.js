const params = new URLSearchParams(window.location.search);
const DATA_URL = params.get('data') || '../data/lunch-menu.json';
const TZ = 'America/Los_Angeles';

const widget = document.getElementById('widget');
const status = document.getElementById('status');
const todayDate = document.getElementById('todayDate');
const tomorrowDate = document.getElementById('tomorrowDate');
const todayMeal = document.getElementById('todayMeal');
const tomorrowMeal = document.getElementById('tomorrowMeal');

function localDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value;
  return { year: get('year'), month: get('month'), day: get('day') };
}

function keyFromParts(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(parts, days) {
  const d = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + days, 12));
  return {
    year: String(d.getUTCFullYear()),
    month: String(d.getUTCMonth() + 1).padStart(2, '0'),
    day: String(d.getUTCDate()).padStart(2, '0'),
  };
}

function displayDate(parts) {
  const d = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

function setMeal(el, value) {
  const text = String(value || '').trim();
  el.textContent = text || 'No lunch listed';
  el.classList.toggle('empty', !text);
}

async function load() {
  const today = localDateParts();
  const tomorrow = addDays(today, 1);
  todayDate.textContent = displayDate(today);
  tomorrowDate.textContent = displayDate(tomorrow);

  try {
    const res = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const days = data?.days && typeof data.days === 'object' ? data.days : {};

    setMeal(todayMeal, days[keyFromParts(today)]);
    setMeal(tomorrowMeal, days[keyFromParts(tomorrow)]);

    const updated = data.updatedAt ? new Date(data.updatedAt) : null;
    if (updated && !Number.isNaN(updated.getTime())) {
      status.textContent = `Menu refreshed ${new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      }).format(updated)}`;
      status.classList.add('visible');
    } else if (!Object.keys(days).length) {
      status.textContent = 'Menu data has not been imported yet.';
      status.classList.add('visible');
    }
  } catch (err) {
    console.error(err);
    widget.classList.add('is-error');
    setMeal(todayMeal, 'Menu unavailable');
    setMeal(tomorrowMeal, 'Menu unavailable');
    status.textContent = 'Could not load lunch menu data.';
    status.classList.add('visible');
  }
}

load();
window.setInterval(load, 6 * 60 * 60 * 1000);
