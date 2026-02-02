/**
 * Who's Got Sun? (AU)
 * Uses WeatherAPI.com: /v1/forecast.json?days=3
 */

// 1) Put your API key here (see README for setup).
// NOTE: Keep this key private; don't commit it to a public repo.
const WEATHERAPI_KEY = "e65675845f0b4555ab573900262901";

// 2) Cities to compare.
const CITIES = [
  { id: "adelaide", name: "Adelaide", query: "Adelaide,AU" },
  { id: "darwin", name: "Darwin", query: "Darwin,AU" },
  { id: "melbourne", name: "Melbourne", query: "Melbourne,AU" },
  { id: "sydney", name: "Sydney", query: "Sydney,AU" },
];

const AUTO_REFRESH_MS = 30 * 60 * 1000;

const gridEl = document.getElementById("grid");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");

let autoRefreshTimer = null;
let tempMode = "current"; // "current" | "peak"
const cityDataById = {};

function formatLocalTime(tsSeconds) {
  // WeatherAPI returns localtime_epoch for the location.
  const d = new Date(tsSeconds * 1000);
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClock(d) {
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Formats the hour (0-23) when peak temp occurred as "Peak 2:00pm".
 */
function formatPeakTime(peakHour) {
  const h = Math.max(0, Math.min(23, Math.round(Number(peakHour))));
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  const timeStr = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `Peak ${timeStr}`;
}

function uvClass(uv) {
  // 0-2 Low, 3-5 Moderate, 6-7 High, 8-10 Very High, 11+ Extreme
  if (uv >= 11) return "uv-extreme";
  if (uv >= 8) return "uv-very";
  if (uv >= 6) return "uv-high";
  if (uv >= 3) return "uv-mod";
  return "uv-low";
}

function uvLabel(uv) {
  if (uv >= 11) return "Extreme";
  if (uv >= 8) return "Very high";
  if (uv >= 6) return "High";
  if (uv >= 3) return "Moderate";
  return "Low";
}

function degToCompass(deg) {
  // 16-wind compass
  const dirs = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  const i = Math.round(deg / 22.5) % 16;
  return dirs[i];
}

function emojiForCondition(text, isDay) {
  const t = String(text || "").toLowerCase();
  if (t.includes("thunder")) return "⛈️";
  if (t.includes("snow") || t.includes("sleet") || t.includes("blizzard")) return "🌨️";
  if (t.includes("hail") || t.includes("ice")) return "🧊";
  if (t.includes("mist") || t.includes("fog")) return "🌫️";
  if (t.includes("rain") || t.includes("drizzle") || t.includes("shower")) return "🌧️";
  if (t.includes("cloud") || t.includes("overcast")) return "☁️";
  if (t.includes("clear") || t.includes("sunny")) return isDay ? "☀️" : "🌙";
  return isDay ? "🌤️" : "🌙";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Returns [r, g, b] for temperature (same hue as getTempColor, ~10% tint).
 */
function getTempRgb(tempC) {
  const t = Number(tempC);
  const lerp = (a, b, x) => a + (b - a) * x;
  const blue = { r: 37, g: 99, b: 235 };
  const lightBlue = { r: 14, g: 165, b: 233 };
  const teal = { r: 20, g: 184, b: 166 };
  const warm = { r: 249, g: 180, b: 100 };
  const hot = { r: 240, g: 120, b: 140 };
  const tint = 0.1;
  const blend = (c) => Math.round(255 - (255 - c) * tint);
  let r, g, b;
  if (t <= 15) {
    const x = t / 15;
    r = lerp(blue.r, lightBlue.r, x); g = lerp(blue.g, lightBlue.g, x); b = lerp(blue.b, lightBlue.b, x);
  } else if (t <= 24) {
    const x = (t - 15) / 9;
    r = lerp(lightBlue.r, teal.r, x); g = lerp(lightBlue.g, teal.g, x); b = lerp(lightBlue.b, teal.b, x);
  } else if (t <= 32) {
    const x = (t - 24) / 8;
    r = lerp(teal.r, warm.r, x); g = lerp(teal.g, warm.g, x); b = lerp(teal.b, warm.b, x);
  } else {
    const x = Math.min(1, (t - 32) / 8);
    r = lerp(warm.r, hot.r, x); g = lerp(warm.g, hot.g, x); b = lerp(warm.b, hot.b, x);
  }
  return [blend(r), blend(g), blend(b)];
}

/**
 * Returns a very subtle tint for temperature (~10% intensity): faint blue-white (cold) to faint warm-white (hot).
 */
function getTempColor(tempC) {
  const [r, g, b] = getTempRgb(tempC);
  return "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("");
}

/**
 * Returns saturated [r, g, b] for card background only (vivid blues → teals → oranges → reds/pinks).
 * Same opacity (0.06 / 0.02) keeps the gradient subtle; higher saturation makes it more colorful.
 */
function getCardBackgroundRgb(tempC) {
  const t = Number(tempC);
  const lerp = (a, b, x) => Math.round(a + (b - a) * x);
  const blue = { r: 37, g: 99, b: 235 };
  const lightBlue = { r: 14, g: 165, b: 233 };
  const teal = { r: 20, g: 184, b: 166 };
  const warm = { r: 245, g: 158, b: 11 };
  const hot = { r: 236, g: 72, b: 153 };
  let r, g, b;
  if (t <= 15) {
    const x = t / 15;
    r = lerp(blue.r, lightBlue.r, x); g = lerp(blue.g, lightBlue.g, x); b = lerp(blue.b, lightBlue.b, x);
  } else if (t <= 24) {
    const x = (t - 15) / 9;
    r = lerp(lightBlue.r, teal.r, x); g = lerp(lightBlue.g, teal.g, x); b = lerp(lightBlue.b, teal.b, x);
  } else if (t <= 32) {
    const x = (t - 24) / 8;
    r = lerp(teal.r, warm.r, x); g = lerp(teal.g, warm.g, x); b = lerp(teal.b, warm.b, x);
  } else {
    const x = Math.min(1, (t - 32) / 8);
    r = lerp(warm.r, hot.r, x); g = lerp(warm.g, hot.g, x); b = lerp(warm.b, hot.b, x);
  }
  return [r, g, b];
}

/**
 * Returns a subtle card background gradient based on temperature (same opacity; more saturated color).
 */
function getCardBackground(tempC) {
  const [r, g, b] = getCardBackgroundRgb(tempC);
  return `linear-gradient(180deg, rgba(${r},${g},${b},0.06), rgba(${r},${g},${b},0.02))`;
}

/**
 * Returns a muted CSS gradient for page background based on time of day (0-24, fractional).
 * Same progression (night → morning → midday → evening) but subdued: narrow range, soft midday, gentle contrast.
 */
function getTimeOfDayBg(hourFraction) {
  const t = ((hourFraction % 24) + 24) % 24;
  const lerp = (a, b, x) => {
    const y = Math.max(0, Math.min(1, x));
    return Math.round(a + (b - a) * y);
  };
  const toHex = (r, g, b) =>
    "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")).join("");
  const key = [
    { t: 0, r: 10, g: 15, b: 24 },
    { t: 5, r: 12, g: 18, b: 30 },
    { t: 8, r: 14, g: 22, b: 36 },
    { t: 12, r: 18, g: 28, b: 44 },
    { t: 14, r: 16, g: 25, b: 40 },
    { t: 18, r: 14, g: 22, b: 36 },
    { t: 22, r: 12, g: 18, b: 30 },
    { t: 24, r: 10, g: 15, b: 24 },
  ];
  let i = 0;
  while (i < key.length - 1 && key[i + 1].t <= t) i++;
  const a = key[i];
  const b = key[i + 1] || key[0];
  const span = (b.t - a.t + 24) % 24 || 24;
  const x = span > 0 ? (t - a.t) / span : 0;
  const r = lerp(a.r, b.r, x);
  const g = lerp(a.g, b.g, x);
  const bl = lerp(a.b, b.b, x);
  const top = toHex(r, g, bl);
  const bottom = toHex(Math.round(r * 0.88), Math.round(g * 0.88), Math.round(bl * 0.88));
  return `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)`;
}

/**
 * Updates the page background (--bg) based on temp mode: current time or average peak time.
 */
function updatePageBackground() {
  let hourFraction;
  if (tempMode === "peak") {
    const hours = Object.values(cityDataById)
      .map((d) => d.peakHour)
      .filter((n) => typeof n === "number");
    const ref = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : 14;
    hourFraction = ref;
  } else {
    const now = new Date();
    hourFraction = now.getHours() + now.getMinutes() / 60;
  }
  const bg = getTimeOfDayBg(hourFraction);
  document.documentElement.style.setProperty("--bg", bg);
}

function ensureKeyPresentOrWarn() {
  // Treat only the original placeholder as invalid.
  if (!WEATHERAPI_KEY || WEATHERAPI_KEY.includes("YOUR_WEATHERAPI_KEY_HERE")) {
    if (statusEl) {
      statusEl.innerHTML =
        '<span class="error">Add your WeatherAPI key in <code>app.js</code> (see README).</span>';
    }
    return false;
  }
  return true;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} from WeatherAPI. ${text}`.trim());
  }
  return await res.json();
}

function buildForecastUrl(cityQuery) {
  const base = "https://api.weatherapi.com/v1";
  return `${base}/forecast.json?key=${encodeURIComponent(
    WEATHERAPI_KEY
  )}&q=${encodeURIComponent(cityQuery)}&days=3&aqi=no&alerts=no`;
}

function renderSkeleton() {
  gridEl.classList.remove("grid--transition-out", "grid--transition-in");
  gridEl.innerHTML = CITIES.map(
    (c) => `
      <article class="card card--skeleton" id="card-${c.id}">
        <div class="card-top">
          <div class="city">
            <h2>${escapeHtml(c.name)}</h2>
            <p class="updated skeleton-text">Loading…</p>
          </div>
          <div class="icon skeleton-pulse" aria-hidden="true">⏳</div>
        </div>
        <div class="card-main">
          <div class="temp-row">
            <div class="temp-now skeleton-pulse">--<span class="temp-unit">°C</span></div>
          </div>
          <div class="conditions skeleton-text">
            <span>—</span>
            <span>—</span>
          </div>
          <div class="kv">
            <div class="pill skeleton-pulse">
              <div class="label">UV</div>
              <div class="value">—</div>
            </div>
            <div class="pill skeleton-pulse">
              <div class="label">Wind</div>
              <div class="value">—</div>
            </div>
          </div>
        </div>
      </article>
    `
  ).join("");
}

function updateCard(cityId, model) {
  const card = document.getElementById(`card-${cityId}`);
  if (!card) return;

  const {
    cityName,
    lastUpdatedLocal,
    nowTempC,
    todayMaxC,
    peakHour,
    feelsLikeC,
    todayMaxFeelsLikeC,
    conditionText,
    isDay,
    uv,
    todayMaxUv,
    windKph,
    todayMaxWindKph,
    windDeg,
    windDirText,
  } = model;

  // #region agent log
  (function(d){fetch('http://127.0.0.1:7242/ingest/22893b8e-ee93-43d7-994f-a498807cad2f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).catch(()=>{});console.log('[agent] updateCard',d);})({location:'app.js:updateCard',message:'Model and tempMode before display',data:{cityName,cityId,tempMode,nowTempC,todayMaxC,typeofTodayMaxC:typeof todayMaxC,same:nowTempC===todayMaxC},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3 H4'});
  // #endregion

  const displayUpdated =
    tempMode === "peak" && typeof peakHour === "number"
      ? formatPeakTime(peakHour)
      : lastUpdatedLocal;

  const displayTempC =
    tempMode === "peak" && typeof todayMaxC === "number"
      ? todayMaxC
      : nowTempC;
  // #region agent log
  (function(d){fetch('http://127.0.0.1:7242/ingest/22893b8e-ee93-43d7-994f-a498807cad2f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).catch(()=>{});console.log('[agent] displayTempC',d);})({location:'app.js:updateCard displayTempC',message:'Display branch and result',data:{cityName,cityId,tempMode,branch:tempMode==='peak'&&typeof todayMaxC==='number'?'peak':'current',displayTempC,nowTempC,todayMaxC},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5'});
  // #endregion
  const displayFeelsLikeC =
    tempMode === "peak" && typeof todayMaxFeelsLikeC === "number"
      ? Math.max(todayMaxFeelsLikeC, feelsLikeC)
      : feelsLikeC;
  const displayUv =
    tempMode === "peak" && typeof todayMaxUv === "number"
      ? todayMaxUv
      : uv;
  const displayWindKph =
    tempMode === "peak" && typeof todayMaxWindKph === "number"
      ? Math.max(todayMaxWindKph, windKph)
      : windKph;

  const iconEmoji = emojiForCondition(conditionText, isDay);
  const uvCls = uvClass(displayUv);
  const uvText = `${Math.round(displayUv * 10) / 10} (${uvLabel(displayUv)})`;
  const windCompass = degToCompass(windDeg);
  const windValueText = `${Math.round(displayWindKph)} km/h ${windDirText || windCompass}`;
  const tempColor = getTempColor(displayTempC);
  /* Arrow and flow both show where wind is going (blowing TO). Flow animation moves "right" in element, so rotation needs -90° offset to match arrow. */
  const windFlowDeg = (Math.round(windDeg) + 180) % 360;
  const windFlowBgDeg = (windFlowDeg + 270) % 360;
  const windAnimDuration = Math.max(1.2, 5 - (displayWindKph || 0) / 20);
  card.style.background = getCardBackground(displayTempC);
  const wasSkeleton = card.classList.contains("card--skeleton");
  card.classList.remove("card--skeleton");
  card.classList.add("card--loaded");
  if (wasSkeleton) {
    card.classList.add("card--just-loaded");
    setTimeout(() => card.classList.remove("card--just-loaded"), 450);
  }

  const iconHtml =
    typeof twemoji !== "undefined" && typeof twemoji.parse === "function"
      ? twemoji.parse(iconEmoji)
      : iconEmoji;

  card.innerHTML = `
    <div class="card-top">
      <div class="city">
        <h2>${escapeHtml(cityName)}</h2>
        <p class="updated">${escapeHtml(displayUpdated)}</p>
      </div>
      <div class="icon" aria-hidden="true">${iconHtml}</div>
    </div>

    <div class="card-main">
      <div class="temp-row">
        <div class="temp-now" style="color: ${tempColor}">${Math.round(displayTempC)}<span class="temp-unit">°C</span></div>
      </div>

      <div class="conditions">
        <span>${escapeHtml(conditionText)}</span>
        <span>Feels: ${Math.round(displayFeelsLikeC)}°C</span>
      </div>

      <div class="kv">
        <div class="pill pill-uv ${uvCls}">
          <div class="label">UV</div>
          <div class="value">
            <div class="uvbar">
              <span class="uv-dot ${uvCls}" aria-hidden="true"></span>
              <span>${escapeHtml(uvText)}</span>
            </div>
          </div>
        </div>

        <div class="pill pill-wind" style="--wind-deg: ${windFlowBgDeg}deg; --wind-duration: ${windAnimDuration}s">
          <div class="wind-flow-bg" aria-hidden="true"></div>
          <div class="label">Wind</div>
          <div class="value">
            <div class="wind">
              <div class="wind-arrow" aria-hidden="true">
                <span style="transform: rotate(${windFlowDeg}deg)">↑</span>
              </div>
              <span>${escapeHtml(windValueText)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function updateCardError(cityId, cityName, message) {
  const card = document.getElementById(`card-${cityId}`);
  if (!card) return;
  card.innerHTML = `
    <div class="card-top">
      <div class="city">
        <h2>${escapeHtml(cityName)}</h2>
        <p class="updated error">Could not load</p>
      </div>
      <div class="icon" aria-hidden="true">⚠️</div>
    </div>
    <div class="card-main">
      <div class="pill">
        <div class="label">Error</div>
        <div class="value error">${escapeHtml(message)}</div>
      </div>
    </div>
  `;
}

function setStatus(text, isError = false) {
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.classList.toggle("error", isError);
  }
}

/**
 * Load city weather from WeatherAPI.com /forecast.json (returns both current and forecast).
 * Temperature mapping per WeatherAPI docs:
 * - Current temp: current.temp_c (real-time; same as /current.json)
 * - Peak temp: forecast.forecastday[0].day.maxtemp_c (max for the day; in day summary, NOT hourly)
 * UV mapping:
 * - Current UV: current.uv (current UV Index; same as /current.json)
 * - Peak UV: max of forecast.forecastday[0].hour[].uv (true daily peak; day.uv is daily average)
 */
async function loadCity(city) {
  const url = buildForecastUrl(city.query);
  const forecast = await fetchJson(url);

  const current = forecast.current;
  const location = forecast.location;
  const forecastdays = forecast.forecast?.forecastday || [];
  // Resolve "today" by location's local date (YYYY-MM-DD) so peak UV is always for the correct calendar day in that city
  const localDateStr =
    (location?.localtime && location.localtime.slice(0, 10)) ||
    (current?.last_updated && current.last_updated.slice(0, 10)) ||
    null;
  const today =
    localDateStr && forecastdays.length > 0
      ? forecastdays.find((fd) => fd.date === localDateStr) || forecastdays[0]
      : forecastdays[0];
  const day = today?.day;
  const hours = today?.hour || [];

  // Current: current.temp_c; Peak: forecast.forecastday[0].day.maxtemp_c
  const currentTempC = typeof current.temp_c === "number" ? current.temp_c : null;
  const todayMaxC = typeof day?.maxtemp_c === "number" ? day.maxtemp_c : null;
  console.log(
    `[Temp] ${city.name}: current.temp_c=${currentTempC}, forecast.forecastday[0].day.maxtemp_c=${todayMaxC}`,
    todayMaxC != null && currentTempC != null && todayMaxC < currentTempC ? "(peak < current, late-day possible)" : ""
  );
  // #region agent log
  (function(d){fetch('http://127.0.0.1:7242/ingest/22893b8e-ee93-43d7-994f-a498807cad2f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).catch(()=>{});console.log('[agent] loadCity',d);})({location:'app.js:loadCity',message:'Temp API values and return',data:{cityName:city.name,currentTempC,todayMaxC,returnedNowTempC:currentTempC??current.temp_c,returnedTodayMaxC:todayMaxC,same:currentTempC===todayMaxC},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1 H2'});
  // #endregion
  const todayMaxFeelsLikeC =
    hours.length > 0
      ? Math.max(...hours.map((h) => h.feelslike_c ?? -Infinity))
      : null;

  const currentUv = typeof current.uv === "number" && current.uv >= 0 ? current.uv : null;
  // True peak UV = max across hourly data (day.uv is daily average, not peak)
  let peakUvFromApi = null;
  if (hours.length > 0) {
    const uvValues = hours.map((h) => h.uv).filter((v) => typeof v === "number" && v >= 0);
    if (uvValues.length > 0) peakUvFromApi = Math.max(...uvValues);
  }
  if (peakUvFromApi == null && typeof day?.uv === "number" && day.uv >= 0) peakUvFromApi = day.uv;
  const todayMaxUv = peakUvFromApi;

  const hourlyUvs = hours.map((h) => h.uv);
  console.log(
    `[UV] ${city.name}: current.uv=${currentUv}, hourly UVs=${JSON.stringify(hourlyUvs)}, calculated peak=${todayMaxUv}`
  );

  const todayMaxWindKph = typeof day?.maxwind_kph === "number" ? day.maxwind_kph : null;

  console.log(
    `[Wind Direction] ${city.name}: API degrees=${current.wind_degree ?? "—"}°, compass=${current.wind_dir ?? "—"}, arrow should point ${current.wind_dir ?? "—"}, flow should go opposite direction`
  );

  let peakHour = null;
  if (hours.length > 0) {
    let maxT = -Infinity;
    hours.forEach((h, i) => {
      const temp = h.temp_c;
      if (typeof temp === "number" && temp > maxT) {
        maxT = temp;
        peakHour = i;
      }
    });
  }

  return {
    cityName: city.name,
    lastUpdatedLocal: formatLocalTime(current.last_updated_epoch),
    nowTempC: currentTempC ?? current.temp_c,
    todayMaxC,
    peakHour,
    feelsLikeC: current.feelslike_c,
    todayMaxFeelsLikeC,
    conditionText: current.condition?.text || "",
    isDay: Boolean(current.is_day),
    uv: current.uv ?? 0,
    todayMaxUv,
    windKph: current.wind_kph ?? 0,
    todayMaxWindKph,
    windDeg: current.wind_degree ?? 0,
    windDirText: current.wind_dir || "",
    fetchedAt: new Date(),
    localtime: location?.localtime || "",
  };
}

async function refreshAll() {
  if (!ensureKeyPresentOrWarn()) {
    renderSkeleton();
    return;
  }

  refreshBtn.disabled = true;
  refreshBtn.classList.add("btn--loading");

  const startedAt = new Date();

  const results = await Promise.allSettled(CITIES.map(loadCity));
  let okCount = 0;

  results.forEach((r, idx) => {
    const city = CITIES[idx];
    if (r.status === "fulfilled") {
      okCount += 1;
      cityDataById[city.id] = r.value;
      updateCard(city.id, r.value);
    } else {
      const msg = r.reason?.message ? String(r.reason.message) : "Unknown error";
      updateCardError(city.id, city.name, msg);
    }
  });

  refreshBtn.disabled = false;
  refreshBtn.classList.remove("btn--loading");
  updatePageBackground();
}

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    refreshAll().catch((e) => {
      setStatus(`Refresh failed: ${e?.message || "Unknown error"}`, true);
      refreshBtn.disabled = false;
      refreshBtn.classList.remove("btn--loading");
    });
  }, AUTO_REFRESH_MS);
}

