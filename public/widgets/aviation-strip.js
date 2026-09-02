import { metarCategory } from './aviation-core.js';
import { MOCK_AVIATION } from './aviation-mock.js';

const METAR_REFRESH_MS = 30 * 60 * 1000;
const TAF_REFRESH_MS = 4 * 60 * 60 * 1000;
const INTERACTION_FLOOR_MS = 5 * 60 * 1000; // client-side floor; server enforces its own
const params = new URLSearchParams(window.location.search);
const ACCESS_TOKEN = params.get('k') || '';
const MOCK = params.get('mock') === '1'; // quota-free UI preview

function endpoint(type, force) {
  const p = new URLSearchParams();
  if (type) p.set('type', type);
  if (force) p.set('force', '1');
  if (ACCESS_TOKEN) p.set('k', ACCESS_TOKEN);
  const qs = p.toString();
  return qs ? `/api/aviation?${qs}` : '/api/aviation';
}

const strip = document.getElementById('strip');
const rowsEl = document.getElementById('rows');
const errorText = document.getElementById('errorText');

// One row per station report, kept per type so METAR and TAF refresh on
// independent cadences.
let metarRows = [];
let tafRows = [];
let lastMetarFetch = 0;

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function loadType(type, { force = false } = {}) {
  strip.classList.remove('is-error');

  if (MOCK) {
    if (!type || type === 'metar') { metarRows = buildMetar(MOCK_AVIATION); lastMetarFetch = Date.now(); }
    if (!type || type === 'taf') { tafRows = buildTaf(MOCK_AVIATION); }
    render();
    return;
  }

  try {
    const res = await fetch(endpoint(type, force), { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message || `HTTP ${res.status}`);
    if (type === 'metar' || !type) { metarRows = buildMetar(body); lastMetarFetch = Date.now(); }
    if (type === 'taf' || !type) { tafRows = buildTaf(body); }
    render();
  } catch (err) {
    console.error(err);
    strip.classList.add('is-error');
    errorText.textContent = err.message || 'Unavailable';
  }
}

function buildMetar(body) {
  // A single row of station category pills: KPLU, KRNT, KTIW, KCLS, ...
  const stations = (Array.isArray(body.metar) ? body.metar : []).map(m => ({
    icao: m.icao || '—',
    category: metarCategory(m),
  }));
  return stations.length ? [{ kind: 'METAR', stations }] : [];
}

function buildTaf(body) {
  return (Array.isArray(body.taf) ? body.taf : []).map(t => {
    const sections = Array.isArray(t.forecast) ? t.forecast : [];
    const periods = sections.map(sec => ({
      category: metarCategory({ visibility: sec.visibility, clouds: sec.clouds }),
      time: transitionTime(sec),
    }));
    return {
      kind: 'TAF',
      icao: t.icao || '—',
      periods,
      raw: t.raw_text || '',
    };
  });
}

// Zulu HH of a forecast section's transition (its start), e.g. "18Z".
function transitionTime(section) {
  const iso = section?.change?.period?.from;
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getUTCHours()).padStart(2, '0')}Z`;
}

function render() {
  const all = [...metarRows, ...tafRows];
  rowsEl.innerHTML = '';
  for (const s of all) {
    const row = document.createElement('div');
    row.className = 'row';

    if (s.kind === 'TAF') {
      // A horizontal timeline of category pills, one per transition, each
      // labeled with its Zulu transition time.
      const pills = s.periods.map(p =>
        `<span class="tafpill ${esc(p.category)}">${esc(p.category)}${p.time ? ` <span class="tafpill-t">${esc(p.time)}</span>` : ''}</span>`
      ).join('');
      row.innerHTML = `
        <span class="icao">${esc(s.icao)}</span>
        <span class="taf-timeline">${pills || '<span class="raw">No forecast</span>'}</span>
      `;
    } else {
      // METAR row: one station pill (ICAO + category) per station.
      const pills = s.stations.map(st =>
        `<span class="stnpill ${esc(st.category)}"><span class="stnpill-id">${esc(st.icao)}</span> ${esc(st.category)}</span>`
      ).join('');
      row.innerHTML = `
        <span class="taf-timeline">${pills || '<span class="raw">No data</span>'}</span>
      `;
      row.addEventListener('click', () => {
        if (!MOCK && Date.now() - lastMetarFetch > INTERACTION_FLOOR_MS) {
          loadType('metar', { force: true });
        }
      });
    }
    rowsEl.appendChild(row);
  }
}

loadType('metar');
loadType('taf');
window.setInterval(() => loadType('metar'), METAR_REFRESH_MS);
window.setInterval(() => loadType('taf'), TAF_REFRESH_MS);
