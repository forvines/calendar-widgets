import {
  categoryFromForecast,
  ceilingFromClouds,
  conditionsText,
  formatVisibility,
  pad2,
  periodLabel,
  windText,
} from './aviation-core.js';

  // ============================================================
  // CONFIGURATION
  // ============================================================
  const CHECKWX_API_KEY = "YOUR_CHECKWX_API_KEY";
  const REFRESH_MINUTES = 10;

  const METAR_ICAO = "KPLU";
  const TAF_ICAO = "KTCM";

  // CheckWX API v2 endpoints
  const API = "https://api.checkwx.com/v2";

  const $ = (id) => document.getElementById(id);

  const statusDot = $("statusDot");
  const updateText = $("updateText");
  const errorBox = $("errorBox");

  function apiUrl(path) {
    return `${API}${path}?x-api-key=${encodeURIComponent(CHECKWX_API_KEY)}`;
  }

  function showError(message) {
    statusDot.className = "dot error";
    updateText.textContent = "Weather unavailable";
    errorBox.textContent = message;
    errorBox.classList.add("show");
  }

  function clearError() {
    errorBox.textContent = "";
    errorBox.classList.remove("show");
  }

  function utcStamp(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}Z`;
  }

  function localStamp(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short"
      }).format(d);
    } catch {
      return "";
    }
  }

  function addForecastRow(grid, section) {
    const category = categoryFromForecast(section);
    const ceiling = ceilingFromClouds(section.clouds);

    // Wide layout: normal six-column row.
    const wideCells = [
      {text: periodLabel(section), cls:"fc mono change"},
      {html:`<span class="cat-pill ${category}">${category}</span>`, cls:"fc"},
      {text: windText(section.wind), cls:"fc mono"},
      {text: formatVisibility(section.visibility), cls:"fc mono"},
      {text: ceiling ? `${ceiling.feet.toLocaleString()} ft` : "None", cls:"fc mono"},
      {text: conditionsText(section.conditions), cls:"fc"}
    ];

    wideCells.forEach(c => {
      const d = document.createElement("div");
      d.className = `${c.cls} wide-forecast-cell`;
      if (c.html) d.innerHTML = c.html;
      else d.textContent = c.text;
      grid.appendChild(d);
    });

    // Narrow layout: one stacked card per forecast period.
    const row = document.createElement("div");
    row.className = "forecast-row";

    const period = document.createElement("div");
    period.className = "forecast-period";
    period.innerHTML = `
      <span class="period-text">${periodLabel(section)}</span>
      <span class="cat-pill ${category}">${category}</span>
    `;
    row.appendChild(period);

    const narrowCells = [
      ["Wind", windText(section.wind), true],
      ["Visibility", formatVisibility(section.visibility), true],
      ["Ceiling", ceiling ? `${ceiling.feet.toLocaleString()} ft` : "None", true],
      ["Weather", conditionsText(section.conditions), false]
    ];

    narrowCells.forEach(([label, value, mono]) => {
      const cell = document.createElement("div");
      cell.className = `forecast-cell${mono ? " mono" : ""}`;
      cell.dataset.label = label;
      cell.textContent = value;
      row.appendChild(cell);
    });

    grid.appendChild(row);
  }

  async function getJson(url) {
    const response = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-store"
    });

    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        detail = body?.error || body?.message || "";
      } catch {
        // A non-JSON error response has no additional CheckWX detail.
      }
      throw new Error(`CheckWX returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    return response.json();
  }

  async function loadWeather() {
    clearError();
    statusDot.className = "dot loading";
    updateText.textContent = "Updating…";

    if (!CHECKWX_API_KEY || CHECKWX_API_KEY === "YOUR_CHECKWX_API_KEY") {
      showError("Add your CheckWX API key to CHECKWX_API_KEY near the top of the script.");
      return;
    }

    try {
      const [metarJson, tafJson] = await Promise.all([
        getJson(apiUrl(`/metar/${METAR_ICAO}/decoded`)),
        getJson(apiUrl(`/taf/${TAF_ICAO}/decoded`))
      ]);

      const m = metarJson?.data?.[0];
      const t = tafJson?.data?.[0];

      if (!m) throw new Error(`No METAR returned for ${METAR_ICAO}.`);
      if (!t) throw new Error(`No TAF returned for ${TAF_ICAO}.`);

      // ----- METAR -----
      $("metarStation").textContent = m.station?.name || "Thun Field";

      const cat = m.flight_category || "—";
      $("metarCategory").textContent = cat;
      $("metarCategory").className = `badge ${cat}`;

      $("wind").textContent = windText(m.wind);
      $("windSub").textContent =
        m.wind?.direction && m.wind.direction !== "VRB"
          ? `${m.wind.direction} wind`
          : "\u00a0";

      $("visibility").textContent = formatVisibility(m.visibility);
      $("visibilitySub").textContent =
        Number.isFinite(m.visibility?.meters)
          ? `${Math.round(m.visibility.meters).toLocaleString()} m`
          : "\u00a0";

      const ceil = m.ceiling || ceilingFromClouds(m.clouds);
      $("ceiling").textContent =
        Number.isFinite(ceil?.feet) ? `${ceil.feet.toLocaleString()} ft` : "None";
      $("ceilingSub").textContent = ceil?.text || "No BKN/OVC/VV ceiling";

      $("altimeter").textContent =
        Number.isFinite(m.pressure?.hg) ? `${Number(m.pressure.hg).toFixed(2)} inHg` : "—";
      $("altimeterSub").textContent =
        Number.isFinite(m.pressure?.mb) ? `${Math.round(m.pressure.mb)} hPa` : "\u00a0";

      $("tempDew").textContent =
        Number.isFinite(m.temperature?.celsius) && Number.isFinite(m.dewpoint?.celsius)
          ? `${m.temperature.celsius}° / ${m.dewpoint.celsius}°C`
          : "—";
      $("tempDewSub").textContent =
        Number.isFinite(m.temperature?.fahrenheit) && Number.isFinite(m.dewpoint?.fahrenheit)
          ? `${m.temperature.fahrenheit}° / ${m.dewpoint.fahrenheit}°F`
          : "\u00a0";

      $("conditions").textContent = conditionsText(m.conditions);
      $("conditionsSub").textContent =
        Number.isFinite(m.humidity) ? `RH ${m.humidity}%` : "\u00a0";

      $("rawMetar").textContent = m.raw_text || "No raw METAR text returned.";
      $("metarTime").textContent =
        m.observed ? `Observed ${utcStamp(m.observed)} · ${localStamp(m.observed)}` : "";

      // ----- TAF -----
      $("tafStation").textContent = t.station?.name || "McChord Field";
      $("rawTaf").textContent = t.raw_text || "No raw TAF text returned.";
      $("tafTime").textContent =
        t.issued ? `Issued ${utcStamp(t.issued)} · ${localStamp(t.issued)}` : "";

      const validFrom = t.period?.from ? utcStamp(t.period.from) : "";
      const validTo = t.period?.to ? utcStamp(t.period.to) : "";
      $("tafMeta").textContent =
        validFrom && validTo ? `Valid ${validFrom} through ${validTo}` : "Terminal forecast";

      const grid = $("forecastGrid");
      while (grid.children.length > 6) grid.removeChild(grid.lastChild);

      const forecast = Array.isArray(t.forecast) ? t.forecast : [];
      if (forecast.length) {
        forecast.forEach(section => addForecastRow(grid, section));
      } else {
        const d = document.createElement("div");
        d.className = "fc";
        d.style.gridColumn = "1 / -1";
        d.textContent = "No decoded forecast sections returned.";
        grid.appendChild(d);
      }

      const now = new Date();
      updateText.textContent =
        `Updated ${now.toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})}`;
      statusDot.className = "dot";

    } catch (err) {
      console.error(err);
      showError(
        `${err.message} If this page is hosted publicly, also confirm your CheckWX key is valid and that browser requests are allowed.`
      );
    }
  }

  loadWeather();
  window.setInterval(loadWeather, REFRESH_MINUTES * 60 * 1000);
