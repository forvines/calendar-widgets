import {
  aqiInfo,
  formatInches as fmtInches,
  formatPercent as fmtPercent,
  formatTemperature as fmtTemp,
  moonPhaseInfo,
  round,
  weatherInfo,
  windDirection as windDir,
} from './weather-core.js';

  // ============================================================
  // LOCATION — Bonney Lake, WA 98391 (city-center point).
  // Change these values if you want to pin the widget to a more exact location.
  // ============================================================
  const LATITUDE = 47.1770457;
  const LONGITUDE = -122.1865056;
  const LOCATION_LABEL = "Bonney Lake · 98391";
  const TIMEZONE = "America/Los_Angeles";
  const REFRESH_MINUTES = 10;

  const $ = (id) => document.getElementById(id);

  const statusDot = $("statusDot");
  const updateText = $("updateText");
  const errorBox = $("errorBox");

  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.search = new URLSearchParams({
    latitude: LATITUDE,
    longitude: LONGITUDE,
    timezone: TIMEZONE,
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    forecast_days: "7",
    current: [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation",
      "rain",
      "showers",
      "snowfall",
      "weather_code",
      "cloud_cover",
      "pressure_msl",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m"
    ].join(","),
    hourly: [
      "temperature_2m",
      "precipitation_probability",
      "precipitation",
      "weather_code",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m"
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
      "precipitation_sum",
      "sunrise",
      "sunset",
      "uv_index_max",
      "wind_speed_10m_max",
      "wind_gusts_10m_max"
    ].join(",")
  }).toString();

  const airUrl = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  airUrl.search = new URLSearchParams({
    latitude: LATITUDE,
    longitude: LONGITUDE,
    timezone: TIMEZONE,
    current: "us_aqi,pm2_5,pm10,ozone"
  }).toString();

  const alertUrl =
    `https://api.weather.gov/alerts/active?point=${encodeURIComponent(LATITUDE + "," + LONGITUDE)}`;

  function showError(message) {
    statusDot.className = "dot error";
    updateText.textContent = "Weather unavailable";
    errorBox.textContent = message;
    errorBox.classList.add("show");
  }

  function clearError() {
    errorBox.classList.remove("show");
    errorBox.textContent = "";
  }

  async function getJson(url, options = {}) {
    const host = new URL(url).hostname;
    let response;

    try {
      response = await fetch(url, {
        cache: "no-store",
        ...options
      });
    } catch (err) {
      throw new Error(`${host}: ${err?.message || "Failed to fetch"}`, { cause: err });
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${host}`);
    }

    return response.json();
  }

  function fmtClock(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit"
    }).format(d);
  }

  function fmtHour(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {hour:"numeric"}).format(d);
  }

  function dayName(iso, index) {
    if (index === 0) return "Today";
    const d = new Date(`${iso}T12:00:00`);
    return new Intl.DateTimeFormat("en-US", {weekday:"short"}).format(d);
  }

  function renderMoonPhase() {
    const moon = moonPhaseInfo(new Date());
    const trend = moon.name.includes("Waxing")
      ? "Waxing"
      : moon.name.includes("Waning")
        ? "Waning"
        : moon.name.includes("Full")
          ? "Full"
          : "New";

    $("moonValue").textContent = moon.icon;
    $("moonSub").textContent = `${trend} · ${moon.illumination}%`;
  }

  function findHourlyStart(hourly) {
    if (!hourly?.time?.length) return 0;
    const now = Date.now();
    let best = 0;
    let bestDiff = Infinity;
    hourly.time.forEach((t, i) => {
      const ms = new Date(t).getTime();
      const diff = ms - now;
      if (diff >= -30 * 60 * 1000 && diff < bestDiff) {
        best = i;
        bestDiff = diff;
      }
    });
    return best;
  }

  // Held so a day click can re-render the hourly chart anchored to that day.
  let lastHourly = null;
  let lastDaily = null;

  // Builds the shared hourly series for the active window (24 hours from start).
  function hourlySeries(hourly, startIndex) {
    const isNowView = startIndex == null;
    const start = isNowView ? findHourlyStart(hourly) : startIndex;
    const n = hourly.time?.length || 0;
    const points = [];
    for (let k = 0; k < 24; k += 1) {
      const i = start + k;
      if (i >= n) break;
      points.push({
        i,
        time: hourly.time[i],
        temp: hourly.temperature_2m?.[i],
        pop: Number.isFinite(hourly.precipitation_probability?.[i]) ? hourly.precipitation_probability[i] : 0,
        amount: Number.isFinite(hourly.precipitation?.[i]) ? hourly.precipitation[i] : 0,
        code: hourly.weather_code?.[i],
        wind: Number.isFinite(hourly.wind_speed_10m?.[i]) ? hourly.wind_speed_10m[i] : null,
        windDir: Number.isFinite(hourly.wind_direction_10m?.[i]) ? hourly.wind_direction_10m[i] : null,
      });
    }
    return { points, isNowView };
  }

  // Renders the hourly chart (temperature line + precip bars + wind row) for the
  // active window (now, or a selected day).
  function renderHourly(hourly, daily, startIndex) {
    const grid = $("hourlyGrid");
    grid.innerHTML = "";
    if (!hourly?.time?.length) return;
    grid.classList.add("is-chart");
    renderCombo(grid, hourlySeries(hourly, startIndex), daily);
  }
  // ---- SVG chart (no dependencies) ----
  const CHART_W = 720, CHART_H = 166, PAD_L = 26, PAD_R = 30, PAD_T = 14, PAD_B = 40;

  // A small arrow glyph rotated to show wind direction (pointing the way the
  // wind blows toward; API direction is where it comes from, so +180°).
  function windArrow(x, y, dirFrom) {
    const rot = Number.isFinite(dirFrom) ? (dirFrom + 180) % 360 : 0;
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="ch-wind-arrow" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})">↑</text>`;
  }

  function svgEl(view, inner) {
    return `<svg class="hourly-chart" viewBox="0 0 ${CHART_W} ${CHART_H}" preserveAspectRatio="none" role="img" aria-label="${view}">${inner}</svg>`;
  }

  function xFor(idx, count) {
    if (count <= 1) return PAD_L;
    return PAD_L + (idx / (count - 1)) * (CHART_W - PAD_L - PAD_R);
  }

  // Maps an ambient temperature (°F) to a color along a cold→hot scale.
  function tempColor(t) {
    if (!Number.isFinite(t)) return "#ffb74d";
    const stops = [
      [20, "#5b8def"],  // very cold - blue
      [35, "#4bc6e8"],  // freezing - cyan
      [50, "#3fbf9f"],  // cool - teal
      [62, "#7cc451"],  // mild - green
      [72, "#f2c744"],  // warm - yellow
      [84, "#f2913d"],  // hot - orange
      [95, "#e0413a"], // very hot - red
    ];
    if (t <= stops[0][0]) return stops[0][1];
    if (t >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
    for (let i = 0; i < stops.length - 1; i += 1) {
      const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
      if (t >= t0 && t <= t1) return lerpColor(c0, c1, (t - t0) / (t1 - t0));
    }
    return "#ffb74d";
  }

  function hexToRgb(h) {
    const v = h.replace("#", "");
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
  }
  function lerpColor(a, b, f) {
    const ca = hexToRgb(a), cb = hexToRgb(b);
    const m = ca.map((v, i) => Math.round(v + (cb[i] - v) * Math.max(0, Math.min(1, f))));
    return `rgb(${m[0]},${m[1]},${m[2]})`;
  }

  // A horizontal gradient with a stop per hour colored by that hour's temp, so
  // the temperature line is tinted by ambient temperature along its length.
  function tempGradient(id, points) {
    const n = points.length;
    const stops = points.map((p, idx) => {
      const off = n <= 1 ? 0 : (idx / (n - 1)) * 100;
      return `<stop offset="${off.toFixed(1)}%" stop-color="${tempColor(p.temp)}"/>`;
    }).join("");
    return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient></defs>`;
  }

  function hourTicks(points) {
    // Label roughly every 3 hours to avoid clutter.
    return points.map((p, idx) => ({ idx, label: fmtHour(p.time), show: idx % 3 === 0 }));
  }

  function tempLinePath(points, minT, maxT, yTop, yBot) {
    const span = Math.max(1, maxT - minT);
    return points.map((p, idx) => {
      const x = xFor(idx, points.length);
      const t = Number.isFinite(p.temp) ? p.temp : minT;
      const y = yBot - ((t - minT) / span) * (yBot - yTop);
      return `${idx === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }

  function xAxisLabels(points, y) {
    return hourTicks(points).filter(t => t.show).map(t =>
      `<text x="${xFor(t.idx, points.length).toFixed(1)}" y="${y}" class="ch-axis ch-x">${t.label}</text>`
    ).join("");
  }

  // Sunrise/sunset events (with x position) that fall within the window's time
  // span, for drawing markers on the combo chart.
  function sunEventsInWindow(points, daily) {
    if (!points.length || !daily) return [];
    const startMs = new Date(points[0].time).getTime();
    const endMs = new Date(points[points.length - 1].time).getTime();
    const span = Math.max(1, endMs - startMs);
    const xAt = ms => PAD_L + ((ms - startMs) / span) * (CHART_W - PAD_L - PAD_R);
    const out = [];
    const days = daily.time?.length || 0;
    for (let d = 0; d < days; d += 1) {
      for (const [key, glyph] of [["sunrise", "☀"], ["sunset", "☾"]]) {
        const iso = daily[key]?.[d];
        if (!iso) continue;
        const ms = new Date(iso).getTime();
        if (ms >= startMs && ms <= endMs) {
          out.push({ x: xAt(ms), glyph, label: fmtClock(iso), kind: key });
        }
      }
    }
    return out;
  }

  function renderCombo(grid, series, daily) {
    const pts = series.points;
    const temps = pts.map(p => p.temp).filter(Number.isFinite);
    if (!temps.length) { grid.innerHTML = '<div class="chart-empty">No data</div>'; return; }
    const minT = Math.min(...temps), maxT = Math.max(...temps);
    // Temp occupies the top ~55%, precip bars the bottom ~45%, shared x-axis.
    const tempTop = PAD_T, tempBot = PAD_T + (CHART_H - PAD_T - PAD_B) * 0.55;
    const barTop = tempBot + 10, barBot = CHART_H - PAD_B;
    const path = tempLinePath(pts, minT, maxT, tempTop, tempBot);
    const bw = (CHART_W - PAD_L - PAD_R) / pts.length * 0.7;

    const bars = pts.map((p, idx) => {
      const h = (Math.max(0, Math.min(100, p.pop)) / 100) * (barBot - barTop);
      const x = xFor(idx, pts.length) - bw / 2;
      const wet = p.amount > 0.005;
      return `<rect x="${x.toFixed(1)}" y="${(barBot - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" class="ch-bar ${wet ? "is-wet" : ""}" rx="1"/>`;
    }).join("");

    // Per-hour rain amount labels above bars with measurable precip.
    const amounts = pts.map((p, idx) => {
      if (!(p.amount > 0.005)) return "";
      const h = (Math.max(0, Math.min(100, p.pop)) / 100) * (barBot - barTop);
      const x = xFor(idx, pts.length);
      const y = Math.min(barBot - h - 2, barBot - 2);
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" class="ch-amt">${p.amount.toFixed(2)}</text>`;
    }).join("");

    // Right-side precipitation % axis.
    const pctAxis = `
      <text x="${CHART_W - 2}" y="${(barTop + 3).toFixed(1)}" class="ch-axis ch-right">100%</text>
      <text x="${CHART_W - 2}" y="${((barTop + barBot) / 2 + 3).toFixed(1)}" class="ch-axis ch-right">50%</text>
      <text x="${CHART_W - 2}" y="${barBot.toFixed(1)}" class="ch-axis ch-right">0%</text>`;

    // Sunrise/sunset markers spanning the chart.
    const sun = sunEventsInWindow(pts, daily).map(e =>
      `<line x1="${e.x.toFixed(1)}" y1="${tempTop}" x2="${e.x.toFixed(1)}" y2="${barBot}" class="ch-sun ${e.kind}"/>`
      + `<text x="${e.x.toFixed(1)}" y="${(tempTop - 2).toFixed(1)}" class="ch-sun-lbl">${e.glyph} ${e.label}</text>`
    ).join("");

    // Wind under each time label (same columns), stacked on a second baseline
    // so columns stay evenly spaced and never crowd each other.
    const timeY = barBot + 13;
    const windY = barBot + 24;
    const wind = hourTicks(pts).filter(t => t.show).map(t => {
      const p = pts[t.idx];
      if (!Number.isFinite(p.wind)) return "";
      const x = xFor(t.idx, pts.length);
      return windArrow(x - 6, windY, p.windDir)
        + `<text x="${(x + 2).toFixed(1)}" y="${windY.toFixed(1)}" class="ch-wind-spd">${Math.round(p.wind)}</text>`;
    }).join("");

    grid.innerHTML = svgEl("Hourly temperature and precipitation", `
      ${tempGradient("tempgrad", pts)}
      ${sun}
      <text x="2" y="${(tempTop + 3).toFixed(1)}" class="ch-axis">${Math.round(maxT)}°</text>
      <text x="2" y="${(tempBot + 3).toFixed(1)}" class="ch-axis">${Math.round(minT)}°</text>
      ${bars}
      ${amounts}
      ${pctAxis}
      <path d="${path}" class="ch-templine" fill="none" stroke="url(#tempgrad)"/>
      ${xAxisLabels(pts, timeY)}
      ${wind}
    `);
  }

  // First hourly index whose local date matches the given daily date.
  function hourlyIndexForDay(hourly, dayIso) {
    if (!hourly?.time?.length || !dayIso) return null;
    const idx = hourly.time.findIndex(t => String(t).slice(0, 10) === String(dayIso).slice(0, 10));
    return idx >= 0 ? idx : null;
  }

  function renderDaily(daily) {
    const grid = $("dailyGrid");
    grid.innerHTML = "";

    const count = Math.min(7, daily.time?.length || 0);
    for (let i = 0; i < count; i++) {
      const info = weatherInfo(daily.weather_code?.[i]);
      const pop = round(daily.precipitation_probability_max?.[i]);

      const card = document.createElement("button");
      card.type = "button";
      card.className = "day";
      card.innerHTML = `
        <div class="day-name">${dayName(daily.time[i], i)}</div>
        <div class="day-icon">${info[1]}</div>
        <div class="day-temps">
          ${fmtTemp(daily.temperature_2m_max?.[i])}
          <span class="low">${fmtTemp(daily.temperature_2m_min?.[i])}</span>
        </div>
        <div class="day-pop">${pop == null ? "—" : pop + "%"} · ${fmtInches(daily.precipitation_sum?.[i])}</div>
      `;
      // Clicking a day brings it into the hour-by-hour strip, replacing the
      // currently shown day. Today (index 0) returns to the live "now" view.
      card.addEventListener("click", () => selectDay(i));
      grid.appendChild(card);
    }
  }

  // Re-renders the hourly strip anchored to the selected day and highlights it.
  function selectDay(dayIndex) {
    if (!lastHourly || !lastDaily) return;
    const startIndex = dayIndex === 0
      ? undefined // live "now" view
      : hourlyIndexForDay(lastHourly, lastDaily.time?.[dayIndex]);
    renderHourly(lastHourly, lastDaily, startIndex);

    const cards = $("dailyGrid").children;
    for (let i = 0; i < cards.length; i++) {
      cards[i].classList.toggle("is-selected", i === dayIndex);
    }
  }

  function renderWeather(weather) {
    const c = weather.current || {};
    const d = weather.daily || {};

    const isDay = (() => {
      if (!d.sunrise?.[0] || !d.sunset?.[0]) return true;
      const now = Date.now();
      return now >= new Date(d.sunrise[0]).getTime() && now <= new Date(d.sunset[0]).getTime();
    })();

    const info = weatherInfo(c.weather_code, isDay);

    $("currentIcon").textContent = info[1];
    $("currentTemp").textContent = fmtTemp(c.temperature_2m);
    $("currentCondition").textContent = info[0];
    $("feelsLike").textContent = `Feels like ${fmtTemp(c.apparent_temperature)}`;

    const todayPop = fmtPercent(d.precipitation_probability_max?.[0]);
    const todayRainAmount = fmtInches(d.precipitation_sum?.[0]);
    $("todaySummary").innerHTML =
      `Today ${fmtTemp(d.temperature_2m_max?.[0])} / <span class="today-low">${fmtTemp(d.temperature_2m_min?.[0])}</span> · Rain ${todayPop} · ${todayRainAmount}`;

    const dir = windDir(c.wind_direction_10m);
    $("windValue").textContent =
      Number.isFinite(c.wind_speed_10m)
        ? `${dir ? dir + " " : ""}${round(c.wind_speed_10m)} mph`
        : "—";
    $("windSub").textContent =
      Number.isFinite(c.wind_gusts_10m)
        ? `Gust ${round(c.wind_gusts_10m)} mph`
        : "Gust —";

    $("humidityValue").textContent = fmtPercent(c.relative_humidity_2m);
    $("humiditySub").textContent =
      Number.isFinite(d.uv_index_max?.[0])
        ? `UV max ${Math.round(d.uv_index_max[0])}`
        : "UV —";

    $("sunsetValue").textContent = fmtClock(d.sunset?.[0]);
    $("sunriseSub").textContent = `Sunrise ${fmtClock(d.sunrise?.[0])}`;

    $("pressureValue").textContent =
      Number.isFinite(c.pressure_msl)
        ? `${(c.pressure_msl * 0.0295299830714).toFixed(2)} inHg`
        : "—";

    $("rainNowValue").textContent = fmtInches(c.precipitation);
    $("rainNowSub").textContent =
      Number.isFinite(c.rain) && c.rain > 0 ? `Rain ${fmtInches(c.rain)}` : "This hour";

    $("cloudValue").textContent = fmtPercent(c.cloud_cover);

    lastHourly = weather.hourly || {};
    lastDaily = d;
    renderHourly(lastHourly, lastDaily);
    renderDaily(d);
  }

  function renderAirUnavailable() {
    $("aqiValue").innerHTML = `<span class="aqi-pill">—</span> Unavailable`;
    $("aqiSub").textContent = "AQI service unavailable";
  }

  function renderAir(air) {
    const c = air.current || {};
    const info = aqiInfo(c.us_aqi);

    $("aqiValue").innerHTML =
      `<span class="aqi-pill ${info.cls}">${info.value}</span>`;
    $("aqiSub").textContent =
      Number.isFinite(c.pm2_5)
        ? `PM2.5 ${Math.round(c.pm2_5)} µg/m³`
        : "PM2.5 —";
  }

  function alertRank(severity) {
    return {
      Extreme: 5,
      Severe: 4,
      Moderate: 3,
      Minor: 2,
      Unknown: 1
    }[severity] || 0;
  }

  function renderAlerts(alerts) {
    const icon = $("severeIcon");
    const features = Array.isArray(alerts?.features) ? alerts.features : [];
    if (!features.length) {
      icon.hidden = true;
      icon.removeAttribute("title");
      return;
    }

    features.sort((a, b) =>
      alertRank(b?.properties?.severity) - alertRank(a?.properties?.severity)
    );
    const p = features[0]?.properties || {};
    const until = p.ends ? ` · until ${fmtClock(p.ends)}` : "";
    const headline = (p.headline || p.description || "").replace(/\s+/g, " ").trim();

    // Compact indicator: the icon shows when any alert is active; the event
    // name + headline live in its tooltip.
    icon.hidden = false;
    icon.title = `${p.event || "Weather Alert"}${until}${headline ? `\n${headline}` : ""}`;
  }

  async function load() {
    renderMoonPhase();
    clearError();
    statusDot.className = "dot loading";
    updateText.textContent = "Updating…";
    $("locationLabel").textContent = LOCATION_LABEL;

    try {
      // NWS alerts are allowed to fail independently so the weather panel
      // remains useful even if api.weather.gov is temporarily unavailable.
      const [weatherResult, airResult, alertsResult] = await Promise.allSettled([
        getJson(weatherUrl.toString()),
        getJson(airUrl.toString()),
        getJson(alertUrl, {
          headers: {"Accept":"application/geo+json"}
        })
      ]);

      // The main weather forecast is the only required service.
      // AQI and NWS alerts fail independently so a secondary API outage
      // cannot blank the entire DAKboard widget.
      if (weatherResult.status !== "fulfilled") {
        const reason = weatherResult.reason;
        throw new Error(
          `Weather API failed: ${reason?.message || "network request failed"}`
        );
      }

      renderWeather(weatherResult.value);

      if (airResult.status === "fulfilled") {
        renderAir(airResult.value);
      } else {
        console.warn("Air-quality request failed:", airResult.reason);
        renderAirUnavailable();
      }

      if (alertsResult.status === "fulfilled") {
        renderAlerts(alertsResult.value);
      } else {
        console.warn("NWS alert request failed:", alertsResult.reason);
        $("severeIcon").hidden = true;
      }

      statusDot.className = "dot";

      const secondaryIssues = [];
      if (airResult.status !== "fulfilled") secondaryIssues.push("AQI");
      if (alertsResult.status !== "fulfilled") secondaryIssues.push("alerts");

      const updated = new Date().toLocaleTimeString([], {
        hour:"numeric",
        minute:"2-digit"
      });

      updateText.textContent = secondaryIssues.length
        ? `Updated ${updated} · ${secondaryIssues.join(" + ")} unavailable`
        : `Updated ${updated}`;

    } catch (err) {
      console.error(err);
      showError(err?.message || "Unable to load weather data.");
    }
  }

  load();
  window.setInterval(load, REFRESH_MINUTES * 60 * 1000);