const TOGGLE_FADE_OUT_MS = 200;
const TOGGLE_FADE_IN_MS = 300;

function applyTempMode() {
  const track = document.getElementById("tempToggleTrack");
  if (track) {
    track.classList.toggle("peak", tempMode === "peak");
  }
  document.querySelectorAll(".temp-toggle-option").forEach((btn) => {
    const isActive = btn.getAttribute("data-temp") === tempMode;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
  // Only animate if we have loaded cards (not skeleton)
  const hasLoadedCards = CITIES.some((c) => {
    const card = document.getElementById(`card-${c.id}`);
    return card && card.classList.contains("card--loaded");
  });
  if (!hasLoadedCards) {
    Object.keys(cityDataById).forEach((cityId) => updateCard(cityId, cityDataById[cityId]));
    updatePageBackground();
    return;
  }
  gridEl.classList.remove("grid--transition-in");
  gridEl.classList.add("grid--transition-out");
  requestAnimationFrame(() => {
    setTimeout(() => {
      Object.keys(cityDataById).forEach((cityId) => {
        updateCard(cityId, cityDataById[cityId]);
      });
      updatePageBackground();
      gridEl.classList.remove("grid--transition-out");
      gridEl.classList.add("grid--transition-in");
      setTimeout(() => {
        gridEl.classList.remove("grid--transition-in");
      }, TOGGLE_FADE_IN_MS);
    }, TOGGLE_FADE_OUT_MS);
  });
}

function init() {
  renderSkeleton();
  document.querySelectorAll(".temp-toggle-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-temp");
      if (mode === "current" || mode === "peak") {
        tempMode = mode;
        applyTempMode();
      }
    });
  });
  refreshBtn.addEventListener("click", () => {
    refreshAll().catch((e) => {
      setStatus(`Refresh failed: ${e?.message || "Unknown error"}`, true);
      refreshBtn.disabled = false;
      refreshBtn.classList.remove("btn--loading");
    });
  });
  refreshAll().catch((e) => {
    setStatus(`Refresh failed: ${e?.message || "Unknown error"}`, true);
    refreshBtn.disabled = false;
    refreshBtn.classList.remove("btn--loading");
  });
  startAutoRefresh();
  updatePageBackground();
  setInterval(updatePageBackground, 60 * 1000);

  const isTouchDevice =
    "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (isTouchDevice) {
    document.body.addEventListener("click", (e) => {
      const pill = e.target.closest(".pill-uv, .pill-wind");
      const activeClass = "active";
      const allPills = document.querySelectorAll(".pill-uv, .pill-wind");
      if (pill) {
        const wasActive = pill.classList.contains(activeClass);
        allPills.forEach((p) => p.classList.remove(activeClass));
        if (!wasActive) pill.classList.add(activeClass);
      } else {
        allPills.forEach((p) => p.classList.remove(activeClass));
      }
    });
  }
}

init();

