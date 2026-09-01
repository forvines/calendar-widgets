import {
  ceilingFromClouds,
  conditionsText,
  formatVisibility,
  metarCategory,
  metarSummary,
  periodLabel,
  windText,
} from './aviation-core.js';

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
const pillList = document.getElementById('pillList');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const errorText = document.getElementById('errorText');
const detailBack = document.getElementById('detailBack');
const detailIcao = document.getElementById('detailIcao');
const detailName = document.getElementById('detailName');
const detailCat = document.getElementById('detailCat');
const detailBody = document.getElementById('detailBody');

detailBack.addEventListener('click', showList);

// Station reports, kept per type so METAR and TAF refresh on independent
// cadences without re-fetching each other.
let metarStations = [];
let tafStations = [];
let openKey = null;
let lastMetarFetch = 0;

function stationsAll() {
  return [...metarStations, ...tafStations];
}

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

// Fetch a single report type. force triggers a server refresh (bounded by the
// server's floor). Updates only that type's stations, then re-renders.
async function loadType(type, { force = false } = {}) {
  statusDot.className = 'dot loading';
  statusText.textContent = 'Updating…';
  strip.classList.remove('is-error');

  if (MOCK) {
    const body = MOCK_AVIATION;
    if (!type || type === 'metar') { metarStations = buildMetar(body); lastMetarFetch = Date.now(); }
    if (!type || type === 'taf') { tafStations = buildTaf(body); }
    renderList();
    if (openKey) {
      const still = stationsAll().find(s => s.key === openKey);
      if (still) renderDetail(still);
    }
    statusDot.className = 'dot';
    statusText.textContent = 'Preview (mock data)';
    return;
  }

  try {
    const res = await fetch(endpoint(type, force), { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = body?.error?.code;
      throw new Error(code === 'AVIATION_NOT_CONFIGURED' ? 'Aviation not configured'
        : (body?.error?.message || `HTTP ${res.status}`));
    }
    if (type === 'metar') { metarStations = buildMetar(body); lastMetarFetch = Date.now(); }
    else if (type === 'taf') { tafStations = buildTaf(body); }
    renderList();
    if (openKey) {
      const still = stationsAll().find(s => s.key === openKey);
      if (still) renderDetail(still);
    }
    statusDot.className = 'dot';
    statusText.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  } catch (err) {
    console.error(err);
    statusDot.className = 'dot error';
    statusText.textContent = 'Unavailable';
    strip.classList.add('is-error');
    errorText.textContent = err.message || 'Error';
  }
}

function buildMetar(body) {
  return (Array.isArray(body.metar) ? body.metar : []).map((m, i) => ({
    key: `metar:${m.icao || i}`,
    kind: 'METAR',
    icao: m.icao || '—',
    name: m.station?.name || '',
    category: metarCategory(m),
    summary: metarSummary(m),
    raw: m.raw_text || '',
    report: m,
  }));
}

function buildTaf(body) {
  return (Array.isArray(body.taf) ? body.taf : []).map((t, i) => {
    const first = Array.isArray(t.forecast) ? t.forecast[0] : null;
    return {
      key: `taf:${t.icao || i}`,
      kind: 'TAF',
      icao: t.icao || '—',
      name: t.station?.name || '',
      category: first ? categoryOf(first) : '—',
      summary: tafSummary(t),
      raw: t.raw_text || '',
      report: t,
    };
  });
}

function categoryOf(section) {
  return metarCategory({ visibility: section.visibility, clouds: section.clouds });
}

function tafSummary(t) {
  const from = t.period?.from ? utc(t.period.from) : '';
  const to = t.period?.to ? utc(t.period.to) : '';
  return from && to ? `valid ${from}→${to}` : 'terminal forecast';
}

function utc(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCHours()).padStart(2, '0')}Z`;
}

function renderList() {
  pillList.innerHTML = '';
  for (const s of stationsAll()) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'pill';
    pill.innerHTML = `
      <span class="pill-icao">${esc(s.icao)}</span>
      <span class="cat ${esc(s.category)}">${esc(s.category)}</span>
      <span class="pill-raw">${esc(s.raw || s.summary)}</span>
      <span class="pill-kind">${esc(s.kind)}</span>
    `;
    pill.addEventListener('click', () => openStation(s));
    pillList.appendChild(pill);
  }
}

// Opening a METAR station also triggers an interaction refresh (bounded by the
// client floor; the server floor is the real guard against exceeding quota).
function openStation(s) {
  openKey = s.key;
  renderDetail(s);
  if (s.kind === 'METAR' && Date.now() - lastMetarFetch > INTERACTION_FLOOR_MS) {
    loadType('metar', { force: true });
  }
}

function renderDetail(s) {
  openKey = s.key;
  detailIcao.textContent = s.icao;
  detailName.textContent = s.name;
  detailCat.textContent = s.category;
  detailCat.className = `cat ${s.category}`;
  detailBody.innerHTML = s.kind === 'METAR' ? metarDetail(s.report) : tafDetail(s.report);
  strip.classList.add('is-detail');
}

function metarDetail(m) {
  const ceiling = m.ceiling || ceilingFromClouds(m.clouds);
  const lines = [
    `<div class="detail-line"><b>Wind</b> ${esc(windText(m.wind))}</div>`,
    `<div class="detail-line"><b>Visibility</b> ${esc(formatVisibility(m.visibility))}</div>`,
    `<div class="detail-line"><b>Ceiling</b> ${Number.isFinite(ceiling?.feet) ? esc(ceiling.feet.toLocaleString()) + ' ft' : 'None'}</div>`,
    `<div class="detail-line"><b>Weather</b> ${esc(conditionsText(m.conditions))}</div>`,
  ];
  if (m.raw_text) lines.push(`<pre class="raw">${esc(m.raw_text)}</pre>`);
  return lines.join('');
}

function tafDetail(t) {
  const rows = (Array.isArray(t.forecast) ? t.forecast : []).slice(0, 6).map(section => {
    const cat = categoryOf(section);
    return `<div class="detail-line"><b>${esc(periodLabel(section))}</b> `
      + `<span class="cat ${cat}" style="font-size:8.5px">${cat}</span> `
      + `${esc(windText(section.wind))} · ${esc(formatVisibility(section.visibility))}</div>`;
  });
  if (t.raw_text) rows.push(`<pre class="raw">${esc(t.raw_text)}</pre>`);
  return rows.join('') || '<div class="detail-line">No forecast sections.</div>';
}

function showList() {
  openKey = null;
  strip.classList.remove('is-detail');
}

// Initial load of both, then independent refresh cadences.
loadType('metar');
loadType('taf');
window.setInterval(() => loadType('metar'), METAR_REFRESH_MS);
window.setInterval(() => loadType('taf'), TAF_REFRESH_MS);

