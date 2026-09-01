import {
  aqiInfo,
  formatInches as fmtInches,
  formatPercent as fmtPercent,
  formatTemperature as fmtTemp,
  isDaylightAt,
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

  function renderHourly(hourly, daily) {
    const grid = $("hourlyGrid");
    grid.innerHTML = "";

    const start = findHourlyStart(hourly);
    const offsets = [0, 3, 6, 9, 12, 15, 18, 21];

    offsets.forEach((offset, j) => {
      const i = start + offset;
      if (i >= (hourly.time?.length || 0)) return;

      const pop = Number.isFinite(hourly.precipitation_probability?.[i])
        ? hourly.precipitation_probability[i]
        : 0;
      const amount = Number.isFinite(hourly.precipitation?.[i])
        ? hourly.precipitation[i]
        : 0;
      const isDay = isDaylightAt(hourly.time[i], daily);
      const info = weatherInfo(hourly.weather_code?.[i], isDay);

      const card = document.createElement("div");
      card.className = "hour";
      card.innerHTML = `
        <div class="hour-time">${j === 0 ? "Now" : fmtHour(hourly.time[i])}</div>
        <div class="hour-icon">${info[1]}</div>
        <div class="hour-temp">${fmtTemp(hourly.temperature_2m?.[i])}</div>
        <div class="hour-pop">${Math.round(pop)}%<br>${fmtInches(amount)}</div>
        <div class="rain-track" aria-label="${Math.round(pop)} percent precipitation probability">
          <div class="rain-bar" style="height:${Math.max(1, Math.min(100, pop))}%"></div>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  function renderDaily(daily) {
    const grid = $("dailyGrid");
    grid.innerHTML = "";

    const count = Math.min(7, daily.time?.length || 0);
    for (let i = 0; i < count; i++) {
      const info = weatherInfo(daily.weather_code?.[i]);
      const pop = round(daily.precipitation_probability_max?.[i]);

      const card = document.createElement("div");
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
      grid.appendChild(card);
    }
  }

  function renderFocus(weather) {
    const box = $("focusMessage");
    box.className = "focus";
    box.textContent = "";

    const daily = weather.daily || {};
    const current = weather.current || {};
    const maxPop = round(daily.precipitation_probability_max?.[0]) || 0;
    const gust = round(daily.wind_gusts_10m_max?.[0]) || 0;
    const high = round(daily.temperature_2m_max?.[0]);

    if (maxPop >= 55) {
      box.textContent = `Rain is likely today — peak probability ${maxPop}%.`;
      box.className = "focus show rain";
    } else if (gust >= 30) {
      box.textContent = `Gusty today — winds may reach about ${gust} mph.`;
      box.className = "focus show wind";
    } else if (high != null && high >= 90) {
      box.textContent = `Hot today — forecast high ${high}°.`;
      box.className = "focus show heat";
    } else if (Number.isFinite(current.wind_gusts_10m) && current.wind_gusts_10m >= 25) {
      box.textContent = `Currently breezy — gusting around ${round(current.wind_gusts_10m)} mph.`;
      box.className = "focus show wind";
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
    $("todaySummary").textContent =
      `Today ${fmtTemp(d.temperature_2m_max?.[0])} / ${fmtTemp(d.temperature_2m_min?.[0])} · Rain ${todayPop} · ${todayRainAmount}`;

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

    renderHourly(weather.hourly || {}, d);
    renderDaily(d);
    renderFocus(weather);
  }

  function renderAirUnavailable() {
    $("aqiValue").innerHTML = `<span class="aqi-pill">—</span> Unavailable`;
    $("aqiSub").textContent = "AQI service unavailable";
  }

  function renderAir(air) {
    const c = air.current || {};
    const info = aqiInfo(c.us_aqi);

    $("aqiValue").innerHTML =
      `<span class="aqi-pill ${info.cls}">${info.value}</span> ${info.label}`;
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
    const banner = $("alertBanner");
    banner.classList.remove("show");

    const features = Array.isArray(alerts?.features) ? alerts.features : [];
    if (!features.length) return;

    features.sort((a,b) =>
      alertRank(b?.properties?.severity) - alertRank(a?.properties?.severity)
    );

    const p = features[0]?.properties || {};
    $("alertTitle").textContent = p.event || "Weather Alert";

    const until = p.ends ? ` · until ${fmtClock(p.ends)}` : "";
    const headline = p.headline || p.description || "";
    $("alertDetail").textContent =
      `${headline}${until}`.replace(/\s+/g, " ").trim();

    banner.classList.add("show");
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
        $("alertBanner").classList.remove("show");
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
