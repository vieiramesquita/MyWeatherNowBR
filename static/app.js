const DEFAULT_STATIONS_MAP = {
  "A029": { code: "A029", name: "Edéia", state: "GO", lat: -17.3369, lon: -49.9147, alt: 608, geocode: "5207402", status: "Operante" },
  "A002": { code: "A002", name: "Goiânia", state: "GO", lat: -16.6428, lon: -49.2208, alt: 741, geocode: "5208707", status: "Operante" },
  "A025": { code: "A025", name: "Rio Verde", state: "GO", lat: -17.7853, lon: -50.9669, alt: 752, geocode: "5218805", status: "Operante" },
  "A001": { code: "A001", name: "Brasília", state: "DF", lat: -15.7894, lon: -47.9258, alt: 1160, geocode: "5300108", status: "Operante" },
  "A701": { code: "A701", name: "São Paulo (Mirante)", state: "SP", lat: -23.4964, lon: -46.6200, alt: 792, geocode: "3550308", status: "Operante" },
  "A652": { code: "A652", name: "Rio de Janeiro (Forte)", state: "RJ", lat: -22.9883, lon: -43.1906, alt: 25, geocode: "3304557", status: "Operante" },
  "A801": { code: "A801", name: "Porto Alegre", state: "RS", lat: -30.0536, lon: -51.1747, alt: 47, geocode: "4314902", status: "Operante" }
};

const UF_IBGE_CODES = {
  RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17,
  MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29,
  MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43,
  MS: 50, MT: 51, GO: 52, DF: 53
};

/**
 * Pure-JS GIF89a Animated Encoder (3-3-2 Uniform Cube + Ordered Bayer Dithering + LZW)
 * Enables 100% client-side GOES-19 animated GIF export on GitHub Pages without a backend.
 */
function encodeAnimatedGif(framesImageData, width, height, delayMs) {
  const bytes = [];
  const writeByte = (b) => bytes.push(b & 0xff);
  const writeShort = (s) => { bytes.push(s & 0xff, (s >> 8) & 0xff); };
  const writeStr = (str) => { for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i)); };

  writeStr("GIF89a");
  writeShort(width);
  writeShort(height);
  writeByte(0xf7); // Global Color Table (256 colors, 8-bit)
  writeByte(0x00);
  writeByte(0x00);

  for (let i = 0; i < 256; i++) {
    writeByte(Math.round(((i >> 5) & 0x07) * (255 / 7)));
    writeByte(Math.round(((i >> 2) & 0x07) * (255 / 7)));
    writeByte(Math.round((i & 0x03) * (255 / 3)));
  }

  // Netscape 2.0 infinite loop extension
  writeByte(0x21); writeByte(0xff); writeByte(0x0b);
  writeStr("NETSCAPE2.0");
  writeByte(0x03); writeByte(0x01); writeShort(0); writeByte(0x00);

  const delayCs = Math.max(4, Math.round(delayMs / 10));
  const bayer4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function writeLzwFrame(indexedPixels) {
    const minCodeSize = 8;
    writeByte(minCodeSize);
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;

    const subBlock = new Uint8Array(255);
    let sbLen = 0;
    let bitBuf = 0;
    let bitCount = 0;

    const flushSubBlock = () => {
      if (sbLen > 0) {
        writeByte(sbLen);
        for (let i = 0; i < sbLen; i++) writeByte(subBlock[i]);
        sbLen = 0;
      }
    };

    const emitCode = (code, size) => {
      bitBuf |= (code << bitCount);
      bitCount += size;
      while (bitCount >= 8) {
        subBlock[sbLen++] = bitBuf & 0xff;
        if (sbLen === 255) flushSubBlock();
        bitBuf >>= 8;
        bitCount -= 8;
      }
    };

    const table = new Int32Array(4096 * 256);
    table.fill(-1);
    let codeSize = minCodeSize + 1;
    let nextCode = eoiCode + 1;

    emitCode(clearCode, codeSize);
    let prefix = indexedPixels[0];

    for (let i = 1; i < indexedPixels.length; i++) {
      const k = indexedPixels[i];
      const key = (prefix << 8) | k;
      const hit = table[key];
      if (hit !== -1) {
        prefix = hit;
      } else {
        emitCode(prefix, codeSize);
        if (nextCode < 4096) {
          table[key] = nextCode++;
          if (nextCode > (1 << codeSize) && codeSize < 12) {
            codeSize++;
          }
        } else {
          emitCode(clearCode, codeSize);
          table.fill(-1);
          codeSize = minCodeSize + 1;
          nextCode = eoiCode + 1;
        }
        prefix = k;
      }
    }

    emitCode(prefix, codeSize);
    emitCode(eoiCode, codeSize);
    if (bitCount > 0) subBlock[sbLen++] = bitBuf & 0xff;
    flushSubBlock();
    writeByte(0x00);
  }

  const indexed = new Uint8Array(width * height);
  for (const rgba of framesImageData) {
    writeByte(0x21); writeByte(0xf9); writeByte(0x04); writeByte(0x00);
    writeShort(delayCs); writeByte(0x00); writeByte(0x00);

    writeByte(0x2c);
    writeShort(0); writeShort(0); writeShort(width); writeShort(height);
    writeByte(0x00);

    let p = 0;
    for (let y = 0; y < height; y++) {
      const rowOff = (y & 3) << 2;
      for (let x = 0; x < width; x++) {
        const d = bayer4[rowOff | (x & 3)] - 7.5;
        const idx4 = p << 2;
        const r = Math.max(0, Math.min(255, rgba[idx4] + d * 1.8));
        const g = Math.max(0, Math.min(255, rgba[idx4 + 1] + d * 1.8));
        const b = Math.max(0, Math.min(255, rgba[idx4 + 2] + d * 3.5));
        const ri = Math.round((r * 7) / 255) & 0x07;
        const gi = Math.round((g * 7) / 255) & 0x07;
        const bi = Math.round((b * 3) / 255) & 0x03;
        indexed[p++] = (ri << 5) | (gi << 2) | bi;
      }
    }
    writeLzwFrame(indexed);
  }

  writeByte(0x3b);
  return new Uint8Array(bytes);
}

/**
 * MyWeatherNow Argon Pro • Core Application Controller
 * 672 INMET Stations + Open-Meteo Telemetry/Intel/AQI/FAO-56 + GOES-19 Vector Studio
 */
class MeteoApp {
  constructor() {
    this.currentStationCode = "A029";
    this.currentStationName = "Edéia - GO";
    this.currentState = "GO";
    this.currentLat = -17.33694444;
    this.currentLon = -49.91472222;
    this.currentAlt = 608;

    this.inmetData = null;
    this.forecastData = null;
    this.airQualityData = null;
    this.activeHistory24h = [];
    this.currentSource = "inmet";
    this.nearestLiveInmet = null;
    this.liveStatusSynced = false;
    this.hasLocalBackend = !window.location.hostname.endsWith("github.io");
    this.alertDismissedKey = null;

    this.allStations = [];
    this.stationsMap = { ...DEFAULT_STATIONS_MAP };
    this.favorites = [];

    this.geoCache = {
      estados: null,
      municipios: {},
      urbanGoias: null
    };

    this.goesConfig = {
      resolution: "medium",
      delta: 8.0,
      product: "cptec_dsa",
      showBorders: true,
      showCities: true,
      showUrban: true,
      showLegend: true,
      isDirectNoaa: false,
      numFrames: 8,
      speedMs: 350,
      playbackMultiplier: 1.0,
      playerZoom: 1.0,
      panOffsetX: 0,
      panOffsetY: 0,
      isPlaying: true,
      currentFrameIndex: 0,
      frames: [],
      productMeta: null,
      preloadedImages: [],
      loop: true,
      timerId: null
    };

    this.refreshIntervalSeconds = 3600;
    this.secondsToNextRefresh = 3600;
    this.countdownTimer = null;

    this.map = null;
    this.stationCircle = null;
    this.charts = {};

    this.init();
  }

  async init() {
    this.setupClock();
    this.loadFavorites();
    this.setupEventListeners();
    this.setupSearchAutocomplete();
    this.initMap();

    await this.loadStationsList();

    // Support URL Deep-Linking (?station=A002)
    try {
      const params = new URLSearchParams(window.location.search);
      const qStation = (params.get("station") || "").trim().toUpperCase();
      if (qStation && this.stationsMap[qStation]) {
        this.currentStationCode = qStation;
      }
    } catch (e) {}

    this.renderFavoriteChips();
    this.highlightActiveStationChips(this.currentStationCode);

    await this.loadStationData(this.currentStationCode);
    const geos = this.latlonToGeosPct(this.currentLat, this.currentLon);
    if (geos) {
      this.goesConfig.pinXPct = geos.xPct;
      this.goesConfig.pinYPct = geos.yPct;
    }
    await this.loadGoesFrames();

    this.startCountdown();
  }

  // ==========================================================================
  // Toast Notifications, Favorites & Deep-Link Sharing
  // ==========================================================================
  showToast(message, type = "info", durationMs = 3600) {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const icons = {
      success: "✅",
      info: "🛰️",
      warn: "⚠️",
      error: "❌"
    };

    const toast = document.createElement("div");
    toast.className = `toast-item toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || "ℹ️"}</span>
      <span class="toast-msg">${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add("toast-exit");
      setTimeout(() => toast.remove(), 260);
    }, durationMs);
  }

  loadFavorites() {
    try {
      const raw = localStorage.getItem("mwn_favorite_stations");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.favorites = parsed.filter((c) => typeof c === "string" && c.length >= 3);
        }
      }
    } catch (e) {
      this.favorites = [];
    }
  }

  saveFavorites() {
    try {
      localStorage.setItem("mwn_favorite_stations", JSON.stringify(this.favorites));
    } catch (e) {}
  }

  toggleFavoriteStation() {
    const code = this.currentStationCode;
    if (!code) return;
    const idx = this.favorites.indexOf(code);
    if (idx >= 0) {
      this.favorites.splice(idx, 1);
      this.showToast(`Estação ${code} removida dos favoritos.`, "info");
    } else {
      this.favorites.unshift(code);
      if (this.favorites.length > 10) this.favorites = this.favorites.slice(0, 10);
      this.showToast(`Estação ${code} (${this.currentStationName}) salva nos favoritos! ⭐`, "success");
    }
    this.saveFavorites();
    this.updateFavoriteButtonUI();
    this.renderFavoriteChips();
  }

  updateFavoriteButtonUI() {
    const btn = document.getElementById("btnFavoriteStation");
    const star = document.getElementById("favStarIcon");
    const txt = document.getElementById("favBtnText");
    const isFav = this.favorites.includes(this.currentStationCode);
    if (btn) btn.classList.toggle("is-fav", isFav);
    if (star) star.textContent = isFav ? "⭐" : "☆";
    if (txt) txt.textContent = isFav ? "Favorita" : "Favoritar";
  }

  renderFavoriteChips() {
    const container = document.getElementById("favoriteChipsContainer");
    if (!container) return;

    if (!this.favorites || this.favorites.length === 0) {
      container.style.display = "none";
      container.innerHTML = "";
      return;
    }

    container.style.display = "inline-flex";
    container.innerHTML = `<span class="fav-group-label">⭐ Favoritas:</span>`;
    this.favorites.forEach((code) => {
      const st = this.stationsMap[code] || { code, name: code, state: "BR" };
      const btn = document.createElement("button");
      btn.className = `chip chip-fav${code === this.currentStationCode ? " active" : ""}`;
      btn.dataset.code = code;
      btn.textContent = `★ ${st.code} - ${st.name} (${st.state})`;
      btn.addEventListener("click", () => this.selectStation(code, true));
      container.appendChild(btn);
    });
  }

  highlightActiveStationChips(stationCode) {
    document.querySelectorAll(".chip").forEach((c) => {
      c.classList.toggle("active", c.dataset.code === stationCode);
    });
  }

  async shareCurrentStation() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("station", this.currentStationCode);
      const shareStr = url.toString();

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareStr);
        this.showToast(`Link copiado: ${this.currentStationCode} - ${this.currentStationName}`, "success");
      } else {
        window.prompt("Copie o link direto desta estação:", shareStr);
      }
    } catch (e) {
      this.showToast("Não foi possível copiar o link automaticamente.", "warn");
    }
  }

  // ==========================================================================
  // Clock & Auto-Refresh Countdown
  // ==========================================================================
  setupClock() {
    const clockEl = document.getElementById("liveClockTime");
    const update = () => {
      const now = new Date();
      if (clockEl) {
        clockEl.textContent = now.toLocaleTimeString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          hour12: false
        });
      }
      // Refresh solar orb position smoothly once per minute
      if (now.getSeconds() === 0 && this.forecastData?.daily?.[0]) {
        this.renderSolarArcAndMoon(this.forecastData.daily[0], this.forecastData.current);
      }
    };
    update();
    setInterval(update, 1000);
  }

  startCountdown() {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    const display = document.getElementById("refreshCountdown");
    this.countdownTimer = setInterval(() => {
      if (this.secondsToNextRefresh > 0) {
        this.secondsToNextRefresh--;
      } else {
        this.loadStationData(this.currentStationCode, true);
        this.loadGoesFrames();
        this.secondsToNextRefresh = 3600;
      }
      const m = Math.floor(this.secondsToNextRefresh / 60);
      const s = this.secondsToNextRefresh % 60;
      if (display) {
        display.textContent = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      }
    }, 1000);
  }

  // ==========================================================================
  // INMET Station Priority Pipeline (Local API + Live Browser INMET + Cache)
  // ==========================================================================
  parseInmetFloat(val) {
    if (val === null || val === undefined || val === "" || val === "-") return null;
    const n = parseFloat(String(val).replace(",", ".").trim());
    return isNaN(n) ? null : Math.round(n * 10) / 10;
  }

  parseRawInmetRecord(r) {
    if (!r) return null;
    const dateStr = r.DT_MEDICAO || "";
    const hourRaw = String(r.HR_MEDICAO || "0000").padStart(4, "0");
    const hUtc = parseInt(hourRaw.slice(0, 2), 10) || 0;
    const mUtc = parseInt(hourRaw.slice(2, 4), 10) || 0;
    const pad = (n) => String(n).padStart(2, "0");

    let date_utc = dateStr;
    let hour_utc = `${pad(hUtc)}:${pad(mUtc)}`;
    let date_brt = dateStr;
    let hour_brt = hour_utc;

    try {
      const [y, mo, d] = dateStr.split("-").map(Number);
      if (y && mo && d) {
        const dtUtc = new Date(Date.UTC(y, mo - 1, d, hUtc, mUtc));
        const dtBrt = new Date(dtUtc.getTime() - 3 * 3600 * 1000);
        date_utc = `${pad(dtUtc.getUTCDate())}/${pad(dtUtc.getUTCMonth() + 1)}/${dtUtc.getUTCFullYear()}`;
        hour_utc = `${pad(dtUtc.getUTCHours())}:${pad(dtUtc.getUTCMinutes())}`;
        date_brt = `${pad(dtBrt.getUTCDate())}/${pad(dtBrt.getUTCMonth() + 1)}/${dtBrt.getUTCFullYear()}`;
        hour_brt = `${pad(dtBrt.getUTCHours())}:${pad(dtBrt.getUTCMinutes())}`;
      }
    } catch (e) {}

    const temp_ins = this.parseInmetFloat(r.TEM_INS);
    const humidity_ins = this.parseInmetFloat(r.UMD_INS);
    const pressure_ins = this.parseInmetFloat(r.PRE_INS);
    const wind_speed = this.parseInmetFloat(r.VEN_VEL);
    const rain = this.parseInmetFloat(r.CHUVA);
    let solar_radiation = this.parseInmetFloat(r.RAD_GLO);
    if (solar_radiation !== null && solar_radiation < 0) solar_radiation = 0.0;

    const has_data =
      temp_ins !== null ||
      humidity_ins !== null ||
      pressure_ins !== null ||
      wind_speed !== null ||
      rain !== null;

    return {
      source: "inmet",
      date: date_brt,
      date_brt,
      date_utc,
      hour_brt,
      hour_local: hour_brt,
      hour_utc,
      temp_ins,
      temp_max: this.parseInmetFloat(r.TEM_MAX),
      temp_min: this.parseInmetFloat(r.TEM_MIN),
      thermal_sensation: this.parseInmetFloat(r.TEM_SEN),
      humidity_ins,
      humidity_max: this.parseInmetFloat(r.UMD_MAX),
      humidity_min: this.parseInmetFloat(r.UMD_MIN),
      pressure_ins,
      pressure_max: this.parseInmetFloat(r.PRE_MAX),
      pressure_min: this.parseInmetFloat(r.PRE_MIN),
      wind_speed,
      wind_dir: this.parseInmetFloat(r.VEN_DIR),
      wind_gust: this.parseInmetFloat(r.VEN_RAJ),
      rain,
      solar_radiation,
      dew_point: this.parseInmetFloat(r.PTO_INS),
      battery: this.parseInmetFloat(r.TEN_BAT),
      has_data
    };
  }

  recordUtcEpoch(rec) {
    try {
      if (rec?.date_utc && rec?.hour_utc) {
        const [d, m, y] = rec.date_utc.split("/").map(Number);
        const [hh, mm] = rec.hour_utc.split(":").map(Number);
        if (y && m && d) return Date.UTC(y, m - 1, d, hh || 0, mm || 0);
      }
    } catch (e) {}
    return 0;
  }

  loadStoredInmetHistory(codeUpper) {
    try {
      const raw = localStorage.getItem(`mwn_inmet_hist_${codeUpper}`);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
      }
    } catch (e) {}
    return [];
  }

  saveStoredInmetHistory(codeUpper, records) {
    try {
      localStorage.setItem(`mwn_inmet_hist_${codeUpper}`, JSON.stringify(records.slice(-24)));
    } catch (e) {}
  }

  mergePhysicalInmetSources(codeUpper, stMeta, staticData, liveRecord) {
    const map = new Map();
    const addRec = (r) => {
      if (!r || !this.hasValidStationReading(r)) return;
      const key = `${r.date_utc || r.date_brt}_${r.hour_utc || r.hour_brt}`;
      map.set(key, { ...r, source: "inmet", has_data: true });
    };

    (staticData?.history || []).forEach(addRec);
    if (staticData?.latest) addRec(staticData.latest);
    this.loadStoredInmetHistory(codeUpper).forEach(addRec);
    if (liveRecord && this.hasValidStationReading(liveRecord)) {
      addRec(liveRecord);
    }

    const sorted = Array.from(map.values()).sort((a, b) => this.recordUtcEpoch(a) - this.recordUtcEpoch(b));
    if (sorted.length === 0) return null;

    // Keep readings within 26 hours of the newest physical packet (up to 24 records)
    const newestEpoch = this.recordUtcEpoch(sorted[sorted.length - 1]);
    const recent = sorted
      .filter((r) => {
        const ep = this.recordUtcEpoch(r);
        return !newestEpoch || !ep || newestEpoch - ep <= 26 * 3600 * 1000;
      })
      .slice(-24);

    if (liveRecord && this.hasValidStationReading(liveRecord)) {
      this.saveStoredInmetHistory(codeUpper, recent);
    }

    const latest = { ...recent[recent.length - 1] };
    const rain24h = Math.round(recent.reduce((acc, r) => acc + (Number(r.rain) || 0), 0) * 10) / 10;
    latest.wind_cardinal = this.degreesToCardinal(latest.wind_dir);
    latest.rain_24h_accum = rain24h;
    latest.reading_timestamp = `${latest.date_brt} às ${latest.hour_brt} BRT (${latest.hour_utc} UTC)`;

    return {
      station: {
        code: codeUpper,
        name: staticData?.station?.name || stMeta.name || `Estação ${codeUpper}`,
        state: staticData?.station?.state || stMeta.state || "BR",
        lat: parseFloat(staticData?.station?.lat ?? stMeta.lat),
        lon: parseFloat(staticData?.station?.lon ?? stMeta.lon),
        altitude: staticData?.station?.altitude || stMeta.alt || 600,
        geocode: stMeta.geocode || staticData?.station?.geocode,
        inmet_link: `https://tempo.inmet.gov.br/TabelaEstacoes/${codeUpper}`
      },
      latest,
      history: recent
    };
  }

  async fetchLiveInmetBrowser(codeUpper, stMeta, staticData = null) {
    this.nearestLiveInmet = null;
    let liveExactRecord = null;
    const geocode = stMeta?.geocode || staticData?.station?.geocode;

    if (geocode) {
      try {
        const res = await fetch(`https://apiprevmet3.inmet.gov.br/estacao/proxima/${geocode}`);
        if (res.ok) {
          const js = await res.json();
          const dados = js?.dados || {};
          const est = js?.estacao || {};
          const returnedCode = String(dados.CD_ESTACAO || est.CODIGO || "").toUpperCase();
          const parsed = this.parseRawInmetRecord(dados);

          if (returnedCode === codeUpper && this.hasValidStationReading(parsed)) {
            liveExactRecord = parsed;
          } else if (returnedCode && returnedCode !== codeUpper && this.hasValidStationReading(parsed)) {
            this.nearestLiveInmet = {
              code: returnedCode,
              name: est.NOME || dados.DC_NOME || returnedCode,
              state: est.UF || dados.UF || stMeta.state || "BR",
              distKm: est.DISTANCIA_EM_KM ? Number(est.DISTANCIA_EM_KM) : null,
              temp: parsed.temp_ins,
              hourBrt: parsed.hour_brt
            };
          }
        }
      } catch (e) {
        console.warn("Live INMET apiprevmet3 fetch warning:", e);
      }
    }

    return this.mergePhysicalInmetSources(codeUpper, stMeta, staticData, liveExactRecord);
  }

  hasValidStationReading(latest) {
    if (!latest || latest.has_data === false) return false;
    return (
      (latest.temp_ins !== null && latest.temp_ins !== undefined) ||
      (latest.humidity_ins !== null && latest.humidity_ins !== undefined) ||
      (latest.pressure_ins !== null && latest.pressure_ins !== undefined) ||
      (latest.wind_speed !== null && latest.wind_speed !== undefined) ||
      (latest.rain !== null && latest.rain !== undefined)
    );
  }

  async loadStationData(stationCode, forceRefresh = false) {
    const codeUpper = (stationCode || "A029").toUpperCase();
    const refreshBtn = document.getElementById("btnManualRefresh");
    if (refreshBtn) refreshBtn.classList.add("spinning");

    const currentNameEl = document.getElementById("stationName");
    if (currentNameEl) currentNameEl.style.opacity = "0.6";

    this.inmetData = null;
    this.forecastData = null;
    this.airQualityData = null;
    this.nearestLiveInmet = null;
    this.alertDismissedKey = null;

    const stMeta = this.stationsMap[codeUpper] || DEFAULT_STATIONS_MAP[codeUpper] || {
      code: codeUpper,
      name: "Estação Meteorológica",
      state: "BR",
      lat: this.currentLat,
      lon: this.currentLon,
      alt: 600
    };

    let data = null;

    // 1. Try local FastAPI server if running (full 24h INMET station table)
    if (this.hasLocalBackend) {
      try {
        const res = await fetch(`/api/inmet/data/${codeUpper}${forceRefresh ? "?force=true" : ""}`);
        if (res.status === 404 || res.status === 501) {
          this.hasLocalBackend = false;
        } else if (res.ok) {
          const apiJson = await res.json();
          if (this.hasValidStationReading(apiJson?.latest)) {
            data = apiJson;
          }
        }
      } catch (e) {
        this.hasLocalBackend = false;
      }
    }

    // 2. Fetch static 24h station cache (if pre-cached) + live official INMET browser telemetry
    if (!data) {
      let staticData = null;
      if (DEFAULT_STATIONS_MAP[codeUpper]) {
        try {
          const res = await fetch(`static/data/stations/station_${codeUpper}.json`);
          if (res.ok) staticData = await res.json();
        } catch (e) {}
      }

      data = await this.fetchLiveInmetBrowser(codeUpper, stMeta, staticData);
    }

    // If station is completely offline without physical telemetry, locate nearest operational INMET station
    if ((!data || !this.hasValidStationReading(data?.latest)) && !this.nearestLiveInmet) {
      const altNear = this.findNearestOperanteNeighbor(codeUpper, parseFloat(stMeta.lat), parseFloat(stMeta.lon));
      if (altNear) {
        this.nearestLiveInmet = {
          code: altNear.code,
          name: altNear.name,
          state: altNear.state,
          distKm: altNear.distance_km,
          temp: null,
          hourBrt: null
        };
      }
    }

    if (data && data.station && this.hasValidStationReading(data.latest)) {
      this.inmetData = data;
      this.currentStationCode = data.station.code || codeUpper;
      this.currentState = data.station.state || stMeta.state || "GO";
      this.currentStationName = `${data.station.name} - ${this.currentState}`;
      this.currentLat = parseFloat(data.station.lat);
      this.currentLon = parseFloat(data.station.lon);
      this.currentAlt = data.station.altitude || stMeta.alt || 600;

      if (data.next_refresh_in_seconds !== undefined) {
        this.secondsToNextRefresh = data.next_refresh_in_seconds;
      }

      // STRICT PRIORITY: Always prioritize meteorological ground station data when available!
      this.currentSource = "inmet";
      this.renderInmetData(data, true);
    } else {
      // Contingency fallback ONLY when physical station has zero telemetry available
      this.currentSource = "openmeteo";
      this.currentStationCode = stMeta.code;
      this.currentState = stMeta.state || "BR";
      this.currentStationName = `${stMeta.name} - ${this.currentState}`;
      this.currentLat = parseFloat(stMeta.lat);
      this.currentLon = parseFloat(stMeta.lon);
      this.currentAlt = stMeta.alt || 600;

      document.getElementById("stationCode").textContent = this.currentStationCode;
      if (currentNameEl) currentNameEl.textContent = this.currentStationName;
      document.getElementById("stationCoords").innerHTML = `
        <span>Lat: ${this.currentLat.toFixed(2)}°</span> • 
        <span>Lon: ${this.currentLon.toFixed(2)}°</span> • 
        <span id="stationAltitude">Alt: ${Math.round(this.currentAlt)}m</span>
      `;
      const linkEl = document.getElementById("inmetOfficialLink");
      if (linkEl) linkEl.href = `https://tempo.inmet.gov.br/TabelaEstacoes/${this.currentStationCode}`;
      const chLabel = document.getElementById("crosshairLabel");
      if (chLabel) chLabel.textContent = `${stMeta.name} (${this.currentStationCode})`;

      this.updateSourceToggleUI("openmeteo", false, null, false);
    }

    // Update URL query param cleanly without reloading
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("station", this.currentStationCode);
      window.history.replaceState(null, "", url.toString());
    } catch (e) {}

    this.updateFavoriteButtonUI();
    this.highlightActiveStationChips(this.currentStationCode);

    // Fetch Forecast (with past 24h & atmospheric intel) and Air Quality in parallel
    await Promise.all([
      this.loadForecast(this.currentLat, this.currentLon),
      this.loadAirQuality(this.currentLat, this.currentLon)
    ]);

    this.renderAtmosphericIntel();
    this.syncAnalytics24h();

    if (currentNameEl) currentNameEl.style.opacity = "1";
    if (refreshBtn) refreshBtn.classList.remove("spinning");
  }

  isGroundDataFresh(latest) {
    if (!this.hasValidStationReading(latest)) return false;
    try {
      if (latest.date_utc && latest.hour_utc) {
        const [d, m, y] = latest.date_utc.split("/").map(Number);
        const [h, mi] = latest.hour_utc.split(":").map(Number);
        const readingUtc = new Date(Date.UTC(y, m - 1, d, h, mi || 0));
        const diffHours = (Date.now() - readingUtc.getTime()) / 3600000;
        if (!isNaN(diffHours)) {
          latest.staleness_hours = Math.max(0, Math.round(diffHours * 10) / 10);
          return diffHours <= 3.0 && diffHours >= -2.0;
        }
      }
    } catch (e) {}
    if (latest.has_current_data !== undefined) return latest.has_current_data === true;
    return false;
  }

  async selectStation(stationCode, forceRefresh = false) {
    this.highlightActiveStationChips(stationCode);
    await this.loadStationData(stationCode, forceRefresh);

    const searchInput = document.getElementById("stationSearchInput");
    const clearBtn = document.getElementById("clearSearchBtn");
    if (searchInput && this.currentStationCode) {
      searchInput.value = `${this.currentStationCode} - ${this.currentStationName}`;
      if (clearBtn) clearBtn.style.display = "block";
    }

    this.goesConfig.panOffsetX = 0;
    this.goesConfig.panOffsetY = 0;
    this.goesConfig.playerZoom = 1.0;
    const geos = this.latlonToGeosPct(this.currentLat, this.currentLon);
    if (geos) {
      this.goesConfig.pinXPct = geos.xPct;
      this.goesConfig.pinYPct = geos.yPct;
    }
    this.applyGoesZoom(true);

    if (this.goesConfig.isDirectNoaa && this.goesConfig.frames.length > 0) {
      await this.updateGoesVectorLayers();
    } else {
      await this.loadGoesFrames();
    }
  }

  updateSourceToggleUI(activeSource, hasFreshGround, stalenessHours, hasPhysicalInmet = true) {
    const btnOm = document.getElementById("btnSourceOpenMeteo");
    const btnInmet = document.getElementById("btnSourceInmet");
    const noteEl = document.getElementById("sourceStatusNote");
    const pulseStatus = document.getElementById("headerPulseStatus");
    const jumpBtn = document.getElementById("btnJumpNearestActive");

    if (btnInmet) {
      if (!hasPhysicalInmet) {
        btnInmet.innerHTML = `<span class="status-dot-amber"></span><span>📡 Estação INMET (Sem Sinal)</span>`;
        btnInmet.title = "Transmissor físico desta estação encontra-se em manutenção ou sem pacote recente no INMET.";
      } else if (!hasFreshGround) {
        const hrs = stalenessHours ? Math.max(1, Math.round(stalenessHours)) : null;
        const staleLabel = hrs ? (hrs >= 24 ? `${Math.round(hrs / 24)}d atrás` : `${hrs}h atrás`) : "Última Leitura";
        btnInmet.innerHTML = `<span class="status-dot-blue"></span><span>📡 Estação INMET (${staleLabel})</span>`;
        btnInmet.title = "Exibindo prioritariamente a última medição física registrada pela estação INMET.";
      } else {
        btnInmet.innerHTML = `<span class="pulse-dot-cyan"></span><span>📡 Estação INMET (Tempo Real)</span>`;
        btnInmet.title = "Prioridade ativa: telemetria oficial em tempo real medida pelos sensores de solo do INMET.";
      }
    }

    if (jumpBtn) {
      if (!hasPhysicalInmet && this.nearestLiveInmet && this.nearestLiveInmet.code !== this.currentStationCode) {
        const near = this.nearestLiveInmet;
        const tempTxt = near.temp !== null && near.temp !== undefined ? ` • ${near.temp}°C` : "";
        const distTxt = near.distKm !== null && near.distKm !== undefined ? ` (${near.distKm} km)` : "";
        jumpBtn.textContent = `📡 Usar Estação Ativa: ${near.code} ${near.name}${tempTxt}${distTxt}`;
        jumpBtn.onclick = () => this.selectStation(near.code, true);
        jumpBtn.style.display = "inline-flex";
      } else {
        jumpBtn.style.display = "none";
      }
    }

    if (activeSource === "inmet" && hasPhysicalInmet) {
      if (btnInmet) btnInmet.classList.add("active");
      if (btnOm) btnOm.classList.remove("active");
      if (noteEl) {
        noteEl.innerHTML = hasFreshGround
          ? `<span class="note-pill inmet">📡 Estação INMET Prioritária</span><span class="note-text">Medição oficial direta dos sensores físicos em solo</span>`
          : `<span class="note-pill inmet-archive">📡 Estação INMET Prioritária</span><span class="note-text">Exibindo última transmissão física registrada pela estação</span>`;
      }
      if (pulseStatus) {
        pulseStatus.textContent = hasFreshGround ? "ESTAÇÃO INMET AO VIVO" : "ESTAÇÃO INMET (SOLO)";
      }
    } else {
      if (btnOm) btnOm.classList.add("active");
      if (btnInmet) btnInmet.classList.remove("active");
      if (noteEl) {
        noteEl.innerHTML = !hasPhysicalInmet
          ? `<span class="note-pill fallback">⚠️ Contingência Open-Meteo</span><span class="note-text">Estação ${this.currentStationCode} sem transmissão no INMET agora</span>`
          : `<span class="note-pill om">🌐 Modelo Open-Meteo</span><span class="note-text">Visualização alternativa por grade numérica (clique em Estação INMET para retornar ao solo)</span>`;
      }
      if (pulseStatus) {
        pulseStatus.textContent = !hasPhysicalInmet ? "CONTINGÊNCIA OPEN-METEO" : "MODO MODELO NUMÉRICO";
      }
    }
  }

  renderInmetData(data, forceCards = false) {
    const st = data.station || {};
    const lat = data.latest || {};
    const hist = data.history || [];
    const hasFreshGround = this.isGroundDataFresh(lat);
    const stalenessHours = lat.staleness_hours;

    this.updateSourceToggleUI(this.currentSource, hasFreshGround, stalenessHours, true);

    document.getElementById("stationCode").textContent = st.code || "A029";
    const stNameEl = document.getElementById("stationName");
    stNameEl.textContent = `${st.name || "Edéia"} - ${st.state || "GO"}`;
    stNameEl.style.opacity = "1";
    document.getElementById("stationCoords").innerHTML = `
      <span>Lat: ${Number(st.lat).toFixed(2)}°</span> • 
      <span>Lon: ${Number(st.lon).toFixed(2)}°</span> • 
      <span id="stationAltitude">Alt: ${Math.round(Number(st.altitude || 608))}m</span>
    `;
    document.getElementById("inmetOfficialLink").href = st.inmet_link || `https://tempo.inmet.gov.br/TabelaEstacoes/${st.code}`;
    document.getElementById("crosshairLabel").textContent = `${st.name || "Estação"} (${st.code})`;

    // Only delegate to Open-Meteo if the user explicitly selected Open-Meteo
    if (!forceCards && this.currentSource === "openmeteo") {
      if (this.forecastData) this.renderOpenMeteoCurrent(this.forecastData);
      return;
    }

    const inmetTime = lat.reading_timestamp || `${lat.date_brt || ""} às ${lat.hour_brt || "--"} BRT`;
    const ageHrs = stalenessHours ? Math.max(1, Math.round(stalenessHours)) : 0;
    const tagNotice = !hasFreshGround
      ? ` <span style="color:#7dd3fc; font-size:11px;">• Último pacote recebido (${ageHrs >= 24 ? Math.round(ageHrs / 24) + "d" : ageHrs + "h"} atrás)</span>`
      : ` <span style="color:#34d399; font-size:11px;">• Telemetria física sincronizada</span>`;
    document.getElementById("readingTimestamp").innerHTML = `
      <span style="color: #38bdf8; font-weight: 700;">📡 Sensor Físico INMET:</span> ${inmetTime}${tagNotice}
    `;

    // Handle individual sensor channel fallback if e.g. thermistor is under maintenance (like A652) while other physical sensors work
    const histTemps = hist.map((r) => r.temp_ins).filter((v) => v !== null && v !== undefined && !isNaN(v));
    let tempVal = lat.temp_ins !== null && lat.temp_ins !== undefined
      ? lat.temp_ins
      : (histTemps.length > 0 ? histTemps[histTemps.length - 1] : null);
    let thermistorFallback = false;
    if (tempVal === null && this.forecastData?.current?.temperature !== undefined) {
      tempVal = this.forecastData.current.temperature;
      thermistorFallback = true;
    }

    document.getElementById("tempInstant").textContent = tempVal !== null ? tempVal : "--";
    if (thermistorFallback) {
      document.getElementById("thermalSensation").textContent = `${this.forecastData.current.apparent_temperature ?? tempVal}°C (Termistor INMET s/ sinal)`;
    } else {
      document.getElementById("thermalSensation").textContent =
        lat.thermal_sensation !== null && lat.thermal_sensation !== undefined
          ? `${lat.thermal_sensation}°C`
          : (tempVal !== null ? `${tempVal}°C` : "--");
    }

    const tMax24 = histTemps.length > 0 ? Math.max(...histTemps) : lat.temp_max;
    const tMin24 = histTemps.length > 0 ? Math.min(...histTemps) : lat.temp_min;
    const tMaxShow = lat.temp_max !== null && lat.temp_max !== undefined ? (tMax24 !== null ? Math.max(lat.temp_max, tMax24) : lat.temp_max) : tMax24;
    const tMinShow = lat.temp_min !== null && lat.temp_min !== undefined ? (tMin24 !== null ? Math.min(lat.temp_min, tMin24) : lat.temp_min) : tMin24;
    document.getElementById("tempMax").textContent = tMaxShow !== null && tMaxShow !== undefined ? `${Number(tMaxShow).toFixed(1)}°C` : "--";
    document.getElementById("tempMin").textContent = tMinShow !== null && tMinShow !== undefined ? `${Number(tMinShow).toFixed(1)}°C` : "--";

    this.updateComparisonDelta();

    const histHums = hist.map((r) => r.humidity_ins).filter((v) => v !== null && v !== undefined && !isNaN(v));
    const hum = lat.humidity_ins !== null && lat.humidity_ins !== undefined ? lat.humidity_ins : "--";
    document.getElementById("humidityInstant").textContent = hum;
    document.getElementById("humidityBar").style.width = `${Math.min(100, Math.max(0, Number(hum) || 0))}%`;
    const hMaxShow = histHums.length > 0 ? Math.round(Math.max(...histHums, Number(lat.humidity_max) || 0)) : lat.humidity_max;
    const hMinShow = histHums.length > 0 ? Math.round(Math.min(...histHums, ...(lat.humidity_min !== null && lat.humidity_min !== undefined ? [Number(lat.humidity_min)] : []))) : lat.humidity_min;
    document.getElementById("humMax").textContent = hMaxShow !== null && hMaxShow !== undefined ? `${hMaxShow}%` : "--";
    document.getElementById("humMin").textContent = hMinShow !== null && hMinShow !== undefined ? `${hMinShow}%` : "--";

    const histPress = hist.map((r) => r.pressure_ins).filter((v) => v !== null && v !== undefined && !isNaN(v));
    const press = lat.pressure_ins !== null && lat.pressure_ins !== undefined ? lat.pressure_ins : "--";
    document.getElementById("pressureInstant").textContent = press;
    if (press !== "--" && !isNaN(Number(press))) {
      const pPct = Math.min(100, Math.max(8, ((Number(press) - 900) / 130) * 100));
      const pBar = document.getElementById("pressureBar");
      if (pBar) pBar.style.width = `${pPct.toFixed(0)}%`;
    }
    const pMaxShow = histPress.length > 0 ? Math.max(...histPress).toFixed(1) : lat.pressure_max;
    const pMinShow = histPress.length > 0 ? Math.min(...histPress).toFixed(1) : lat.pressure_min;
    document.getElementById("pressMax").textContent = pMaxShow !== null && pMaxShow !== undefined ? pMaxShow : "--";
    document.getElementById("pressMin").textContent = pMinShow !== null && pMinShow !== undefined ? pMinShow : "--";

    const wSpeed = lat.wind_speed !== null && lat.wind_speed !== undefined ? Number(lat.wind_speed) : 0;
    document.getElementById("windSpeed").textContent = wSpeed.toFixed(1);
    document.getElementById("windSpeedKmh").textContent = (wSpeed * 3.6).toFixed(1);
    document.getElementById("windCardinal").textContent = lat.wind_cardinal || this.degreesToCardinal(lat.wind_dir);
    document.getElementById("windDir").textContent = lat.wind_dir !== null && lat.wind_dir !== undefined ? Math.round(lat.wind_dir) : "--";
    const wGust = lat.wind_gust !== null && lat.wind_gust !== undefined ? Number(lat.wind_gust) : wSpeed;
    document.getElementById("windGust").textContent = `${wGust.toFixed(1)} m/s (${(wGust * 3.6).toFixed(1)} km/h)`;

    if (lat.wind_dir !== null && lat.wind_dir !== undefined) {
      document.getElementById("compassNeedle").style.transform = `rotate(${lat.wind_dir}deg)`;
    }

    const rain = lat.rain !== null && lat.rain !== undefined ? Number(lat.rain) : 0.0;
    document.getElementById("rainInstant").textContent = rain.toFixed(1);
    document.getElementById("rainLastHour").textContent = `${rain.toFixed(1)} mm`;
    const rain24h = lat.rain_24h_accum !== undefined ? Number(lat.rain_24h_accum) : rain;
    document.getElementById("rain24hAccum").textContent = `${rain24h.toFixed(1)} mm`;
    document.getElementById("rainStatusText").textContent = rain > 0
      ? "Chuva registrada no pluviômetro físico"
      : (rain24h > 0 ? `Sem chuva na última hora • ${rain24h.toFixed(1)} mm em 24h` : "Sem chuva registrada no pluviômetro");

    if (lat.dew_point !== null && lat.dew_point !== undefined) {
      document.getElementById("dewPoint").textContent = lat.dew_point;
    } else if (tempVal !== null && hum !== "--" && Number(hum) > 0) {
      const T = Number(tempVal);
      const RH = Number(hum);
      const alpha = ((17.27 * T) / (237.7 + T)) + Math.log(RH / 100.0);
      document.getElementById("dewPoint").textContent = ((237.7 * alpha) / (17.27 - alpha)).toFixed(1);
    } else {
      document.getElementById("dewPoint").textContent = "--";
    }

    const rad = lat.solar_radiation !== null && lat.solar_radiation !== undefined ? Math.max(0, Number(lat.solar_radiation)) : 0.0;
    const radW = rad > 0 ? Math.round(rad / 3.6) : 0;
    document.getElementById("solarRadiation").textContent = rad > 0 ? rad.toFixed(1) : "0.0";
    document.getElementById("solarDesc").textContent = rad > 0
      ? `Piranômetro INMET: ${rad.toFixed(1)} kJ/m² (~${radW} W/m²)`
      : "Período noturno ou sem radiação solar direta no sensor.";

    // Card 7: Physical Datalogger Battery Voltage
    const batVal = lat.battery !== null && lat.battery !== undefined ? Number(lat.battery) : null;
    const batEl = document.getElementById("batteryVoltage");
    const batUnit = document.getElementById("batteryUnit");
    const batTag = document.getElementById("batteryStatusTag");
    if (batEl) batEl.textContent = batVal !== null ? batVal.toFixed(1) : "12.8";
    if (batUnit) batUnit.textContent = "V";
    if (batTag) {
      if (batVal !== null && batVal < 11.8) {
        batTag.className = "battery-status-tag tag-warn";
        batTag.textContent = "Tensão em Atenção (<11.8V)";
      } else {
        batTag.className = "battery-status-tag tag-good";
        batTag.textContent = batVal !== null && batVal >= 12.6 ? "Carga Solar Ótima" : "Alimentação Solar OK";
      }
    }

    // Card 8: Physical Station Transmission Status
    const stDot = document.getElementById("stationStatusDot");
    const stTxt = document.getElementById("stationStatusText");
    const stSub = document.getElementById("stationStatusSub");
    if (stDot) stDot.className = hasFreshGround ? "dot-online" : "dot-warning";
    if (stTxt) {
      stTxt.textContent = hasFreshGround
        ? "Estação INMET Operante (Ao Vivo)"
        : `Último Pacote: ${lat.date_brt || ""} ${lat.hour_brt || ""} BRT`;
    }
    if (stSub) {
      stSub.textContent = `Histórico físico: ${hist.length} leituras horárias`;
    }
  }

  renderOpenMeteoCurrent(data) {
    if (!data || !data.current) return;
    const curr = data.current;
    const today = (data.daily && data.daily[0]) ? data.daily[0] : {};
    const past24 = data.past_24h || [];
    const hasPhysical = this.hasValidStationReading(this.inmetData?.latest);

    const timeFormatted = curr.time ? curr.time.replace("T", " às ") : "Tempo Real";
    const readingTimeEl = document.getElementById("readingTimestamp");
    if (readingTimeEl) {
      const groundNotice = hasPhysical
        ? `• <span style="color: #7dd3fc; font-size:11px;">Sensor INMET disponível (${this.inmetData.latest.hour_brt || "--"} BRT)</span>`
        : `• <span style="color: #fbbf24; font-size:11px;">Estação ${this.currentStationCode} sem pacote INMET ativo</span>`;
      readingTimeEl.innerHTML = `<span style="color: #34d399; font-weight: 700;">🌐 Grade Numérica (Open-Meteo):</span> ${timeFormatted} BRT ${groundNotice}`;
    }

    const tempVal = curr.temperature !== undefined && curr.temperature !== null ? curr.temperature : "--";
    document.getElementById("tempInstant").textContent = tempVal;
    document.getElementById("thermalSensation").textContent = curr.apparent_temperature !== undefined && curr.apparent_temperature !== null ? `${curr.apparent_temperature}°C` : `${tempVal}°C`;
    document.getElementById("tempMax").textContent = today.temp_max !== undefined && today.temp_max !== null ? `${today.temp_max}°C` : "--";
    document.getElementById("tempMin").textContent = today.temp_min !== undefined && today.temp_min !== null ? `${today.temp_min}°C` : "--";

    this.updateComparisonDelta();

    // 1. Real 24h Humidity Min/Max from past_24h
    const hum = curr.humidity !== undefined ? curr.humidity : (curr.relative_humidity !== undefined ? curr.relative_humidity : "--");
    document.getElementById("humidityInstant").textContent = hum;
    document.getElementById("humidityBar").style.width = `${Math.min(100, Math.max(0, Number(hum) || 0))}%`;

    const validHums = past24.map((r) => r.humidity_ins).filter((v) => v !== null && v !== undefined && !isNaN(v));
    document.getElementById("humMax").textContent = validHums.length > 0 ? `${Math.round(Math.max(...validHums))}%` : (hum !== "--" ? `${hum}%` : "--");
    document.getElementById("humMin").textContent = validHums.length > 0 ? `${Math.round(Math.min(...validHums))}%` : (hum !== "--" ? `${hum}%` : "--");

    // 2. Real 24h Surface Pressure Min/Max from past_24h
    const pressRaw = curr.surface_pressure !== undefined ? curr.surface_pressure : (curr.pressure !== undefined ? curr.pressure : null);
    const press = pressRaw !== null && !isNaN(Number(pressRaw)) ? Number(pressRaw) : null;
    document.getElementById("pressureInstant").textContent = press !== null ? press.toFixed(1) : "--";
    if (press !== null) {
      const pPct = Math.min(100, Math.max(8, ((press - 900) / 130) * 100));
      const pBar = document.getElementById("pressureBar");
      if (pBar) pBar.style.width = `${pPct.toFixed(0)}%`;
    }
    const validPress = past24.map((r) => r.pressure_ins).filter((v) => v !== null && v !== undefined && !isNaN(v));
    document.getElementById("pressMax").textContent = validPress.length > 0 ? Math.max(...validPress).toFixed(1) : (press !== null ? press.toFixed(1) : "--");
    document.getElementById("pressMin").textContent = validPress.length > 0 ? Math.min(...validPress).toFixed(1) : (press !== null ? press.toFixed(1) : "--");

    // 3. Wind & Gusts
    const wSpeedKmh = curr.wind_speed !== undefined && curr.wind_speed !== null ? Number(curr.wind_speed) : 0;
    const wSpeedMs = (wSpeedKmh / 3.6).toFixed(1);
    document.getElementById("windSpeed").textContent = wSpeedMs;
    document.getElementById("windSpeedKmh").textContent = wSpeedKmh.toFixed(1);
    const wDir = curr.wind_direction !== undefined && curr.wind_direction !== null ? curr.wind_direction : 0;
    document.getElementById("windDir").textContent = `${wDir}`;
    document.getElementById("windCardinal").textContent = this.degreesToCardinal(wDir);
    const wGustKmh = curr.wind_gusts !== undefined && curr.wind_gusts !== null ? Number(curr.wind_gusts) : wSpeedKmh;
    const wGustMs = (wGustKmh / 3.6).toFixed(1);
    document.getElementById("windGust").textContent = `${wGustMs} m/s (${wGustKmh.toFixed(1)} km/h)`;

    if (curr.wind_direction !== undefined && curr.wind_direction !== null) {
      document.getElementById("compassNeedle").style.transform = `rotate(${curr.wind_direction}deg)`;
    }

    // 4. Rain & Real 24h Accumulation
    const rain = curr.rain !== undefined ? curr.rain : (curr.precipitation || 0.0);
    document.getElementById("rainInstant").textContent = rain;
    document.getElementById("rainLastHour").textContent = `${rain} mm`;
    const accumPast24 = past24.reduce((acc, r) => acc + (Number(r.rain) || 0), 0);
    const rainTodayPred = today.precipitation_sum !== undefined ? today.precipitation_sum : (today.rain_sum || 0.0);
    document.getElementById("rain24hAccum").textContent = past24.length > 0 ? `${accumPast24.toFixed(1)} mm` : `${rainTodayPred} mm (Hoje)`;
    document.getElementById("rainStatusText").textContent = rain > 0
      ? "Precipitação estimada em andamento"
      : (rainTodayPred > 0 ? `Sem chuva agora • ${rainTodayPred} mm previstos hoje` : "Tempo firme nas últimas horas");

    // 5. Dew Point
    if (curr.dew_point !== undefined && curr.dew_point !== null) {
      document.getElementById("dewPoint").textContent = Number(curr.dew_point).toFixed(1);
    } else if (curr.temperature !== undefined && hum !== "--" && Number(hum) > 0) {
      const T = Number(curr.temperature);
      const RH = Number(hum);
      const alpha = ((17.27 * T) / (237.7 + T)) + Math.log(RH / 100.0);
      document.getElementById("dewPoint").textContent = ((237.7 * alpha) / (17.27 - alpha)).toFixed(1);
    } else {
      document.getElementById("dewPoint").textContent = "--";
    }

    // 6. Global Solar Radiation
    const radKj = curr.solar_radiation_kj_m2 !== undefined && curr.solar_radiation_kj_m2 !== null
      ? Number(curr.solar_radiation_kj_m2)
      : (curr.shortwave_radiation ? Math.round(curr.shortwave_radiation * 3.6 * 10) / 10 : 0.0);
    const radW = curr.shortwave_radiation !== undefined && curr.shortwave_radiation !== null
      ? Math.round(curr.shortwave_radiation)
      : Math.round(radKj / 3.6);
    document.getElementById("solarRadiation").textContent = radKj > 0 ? radKj.toFixed(1) : "0.0";
    document.getElementById("solarDesc").textContent = radKj > 0
      ? `Irradiância estimada: ~${radW} W/m² (${radKj.toFixed(1)} kJ/m²)`
      : "Período noturno ou sem radiação solar direta.";

    const batEl = document.getElementById("batteryVoltage");
    const batUnit = document.getElementById("batteryUnit");
    const batTag = document.getElementById("batteryStatusTag");
    if (batEl) batEl.textContent = "Modelo";
    if (batUnit) batUnit.textContent = "";
    if (batTag) {
      batTag.className = "battery-status-tag tag-info";
      batTag.textContent = "Estimativa Numérica";
    }

    const stDot = document.getElementById("stationStatusDot");
    const stTxt = document.getElementById("stationStatusText");
    const stSub = document.getElementById("stationStatusSub");
    if (stDot) stDot.className = hasPhysical ? "dot-online" : "dot-warning";
    if (stTxt) {
      stTxt.textContent = hasPhysical
        ? "Visualizando Grade Open-Meteo"
        : `Estação ${this.currentStationCode} Sem Transmissão INMET`;
    }
    if (stSub) {
      stSub.textContent = hasPhysical
        ? "Clique em Estação INMET para dados do solo"
        : "Operando em contingência automática de grade";
    }
  }

  degreesToCardinal(deg) {
    if (deg === undefined || deg === null || isNaN(deg)) return "N/D";
    const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const idx = Math.round((((Number(deg) % 360) + 360) % 360) / 22.5) % 16;
    return dirs[idx];
  }

  getCardinalDirection(deg) {
    if (deg === null || deg === undefined || deg === "" || isNaN(deg)) return "--";
    return this.degreesToCardinal(parseFloat(deg));
  }

  setDataSource(source) {
    const hasPhysical = this.hasValidStationReading(this.inmetData?.latest);
    if (source === "inmet" && !hasPhysical) {
      const nearMsg = this.nearestLiveInmet
        ? ` Sugestão: alterne para a estação física ativa ${this.nearestLiveInmet.code} (${this.nearestLiveInmet.name}).`
        : "";
      this.showToast(`A estação ${this.currentStationCode} está sem transmissão física ativa no INMET neste momento.${nearMsg}`, "warn", 4600);
      return;
    }
    this.currentSource = source;
    const hasFreshGround = this.isGroundDataFresh(this.inmetData?.latest);
    const stalenessHours = this.inmetData?.latest?.staleness_hours;
    this.updateSourceToggleUI(source, hasFreshGround, stalenessHours, hasPhysical);

    if (source === "openmeteo") {
      if (this.forecastData) this.renderOpenMeteoCurrent(this.forecastData);
    } else if (this.inmetData) {
      this.renderInmetData(this.inmetData, true);
    }
    this.renderAtmosphericIntel();
    this.syncAnalytics24h();
  }

  updateComparisonDelta() {
    const inmetVal = this.inmetData?.latest?.temp_ins;
    const omVal = this.forecastData?.current?.temperature;
    const hasPhysical = this.hasValidStationReading(this.inmetData?.latest);
    const inmetTime = this.inmetData?.latest?.hour_brt ? `${this.inmetData.latest.hour_brt} BRT` : "solo";
    const compInmetEl = document.getElementById("compInmetVal");
    const compOmEl = document.getElementById("compOpenMeteoVal");
    const compDeltaEl = document.getElementById("compDeltaText");

    const inmetBox = compInmetEl?.closest(".comp-box");
    const omBox = compOmEl?.closest(".comp-box");
    if (inmetBox) inmetBox.classList.toggle("active-source", this.currentSource === "inmet");
    if (omBox) omBox.classList.toggle("active-source", this.currentSource === "openmeteo");

    if (compOmEl) {
      compOmEl.textContent = omVal !== undefined && omVal !== null ? `${omVal}°C` : "--";
    }

    if (inmetVal !== undefined && inmetVal !== null && omVal !== undefined && omVal !== null) {
      if (compInmetEl) compInmetEl.textContent = `${inmetVal}°C`;
      const delta = (inmetVal - omVal).toFixed(1);
      const sign = Number(delta) > 0 ? `+${delta}` : delta;
      if (compDeltaEl) {
        compDeltaEl.innerHTML = this.currentSource === "inmet"
          ? `Prioridade: <strong>📡 Sensor INMET (${inmetVal}°C às ${inmetTime})</strong> • Diferença p/ grade: <strong>${sign}°C</strong>`
          : `Visualizando Grade (${omVal}°C) • Sensor físico INMET: <strong>${inmetVal}°C (${inmetTime})</strong>`;
      }
    } else if (hasPhysical) {
      if (compInmetEl) compInmetEl.textContent = inmetVal !== null && inmetVal !== undefined ? `${inmetVal}°C` : "Parcial";
      if (compDeltaEl) {
        compDeltaEl.innerHTML = `Prioridade: <strong>📡 Sensores Físicos INMET (${this.currentStationCode})</strong> ativos em solo.`;
      }
    } else {
      if (compInmetEl) compInmetEl.textContent = "Sem Sinal";
      if (compDeltaEl) {
        compDeltaEl.innerHTML = omVal !== undefined && omVal !== null
          ? `Estação <strong>${this.currentStationCode}</strong> sem sinal no INMET • Contingência Open-Meteo (${omVal}°C).`
          : "Sincronizando telemetria...";
      }
    }
  }

  // ==========================================================================
  // Open-Meteo Forecast + Past 24h + Air Quality CAMS API
  // ==========================================================================
  getWmoInfo(code, isDay = true) {
    const map = {
      0: { desc: isDay ? "Céu Limpo" : "Noite Limpa", icon: isDay ? "clear-day" : "clear-night" },
      1: { desc: isDay ? "Predomínio de Sol" : "Poucas Nuvens", icon: isDay ? "mainly-clear" : "clear-night" },
      2: { desc: "Parcialmente Nublado", icon: isDay ? "partly-cloudy-day" : "partly-cloudy-night" },
      3: { desc: "Céu Encoberto", icon: "overcast" },
      45: { desc: "Nevoeiro", icon: "fog" },
      48: { desc: "Nevoeiro com Geada", icon: "fog" },
      51: { desc: "Garoa Leve", icon: "drizzle" },
      53: { desc: "Garoa Moderada", icon: "drizzle" },
      55: { desc: "Garoa Densa", icon: "drizzle" },
      61: { desc: "Chuva Leve", icon: "rain-light" },
      63: { desc: "Chuva Moderada", icon: "rain" },
      65: { desc: "Chuva Forte", icon: "rain-heavy" },
      66: { desc: "Chuva Fria", icon: "sleet" },
      67: { desc: "Chuva Fria Forte", icon: "sleet" },
      71: { desc: "Neve Fraca", icon: "snow" },
      73: { desc: "Neve Moderada", icon: "snow" },
      75: { desc: "Neve Intensa", icon: "snow" },
      80: { desc: "Pancadas Isoladas", icon: "showers" },
      81: { desc: "Pancadas de Chuva", icon: "showers" },
      82: { desc: "Pancadas Fortes", icon: "showers-heavy" },
      95: { desc: "Tempestade Elétrica", icon: "thunderstorm" },
      96: { desc: "Tempestade com Granizo", icon: "thunderstorm-hail" },
      99: { desc: "Tempestade Severa", icon: "thunderstorm-hail" }
    };
    return map[code] || { desc: "Instável", icon: isDay ? "partly-cloudy-day" : "cloudy" };
  }

  getWeatherEmoji(icon) {
    const emojis = {
      "clear-day": "☀️",
      "clear-night": "🌙",
      "mainly-clear": "🌤️",
      "partly-cloudy": "⛅",
      "partly-cloudy-day": "⛅",
      "partly-cloudy-night": "☁️",
      "cloudy": "☁️",
      "overcast": "☁️",
      "fog": "🌫️",
      "drizzle": "🌦️",
      "rain-light": "🌦️",
      "rain": "🌧️",
      "rain-heavy": "⛈️",
      "sleet": "🌨️",
      "snow": "❄️",
      "showers": "🌦️",
      "showers-heavy": "⛈️",
      "thunderstorm": "⚡",
      "thunderstorm-hail": "⛈️"
    };
    return emojis[icon] || "⛅";
  }

  formatBrtIsoToBrtAndUtc(isoBrtStr) {
    if (!isoBrtStr || !isoBrtStr.includes("T")) {
      return { date_brt: isoBrtStr || "--", hour_brt: "--", date_utc: "--", hour_utc: "--" };
    }
    try {
      const [dPart, tPart] = isoBrtStr.split("T");
      const [y, m, d] = dPart.split("-").map(Number);
      const [hh, mm] = tPart.split(":").map(Number);
      const pad = (n) => String(n).padStart(2, "0");
      const date_brt = `${pad(d)}/${pad(m)}/${y}`;
      const hour_brt = `${pad(hh)}:${pad(mm || 0)}`;
      // BRT is UTC-3 => UTC = BRT + 3 hours
      const utcMs = Date.UTC(y, m - 1, d, hh, mm || 0) + 3 * 3600 * 1000;
      const dtUtc = new Date(utcMs);
      const date_utc = `${pad(dtUtc.getUTCDate())}/${pad(dtUtc.getUTCMonth() + 1)}/${dtUtc.getUTCFullYear()}`;
      const hour_utc = `${pad(dtUtc.getUTCHours())}:${pad(dtUtc.getUTCMinutes())}`;
      return { date_brt, hour_brt, date_utc, hour_utc };
    } catch (e) {
      return { date_brt: isoBrtStr.slice(0, 10), hour_brt: isoBrtStr.slice(11, 16), date_utc: "--", hour_utc: "--" };
    }
  }

  async fetchDirectOpenMeteo(lat, lon) {
    try {
      const currentParams = [
        "temperature_2m", "relative_humidity_2m", "dew_point_2m", "apparent_temperature", "is_day",
        "precipitation", "rain", "weather_code", "cloud_cover", "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high",
        "pressure_msl", "surface_pressure", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
        "shortwave_radiation", "direct_normal_irradiance", "diffuse_radiation", "uv_index", "visibility", "cape", "vapour_pressure_deficit"
      ].join(",");

      const hourlyParams = [
        "temperature_2m", "relative_humidity_2m", "dew_point_2m", "apparent_temperature",
        "precipitation_probability", "precipitation", "weather_code", "surface_pressure",
        "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "cloud_cover",
        "shortwave_radiation", "et0_fao_evapotranspiration", "vapour_pressure_deficit", "cape", "uv_index", "is_day"
      ].join(",");

      const dailyParams = [
        "weather_code", "temperature_2m_max", "temperature_2m_min", "apparent_temperature_max", "apparent_temperature_min",
        "sunrise", "sunset", "daylight_duration", "sunshine_duration", "precipitation_sum", "precipitation_probability_max",
        "wind_speed_10m_max", "wind_direction_10m_dominant", "uv_index_max", "et0_fao_evapotranspiration"
      ].join(",");

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=${currentParams}&hourly=${hourlyParams}&daily=${dailyParams}&timezone=America%2FSao_Paulo&past_days=1&forecast_days=7`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const raw = await res.json();

      const curr = raw.current || {};
      const hourlyRaw = raw.hourly || {};
      const dailyRaw = raw.daily || {};

      const isDayCurr = curr.is_day !== 0;
      const radW = curr.shortwave_radiation !== undefined && curr.shortwave_radiation !== null ? curr.shortwave_radiation : 0.0;
      const currTime = curr.time || "";
      const times = hourlyRaw.time || [];

      let startIdx = 0;
      if (currTime) {
        const currHour = currTime.slice(0, 13) + ":00";
        const idx = times.indexOf(currHour);
        if (idx !== -1) {
          startIdx = idx;
        } else {
          for (let i = 0; i < times.length; i++) {
            if (times[i] >= currHour) {
              startIdx = i;
              break;
            }
          }
        }
      }

      const hTemps = hourlyRaw.temperature_2m || [];
      const hHum = hourlyRaw.relative_humidity_2m || [];
      const hDew = hourlyRaw.dew_point_2m || [];
      const hApp = hourlyRaw.apparent_temperature || [];
      const hRainProb = hourlyRaw.precipitation_probability || [];
      const hRain = hourlyRaw.precipitation || [];
      const hPress = hourlyRaw.surface_pressure || [];
      const hWind = hourlyRaw.wind_speed_10m || [];
      const hWDir = hourlyRaw.wind_direction_10m || [];
      const hGust = hourlyRaw.wind_gusts_10m || [];
      const hCodes = hourlyRaw.weather_code || [];
      const hCloud = hourlyRaw.cloud_cover || [];
      const hRad = hourlyRaw.shortwave_radiation || [];
      const hEt0 = hourlyRaw.et0_fao_evapotranspiration || [];
      const hVpd = hourlyRaw.vapour_pressure_deficit || [];
      const hCape = hourlyRaw.cape || [];
      const hIsDay = hourlyRaw.is_day || [];

      // Build exact chronological past 24 hours series up to startIdx
      const pastStart = Math.max(0, startIdx - 23);
      const past24h = [];
      for (let i = pastStart; i <= Math.min(times.length - 1, startIdx); i++) {
        const dtInfo = this.formatBrtIsoToBrtAndUtc(times[i]);
        const tVal = hTemps[i] !== null && hTemps[i] !== undefined ? Math.round(hTemps[i] * 10) / 10 : null;
        const wKmh = hWind[i] !== null && hWind[i] !== undefined ? hWind[i] : null;
        const gKmh = hGust[i] !== null && hGust[i] !== undefined ? hGust[i] : null;
        const radI = hRad[i] !== null && hRad[i] !== undefined ? hRad[i] : 0.0;

        past24h.push({
          has_data: true,
          source: "openmeteo",
          date_brt: dtInfo.date_brt,
          hour_brt: dtInfo.hour_brt,
          date_utc: dtInfo.date_utc,
          hour_utc: dtInfo.hour_utc,
          temp_ins: tVal,
          temp_max: tVal,
          temp_min: tVal,
          thermal_sensation: hApp[i] !== null && hApp[i] !== undefined ? Math.round(hApp[i] * 10) / 10 : tVal,
          dew_point: hDew[i] !== null && hDew[i] !== undefined ? Math.round(hDew[i] * 10) / 10 : null,
          humidity_ins: hHum[i] !== undefined ? hHum[i] : null,
          pressure_ins: hPress[i] !== null && hPress[i] !== undefined ? Math.round(hPress[i] * 10) / 10 : null,
          wind_speed: wKmh !== null ? Math.round((wKmh / 3.6) * 10) / 10 : null,
          wind_dir: hWDir[i] !== undefined ? hWDir[i] : null,
          wind_gust: gKmh !== null ? Math.round((gKmh / 3.6) * 10) / 10 : null,
          rain: hRain[i] !== null && hRain[i] !== undefined ? Math.round(hRain[i] * 10) / 10 : 0.0,
          solar_radiation: Math.round(radI * 3.6 * 10) / 10,
          vpd: hVpd[i] !== null && hVpd[i] !== undefined ? Math.round(hVpd[i] * 100) / 100 : null,
          et0: hEt0[i] !== null && hEt0[i] !== undefined ? Math.round(hEt0[i] * 100) / 100 : null,
          cape: hCape[i] !== null && hCape[i] !== undefined ? Math.round(hCape[i]) : 0
        });
      }

      // Build next 24h forecast
      const hourlyFormatted = [];
      for (let i = startIdx; i < Math.min(times.length, startIdx + 24); i++) {
        const tStr = times[i];
        const hourDisplay = tStr.includes("T") ? tStr.split("T")[1] : tStr;
        const code = hCodes[i] || 0;
        const dayFlag = hIsDay[i] !== undefined ? hIsDay[i] === 1 : true;
        const info = this.getWmoInfo(code, dayFlag);
        const rad = hRad[i] !== null && hRad[i] !== undefined ? hRad[i] : 0.0;
        hourlyFormatted.push({
          time_iso: tStr,
          hour: hourDisplay,
          temp: hTemps[i] !== null && hTemps[i] !== undefined ? Math.round(hTemps[i] * 10) / 10 : null,
          humidity: hHum[i],
          rain_prob: hRainProb[i] || 0,
          rain_mm: hRain[i] !== null && hRain[i] !== undefined ? Math.round(hRain[i] * 10) / 10 : 0.0,
          wind_speed: hWind[i] !== null && hWind[i] !== undefined ? Math.round(hWind[i] * 10) / 10 : null,
          cloud_cover: hCloud[i] !== undefined ? hCloud[i] : null,
          shortwave_radiation: Math.round(rad * 10) / 10,
          solar_radiation_kj_m2: Math.round(rad * 3.6 * 10) / 10,
          is_day: dayFlag,
          weather_code: code,
          weather_icon: info.icon,
          weather_desc: info.desc
        });
      }

      // Slice daily starting strictly from today in BRT (since past_days=1 puts yesterday at index 0)
      const dTimes = dailyRaw.time || [];
      const todayStr = currTime ? currTime.slice(0, 10) : "";
      let dayStartIdx = 0;
      if (todayStr) {
        const foundIdx = dTimes.findIndex((t) => t >= todayStr);
        if (foundIdx !== -1) dayStartIdx = foundIdx;
      }

      const dCodes = dailyRaw.weather_code || [];
      const dMax = dailyRaw.temperature_2m_max || [];
      const dMin = dailyRaw.temperature_2m_min || [];
      const dAppMax = dailyRaw.apparent_temperature_max || [];
      const dAppMin = dailyRaw.apparent_temperature_min || [];
      const dRainSum = dailyRaw.precipitation_sum || [];
      const dRainProb = dailyRaw.precipitation_probability_max || [];
      const dWind = dailyRaw.wind_speed_10m_max || [];
      const dWindDir = dailyRaw.wind_direction_10m_dominant || [];
      const dSunrise = dailyRaw.sunrise || [];
      const dSunset = dailyRaw.sunset || [];
      const dDaylight = dailyRaw.daylight_duration || [];
      const dSunshine = dailyRaw.sunshine_duration || [];
      const dUv = dailyRaw.uv_index_max || [];
      const dEt0 = dailyRaw.et0_fao_evapotranspiration || [];

      const weekdaysPt = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
      const dailyFormatted = [];
      for (let rel = 0; rel < 7 && (dayStartIdx + rel) < dTimes.length; rel++) {
        const i = dayStartIdx + rel;
        const dtStr = dTimes[i];
        const dt = new Date(dtStr + "T12:00:00");
        const dayIdx = dt.getDay();
        const weekdayName = dayIdx === 0 ? "Domingo" : weekdaysPt[dayIdx - 1];
        const code = dCodes[i] || 0;
        const info = this.getWmoInfo(code, true);
        let dateFormatted = dtStr;
        if (dtStr && dtStr.includes("-")) {
          const parts = dtStr.split("-");
          dateFormatted = `${parts[2]}/${parts[1]}`;
        }

        dailyFormatted.push({
          date: dtStr,
          date_formatted: dateFormatted,
          weekday: rel === 0 ? "Hoje" : (rel === 1 ? "Amanhã" : weekdayName),
          temp_max: dMax[i] !== null && dMax[i] !== undefined ? Math.round(dMax[i] * 10) / 10 : null,
          temp_min: dMin[i] !== null && dMin[i] !== undefined ? Math.round(dMin[i] * 10) / 10 : null,
          apparent_max: dAppMax[i] !== null && dAppMax[i] !== undefined ? Math.round(dAppMax[i] * 10) / 10 : null,
          apparent_min: dAppMin[i] !== null && dAppMin[i] !== undefined ? Math.round(dAppMin[i] * 10) / 10 : null,
          rain_sum: dRainSum[i] !== null && dRainSum[i] !== undefined ? Math.round(dRainSum[i] * 10) / 10 : 0.0,
          precipitation_sum: dRainSum[i] !== null && dRainSum[i] !== undefined ? Math.round(dRainSum[i] * 10) / 10 : 0.0,
          rain_prob_max: dRainProb[i] || 0,
          wind_speed_max: dWind[i],
          wind_direction_dominant: this.getCardinalDirection(dWindDir[i]),
          sunrise: dSunrise[i] && dSunrise[i].includes("T") ? dSunrise[i].split("T")[1] : "--",
          sunset: dSunset[i] && dSunset[i].includes("T") ? dSunset[i].split("T")[1] : "--",
          daylight_duration: dDaylight[i] !== undefined ? dDaylight[i] : null,
          sunshine_duration: dSunshine[i] !== undefined ? dSunshine[i] : null,
          uv_index_max: dUv[i] !== null && dUv[i] !== undefined ? Math.round(dUv[i] * 10) / 10 : 0,
          et0_sum: dEt0[i] !== null && dEt0[i] !== undefined ? Math.round(dEt0[i] * 100) / 100 : null,
          weather_code: code,
          weather_icon: info.icon,
          weather_desc: info.desc
        });
      }

      const currInfo = this.getWmoInfo(curr.weather_code || 0, isDayCurr);
      const et0CurrHour = hEt0[startIdx] !== null && hEt0[startIdx] !== undefined ? Math.round(hEt0[startIdx] * 100) / 100 : 0.0;

      return {
        latitude: lat,
        longitude: lon,
        current: {
          time: curr.time,
          temperature: curr.temperature_2m,
          apparent_temperature: curr.apparent_temperature,
          humidity: curr.relative_humidity_2m,
          relative_humidity: curr.relative_humidity_2m,
          dew_point: curr.dew_point_2m,
          is_day: isDayCurr,
          precipitation: curr.precipitation || 0.0,
          rain: curr.rain || 0.0,
          cloud_cover: curr.cloud_cover,
          cloud_cover_low: curr.cloud_cover_low,
          cloud_cover_mid: curr.cloud_cover_mid,
          cloud_cover_high: curr.cloud_cover_high,
          pressure: curr.surface_pressure || curr.pressure_msl,
          surface_pressure: curr.surface_pressure || curr.pressure_msl,
          pressure_msl: curr.pressure_msl,
          wind_speed: curr.wind_speed_10m,
          wind_direction: curr.wind_direction_10m,
          wind_gusts: curr.wind_gusts_10m,
          visibility: curr.visibility,
          uv_index: curr.uv_index !== undefined && curr.uv_index !== null ? Math.round(curr.uv_index * 10) / 10 : 0.0,
          cape: curr.cape !== undefined && curr.cape !== null ? Math.round(curr.cape) : 0,
          vpd: curr.vapour_pressure_deficit !== undefined && curr.vapour_pressure_deficit !== null ? Math.round(curr.vapour_pressure_deficit * 100) / 100 : 0.0,
          et0_hour: et0CurrHour,
          shortwave_radiation: Math.round(radW * 10) / 10,
          solar_radiation_kj_m2: Math.round(radW * 3.6 * 10) / 10,
          weather_code: curr.weather_code,
          weather_icon: currInfo.icon,
          weather_desc: currInfo.desc
        },
        past_24h: past24h,
        hourly: hourlyFormatted,
        daily: dailyFormatted
      };
    } catch (e) {
      console.warn("Direct Open-Meteo error:", e);
      return null;
    }
  }

  async loadForecast(lat, lon) {
    try {
      let data = null;
      if (this.hasLocalBackend) {
        try {
          const res = await fetch(`/api/forecast?lat=${lat}&lon=${lon}`);
          if (res.ok) data = await res.json();
        } catch (e) {}
      }

      if (!data || !data.past_24h) {
        data = await this.fetchDirectOpenMeteo(lat, lon);
      }
      if (!data) return;

      this.forecastData = data;
      if (this.currentSource === "openmeteo") {
        this.renderOpenMeteoCurrent(data);
      } else if (this.inmetData && (this.inmetData.latest?.temp_ins === null || this.inmetData.latest?.temp_ins === undefined)) {
        // Refresh partial INMET station display (e.g., if thermistor channel alone was null)
        this.renderInmetData(this.inmetData, true);
      }

      this.renderForecastSummary(data);
      this.renderHourlyForecast(data.hourly || []);
      this.renderDailyForecast(data.daily || []);
      this.renderEphemeris(data.daily && data.daily[0] ? data.daily[0] : null);
      this.updateComparisonDelta();
    } catch (err) {
      console.error("Error loading Open-Meteo forecast:", err);
    }
  }

  async loadAirQuality(lat, lon) {
    try {
      const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,dust,uv_index&timezone=America%2FSao_Paulo`;
      const res = await fetch(url);
      if (!res.ok) {
        this.airQualityData = null;
        return;
      }
      const raw = await res.json();
      this.airQualityData = raw.current || null;
    } catch (e) {
      console.warn("Air quality API unavailable:", e);
      this.airQualityData = null;
    }
  }

  renderForecastSummary(data) {
    const today = data.daily && data.daily[0] ? data.daily[0] : null;
    if (!today) return;
    const rangeEl = document.getElementById("forecastDayTempRange");
    if (rangeEl) rangeEl.textContent = `${today.temp_min}°C • ${today.temp_max}°C`;
    const rainEl = document.getElementById("forecastDayRainProb");
    const rainSum = today.precipitation_sum !== undefined ? today.precipitation_sum : (today.rain_sum || 0);
    if (rainEl) rainEl.textContent = `${today.rain_prob_max}% (${rainSum} mm)`;
  }

  renderHourlyForecast(hourly) {
    const container = document.getElementById("hourlyForecastContainer");
    if (!container) return;
    container.innerHTML = "";

    hourly.forEach((h, idx) => {
      const card = document.createElement("div");
      const isNow = idx === 0;
      card.className = "hourly-card" + (isNow ? " current-hour" : "");
      const radInfo = h.solar_radiation_kj_m2 > 0 ? ` • Rad: ${h.solar_radiation_kj_m2} kJ/m²` : "";
      card.title = `Previsão para ${h.hour}: Temp: ${h.temp}°C | Chuva: ${h.rain_mm} mm (${h.rain_prob}%) | Vento: ${h.wind_speed} km/h${radInfo}`;
      card.innerHTML = `
        <span class="hourly-time">${isNow ? `Agora (${h.hour})` : h.hour}</span>
        <span class="hourly-icon">${this.getWeatherEmoji(h.weather_icon)}</span>
        <span class="hourly-temp">${h.temp !== null ? `${h.temp}°` : "--"}</span>
        <span class="hourly-rain" title="Chuva: ${h.rain_mm} mm (${h.rain_prob}%)">${h.rain_prob}%</span>
      `;
      container.appendChild(card);
    });
  }

  renderDailyForecast(daily) {
    const container = document.getElementById("dailyForecastContainer");
    if (!container) return;
    container.innerHTML = "";
    if (!daily || daily.length === 0) return;

    const allMin = Math.min(...daily.map((d) => (d.temp_min !== null ? d.temp_min : 15)));
    const allMax = Math.max(...daily.map((d) => (d.temp_max !== null ? d.temp_max : 35)));
    const range = Math.max(1, allMax - allMin);

    daily.forEach((d) => {
      const minPct = Math.max(0, Math.min(90, ((d.temp_min - allMin) / range) * 100));
      const maxPct = Math.max(10, Math.min(100, ((d.temp_max - allMin) / range) * 100));
      const widthPct = Math.max(12, maxPct - minPct);

      let dateText = d.date_formatted;
      if (!dateText && d.date && typeof d.date === "string") {
        const parts = d.date.split("-");
        dateText = parts.length === 3 ? `${parts[2]}/${parts[1]}` : d.date;
      }

      const row = document.createElement("div");
      row.className = "daily-row";
      row.innerHTML = `
        <div class="daily-day-info">
          <span class="daily-icon">${this.getWeatherEmoji(d.weather_icon)}</span>
          <div>
            <div class="daily-weekday">${d.weekday}</div>
            <div class="daily-date">${dateText || ""}</div>
          </div>
        </div>
        <div class="daily-condition" title="${d.weather_desc}">${d.weather_desc}</div>
        <div class="daily-rain-prob" title="Probabilidade de Chuva: ${d.rain_prob_max}% • Volume: ${d.precipitation_sum || 0} mm">
          <span class="rain-drop-icon">💧</span>
          <span>${d.rain_prob_max}%</span>
        </div>
        <div class="daily-temp-bar-wrapper">
          <span class="daily-tmin">${d.temp_min !== null && d.temp_min !== undefined ? d.temp_min : "--"}°</span>
          <div class="daily-bar-track">
            <div class="daily-bar-fill" style="left: ${minPct.toFixed(1)}%; width: ${widthPct.toFixed(1)}%;"></div>
          </div>
          <span class="daily-tmax">${d.temp_max !== null && d.temp_max !== undefined ? d.temp_max : "--"}°</span>
        </div>
      `;
      container.appendChild(row);
    });
  }

  renderEphemeris(today) {
    if (!today) return;
    const sr = document.getElementById("sunriseTime");
    const ss = document.getElementById("sunsetTime");
    if (sr) sr.textContent = today.sunrise || "06:05";
    if (ss) ss.textContent = today.sunset || "18:18";
  }

  // ==========================================================================
  // Atmospheric Intelligence, Air Quality, Agrometeorology & Live Solar Arc
  // ==========================================================================
  setPillTone(el, text, tone) {
    if (!el) return;
    el.textContent = text;
    el.className = `intel-status-pill pill-${tone}`;
  }

  renderAtmosphericIntel() {
    const curr = this.forecastData?.current || {};
    const today = this.forecastData?.daily?.[0] || {};
    const aq = this.airQualityData || {};

    // --- 1. Convective CAPE, Visibility & 3-Layer Cloud Profile ---
    const cape = Number(curr.cape) || 0;
    const visMeters = curr.visibility !== undefined && curr.visibility !== null ? Number(curr.visibility) : 24000;
    const visKm = (visMeters / 1000).toFixed(1);

    const capeEl = document.getElementById("intelCapeVal");
    if (capeEl) capeEl.innerHTML = `${Math.round(cape)} <small>J/kg</small>`;
    const visEl = document.getElementById("intelVisVal");
    if (visEl) visEl.innerHTML = `${visKm} <small>km</small>`;

    const cLow = Math.min(100, Math.max(0, Number(curr.cloud_cover_low) || 0));
    const cMid = Math.min(100, Math.max(0, Number(curr.cloud_cover_mid) || 0));
    const cHigh = Math.min(100, Math.max(0, Number(curr.cloud_cover_high) || 0));

    const setCloud = (barId, valId, pct) => {
      const b = document.getElementById(barId);
      const v = document.getElementById(valId);
      if (b) b.style.width = `${pct}%`;
      if (v) v.textContent = `${Math.round(pct)}%`;
    };
    setCloud("cloudHighBar", "cloudHighVal", cHigh);
    setCloud("cloudMidBar", "cloudMidVal", cMid);
    setCloud("cloudLowBar", "cloudLowVal", cLow);

    const capeBadge = document.getElementById("intelCapeBadge");
    const convNote = document.getElementById("intelConvectiveSummary");
    if (cape >= 2000 || (curr.weather_code >= 95)) {
      this.setPillTone(capeBadge, "Severa", "rose");
      if (convNote) convNote.textContent = "Alta energia convectiva (CAPE elevado): risco de tempestades intensas, raios e rajadas.";
    } else if (cape >= 1000) {
      this.setPillTone(capeBadge, "Instável", "amber");
      if (convNote) convNote.textContent = "Convecção moderada a forte: ambiente favorável à formação de cumulonimbus (Cb).";
    } else if (cape >= 350) {
      this.setPillTone(capeBadge, "Convecção Leve", "cyan");
      if (convNote) convNote.textContent = "Instabilidade termodinâmica fraca a moderada; pancadas isoladas possíveis.";
    } else {
      this.setPillTone(capeBadge, "Estável", "emerald");
      if (convNote) convNote.textContent = visMeters < 5000
        ? `Atmosfera estável com visibilidade reduzida (${visKm} km por névoa/umidade).`
        : "Coluna atmosférica estável e boa visibilidade horizontal.";
    }

    // --- 2. Air Quality (US AQI, EU AQI, PM2.5, PM10, O3, Dust) & UV Index ---
    const usAqi = aq.us_aqi !== undefined && aq.us_aqi !== null ? Math.round(aq.us_aqi) : null;
    const euAqi = aq.european_aqi !== undefined && aq.european_aqi !== null ? Math.round(aq.european_aqi) : null;
    const uvNow = curr.uv_index !== undefined && curr.uv_index !== null
      ? Number(curr.uv_index)
      : (aq.uv_index !== undefined && aq.uv_index !== null ? Number(aq.uv_index) : 0);
    const uvMax = today.uv_index_max !== undefined && today.uv_index_max !== null ? Number(today.uv_index_max) : uvNow;

    const aqiValEl = document.getElementById("intelAqiVal");
    if (aqiValEl) aqiValEl.textContent = usAqi !== null ? `${usAqi}` : "--";
    const euAqiEl = document.getElementById("intelEuAqiVal");
    if (euAqiEl) euAqiEl.textContent = euAqi !== null ? `EU AQI: ${euAqi}` : "CAMS Satelital";

    const setPollutant = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val !== undefined && val !== null ? `${Number(val).toFixed(1)} µg` : "--";
    };
    setPollutant("aqPm25", aq.pm2_5);
    setPollutant("aqPm10", aq.pm10);
    setPollutant("aqOzone", aq.ozone);
    setPollutant("aqDust", aq.dust);

    const aqiBadge = document.getElementById("intelAqiBadge");
    if (usAqi === null) {
      this.setPillTone(aqiBadge, "N/D", "cyan");
    } else if (usAqi <= 50) {
      this.setPillTone(aqiBadge, "Ar Bom", "emerald");
    } else if (usAqi <= 100) {
      this.setPillTone(aqiBadge, "Moderado", "amber");
    } else if (usAqi <= 150) {
      this.setPillTone(aqiBadge, "Sensíveis", "amber");
    } else {
      this.setPillTone(aqiBadge, "Insalubre", "rose");
    }

    const uvValEl = document.getElementById("intelUvVal");
    if (uvValEl) uvValEl.textContent = uvNow.toFixed(1);
    const uvMaxEl = document.getElementById("intelUvMaxToday");
    if (uvMaxEl) uvMaxEl.textContent = `Pico hoje: ${uvMax.toFixed(1)}`;

    const uvBadge = document.getElementById("intelUvBadge");
    let uvLabel = "Baixo";
    let uvBg = "rgba(16, 185, 129, 0.18)";
    let uvColor = "#34d399";
    if (uvNow >= 11) { uvLabel = "Extremo"; uvBg = "rgba(168, 85, 247, 0.25)"; uvColor = "#d8b4fe"; }
    else if (uvNow >= 8) { uvLabel = "Muito Alto"; uvBg = "rgba(244, 63, 94, 0.22)"; uvColor = "#fb7185"; }
    else if (uvNow >= 6) { uvLabel = "Alto"; uvBg = "rgba(245, 158, 11, 0.22)"; uvColor = "#fbbf24"; }
    else if (uvNow >= 3) { uvLabel = "Moderado"; uvBg = "rgba(6, 182, 212, 0.2)"; uvColor = "#38bdf8"; }
    if (uvBadge) {
      uvBadge.textContent = uvLabel;
      uvBadge.style.background = uvBg;
      uvBadge.style.color = uvColor;
    }

    const uvAdviceEl = document.getElementById("intelUvAdvice");
    if (uvAdviceEl) {
      const aqiTxt = usAqi !== null && usAqi > 100
        ? `Atenção: partículas/fumaça elevadas (PM2.5 ${aq.pm2_5 ?? "--"} µg/m³).`
        : "Qualidade do ar favorável para atividades ao ar livre.";
      const uvTxt = uvNow >= 6
        ? `OMS: Proteção solar indispensável agora (UV ${uvNow.toFixed(1)}).`
        : (uvNow >= 3 ? "OMS: Uso de filtro solar recomendado." : "Sem risco UV significativo no momento.");
      uvAdviceEl.textContent = `${uvTxt} ${aqiTxt}`;
    }

    // --- 3. Agrometeorology FAO-56 (ET0, VPD & Spraying Window — Prioritizing Physical INMET Sensors) ---
    const inmetLat = this.inmetData?.latest || null;
    const usePhysicalAgro = this.currentSource === "inmet" && this.hasValidStationReading(inmetLat);

    const agroSubEl = document.getElementById("agroSourceSub");
    if (agroSubEl) {
      agroSubEl.textContent = usePhysicalAgro
        ? `📡 Microclima: Sensor INMET (${this.currentStationCode}) + FAO-56`
        : "🌐 Microclima: Grade Open-Meteo FAO-56";
    }

    const et0Day = today.et0_sum !== undefined && today.et0_sum !== null ? Number(today.et0_sum) : null;
    const et0Hour = curr.et0_hour !== undefined && curr.et0_hour !== null ? Number(curr.et0_hour) : 0;

    const tempC = usePhysicalAgro && inmetLat.temp_ins !== null && inmetLat.temp_ins !== undefined
      ? Number(inmetLat.temp_ins)
      : Number(curr.temperature ?? 25);
    const rhPct = usePhysicalAgro && inmetLat.humidity_ins !== null && inmetLat.humidity_ins !== undefined
      ? Number(inmetLat.humidity_ins)
      : Number(curr.humidity ?? curr.relative_humidity ?? 60);
    const windKmh = usePhysicalAgro && inmetLat.wind_speed !== null && inmetLat.wind_speed !== undefined
      ? Number(inmetLat.wind_speed) * 3.6
      : Number(curr.wind_speed ?? 0);
    const rainNow = usePhysicalAgro && inmetLat.rain !== null && inmetLat.rain !== undefined
      ? Number(inmetLat.rain)
      : Number(curr.precipitation ?? curr.rain ?? 0);

    let vpd = usePhysicalAgro ? this.computeTetensVpd(tempC, rhPct) : null;
    if (vpd === null && curr.vpd !== undefined && curr.vpd !== null) {
      vpd = Number(curr.vpd);
    }
    if (vpd === null && !isNaN(tempC) && !isNaN(rhPct)) {
      vpd = this.computeTetensVpd(tempC, rhPct);
    }

    const et0DayEl = document.getElementById("agroEt0Day");
    if (et0DayEl) et0DayEl.innerHTML = et0Day !== null ? `${et0Day.toFixed(2)} <small>mm</small>` : `-- <small>mm</small>`;
    const et0HourEl = document.getElementById("agroEt0Hour");
    if (et0HourEl) et0HourEl.textContent = `Taxa horária: ${et0Hour.toFixed(2)} mm/h`;

    const vpdEl = document.getElementById("agroVpdVal");
    if (vpdEl) vpdEl.innerHTML = vpd !== null ? `${vpd.toFixed(2)} <small>kPa</small>` : `-- <small>kPa</small>`;
    const vpdStatusEl = document.getElementById("agroVpdStatus");
    if (vpdStatusEl && vpd !== null) {
      if (vpd < 0.4) vpdStatusEl.textContent = "Ar saturado (risco fúngico)";
      else if (vpd <= 1.2) vpdStatusEl.textContent = "Transpiração ideal (0.4–1.2)";
      else if (vpd <= 1.6) vpdStatusEl.textContent = "Demanda moderada";
      else vpdStatusEl.textContent = "Estresse hídrico / alta demanda";
    }

    // Agronomic Spraying Evaluation (EMBRAPA / ANDEF criteria: Wind 3-10 km/h, RH >= 55%, Temp <= 30°C, no rain)
    const chkWind = document.getElementById("agroCheckWind");
    const chkHum = document.getElementById("agroCheckHum");
    const chkTemp = document.getElementById("agroCheckTemp");

    const windState = (windKmh >= 3 && windKmh <= 10) ? "ok" : (windKmh > 15 ? "bad" : "warn");
    const humState = rhPct >= 55 ? "ok" : (rhPct < 45 ? "bad" : "warn");
    const tempState = tempC <= 30 ? "ok" : (tempC > 33 ? "bad" : "warn");

    if (chkWind) { chkWind.className = `agro-check-chip ${windState}`; chkWind.textContent = `💨 ${windKmh.toFixed(0)} km/h`; }
    if (chkHum)  { chkHum.className = `agro-check-chip ${humState}`;  chkHum.textContent = `💧 UR ${Math.round(rhPct)}%`; }
    if (chkTemp) { chkTemp.className = `agro-check-chip ${tempState}`; chkTemp.textContent = `🌡️ ${tempC.toFixed(1)}°C`; }

    const sprayBadge = document.getElementById("agroSprayBadge");
    const sprayReason = document.getElementById("agroSprayReason");
    if (rainNow > 0.1) {
      this.setPillTone(sprayBadge, "Impróprio", "rose");
      if (sprayReason) sprayReason.textContent = "Pulverização suspensa: precipitação ativa causa lavagem foliar.";
    } else if (windState === "bad" || humState === "bad" || tempState === "bad") {
      this.setPillTone(sprayBadge, "Restrito", "rose");
      const reasons = [];
      if (windKmh > 15) reasons.push(`vento forte (${windKmh.toFixed(0)} km/h • deriva)`);
      if (rhPct < 45) reasons.push(`baixa umidade (${Math.round(rhPct)}% • evaporação de gotas)`);
      if (tempC > 33) reasons.push(`calor elevado (${tempC.toFixed(1)}°C • volatilização)`);
      if (sprayReason) sprayReason.textContent = `Evitar aplicação agora: ${reasons.join(", ")}.`;
    } else if (windState === "warn" || humState === "warn" || tempState === "warn") {
      this.setPillTone(sprayBadge, "Atenção", "amber");
      if (sprayReason) {
        sprayReason.textContent = windKmh < 3
          ? "Vento muito calmo (<3 km/h): atenção a inversão térmica; use pontas adequadas."
          : "Janela limítrofe: monitore deriva e tamanho de gotas durante a aplicação.";
      }
    } else {
      this.setPillTone(sprayBadge, "Janela Ideal", "emerald");
      if (sprayReason) sprayReason.textContent = "Condições agronômicas ideais (vento 3–10 km/h, UR ≥ 55% e T ≤ 30°C).";
    }

    // --- 4. Live Solar Arc & Lunar Phase ---
    this.renderSolarArcAndMoon(today, curr);

    // --- 5. Dynamic Severe Weather / Environmental Alert Banner ---
    this.evaluateWeatherAlerts(curr, aq, cape);
  }

  computeMoonPhase(dateObj = new Date()) {
    // Synodic month reference: Known New Moon 2000-01-06 18:14 UTC
    const synodicDays = 29.530588853;
    const refUtc = Date.UTC(2000, 0, 6, 18, 14, 0);
    const diffDays = (dateObj.getTime() - refUtc) / 86400000;
    const phase = ((diffDays % synodicDays) + synodicDays) % synodicDays;
    const frac = phase / synodicDays; // 0 = New, 0.5 = Full
    const illum = Math.round(((1 - Math.cos(2 * Math.PI * frac)) / 2) * 100);

    let emoji = "🌑";
    let name = "Lua Nova";
    if (frac < 0.03 || frac > 0.97) { emoji = "🌑"; name = "Lua Nova"; }
    else if (frac < 0.22) { emoji = "🌒"; name = "Crescente"; }
    else if (frac < 0.28) { emoji = "🌓"; name = "Quarto Crescente"; }
    else if (frac < 0.47) { emoji = "🌔"; name = "Gibosa Crescente"; }
    else if (frac < 0.53) { emoji = "🌕"; name = "Lua Cheia"; }
    else if (frac < 0.72) { emoji = "🌖"; name = "Gibosa Minguante"; }
    else if (frac < 0.78) { emoji = "🌗"; name = "Quarto Minguante"; }
    else { emoji = "🌘"; name = "Minguante"; }

    return { emoji, name, illum };
  }

  renderSolarArcAndMoon(today, curr) {
    const srStr = today?.sunrise && today.sunrise.includes(":") ? today.sunrise : "06:05";
    const ssStr = today?.sunset && today.sunset.includes(":") ? today.sunset : "18:18";

    const parseMin = (hhmm) => {
      const [h, m] = hhmm.split(":").map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const fmtMin = (mins) => {
      const mNorm = ((Math.round(mins) % 1440) + 1440) % 1440;
      const h = Math.floor(mNorm / 60);
      const m = mNorm % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    };

    const srMin = parseMin(srStr);
    const ssMin = parseMin(ssStr);
    const noonMin = (srMin + ssMin) / 2;

    // Current time in BRT (America/Sao_Paulo)
    const brtParts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(new Date()).split(":").map(Number);
    const nowMin = (brtParts[0] || 0) * 60 + (brtParts[1] || 0);

    const arcSr = document.getElementById("arcSunrise");
    const arcNoon = document.getElementById("arcNoon");
    const arcSs = document.getElementById("arcSunset");
    if (arcSr) arcSr.textContent = srStr;
    if (arcNoon) arcNoon.textContent = fmtMin(noonMin);
    if (arcSs) arcSs.textContent = ssStr;

    const isDaytime = nowMin >= srMin && nowMin <= ssMin;
    const dnBadge = document.getElementById("intelDayNightBadge");
    this.setPillTone(dnBadge, isDaytime ? "☀️ Diurno" : "🌙 Noturno", isDaytime ? "amber" : "purple");

    // Quadratic Bezier M(28,86) Q(130,-24) (232,86)
    let t = 0;
    if (isDaytime && ssMin > srMin) {
      t = Math.max(0, Math.min(1, (nowMin - srMin) / (ssMin - srMin)));
    } else {
      t = nowMin < srMin ? 0 : 1;
    }

    const x = (1 - t) * (1 - t) * 28 + 2 * (1 - t) * t * 130 + t * t * 232;
    const y = (1 - t) * (1 - t) * 86 + 2 * (1 - t) * t * (-24) + t * t * 86;

    const orbGroup = document.getElementById("solarOrbGroup");
    const orbCore = document.getElementById("solarOrbCore");
    const orbGlow = document.getElementById("solarOrbGlow");
    const progPath = document.getElementById("solarArcProgress");

    if (progPath) {
      const totalLen = typeof progPath.getTotalLength === "function" ? progPath.getTotalLength() : 246;
      progPath.style.strokeDasharray = `${totalLen}`;
      progPath.style.strokeDashoffset = `${totalLen * (1 - (isDaytime ? t : 0))}`;
    }

    if (orbGroup) {
      if (isDaytime) {
        orbGroup.setAttribute("transform", `translate(${x.toFixed(1)}, ${y.toFixed(1)})`);
        if (orbCore) orbCore.setAttribute("fill", "#fde047");
        if (orbGlow) orbGlow.style.opacity = "1";
      } else {
        // Place lunar/night orb cleanly along night horizon progress
        const nightDur = (1440 - ssMin) + srMin;
        const nightElapsed = nowMin > ssMin ? (nowMin - ssMin) : (1440 - ssMin + nowMin);
        const tn = nightDur > 0 ? Math.max(0.05, Math.min(0.95, nightElapsed / nightDur)) : 0.5;
        const nx = 232 - tn * (232 - 28);
        orbGroup.setAttribute("transform", `translate(${nx.toFixed(1)}, 86)`);
        if (orbCore) orbCore.setAttribute("fill", "#93c5fd");
        if (orbGlow) orbGlow.style.opacity = "0.35";
      }
    }

    // Daylight duration & solar countdown
    const durSec = today?.daylight_duration ? Number(today.daylight_duration) : Math.max(0, (ssMin - srMin) * 60);
    const dHours = Math.floor(durSec / 3600);
    const dMins = Math.round((durSec % 3600) / 60);
    const dlEl = document.getElementById("intelDaylightDur");
    if (dlEl) dlEl.textContent = `☀️ Fotoperíodo: ${dHours}h ${String(dMins).padStart(2, "0")}m`;

    const moon = this.computeMoonPhase(new Date());
    const moonEl = document.getElementById("intelMoonPhase");
    if (moonEl) moonEl.textContent = `${moon.emoji} ${moon.name} (${moon.illum}%)`;

    const cdEl = document.getElementById("intelSunCountdown");
    if (cdEl) {
      let diffMin = 0;
      let label = "";
      if (isDaytime) {
        diffMin = ssMin - nowMin;
        label = "Pôr do sol em";
      } else if (nowMin < srMin) {
        diffMin = srMin - nowMin;
        label = "Nascer do sol em";
      } else {
        diffMin = (1440 - nowMin) + srMin;
        label = "Próximo nascer do sol em";
      }
      const ch = Math.floor(diffMin / 60);
      const cm = diffMin % 60;
      cdEl.textContent = `${label} ${ch}h ${String(cm).padStart(2, "0")}min • Horário de Brasília`;
    }
  }

  evaluateWeatherAlerts(curr, aq, cape) {
    const banner = document.getElementById("weatherAlertBanner");
    if (!banner) return;

    const iconEl = document.getElementById("weatherAlertIcon");
    const titleEl = document.getElementById("weatherAlertTitle");
    const textEl = document.getElementById("weatherAlertText");

    const inmetLat = this.inmetData?.latest || null;
    const usePhysical = this.currentSource === "inmet" && this.hasValidStationReading(inmetLat);

    const wCode = Number(curr.weather_code || 0);
    const gustKmh = usePhysical && inmetLat.wind_gust !== null && inmetLat.wind_gust !== undefined
      ? Number(inmetLat.wind_gust) * 3.6
      : Number(curr.wind_gusts || 0);
    const rh = usePhysical && inmetLat.humidity_ins !== null && inmetLat.humidity_ins !== undefined
      ? Number(inmetLat.humidity_ins)
      : Number(curr.humidity ?? curr.relative_humidity ?? 65);
    const temp = usePhysical && inmetLat.temp_ins !== null && inmetLat.temp_ins !== undefined
      ? Number(inmetLat.temp_ins)
      : Number(curr.temperature ?? 24);
    const uv = Number(curr.uv_index || 0);
    const usAqi = aq?.us_aqi !== undefined && aq?.us_aqi !== null ? Number(aq.us_aqi) : 0;

    let alert = null;
    if (wCode >= 95 || cape >= 1800) {
      alert = {
        key: "storm",
        tone: "severity-rose",
        icon: "⛈️",
        title: `Alerta de Tempestade Convectiva • ${this.currentStationName}`,
        text: `Instabilidade severa detectada (CAPE ${Math.round(cape)} J/kg, rajadas de ${gustKmh.toFixed(0)} km/h). Acompanhe os topos frios no GOES-19.`
      };
    } else if (gustKmh >= 50) {
      alert = {
        key: "gale",
        tone: "severity-rose",
        icon: "💨",
        title: `Aviso de Rajadas Intensas (${gustKmh.toFixed(0)} km/h)`,
        text: `Ventos fortes registrados na região da estação ${this.currentStationCode}. Risco elevado de deriva e queda de galhos.`
      };
    } else if (rh <= 20) {
      alert = {
        key: "low_rh_red",
        tone: "severity-rose",
        icon: "🔥",
        title: `Alerta Crítico de Baixa Umidade (${Math.round(rh)}%)`,
        text: `Índice abaixo de 20% (padrão Defesa Civil/INMET): alto risco de incêndios florestais e desconforto respiratório.`
      };
    } else if (rh <= 30) {
      alert = {
        key: "low_rh_amber",
        tone: "severity-amber",
        icon: "🏜️",
        title: `Estado de Atenção • Umidade Relativa Baixa (${Math.round(rh)}%)`,
        text: `Ar seco na região de ${this.currentStationName}. Hidrate-se e monitore focos de calor no canal Fire Temperature RGB.`
      };
    } else if (usAqi >= 120) {
      alert = {
        key: "aqi",
        tone: "severity-amber",
        icon: "😷",
        title: `Qualidade do Ar Degradada (US AQI ${Math.round(usAqi)})`,
        text: `Concentração elevada de aerossóis/fumaça (PM2.5: ${aq.pm2_5 ?? "--"} µg/m³). Grupos sensíveis devem reduzir esforço externo.`
      };
    } else if (temp >= 37) {
      alert = {
        key: "heat",
        tone: "severity-rose",
        icon: "🌡️",
        title: `Calor Intenso (${temp.toFixed(1)}°C)`,
        text: `Estresse térmico elevado em ${this.currentStationName} (sensação de ${curr.apparent_temperature ?? temp}°C).`
      };
    } else if (uv >= 8 && curr.is_day) {
      alert = {
        key: "uv",
        tone: "severity-amber",
        icon: "☀️",
        title: `Radiação Ultravioleta Muito Alta (Índice UV ${uv.toFixed(1)})`,
        text: `Exposição solar desprotegida pode causar danos rápidos à pele. Utilize FPS 30+ e óculos com proteção UV.`
      };
    }

    if (!alert || this.alertDismissedKey === `${this.currentStationCode}_${alert.key}`) {
      banner.style.display = "none";
      return;
    }

    banner.dataset.alertKey = `${this.currentStationCode}_${alert.key}`;
    banner.className = `weather-alert-banner ${alert.tone}`;
    if (iconEl) iconEl.textContent = alert.icon;
    if (titleEl) titleEl.textContent = alert.title;
    if (textEl) textEl.textContent = alert.text;
    banner.style.display = "flex";
  }

  // ==========================================================================
  // GOES-19 Satellite Temporal Studio, Vector Projection & Client-Side Export
  // ==========================================================================
  parseNoaaTimestamp(ts) {
    ts = String(ts);
    const year = parseInt(ts.slice(0, 4), 10);
    const doy = parseInt(ts.slice(4, 7), 10);
    const hourUtc = parseInt(ts.slice(7, 9), 10);
    const minUtc = parseInt(ts.slice(9, 11), 10);

    const dateUtc = new Date(Date.UTC(year, 0, 1, hourUtc, minUtc));
    dateUtc.setUTCDate(doy);

    const dateBrt = new Date(dateUtc.getTime() - 3 * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, "0");

    const dStr = `${pad(dateBrt.getUTCDate())}/${pad(dateBrt.getUTCMonth() + 1)}/${dateBrt.getUTCFullYear()}`;
    const tBrtStr = `${pad(dateBrt.getUTCHours())}:${pad(dateBrt.getUTCMinutes())}`;
    const tUtcStr = `${pad(dateUtc.getUTCHours())}:${pad(dateUtc.getUTCMinutes())}`;

    return {
      utc: `${dStr} ${tUtcStr} UTC`,
      local: `${dStr} às ${tBrtStr} BRT`,
      time_only_local: `${tBrtStr} BRT`,
      time_only_utc: `${tUtcStr} UTC`,
      short_hhmm: tBrtStr,
      time_label: `${tBrtStr} BRT (${tUtcStr} UTC)`
    };
  }

  latlonToGeosPct(latDeg, lonDeg, lon0Deg = -75.0) {
    const rEq = 6378137.0;
    const rPol = 6356752.31414;
    const H = 42164160.0;

    const lat = (latDeg * Math.PI) / 180.0;
    const lon = (lonDeg * Math.PI) / 180.0;
    const lon0 = (lon0Deg * Math.PI) / 180.0;

    const latGeo = Math.atan(((rPol * rPol) / (rEq * rEq)) * Math.tan(lat));
    const cosLatGeo = Math.cos(latGeo);
    const cosC = cosLatGeo * Math.cos(lon - lon0);
    if (cosC < 0.16) return null; // Beyond visible limb of GOES-East

    const rC = rPol / Math.sqrt(1 - (1 - (rPol * rPol) / (rEq * rEq)) * (cosLatGeo * cosLatGeo));
    const sX = H - rC * cosC;
    const sY = -rC * cosLatGeo * Math.sin(lon - lon0);
    const sZ = rC * Math.sin(latGeo);

    const xRad = Math.asin(-sY / Math.sqrt(sX * sX + sY * sY + sZ * sZ));
    const yRad = Math.atan(sZ / sX);

    const maxScanAngle = 0.151872;
    const pctX = ((xRad / maxScanAngle + 1.0) * 0.5) * 100.0;
    const pctY = ((1.0 - yRad / maxScanAngle) * 0.5) * 100.0;
    return { xPct: pctX, yPct: pctY };
  }

  getDirectNoaaProductSpec(prodKey) {
    const specs = {
      cptec_dsa: {
        noaaId: "13",
        name: "Realce Convectivo IR (Canal 13 • 10,35µm)",
        has_temp_scale: true,
        legend_url: "static/img/legends/goes-ch13-dsa-celsius-pt-br.png",
        legend_title: "10,35µm Temp. de Brilho (°C)"
      },
      cptec_sandwich: {
        noaaId: "Sandwich",
        name: "Sandwich Convectivo (Visível + IR Térmico)",
        has_temp_scale: true,
        legend_url: "static/img/legends/goes-ch13-dsa-celsius-pt-br.png",
        legend_title: "Sandwich • Topo de Nuvens (°C)"
      },
      geocolor: {
        noaaId: "GEOCOLOR",
        name: "GOES-19 GeoColor (True-Color / Luzes Noturnas)",
        has_temp_scale: false,
        legend_title: "Guia GeoColor (NOAA STAR)",
        rgb_guide: [
          { color: "#ffffff", label: "Nuvens Densas / Cumulonimbus" },
          { color: "#16a34a", label: "Cobertura Vegetal Diurna" },
          { color: "#60a5fa", label: "Neblina Baixa / Estratos Noturnos" },
          { color: "#facc15", label: "Luzes Urbanas (Período Noturno)" }
        ]
      },
      fire_temp: {
        noaaId: "FireTemperature",
        name: "Focos de Queimada • Fire Temperature RGB",
        has_temp_scale: false,
        legend_title: "Temperatura de Fogo RGB (NOAA)",
        rgb_guide: [
          { color: "#dc2626", label: "Foco de Calor Ativo (~500–750 K)" },
          { color: "#f97316", label: "Queimada Muito Intensa (~900 K)" },
          { color: "#fef08a", label: "Frente de Fogo Extrema (>1100 K)" },
          { color: "#38bdf8", label: "Nuvens Frias / Plumas Convectivas" }
        ]
      },
      air_mass: {
        noaaId: "AirMass",
        name: "Massas de Ar & Frentes Frias RGB",
        has_temp_scale: false,
        legend_title: "Interpretação Massas de Ar RGB",
        rgb_guide: [
          { color: "#15803d", label: "Massa Tropical Quente (Baixo Ozônio)" },
          { color: "#3b82f6", label: "Massa Polar Fria (Alto Ozônio)" },
          { color: "#dc2626", label: "Ar Seco Estratosférico / Corrente de Jato" },
          { color: "#f8fafc", label: "Nuvens Espessas / Frente Fria" }
        ]
      },
      cptec_wv: {
        noaaId: "08",
        name: "Vapor d'Água Alta Troposfera (Canal 08 • 6,19µm)",
        has_temp_scale: true,
        legend_url: "static/img/legends/goes-ch08-WVCOLOR35-celsius-pt-br.png",
        legend_title: "6,19µm Vapor d'Água (°C)"
      },
      cptec_cloud_phase: {
        noaaId: "DayConvection",
        name: "Convecção Diurna & Fase de Nuvens RGB",
        has_temp_scale: false,
        legend_title: "Microfísica Convectiva RGB",
        rgb_guide: [
          { color: "#facc15", label: "Convecção Severa / Cristais Pequenos" },
          { color: "#ef4444", label: "Correntes Ascendentes Jovens" },
          { color: "#22d3ee", label: "Nuvens Baixas de Água Líquida" },
          { color: "#9333ea", label: "Cirrus Finos / Bigorna Dissipando" }
        ]
      },
      cptec_night_micro: {
        noaaId: "DayNightCloudMicroCombo",
        name: "Microfísica Dia/Noite (Nevoeiros & Stratus)",
        has_temp_scale: false,
        legend_title: "Microfísica de Nuvens RGB",
        rgb_guide: [
          { color: "#bef264", label: "Nevoeiro / Stratus Baixos Noturnos" },
          { color: "#ef4444", label: "Nuvens Espessas / Topos Muito Frios" },
          { color: "#38bdf8", label: "Superfície Livre de Nuvens (Noite)" }
        ]
      },
      cptec_natural: {
        noaaId: "DayLandCloudFire",
        name: "Terra, Nuvem & Fogo (DayLandCloudFire RGB)",
        has_temp_scale: false,
        legend_title: "Day Land Cloud Fire RGB",
        rgb_guide: [
          { color: "#ef4444", label: "Anomalia Termal / Queimada Ativa" },
          { color: "#22d3ee", label: "Nuvens de Gelo / Topos Altos" },
          { color: "#22c55e", label: "Vegetação Fotossinteticamente Ativa" },
          { color: "#78350f", label: "Cicatriz de Queimada / Solo Exposto" }
        ]
      },
      cptec_ir_noaa: {
        noaaId: "14",
        name: "Infravermelho Janela Longa (Canal 14 • 11,2µm)",
        has_temp_scale: true,
        legend_url: "static/img/legends/goes-ch13-IR4AVHRR6-celsius-pt-br.png",
        legend_title: "11,2µm Temp. de Brilho (°C) NOAA"
      }
    };
    return specs[prodKey] || specs.geocolor;
  }

  async fetchDirectNoaaGoesFrames() {
    const currentProd = this.goesConfig.product || "cptec_dsa";
    const spec = this.getDirectNoaaProductSpec(currentProd);
    const noaaProd = spec.noaaId;

    const resMap = {
      low: "339x339",
      medium: "678x678",
      high: "1808x1808",
      ultra: "5424x5424"
    };

    let activeRes = this.goesConfig.resolution || "medium";
    if (this.goesConfig.delta <= 5.0 && activeRes === "medium") {
      activeRes = "high";
      this.goesConfig.resolution = "high";
      const highBtn = document.querySelector('#resSelector .seg-btn[data-res="high"]');
      if (highBtn) {
        document.querySelectorAll("#resSelector .seg-btn").forEach((b) => b.classList.remove("active"));
        highBtn.classList.add("active");
      }
    }
    const resCode = resMap[activeRes] || "678x678";
    const numFrames = this.goesConfig.numFrames || 8;

    let timestamps = [];
    try {
      const dirUrl = `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/${noaaProd}/`;
      const res = await fetch(dirUrl);
      if (res.ok) {
        const html = await res.text();
        const regex = new RegExp(`(\\d{11})_GOES19-ABI-FD-${noaaProd}-(?:678x678|1808x1808|339x339|latest)\\.jpg`, "g");
        const found = [...html.matchAll(regex)].map((m) => m[1]);
        const unique = [...new Set(found)].sort();
        if (unique.length >= 2) {
          timestamps = unique.slice(-numFrames);
        }
      }
    } catch (e) {
      console.warn("Direct NOAA directory listing fallback:", e);
    }

    if (timestamps.length === 0) {
      const now = new Date();
      const base = new Date(now.getTime() - 25 * 60 * 1000);
      base.setUTCMinutes(Math.floor(base.getUTCMinutes() / 10) * 10, 0, 0);
      for (let i = numFrames - 1; i >= 0; i--) {
        const t = new Date(base.getTime() - i * 10 * 60 * 1000);
        const year = t.getUTCFullYear();
        const start = new Date(Date.UTC(year, 0, 0));
        const doy = Math.floor((t - start) / 86400000);
        const hh = String(t.getUTCHours()).padStart(2, "0");
        const mm = String(t.getUTCMinutes()).padStart(2, "0");
        timestamps.push(`${year}${String(doy).padStart(3, "0")}${hh}${mm}`);
      }
    }

    const frames = timestamps.map((ts) => {
      const fmt = this.parseNoaaTimestamp(ts);
      return {
        url: `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/${noaaProd}/${ts}_GOES19-ABI-FD-${noaaProd}-${resCode}.jpg`,
        timestamp_raw: ts,
        time_utc: fmt.utc,
        time_local: fmt.local,
        time_short: fmt.time_only_local,
        short_hhmm: fmt.short_hhmm,
        time_only_utc: fmt.time_only_utc,
        time_label: fmt.time_label
      };
    });

    const geos = this.latlonToGeosPct(this.currentLat, this.currentLon) || { xPct: 71.8, yPct: 63.8 };

    return {
      is_direct_noaa: true,
      frames,
      product: {
        id: noaaProd,
        name: spec.name,
        has_temp_scale: Boolean(spec.has_temp_scale),
        legend_url: spec.legend_url || null,
        legend_title: spec.legend_title || spec.name,
        rgb_guide: spec.rgb_guide || []
      },
      pin_x_pct: geos.xPct,
      pin_y_pct: geos.yPct,
      brazil_center_x_pct: 71.8,
      brazil_center_y_pct: 63.8,
      res_label: `${resCode} Full Disk`,
      scale_mode: this.goesConfig.delta <= 12.0 ? "brasil" : "fulldisk"
    };
  }

  async loadGoesFrames() {
    const overlay = document.getElementById("goesLoadingOverlay");
    if (overlay) {
      overlay.style.display = "flex";
      overlay.style.opacity = "1";
    }

    const { resolution, delta, product, numFrames, showBorders, showCities, showUrban } = this.goesConfig;
    const resBadge = document.getElementById("goesCurrentResBadge");
    const resLabels = {
      low: "339x339 Baixa",
      medium: "678x678 Média",
      high: "1808x1808 Alta",
      ultra: "5424x5424 Ultra"
    };
    if (resBadge) resBadge.textContent = resLabels[resolution] || resolution;

    let data = null;
    const directOnlyProducts = ["fire_temp", "air_mass"];

    // 1. Try local FastAPI backend if running (and product is supported by CPTEC/INPE backend)
    if (this.hasLocalBackend && !directOnlyProducts.includes(product)) {
      try {
        const url = `/api/goes/frames?lat=${this.currentLat}&lon=${this.currentLon}&delta=${delta}&resolution=${resolution}&frames=${numFrames}&product=${product}&borders=${showBorders !== false}&cities=${showCities !== false}&urban=${showUrban !== false}`;
        const res = await fetch(url);
        if (res.ok) data = await res.json();
      } catch (e) {}
    }

    // 2. Direct NOAA STAR GOES-19 Full Disk (100% browser-native for GitHub Pages)
    if (!data || !data.frames || data.frames.length === 0) {
      try {
        data = await this.fetchDirectNoaaGoesFrames();
      } catch (e) {
        console.error("Direct NOAA fetch error:", e);
      }
    }

    if (data && data.frames && data.frames.length > 0) {
      this.goesConfig.isDirectNoaa = Boolean(data.is_direct_noaa);
      this.goesConfig.frames = data.frames;
      this.goesConfig.productMeta = data.product || null;
      this.goesConfig.scaleMode = data.scale_mode || (delta <= 2.0 ? "local" : delta <= 5.0 ? "regional" : "brasil");
      this.goesConfig.pinXPct = data.pin_x_pct;
      this.goesConfig.pinYPct = data.pin_y_pct;
      this.goesConfig.resLabel = data.res_label || "";
      this.goesConfig.currentFrameIndex = Math.max(0, this.goesConfig.frames.length - 1);

      const hudResBadge = document.getElementById("hudResBadge");
      if (hudResBadge) hudResBadge.textContent = data.res_label ? `🛰️ ${data.res_label}` : "";

      this.applyGoesZoom();
      await Promise.all([
        this.preloadGoesImages(),
        this.updateGoesVectorLayers()
      ]);

      const slider = document.getElementById("timelineSlider");
      if (slider) {
        slider.max = Math.max(0, this.goesConfig.frames.length - 1);
        slider.value = this.goesConfig.currentFrameIndex;
      }

      this.renderTimelineTicks();
      this.renderCurrentGoesFrame();
      this.startGoesAnimation();
    } else {
      this.goesConfig.isDirectNoaa = false;
      this.goesConfig.frames = [{
        url: "static/sample_goes_edeia.png",
        time_label: "GOES-19 • Amostra Offline",
        time_utc: "Offline"
      }];
      this.goesConfig.currentFrameIndex = 0;
      this.renderTimelineTicks();
      this.renderCurrentGoesFrame();
    }

    if (overlay) {
      overlay.style.opacity = "0";
      setTimeout(() => { overlay.style.display = "none"; }, 280);
    }
  }

  getZoomTransform() {
    const { delta, pinXPct, pinYPct, playerZoom, panOffsetX, panOffsetY } = this.goesConfig;
    const px = pinXPct !== undefined ? pinXPct : 71.8;
    const py = pinYPct !== undefined ? pinYPct : 63.8;

    let baseScale = 1.0;
    let targetX = 50.0;
    let targetY = 50.0;

    if (delta <= 0.35) {
      baseScale = 18.0; targetX = px; targetY = py;
    } else if (delta <= 0.8) {
      baseScale = 12.0; targetX = px; targetY = py;
    } else if (delta <= 2.0) {
      baseScale = 7.5; targetX = px; targetY = py;
    } else if (delta <= 5.0) {
      baseScale = 4.2; targetX = px; targetY = py;
    } else if (delta <= 12.0) {
      baseScale = 2.15; targetX = 72.5; targetY = 64.5;
    } else {
      baseScale = 1.0; targetX = 50.0; targetY = 50.0;
    }

    const finalScale = baseScale * (playerZoom || 1.0);
    const tx = 50.0 - finalScale * targetX + (panOffsetX || 0);
    const ty = 50.0 - finalScale * targetY + (panOffsetY || 0);
    return { finalScale, tx, ty, px, py };
  }

  applyGoesZoom(animate = true) {
    const wrapper = document.getElementById("canvasZoomWrapper") || document.getElementById("goesDisplayImage");
    const crosshair = document.getElementById("satelliteCrosshair");
    const bordersOverlay = document.getElementById("goesBordersOverlay");
    if (bordersOverlay) bordersOverlay.classList.add("hidden");
    if (!wrapper) return;

    const { finalScale, tx, ty, px, py } = this.getZoomTransform();

    wrapper.style.transition = animate ? "transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)" : "none";
    wrapper.style.transformOrigin = "0% 0%";
    wrapper.style.transform = `translate(${tx}%, ${ty}%) scale(${finalScale})`;

    if (crosshair) {
      crosshair.style.left = `${px}%`;
      crosshair.style.top = `${py}%`;
      crosshair.style.display = "block";
      const invScale = Math.max(0.14, Math.min(1.0, 1.15 / finalScale));
      crosshair.style.transform = `scale(${invScale})`;
      const lbl = document.getElementById("crosshairLabel");
      if (lbl) lbl.textContent = `${this.currentStationName} (${this.currentStationCode})`;
    }

    const zoomDisplay = document.getElementById("playerZoomDisplay");
    if (zoomDisplay) zoomDisplay.textContent = `${finalScale.toFixed(1)}x`;
  }

  setPlayerZoom(newZoom) {
    const clamped = Math.max(0.5, Math.min(6.0, Math.round(newZoom * 10) / 10));
    this.goesConfig.playerZoom = clamped;
    this.applyGoesZoom(true);
  }

  toggleGoesFullscreen() {
    const wrapper = document.getElementById("goesScreenWrapper");
    if (!wrapper) return;

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      wrapper.classList.remove("goes-fullscreen-active");
    } else if (wrapper.requestFullscreen) {
      wrapper.requestFullscreen().catch(() => {
        wrapper.classList.toggle("goes-fullscreen-active");
      });
    } else {
      wrapper.classList.toggle("goes-fullscreen-active");
    }
  }

  // ==========================================================================
  // Geostationary SVG Vector Projection Engine (IBGE States, Cities & Urban)
  // ==========================================================================
  async fetchGeoJsonStates() {
    if (this.geoCache.estados) return this.geoCache.estados;
    try {
      const res = await fetch("static/data/geo/brasil_estados.geojson");
      if (res.ok) {
        this.geoCache.estados = await res.json();
        return this.geoCache.estados;
      }
    } catch (e) {}
    return null;
  }

  async fetchGeoJsonMunicipios(ufSigla) {
    const uf = (ufSigla || "GO").toUpperCase();
    if (this.geoCache.municipios[uf]) return this.geoCache.municipios[uf];

    if (uf === "GO") {
      try {
        const res = await fetch("static/data/geo/goias_municipios.geojson");
        if (res.ok) {
          this.geoCache.municipios.GO = await res.json();
          return this.geoCache.municipios.GO;
        }
      } catch (e) {}
    }

    const ufCode = UF_IBGE_CODES[uf];
    if (!ufCode) return null;
    try {
      const url = `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${ufCode}?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=municipio`;
      const res = await fetch(url);
      if (res.ok) {
        const gj = await res.json();
        this.geoCache.municipios[uf] = gj;
        return gj;
      }
    } catch (e) {
      console.warn(`IBGE municipal mesh unavailable for ${uf}:`, e);
    }
    return null;
  }

  async fetchGeoJsonUrbanGoias() {
    if (this.geoCache.urbanGoias) return this.geoCache.urbanGoias;
    try {
      const res = await fetch("static/data/geo/goias_areas_urbanizadas_2022.geojson");
      if (res.ok) {
        this.geoCache.urbanGoias = await res.json();
        return this.geoCache.urbanGoias;
      }
    } catch (e) {}
    return null;
  }

  geoJsonToGeosSvgPath(geojson, bboxFilter = null) {
    if (!geojson || !Array.isArray(geojson.features)) return { svgPath: "", ringsPct: [] };
    const chunks = [];
    const ringsPct = [];

    const processRing = (ring) => {
      if (!ring || ring.length < 3) return;
      if (bboxFilter) {
        const [lon0, lat0] = ring[0];
        if (
          lon0 < bboxFilter.minLon || lon0 > bboxFilter.maxLon ||
          lat0 < bboxFilter.minLat || lat0 > bboxFilter.maxLat
        ) {
          return;
        }
      }

      const pts = [];
      let dStr = "";
      for (let i = 0; i < ring.length; i++) {
        const pt = this.latlonToGeosPct(ring[i][1], ring[i][0]);
        if (!pt) continue;
        pts.push(pt);
        const sx = (pt.xPct * 10).toFixed(2);
        const sy = (pt.yPct * 10).toFixed(2);
        dStr += (pts.length === 1 ? `M${sx},${sy}` : `L${sx},${sy}`);
      }
      if (pts.length >= 3) {
        chunks.push(dStr + "Z");
        ringsPct.push(pts);
      }
    };

    for (const feat of geojson.features) {
      const geom = feat?.geometry;
      if (!geom || !geom.coordinates) continue;
      if (geom.type === "Polygon") {
        for (const ring of geom.coordinates) processRing(ring);
      } else if (geom.type === "MultiPolygon") {
        for (const poly of geom.coordinates) {
          for (const ring of poly) processRing(ring);
        }
      }
    }

    return { svgPath: chunks.join(""), ringsPct };
  }

  async updateGoesVectorLayers() {
    const svgOverlay = document.getElementById("goesVectorOverlay");
    const gBorders = document.getElementById("svgLayerBorders");
    const gCities = document.getElementById("svgLayerCities");
    const gUrban = document.getElementById("svgLayerUrban");
    if (!svgOverlay || !gBorders || !gCities || !gUrban) return;

    // When backend renders cropped PNGs directly, hide client-side Full Disk vector SVG
    if (!this.goesConfig.isDirectNoaa) {
      svgOverlay.style.display = "none";
      return;
    }

    svgOverlay.style.display = "block";
    this._activeVectorRings = { borders: [], cities: [], urban: [] };

    // 1. State Borders (27 UFs)
    if (this.goesConfig.showBorders) {
      const estadosGj = await this.fetchGeoJsonStates();
      if (estadosGj) {
        if (!this.geoCache._estadosProjected) {
          this.geoCache._estadosProjected = this.geoJsonToGeosSvgPath(estadosGj);
        }
        const { svgPath, ringsPct } = this.geoCache._estadosProjected;
        gBorders.innerHTML = svgPath ? `<path d="${svgPath}"></path>` : "";
        this._activeVectorRings.borders = ringsPct;
      }
    } else {
      gBorders.innerHTML = "";
    }

    // 2. Active State Municipal Mesh (IBGE)
    if (this.goesConfig.showCities && this.goesConfig.delta <= 9.0) {
      const uf = this.currentState || "GO";
      const munGj = await this.fetchGeoJsonMunicipios(uf);
      if (munGj) {
        const cacheKey = `_munProj_${uf}`;
        if (!this.geoCache[cacheKey]) {
          this.geoCache[cacheKey] = this.geoJsonToGeosSvgPath(munGj);
        }
        const { svgPath, ringsPct } = this.geoCache[cacheKey];
        const strokeOp = this.goesConfig.delta <= 4.0 ? "0.68" : "0.35";
        gCities.innerHTML = svgPath ? `<path d="${svgPath}" style="stroke-opacity:${strokeOp};"></path>` : "";
        this._activeVectorRings.cities = ringsPct;
      } else {
        gCities.innerHTML = "";
      }
    } else {
      gCities.innerHTML = "";
    }

    // 3. IBGE 2022 Urbanized Footprints (Regional/Local Zoom in GO)
    if (this.goesConfig.showUrban && this.currentState === "GO" && this.goesConfig.delta <= 4.0) {
      const urbanGj = await this.fetchGeoJsonUrbanGoias();
      if (urbanGj) {
        const padDeg = Math.max(0.8, this.goesConfig.delta * 1.35);
        const bbox = {
          minLat: this.currentLat - padDeg,
          maxLat: this.currentLat + padDeg,
          minLon: this.currentLon - padDeg,
          maxLon: this.currentLon + padDeg
        };
        const { svgPath, ringsPct } = this.geoJsonToGeosSvgPath(urbanGj, bbox);
        gUrban.innerHTML = svgPath ? `<path d="${svgPath}"></path>` : "";
        this._activeVectorRings.urban = ringsPct;
      } else {
        gUrban.innerHTML = "";
      }
    } else {
      gUrban.innerHTML = "";
    }
  }

  setupCanvasPanAndZoom() {
    const holder = document.querySelector(".canvas-holder");
    if (!holder || holder._panZoomInitialized) return;
    holder._panZoomInitialized = true;

    let isDown = false;
    let startX = 0;
    let startY = 0;
    let initialPanX = 0;
    let initialPanY = 0;

    holder.addEventListener("mousedown", (e) => {
      if (e.target.closest("button") || e.target.closest(".cptec-legend-box") || e.target.closest("input")) return;
      isDown = true;
      holder.style.cursor = "grabbing";
      startX = e.clientX;
      startY = e.clientY;
      initialPanX = this.goesConfig.panOffsetX || 0;
      initialPanY = this.goesConfig.panOffsetY || 0;
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const rect = holder.getBoundingClientRect();
      this.goesConfig.panOffsetX = initialPanX + (dx / (rect.width || 520)) * 100;
      this.goesConfig.panOffsetY = initialPanY + (dy / (rect.height || 520)) * 100;
      this.applyGoesZoom(false);
    });

    window.addEventListener("mouseup", () => {
      if (!isDown) return;
      isDown = false;
      holder.style.cursor = "grab";
    });

    let touchStartDist = 0;
    let initialZoom = 1.0;

    holder.addEventListener("touchstart", (e) => {
      if (e.target.closest("button") || e.target.closest(".cptec-legend-box") || e.target.closest("input")) return;
      if (e.touches.length === 1) {
        isDown = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        initialPanX = this.goesConfig.panOffsetX || 0;
        initialPanY = this.goesConfig.panOffsetY || 0;
      } else if (e.touches.length === 2) {
        isDown = false;
        touchStartDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialZoom = this.goesConfig.playerZoom || 1.0;
      }
    }, { passive: true });

    holder.addEventListener("touchmove", (e) => {
      if (e.touches.length === 1 && isDown) {
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        const rect = holder.getBoundingClientRect();
        this.goesConfig.panOffsetX = initialPanX + (dx / (rect.width || 360)) * 100;
        this.goesConfig.panOffsetY = initialPanY + (dy / (rect.height || 360)) * 100;
        this.applyGoesZoom(false);
      } else if (e.touches.length === 2 && touchStartDist > 0) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const newZoom = Math.max(0.5, Math.min(6.0, initialZoom * (dist / touchStartDist)));
        this.goesConfig.playerZoom = Math.round(newZoom * 10) / 10;
        this.applyGoesZoom(false);
      }
    }, { passive: true });

    holder.addEventListener("touchend", () => {
      isDown = false;
      touchStartDist = 0;
    }, { passive: true });

    holder.addEventListener("wheel", (e) => {
      e.preventDefault();
      const step = e.deltaY < 0 ? 0.2 : -0.2;
      this.setPlayerZoom((this.goesConfig.playerZoom || 1.0) + step);
    }, { passive: false });

    holder.addEventListener("dblclick", (e) => {
      if (e.target.closest("button") || e.target.closest(".cptec-legend-box") || e.target.closest("input")) return;
      this.goesConfig.panOffsetX = 0;
      this.goesConfig.panOffsetY = 0;
      this.goesConfig.playerZoom = 1.0;
      this.applyGoesZoom(true);
    });
  }

  async preloadGoesImages() {
    const promises = this.goesConfig.frames.map((f) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          img._corsClean = true;
          resolve(img);
        };
        img.onerror = () => {
          // Retry without crossOrigin if server lacked CORS header
          const fallbackImg = new Image();
          fallbackImg.onload = () => {
            fallbackImg._corsClean = false;
            resolve(fallbackImg);
          };
          fallbackImg.onerror = () => resolve(null);
          fallbackImg.src = f.url;
        };
        img.src = f.url;
      });
    });
    this.goesConfig.preloadedImages = await Promise.all(promises);
  }

  renderTimelineTicks() {
    const ticksEl = document.getElementById("timelineTicks");
    if (!ticksEl) return;
    ticksEl.innerHTML = "";
    const frames = this.goesConfig.frames || [];
    if (frames.length <= 1) return;

    frames.forEach((f, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `timeline-tick-btn${idx === this.goesConfig.currentFrameIndex ? " active" : ""}`;
      btn.textContent = f.short_hhmm || (f.time_short ? f.time_short.replace(" BRT", "") : `${idx + 1}`);
      btn.title = `Ir para quadro ${idx + 1}: ${f.time_label || f.time_local || ""}`;
      btn.addEventListener("click", () => {
        this.pauseGoesAnimation();
        this.goesConfig.currentFrameIndex = idx;
        this.renderCurrentGoesFrame();
      });
      ticksEl.appendChild(btn);
    });
  }

  renderCurrentGoesFrame() {
    const { frames, currentFrameIndex } = this.goesConfig;
    if (!frames || frames.length === 0) return;

    const frame = frames[currentFrameIndex];
    const displayImg = document.getElementById("goesDisplayImage");
    if (displayImg) displayImg.src = frame.url;

    const pMeta = this.goesConfig.productMeta || {};
    const prodName = pMeta.name || "Satélite GOES-19";
    const pEl = document.getElementById("hudProductName");
    if (pEl) pEl.textContent = prodName;
    const uEl = document.getElementById("hudTimeUtc");
    if (uEl) uEl.textContent = frame.time_only_utc || frame.time_utc || "";
    const lEl = document.getElementById("hudTimeLocal");
    if (lEl) lEl.textContent = frame.time_short || frame.time_local || "";
    const cEl = document.getElementById("hudFrameCounter");
    if (cEl) cEl.textContent = `Quadro ${currentFrameIndex + 1} de ${frames.length}`;

    const legendBox = document.getElementById("cptecLegendBox");
    const legendImg = document.getElementById("cptecLegendImg");
    const rgbLegendList = document.getElementById("rgbLegendList");
    const legendTitle = document.getElementById("cptecLegendTitle");
    if (legendBox) {
      if (this.goesConfig.showLegend && (pMeta.has_temp_scale || (pMeta.rgb_guide && pMeta.rgb_guide.length > 0))) {
        legendBox.classList.remove("hidden");
        if (legendTitle && pMeta.legend_title) legendTitle.textContent = pMeta.legend_title;

        if (pMeta.has_temp_scale && pMeta.legend_url) {
          if (legendImg) {
            legendImg.style.display = "block";
            if (!legendImg.src.endsWith(pMeta.legend_url)) legendImg.src = pMeta.legend_url;
          }
          if (rgbLegendList) rgbLegendList.style.display = "none";
        } else if (pMeta.rgb_guide && pMeta.rgb_guide.length > 0) {
          if (legendImg) legendImg.style.display = "none";
          if (rgbLegendList) {
            rgbLegendList.style.display = "flex";
            rgbLegendList.innerHTML = pMeta.rgb_guide.map((item) => `
              <div class="rgb-legend-item">
                <span class="rgb-legend-dot" style="background: ${item.color}; box-shadow: 0 0 6px ${item.color};"></span>
                <span>${item.label}</span>
              </div>
            `).join("");
          }
        }
      } else {
        legendBox.classList.add("hidden");
      }
    }

    const slider = document.getElementById("timelineSlider");
    if (slider) slider.value = currentFrameIndex;

    const tickBtns = document.querySelectorAll("#timelineTicks .timeline-tick-btn");
    tickBtns.forEach((b, i) => b.classList.toggle("active", i === currentFrameIndex));
  }

  startGoesAnimation() {
    if (this.goesConfig.timerId) clearInterval(this.goesConfig.timerId);
    if (!this.goesConfig.isPlaying) return;

    const interval = this.goesConfig.speedMs / this.goesConfig.playbackMultiplier;
    this.goesConfig.timerId = setInterval(() => {
      if (!this.goesConfig.frames || this.goesConfig.frames.length <= 1) return;
      let nextIndex = this.goesConfig.currentFrameIndex + 1;
      if (nextIndex >= this.goesConfig.frames.length) {
        if (this.goesConfig.loop) {
          nextIndex = 0;
        } else {
          this.pauseGoesAnimation();
          return;
        }
      }
      this.goesConfig.currentFrameIndex = nextIndex;
      this.renderCurrentGoesFrame();
    }, interval);

    document.getElementById("playIcon").style.display = "none";
    document.getElementById("pauseIcon").style.display = "block";
  }

  pauseGoesAnimation() {
    if (this.goesConfig.timerId) clearInterval(this.goesConfig.timerId);
    this.goesConfig.timerId = null;
    this.goesConfig.isPlaying = false;
    document.getElementById("playIcon").style.display = "block";
    document.getElementById("pauseIcon").style.display = "none";
  }

  togglePlayPause() {
    if (this.goesConfig.isPlaying) {
      this.pauseGoesAnimation();
    } else {
      this.goesConfig.isPlaying = true;
      this.startGoesAnimation();
    }
  }

  stepFrame(direction) {
    this.pauseGoesAnimation();
    const len = this.goesConfig.frames.length;
    if (len === 0) return;
    let nextIndex = this.goesConfig.currentFrameIndex + direction;
    if (nextIndex < 0) nextIndex = len - 1;
    if (nextIndex >= len) nextIndex = 0;
    this.goesConfig.currentFrameIndex = nextIndex;
    this.renderCurrentGoesFrame();
  }

  // ==========================================================================
  // Composite Frame Renderer for Client-Side GIF89a & HD PNG Snapshot
  // ==========================================================================
  renderGoesFrameToCanvas(ctx, W, H, frameIdx) {
    ctx.fillStyle = "#02040a";
    ctx.fillRect(0, 0, W, H);

    const img = this.goesConfig.preloadedImages?.[frameIdx];
    const frame = this.goesConfig.frames?.[frameIdx] || {};
    const { finalScale, tx, ty, px, py } = this.getZoomTransform();

    if (img && img.complete && img.naturalWidth > 0) {
      const drawX = (tx / 100) * W;
      const drawY = (ty / 100) * H;
      const drawW = finalScale * W;
      const drawH = finalScale * H;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    }

    // Draw geostationary vector overlays if active in Direct NOAA mode
    if (this.goesConfig.isDirectNoaa && this._activeVectorRings) {
      const strokeRings = (rings, strokeStyle, lineWidth, fillStyle = null) => {
        if (!rings || rings.length === 0) return;
        ctx.save();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = "round";
        if (fillStyle) ctx.fillStyle = fillStyle;
        ctx.beginPath();
        for (const ring of rings) {
          for (let i = 0; i < ring.length; i++) {
            const sx = ((tx + finalScale * ring[i].xPct) / 100) * W;
            const sy = ((ty + finalScale * ring[i].yPct) / 100) * H;
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          ctx.closePath();
        }
        if (fillStyle) ctx.fill();
        ctx.stroke();
        ctx.restore();
      };

      strokeRings(this._activeVectorRings.urban, "rgba(251, 113, 133, 0.85)", 1.0, "rgba(244, 63, 94, 0.28)");
      strokeRings(this._activeVectorRings.cities, "rgba(56, 189, 248, 0.5)", 0.85);
      strokeRings(this._activeVectorRings.borders, "rgba(250, 204, 21, 0.9)", 1.45);
    }

    // Draw Station Crosshair Pin
    const pinScreenX = ((tx + finalScale * px) / 100) * W;
    const pinScreenY = ((ty + finalScale * py) / 100) * H;
    if (pinScreenX >= -20 && pinScreenX <= W + 20 && pinScreenY >= -20 && pinScreenY <= H + 20) {
      ctx.save();
      ctx.strokeStyle = "#f43f5e";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(pinScreenX, pinScreenY, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(pinScreenX, pinScreenY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const pinLabel = `${this.currentStationCode} • ${this.currentStationName}`;
      ctx.font = `bold ${Math.round(W * 0.021)}px "JetBrains Mono", monospace`;
      const tw = ctx.measureText(pinLabel).width;
      const bx = Math.max(8, Math.min(W - tw - 20, pinScreenX - (tw + 12) / 2));
      const by = Math.min(H - 54, pinScreenY + 17);
      ctx.fillStyle = "rgba(8, 13, 28, 0.88)";
      ctx.strokeStyle = "rgba(6, 182, 212, 0.7)";
      ctx.lineWidth = 1;
      ctx.fillRect(bx, by, tw + 12, 20);
      ctx.strokeRect(bx, by, tw + 12, 20);
      ctx.fillStyle = "#f8fafc";
      ctx.fillText(pinLabel, bx + 6, by + 14);
      ctx.restore();
    }

    // Top HUD Banner
    ctx.save();
    ctx.fillStyle = "rgba(6, 10, 22, 0.84)";
    ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = "#38bdf8";
    ctx.font = `bold ${Math.round(W * 0.022)}px "Outfit", sans-serif`;
    const prodTitle = this.goesConfig.productMeta?.name || "GOES-19 Full Disk";
    ctx.fillText(`🛰️ ${prodTitle}`, 12, 22);

    const timeRight = frame.time_short || frame.time_local || "";
    ctx.fillStyle = "#34d399";
    ctx.font = `bold ${Math.round(W * 0.022)}px "JetBrains Mono", monospace`;
    const trW = ctx.measureText(timeRight).width;
    ctx.fillText(timeRight, W - trW - 12, 22);

    // Bottom HUD Watermark
    ctx.fillStyle = "rgba(6, 10, 22, 0.82)";
    ctx.fillRect(0, H - 26, W, 26);
    ctx.fillStyle = "#94a3b8";
    ctx.font = `${Math.round(W * 0.0185)}px "JetBrains Mono", monospace`;
    ctx.fillText(`MyWeatherNow • NOAA GOES-19 • ${frame.time_utc || ""}`, 12, H - 9);
    const fCounter = `${frameIdx + 1}/${this.goesConfig.frames.length}`;
    const fcW = ctx.measureText(fCounter).width;
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(fCounter, W - fcW - 12, H - 9);
    ctx.restore();
  }

  async captureSnapshotPng() {
    try {
      if (!this.goesConfig.frames || this.goesConfig.frames.length === 0) {
        this.showToast("Aguarde o carregamento dos quadros do satélite.", "warn");
        return;
      }
      const idx = this.goesConfig.currentFrameIndex || 0;
      const img = this.goesConfig.preloadedImages?.[idx];
      if (!img || !img._corsClean) {
        this.showToast("Captura direta indisponível por restrição CORS da imagem atual.", "warn");
        return;
      }

      const SIZE = 960;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      this.renderGoesFrameToCanvas(ctx, SIZE, SIZE, idx);

      canvas.toBlob((blob) => {
        if (!blob) {
          this.showToast("Erro ao exportar imagem PNG.", "error");
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const ts = this.goesConfig.frames[idx]?.timestamp_raw || Date.now();
        a.href = url;
        a.download = `GOES19_${this.currentStationCode}_${this.goesConfig.product}_${ts}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showToast("Snapshot PNG HD (960x960) baixado com sucesso! 📸", "success");
      }, "image/png");
    } catch (err) {
      console.error("Snapshot PNG error:", err);
      this.showToast("Falha ao capturar PNG do satélite.", "error");
    }
  }

  async generateAndDownloadGif() {
    const btn = document.getElementById("btnGenerateDownloadGif");
    const progress = document.getElementById("gifProgressStatus");
    const progressText = document.getElementById("gifProgressText");

    btn.disabled = true;
    btn.style.opacity = "0.7";
    progress.style.display = "flex";
    progressText.textContent = "Preparando quadros temporais do GOES-19...";

    const { resolution, delta, product, numFrames, speedMs, showBorders, showCities, showUrban } = this.goesConfig;

    // 1. Try local Python backend first if running and not a direct-only NOAA composite
    if (!this.goesConfig.isDirectNoaa) {
      try {
        const apiUrl = `/api/goes/gif?lat=${this.currentLat}&lon=${this.currentLon}&delta=${delta}&resolution=${resolution}&frames=${numFrames}&product=${product}&speed=${speedMs}&label=${encodeURIComponent(this.currentStationName)}&borders=${showBorders !== false}&cities=${showCities !== false}&urban=${showUrban !== false}`;
        const res = await fetch(apiUrl);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "success" && data.download_url) {
            progressText.textContent = "GIF gerado! Iniciando download...";
            const a = document.createElement("a");
            a.href = data.download_url;
            a.download = data.filename || `GOES19_${this.currentStationCode}_timelapse.gif`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            this.showToast("GIF animado exportado com sucesso! 🎬", "success");
            setTimeout(() => {
              progress.style.display = "none";
              btn.disabled = false;
              btn.style.opacity = "1";
            }, 1400);
            return;
          }
        }
      } catch (e) {}
    }

    // 2. 100% Client-Side Browser GIF89a Encoding (Works on GitHub Pages!)
    try {
      if (!this.goesConfig.frames || this.goesConfig.frames.length === 0) {
        throw new Error("Sem quadros carregados para gerar o GIF.");
      }

      const SIZE = resolution === "low" ? 420 : 560;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const rgbaFrames = [];
      const total = this.goesConfig.frames.length;

      for (let i = 0; i < total; i++) {
        const img = this.goesConfig.preloadedImages?.[i];
        if (!img || !img._corsClean) continue;
        progressText.textContent = `Renderizando quadro ${i + 1} de ${total} (${SIZE}x${SIZE})...`;
        await new Promise((r) => setTimeout(r, 12));
        this.renderGoesFrameToCanvas(ctx, SIZE, SIZE, i);
        const imgData = ctx.getImageData(0, 0, SIZE, SIZE);
        rgbaFrames.push(imgData.data);
      }

      if (rgbaFrames.length === 0) {
        throw new Error("As imagens atuais não permitem extração CORS no navegador.");
      }

      progressText.textContent = `Codificando animação GIF89a (${rgbaFrames.length} quadros)...`;
      await new Promise((r) => setTimeout(r, 20));

      const effectiveDelay = Math.max(80, Math.round(speedMs / (this.goesConfig.playbackMultiplier || 1.0)));
      const gifBytes = encodeAnimatedGif(rgbaFrames, SIZE, SIZE, effectiveDelay);

      const blob = new Blob([gifBytes], { type: "image/gif" });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `GOES19_${this.currentStationCode}_${product}_${rgbaFrames.length}q.gif`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);

      progressText.textContent = "GIF animado baixado com sucesso!";
      this.showToast(`GIF animado (${(gifBytes.length / 1024).toFixed(0)} KB) gerado no navegador! 🎬`, "success");
    } catch (err) {
      console.error("Client-side GIF error:", err);
      progressText.textContent = `Erro: ${err.message}`;
      this.showToast(`Erro ao gerar GIF: ${err.message}`, "error");
    } finally {
      setTimeout(() => {
        progress.style.display = "none";
        btn.disabled = false;
        btn.style.opacity = "1";
      }, 2000);
    }
  }

  // ==========================================================================
  // Historical 24h Analytics Hub & Chart.js Visualizations (All 672 Stations)
  // ==========================================================================
  initMap() {}
  updateMapStation() {}
  updateMapGoesOverlay() {}

  computeTetensVpd(tempC, rhPct) {
    if (tempC === null || tempC === undefined || rhPct === null || rhPct === undefined) return null;
    const T = Number(tempC);
    const RH = Number(rhPct);
    if (isNaN(T) || isNaN(RH)) return null;
    const es = 0.61078 * Math.exp((17.27 * T) / (T + 237.3));
    return Math.round(Math.max(0, es * (1 - RH / 100)) * 100) / 100;
  }

  syncAnalytics24h() {
    const inmetValid = (this.inmetData?.history || []).filter((r) => this.hasValidStationReading(r));
    const omPast24 = this.forecastData?.past_24h || [];

    const badge = document.getElementById("analyticsSourceBadge");
    if (this.currentSource === "inmet" && inmetValid.length >= 6) {
      this.activeHistory24h = inmetValid;
      if (badge) {
        badge.textContent = `📡 Sensor Físico INMET (${this.currentStationCode} • ${inmetValid.length}h)`;
        badge.className = "tag-pill tag-green";
      }
    } else if (this.currentSource === "inmet" && inmetValid.length > 0 && omPast24.length > 0) {
      // Anchor live INMET physical reading(s) onto preceding 24h series for uncached live stations
      const mergedMap = new Map();
      omPast24.forEach((r) => {
        const key = `${r.date_brt}_${r.hour_brt}`;
        mergedMap.set(key, { ...r, source: "openmeteo" });
      });
      inmetValid.forEach((r) => {
        const key = `${r.date_brt || r.date}_${r.hour_brt || r.hour_local}`;
        mergedMap.set(key, { ...r, source: "inmet" });
      });
      this.activeHistory24h = Array.from(mergedMap.values()).slice(-24);
      if (badge) {
        badge.textContent = `📡 Sensor INMET Ao Vivo + Série 24h (${this.currentStationCode})`;
        badge.className = "tag-pill tag-green";
      }
    } else if (this.currentSource === "inmet" && inmetValid.length > 0) {
      this.activeHistory24h = inmetValid;
      if (badge) {
        badge.textContent = `📡 Sensor Físico INMET (${this.currentStationCode})`;
        badge.className = "tag-pill tag-green";
      }
    } else if (omPast24.length > 0) {
      this.activeHistory24h = omPast24;
      if (badge) {
        badge.textContent = `🌐 Série Modelo 24h • Open-Meteo (${this.currentStationCode})`;
        badge.className = "tag-pill tag-cyan";
      }
    } else if (inmetValid.length > 0) {
      this.activeHistory24h = inmetValid;
      if (badge) {
        badge.textContent = `📡 Histórico INMET (${this.currentStationCode})`;
        badge.className = "tag-pill tag-green";
      }
    } else {
      this.activeHistory24h = [];
    }

    this.renderHistoryCharts(this.activeHistory24h);
    this.renderHistoryTable(this.activeHistory24h);
  }

  renderHistoryTable(records) {
    const tbody = document.getElementById("inmetTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const activeRecords = records && records.length > 0 ? records : this.activeHistory24h;
    if (!activeRecords || activeRecords.length === 0) {
      tbody.innerHTML = `<tr><td colspan="15" style="text-align:center; padding: 20px; color: var(--text-muted);">Nenhum registro das últimas 24h disponível no momento.</td></tr>`;
      return;
    }

    const reversed = [...activeRecords].reverse();
    reversed.forEach((r) => {
      const isInmetRow = r.source !== "openmeteo";
      const srcDot = isInmetRow ? "📡 " : "";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong style="color: ${isInmetRow ? "#38bdf8" : "#94a3b8"};" title="${isInmetRow ? "Sensor Físico INMET" : "Estimativa Grade Open-Meteo"}">${srcDot}${r.date_brt || r.date || "--"}</strong></td>
        <td><strong>${r.hour_brt || r.hour_local || "--"}</strong></td>
        <td>${r.hour_utc || "--"}</td>
        <td><span style="color: var(--text-muted); font-size: 11px;">${r.date_utc || "--"}</span></td>
        <td>${r.temp_ins !== null && r.temp_ins !== undefined ? `${r.temp_ins}°C` : "--"}</td>
        <td>${r.temp_max !== null && r.temp_max !== undefined ? `${r.temp_max}°C` : "--"}</td>
        <td>${r.temp_min !== null && r.temp_min !== undefined ? `${r.temp_min}°C` : "--"}</td>
        <td>${r.thermal_sensation !== null && r.thermal_sensation !== undefined ? `${r.thermal_sensation}°C` : "--"}</td>
        <td>${r.humidity_ins !== null && r.humidity_ins !== undefined ? `${r.humidity_ins}%` : "--"}</td>
        <td>${r.pressure_ins !== null && r.pressure_ins !== undefined ? `${r.pressure_ins} hPa` : "--"}</td>
        <td>${r.wind_speed !== null && r.wind_speed !== undefined ? `${r.wind_speed} m/s` : "--"}</td>
        <td>${r.wind_dir !== null && r.wind_dir !== undefined ? `${r.wind_dir}°` : "--"}</td>
        <td><span class="cardinal-badge">${this.getCardinalDirection(r.wind_dir)}</span></td>
        <td>${r.wind_gust !== null && r.wind_gust !== undefined ? `${r.wind_gust} m/s` : "--"}</td>
        <td style="${r.rain > 0 ? "color: #38bdf8; font-weight:700;" : ""}">${r.rain !== null && r.rain !== undefined ? `${r.rain} mm` : "0.0 mm"}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderHistoryCharts(records) {
    if (!window.Chart) return;
    const activeRecords = records && records.length > 0 ? records : this.activeHistory24h;
    if (!activeRecords || activeRecords.length === 0) return;

    const sorted = [...activeRecords];
    const labels = sorted.map((r) => r.hour_brt || r.hour_local || "--");

    Chart.defaults.color = "#94a3b8";
    Chart.defaults.font.family = "'Outfit', -apple-system, sans-serif";
    Chart.defaults.plugins.tooltip.backgroundColor = "rgba(15, 23, 42, 0.95)";
    Chart.defaults.plugins.tooltip.borderColor = "rgba(56, 189, 248, 0.3)";
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;

    this.renderRainChart(sorted, labels);
    this.renderTempChart(sorted, labels);
    this.renderWindCharts(sorted, labels);
    this.renderRadiationChart(sorted, labels);
    this.renderPressVpdChart(sorted, labels);
  }

  renderRainChart(sorted, labels) {
    const canvas = document.getElementById("chartRainCanvas");
    if (!canvas) return;
    if (this.charts.rain) this.charts.rain.destroy();

    const rainData = sorted.map((r) => (r.rain !== null && r.rain !== undefined ? Number(r.rain) : 0.0));
    const totalRain = rainData.reduce((acc, val) => acc + val, 0).toFixed(1);
    const badge = document.getElementById("chartRain24hTotal");
    if (badge) badge.textContent = `Total 24h: ${totalRain} mm`;

    this.charts.rain = new Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Chuva (mm)",
          data: rainData,
          backgroundColor: rainData.map((v) => (v > 0 ? "rgba(56, 189, 248, 0.82)" : "rgba(56, 189, 248, 0.14)")),
          borderColor: "#38bdf8",
          borderWidth: 1.5,
          borderRadius: 6,
          barThickness: "flex",
          maxBarThickness: 32
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (ctx) => `Precipitação: ${ctx.parsed.y.toFixed(1)} mm` }
          }
        },
        scales: {
          x: { grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { font: { size: 10 } } },
          y: {
            beginAtZero: true,
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            title: { display: true, text: "Milímetros (mm)", color: "#64748b", font: { size: 10 } }
          }
        }
      }
    });
  }

  renderTempChart(sorted, labels) {
    const canvas = document.getElementById("chartTempCanvas");
    if (!canvas) return;
    if (this.charts.temp) this.charts.temp.destroy();

    const tempsIns = sorted.map((r) => r.temp_ins);
    const thermal = sorted.map((r) => r.thermal_sensation);
    const dew = sorted.map((r) => {
      if (r.dew_point !== null && r.dew_point !== undefined) return r.dew_point;
      if (r.temp_ins !== null && r.humidity_ins !== null && r.humidity_ins > 0) {
        const T = Number(r.temp_ins);
        const RH = Number(r.humidity_ins);
        const alpha = ((17.27 * T) / (237.7 + T)) + Math.log(RH / 100.0);
        return Math.round(((237.7 * alpha) / (17.27 - alpha)) * 10) / 10;
      }
      return null;
    });

    const validTemps = tempsIns.filter((v) => v !== null && v !== undefined && !isNaN(v));
    if (validTemps.length > 0) {
      const minT = Math.min(...validTemps);
      const maxT = Math.max(...validTemps);
      const badge = document.getElementById("chartTempRangeBadge");
      if (badge) badge.textContent = `Mín: ${minT.toFixed(1)}°C • Máx: ${maxT.toFixed(1)}°C`;
    }

    this.charts.temp = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Temperatura (°C)",
            data: tempsIns,
            borderColor: "#38bdf8",
            backgroundColor: "rgba(56, 189, 248, 0.12)",
            fill: true,
            tension: 0.35,
            pointRadius: 3.5,
            pointHoverRadius: 6,
            pointBackgroundColor: "#38bdf8"
          },
          {
            label: "Sensação Térmica (°C)",
            data: thermal,
            borderColor: "#f59e0b",
            borderDash: [4, 4],
            tension: 0.35,
            pointRadius: 2.5
          },
          {
            label: "Ponto de Orvalho (°C)",
            data: dew,
            borderColor: "#34d399",
            borderDash: [3, 3],
            tension: 0.35,
            pointRadius: 2.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { boxWidth: 10, font: { size: 10 }, color: "#cbd5e1" } },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) + "°C" : "--"}`
            }
          }
        },
        scales: {
          x: { grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { font: { size: 10 } } },
          y: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            title: { display: true, text: "Graus Celsius (°C)", color: "#64748b", font: { size: 10 } }
          }
        }
      }
    });
  }

  renderWindCharts(sorted, labels) {
    const polarCanvas = document.getElementById("chartWindPolarCanvas");
    const speedCanvas = document.getElementById("chartWindSpeedCanvas");
    if (!polarCanvas || !speedCanvas) return;

    if (this.charts.windPolar) this.charts.windPolar.destroy();
    if (this.charts.windSpeed) this.charts.windSpeed.destroy();

    const sectors = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const sectorCounts = new Array(16).fill(0);
    const sectorSpeeds = new Array(16).fill(0);

    sorted.forEach((r) => {
      if (r.wind_dir !== null && r.wind_dir !== undefined && r.wind_speed !== null && r.wind_speed !== undefined) {
        const idx = Math.round((((Number(r.wind_dir) % 360) + 360) % 360) / 22.5) % 16;
        sectorCounts[idx]++;
        sectorSpeeds[idx] += Number(r.wind_speed);
      }
    });

    const sectorAvgSpeeds = sectorCounts.map((count, i) => (count > 0 ? sectorSpeeds[i] / count : 0));
    let maxCount = -1;
    let dominantSector = "N/D";
    sectorCounts.forEach((c, i) => {
      if (c > maxCount && c > 0) {
        maxCount = c;
        dominantSector = sectors[i];
      }
    });

    const windBadge = document.getElementById("chartWindDominantBadge");
    if (windBadge) windBadge.textContent = `Rumo Predominante: ${dominantSector}`;

    this.charts.windPolar = new Chart(polarCanvas.getContext("2d"), {
      type: "polarArea",
      data: {
        labels: sectors,
        datasets: [{
          label: "Frequência Horária",
          data: sectorCounts,
          backgroundColor: sectorAvgSpeeds.map((spd) => {
            if (spd > 4.0) return "rgba(244, 63, 94, 0.75)";
            if (spd > 2.0) return "rgba(245, 158, 11, 0.75)";
            if (spd > 0.5) return "rgba(16, 185, 129, 0.75)";
            return "rgba(148, 163, 184, 0.25)";
          }),
          borderColor: "rgba(255, 255, 255, 0.15)",
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${ctx.raw}h (Média: ${sectorAvgSpeeds[ctx.dataIndex].toFixed(1)} m/s)`
            }
          }
        },
        scales: {
          r: {
            grid: { color: "rgba(255, 255, 255, 0.08)" },
            ticks: { display: false },
            pointLabels: { color: "#94a3b8", font: { size: 9, weight: "bold" } }
          }
        }
      }
    });

    const speeds = sorted.map((r) => r.wind_speed);
    const gusts = sorted.map((r) => r.wind_gust);

    this.charts.windSpeed = new Chart(speedCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Velocidade (m/s)",
            data: speeds,
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.12)",
            fill: true,
            tension: 0.35,
            pointRadius: 3
          },
          {
            label: "Rajada Máx (m/s)",
            data: gusts,
            borderColor: "#f43f5e",
            borderDash: [3, 3],
            pointRadius: 2.5,
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { boxWidth: 10, font: { size: 9 }, color: "#cbd5e1" } }
        },
        scales: {
          x: { grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { font: { size: 9 } } },
          y: { beginAtZero: true, grid: { color: "rgba(255, 255, 255, 0.05)" }, title: { display: true, text: "m/s", color: "#64748b", font: { size: 9 } } }
        }
      }
    });
  }

  renderRadiationChart(sorted, labels) {
    const canvas = document.getElementById("chartRadCanvas");
    if (!canvas) return;
    if (this.charts.rad) this.charts.rad.destroy();

    const radData = sorted.map((r) => (r.solar_radiation !== null && r.solar_radiation !== undefined ? Math.max(0, Number(r.solar_radiation)) : 0.0));
    const humData = sorted.map((r) => r.humidity_ins);

    const peakRad = radData.length > 0 ? Math.max(...radData) : 0;
    const peakBadge = document.getElementById("chartRadPeakBadge");
    if (peakBadge) peakBadge.textContent = `Pico: ${peakRad.toFixed(1)} kJ/m² (~${Math.round(peakRad / 3.6)} W/m²)`;

    this.charts.rad = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Radiação Global (kJ/m²)",
            data: radData,
            borderColor: "#f59e0b",
            backgroundColor: "rgba(245, 158, 11, 0.2)",
            fill: true,
            tension: 0.35,
            yAxisID: "y",
            pointRadius: 3,
            pointHoverRadius: 6
          },
          {
            label: "Umidade Relativa (%)",
            data: humData,
            borderColor: "#818cf8",
            borderDash: [3, 3],
            tension: 0.3,
            yAxisID: "y1",
            pointRadius: 2.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { boxWidth: 10, font: { size: 10 }, color: "#cbd5e1" } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.datasetIndex === 0) {
                  const kj = ctx.parsed.y;
                  return `Radiação: ${kj.toFixed(1)} kJ/m² (~${Math.round(kj / 3.6)} W/m²)`;
                }
                return `Umidade: ${ctx.parsed.y}%`;
              }
            }
          }
        },
        scales: {
          x: { grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { font: { size: 10 } } },
          y: {
            beginAtZero: true,
            position: "left",
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            title: { display: true, text: "Radiação (kJ/m²)", color: "#f59e0b", font: { size: 10 } }
          },
          y1: {
            min: 0,
            max: 100,
            position: "right",
            grid: { display: false },
            title: { display: true, text: "Umidade (%)", color: "#818cf8", font: { size: 10 } }
          }
        }
      }
    });
  }

  renderPressVpdChart(sorted, labels) {
    const canvas = document.getElementById("chartPressCanvas");
    if (!canvas) return;
    if (this.charts.press) this.charts.press.destroy();

    const pressData = sorted.map((r) => (r.pressure_ins !== null && r.pressure_ins !== undefined ? Number(r.pressure_ins) : null));
    const vpdData = sorted.map((r) => {
      if (r.vpd !== null && r.vpd !== undefined) return Number(r.vpd);
      return this.computeTetensVpd(r.temp_ins, r.humidity_ins);
    });

    const validP = pressData.filter((v) => v !== null && !isNaN(v));
    const trendBadge = document.getElementById("chartPressTrendBadge");
    if (trendBadge && validP.length >= 4) {
      // Compare latest pressure vs 3 hours prior for standard synoptic barometric tendency
      const latestP = validP[validP.length - 1];
      const refP = validP[Math.max(0, validP.length - 4)];
      const diff3h = latestP - refP;
      const sign = diff3h >= 0 ? `+${diff3h.toFixed(1)}` : diff3h.toFixed(1);
      if (diff3h >= 1.2) {
        trendBadge.textContent = `📈 Subindo (${sign} hPa / 3h)`;
      } else if (diff3h <= -1.2) {
        trendBadge.textContent = `📉 Em Queda (${sign} hPa / 3h)`;
      } else {
        trendBadge.textContent = `➖ Estável (${sign} hPa / 3h)`;
      }
    }

    this.charts.press = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Pressão Atmosférica (hPa)",
            data: pressData,
            borderColor: "#a78bfa",
            backgroundColor: "rgba(167, 139, 250, 0.14)",
            fill: true,
            tension: 0.35,
            yAxisID: "y",
            pointRadius: 3,
            pointHoverRadius: 6
          },
          {
            label: "Déficit de Vapor • VPD (kPa)",
            data: vpdData,
            borderColor: "#34d399",
            borderDash: [4, 3],
            tension: 0.35,
            yAxisID: "y1",
            pointRadius: 2.5
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { boxWidth: 10, font: { size: 10 }, color: "#cbd5e1" } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.datasetIndex === 0) return `Pressão: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) + " hPa" : "--"}`;
                return `VPD: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(2) + " kPa" : "--"}`;
              }
            }
          }
        },
        scales: {
          x: { grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { font: { size: 10 } } },
          y: {
            position: "left",
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            title: { display: true, text: "Pressão Local (hPa)", color: "#a78bfa", font: { size: 10 } }
          },
          y1: {
            beginAtZero: true,
            position: "right",
            grid: { display: false },
            title: { display: true, text: "VPD (kPa)", color: "#34d399", font: { size: 10 } }
          }
        }
      }
    });
  }

  filterChartPanels(category) {
    const cards = {
      temp: document.getElementById("cardChartTemp"),
      rain: document.getElementById("cardChartRain"),
      wind: document.getElementById("cardChartWind"),
      rad: document.getElementById("cardChartRad"),
      press: document.getElementById("cardChartPress")
    };

    if (category === "all") {
      Object.entries(cards).forEach(([key, card]) => {
        if (card) {
          card.classList.remove("chart-hidden", "single-active");
          if (key === "press") card.classList.add("span-full");
        }
      });
    } else {
      Object.entries(cards).forEach(([key, card]) => {
        if (card) {
          if (key === category) {
            card.classList.remove("chart-hidden");
            card.classList.add("single-active");
          } else {
            card.classList.add("chart-hidden");
            card.classList.remove("single-active");
          }
        }
      });
    }

    setTimeout(() => {
      Object.values(this.charts).forEach((c) => c && c.resize());
    }, 50);
  }

  // ==========================================================================
  // Station Search, Autocomplete & GPS Nearest (Prioritizing Operational INMET Stations)
  // ==========================================================================
  async loadStationsList() {
    if (this.allStations && this.allStations.length > 0) return;
    try {
      let res = await fetch("static/data/inmet_stations.json");
      if (!res.ok) res = await fetch("inmet_stations.json");
      if (res.ok) {
        const list = await res.json();
        this.allStations = list;
        list.forEach((s) => {
          const code = String(s.code || "").toUpperCase();
          this.stationsMap[code] = {
            code,
            name: s.name,
            municipality: s.municipality || s.name,
            state: s.state,
            lat: parseFloat(s.lat),
            lon: parseFloat(s.lon),
            alt: parseFloat(s.altitude || 600),
            geocode: s.geocode || null,
            status: s.status || "Operante"
          };
        });
        // Non-blocking background sync of real-time INMET operational statuses
        this.syncLiveStationsStatus();
      }
    } catch (e) {
      console.warn("Could not load inmet_stations.json statically:", e);
    }
  }

  async syncLiveStationsStatus() {
    if (this.liveStatusSynced) return;
    this.liveStatusSynced = true;
    try {
      const res = await fetch("https://apitempo.inmet.gov.br/estacoes/T");
      if (!res.ok) return;
      const liveArr = await res.json();
      if (!Array.isArray(liveArr)) return;
      const statusByCode = {};
      liveArr.forEach((item) => {
        if (item?.CD_ESTACAO && item?.CD_SITUACAO) {
          statusByCode[String(item.CD_ESTACAO).toUpperCase()] = item.CD_SITUACAO;
        }
      });
      this.allStations.forEach((s) => {
        const code = String(s.code || "").toUpperCase();
        if (statusByCode[code]) {
          s.status = statusByCode[code];
          if (this.stationsMap[code]) {
            this.stationsMap[code].status = statusByCode[code];
          }
        }
      });
    } catch (e) {}
  }

  normalizeStr(str) {
    if (!str) return "";
    return str
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  findNearestOperanteNeighbor(excludeCode, lat, lon) {
    if (isNaN(lat) || isNaN(lon)) return null;
    const list = this.allStations && this.allStations.length > 0
      ? this.allStations
      : Object.values(this.stationsMap || DEFAULT_STATIONS_MAP);

    let best = null;
    let minDist = Infinity;
    for (const s of list) {
      if (String(s.code).toUpperCase() === excludeCode) continue;
      if (s.status && s.status !== "Operante") continue;
      const sLat = parseFloat(s.lat);
      const sLon = parseFloat(s.lon);
      if (isNaN(sLat) || isNaN(sLon)) continue;
      const dist = this.haversineDistance(lat, lon, sLat, sLon);
      if (dist < minDist) {
        minDist = dist;
        best = {
          code: s.code,
          name: s.name,
          state: s.state,
          distance_km: Math.round(dist * 10) / 10
        };
      }
    }
    return best;
  }

  searchStationsLocal(query, lat, lon, limit = 20) {
    const list = this.allStations && this.allStations.length > 0
      ? this.allStations
      : Object.values(this.stationsMap || DEFAULT_STATIONS_MAP);

    const q = this.normalizeStr(query);
    const results = [];
    const hasCoords = lat !== undefined && lon !== undefined && !isNaN(lat) && !isNaN(lon);

    for (const s of list) {
      const nameNorm = this.normalizeStr(s.name);
      const munNorm = this.normalizeStr(s.municipality);
      const codeNorm = this.normalizeStr(s.code);
      const stateNorm = this.normalizeStr(s.state);

      if (!q || nameNorm.includes(q) || munNorm.includes(q) || codeNorm.includes(q) || stateNorm === q) {
        const sLat = parseFloat(s.lat);
        const sLon = parseFloat(s.lon);
        let dist = null;
        if (hasCoords && !isNaN(sLat) && !isNaN(sLon)) {
          dist = Math.round(this.haversineDistance(lat, lon, sLat, sLon) * 10) / 10;
        }
        results.push({
          code: s.code,
          name: s.name,
          state: s.state,
          status: s.status || "Operante",
          lat: sLat,
          lon: sLon,
          distance_km: dist
        });
      }
    }

    results.sort((a, b) => {
      const aExact = this.normalizeStr(a.code) === q ? 0 : 1;
      const bExact = this.normalizeStr(b.code) === q ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;

      const aOp = a.status === "Operante" ? 0 : 1;
      const bOp = b.status === "Operante" ? 0 : 1;
      if (aOp !== bOp) return aOp - bOp;

      if (hasCoords) {
        return (a.distance_km ?? 999999) - (b.distance_km ?? 999999);
      }
      return (a.name || "").localeCompare(b.name || "");
    });
    return results.slice(0, limit);
  }

  findNearestStationLocal(lat, lon) {
    const list = this.allStations && this.allStations.length > 0
      ? this.allStations
      : Object.values(this.stationsMap || DEFAULT_STATIONS_MAP);

    let bestOperante = null;
    let minOperanteDist = Infinity;
    let bestAny = null;
    let minAnyDist = Infinity;

    for (const s of list) {
      const sLat = parseFloat(s.lat);
      const sLon = parseFloat(s.lon);
      if (isNaN(sLat) || isNaN(sLon)) continue;
      const dist = this.haversineDistance(lat, lon, sLat, sLon);
      if (dist < minAnyDist) {
        minAnyDist = dist;
        bestAny = {
          code: s.code,
          name: s.name,
          state: s.state,
          status: s.status || "Operante",
          lat: sLat,
          lon: sLon,
          distance_km: Math.round(dist * 10) / 10
        };
      }
      if ((s.status || "Operante") === "Operante" && dist < minOperanteDist) {
        minOperanteDist = dist;
        bestOperante = {
          code: s.code,
          name: s.name,
          state: s.state,
          status: "Operante",
          lat: sLat,
          lon: sLon,
          distance_km: Math.round(dist * 10) / 10
        };
      }
    }

    // Prioritize an operational physical station if within +45 km of the closest site
    if (bestOperante && (!bestAny || minOperanteDist <= minAnyDist + 45.0)) {
      return bestOperante;
    }
    return bestAny;
  }

  setupSearchAutocomplete() {
    const input = document.getElementById("stationSearchInput");
    const results = document.getElementById("stationSearchResults");
    const clearBtn = document.getElementById("clearSearchBtn");
    if (!input || !results) return;

    let debounceTimer = null;
    let selectedIndex = -1;

    input.addEventListener("focus", () => input.select());

    input.addEventListener("input", (e) => {
      const q = e.target.value.trim();
      if (clearBtn) clearBtn.style.display = q ? "block" : "none";
      clearTimeout(debounceTimer);
      selectedIndex = -1;

      if (q.length < 2) {
        results.classList.remove("active");
        results.innerHTML = "";
        return;
      }

      debounceTimer = setTimeout(async () => {
        let stations = [];
        if (this.hasLocalBackend) {
          try {
            const res = await fetch(`/api/stations?q=${encodeURIComponent(q)}&lat=${this.currentLat}&lon=${this.currentLon}&limit=20`);
            if (res.ok) {
              const data = await res.json();
              stations = data.stations || [];
            }
          } catch (err) {}
        }

        if (!stations || stations.length === 0) {
          if (!this.allStations || this.allStations.length === 0) {
            await this.loadStationsList();
          }
          stations = this.searchStationsLocal(q, this.currentLat, this.currentLon, 20);
        }
        this.renderSearchResults(stations);
      }, 140);
    });

    input.addEventListener("keydown", (e) => {
      const items = results.querySelectorAll(".search-item");
      if (!results.classList.contains("active") || items.length === 0) {
        if (e.key === "Escape") results.classList.remove("active");
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % items.length;
        items.forEach((it, idx) => it.classList.toggle("highlighted", idx === selectedIndex));
        items[selectedIndex]?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        items.forEach((it, idx) => it.classList.toggle("highlighted", idx === selectedIndex));
        items[selectedIndex]?.scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          items[selectedIndex].click();
        } else if (items.length > 0) {
          items[0].click();
        }
      } else if (e.key === "Escape") {
        results.classList.remove("active");
      }
    });

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        input.value = "";
        clearBtn.style.display = "none";
        results.classList.remove("active");
        results.innerHTML = "";
        input.focus();
      });
    }

    document.addEventListener("click", (e) => {
      if (!input.contains(e.target) && !results.contains(e.target)) {
        results.classList.remove("active");
      }
    });
  }

  renderSearchResults(stations) {
    const results = document.getElementById("stationSearchResults");
    if (!results) return;
    results.innerHTML = "";

    if (!stations || stations.length === 0) {
      results.innerHTML = `<div style="padding: 10px; color: var(--text-muted); font-size: 13px;">Nenhuma estação encontrada.</div>`;
      results.classList.add("active");
      return;
    }

    stations.forEach((s) => {
      const item = document.createElement("div");
      item.className = "search-item";
      const favMark = this.favorites.includes(s.code) ? "⭐ " : "";
      const isOp = (s.status || this.stationsMap[s.code]?.status || "Operante") === "Operante";
      const statusBadge = isOp
        ? `<span class="search-st-status operante" title="Estação física INMET operante">🟢 Operante</span>`
        : `<span class="search-st-status pane" title="Estação física em manutenção no INMET">🟠 Manutenção</span>`;
      item.innerHTML = `
        <div class="search-item-info">
          <span class="search-st-code">${s.code}</span>
          <span class="search-st-name">${favMark}${s.name} (${s.state})</span>
        </div>
        <div class="search-item-right">
          ${statusBadge}
          <span class="search-st-dist">${s.distance_km !== undefined && s.distance_km !== null ? `${s.distance_km} km` : ""}</span>
        </div>
      `;
      item.addEventListener("click", async () => {
        results.classList.remove("active");
        results.innerHTML = "";
        await this.selectStation(s.code, true);
      });
      results.appendChild(item);
    });

    results.classList.add("active");
  }

  async detectGpsLocation() {
    const btn = document.getElementById("btnGpsNearest");
    if (btn) btn.classList.add("spinning");

    if (!navigator.geolocation) {
      this.showToast("Geolocalização não é suportada pelo seu navegador.", "warn");
      if (btn) btn.classList.remove("spinning");
      return;
    }

    this.showToast("Obtendo sua localização GPS...", "info", 2200);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          let st = null;
          try {
            const res = await fetch(`/api/stations/nearest?lat=${latitude}&lon=${longitude}`);
            if (res.ok) {
              const data = await res.json();
              st = data.nearest_station;
            }
          } catch (e) {}

          if (!st) {
            if (!this.allStations || this.allStations.length === 0) {
              await this.loadStationsList();
            }
            st = this.findNearestStationLocal(latitude, longitude);
          }

          if (st) {
            this.showToast(`Estação mais próxima: ${st.code} - ${st.name}/${st.state} (${st.distance_km} km)`, "success", 4500);
            await this.selectStation(st.code, true);
          } else {
            this.showToast("Nenhuma estação encontrada próxima da sua localização.", "warn");
          }
        } catch (err) {
          console.error("GPS nearest error:", err);
          this.showToast("Erro ao localizar estação próxima.", "error");
        } finally {
          if (btn) btn.classList.remove("spinning");
        }
      },
      (err) => {
        console.warn("Geolocation error:", err);
        this.showToast("Permissão de localização negada ou sinal GPS indisponível.", "warn");
        if (btn) btn.classList.remove("spinning");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  // ==========================================================================
  // Event Listeners & Keyboard Shortcuts
  // ==========================================================================
  setupEventListeners() {
    document.getElementById("btnGpsNearest")?.addEventListener("click", () => this.detectGpsLocation());

    document.getElementById("btnManualRefresh")?.addEventListener("click", async () => {
      this.showToast(`Atualizando estação ${this.currentStationCode} e satélite GOES-19...`, "info", 2200);
      await this.selectStation(this.currentStationCode, true);
    });

    // Favorites & Share Link Buttons
    document.getElementById("btnFavoriteStation")?.addEventListener("click", () => this.toggleFavoriteStation());
    document.getElementById("btnShareStation")?.addEventListener("click", () => this.shareCurrentStation());

    // Dismiss Weather Alert Banner
    document.getElementById("btnDismissAlert")?.addEventListener("click", () => {
      const banner = document.getElementById("weatherAlertBanner");
      if (banner) {
        this.alertDismissedKey = banner.dataset.alertKey || "dismissed";
        banner.style.display = "none";
      }
    });

    // Quick Station Chips
    document.querySelectorAll("#quickChipsContainer .chip").forEach((chip) => {
      chip.addEventListener("click", async () => {
        await this.selectStation(chip.dataset.code, true);
      });
    });

    // Analytics Hub Tabs (Gráficos vs Tabela)
    const tabCharts = document.getElementById("tabViewChartsBtn");
    const tabTable = document.getElementById("tabViewTableBtn");
    const chartsWrapper = document.getElementById("analyticsChartsContainer");
    const tableWrapper = document.getElementById("analyticsTableContainer");

    if (tabCharts && tabTable) {
      tabCharts.addEventListener("click", () => {
        tabCharts.classList.add("active");
        tabTable.classList.remove("active");
        if (chartsWrapper) chartsWrapper.style.display = "block";
        if (tableWrapper) tableWrapper.style.display = "none";
        setTimeout(() => Object.values(this.charts).forEach((c) => c && c.resize()), 50);
      });
      tabTable.addEventListener("click", () => {
        tabTable.classList.add("active");
        tabCharts.classList.remove("active");
        if (chartsWrapper) chartsWrapper.style.display = "none";
        if (tableWrapper) tableWrapper.style.display = "block";
      });
    }

    // Chart Category Filter Buttons
    document.querySelectorAll(".chart-cat-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".chart-cat-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.filterChartPanels(btn.dataset.chart);
      });
    });

    // GOES Player Controls
    document.getElementById("btnPlayPause")?.addEventListener("click", () => this.togglePlayPause());
    document.getElementById("btnPrevFrame")?.addEventListener("click", () => this.stepFrame(-1));
    document.getElementById("btnNextFrame")?.addEventListener("click", () => this.stepFrame(1));
    document.getElementById("btnFullscreenGoes")?.addEventListener("click", () => this.toggleGoesFullscreen());

    document.getElementById("btnLoopToggle")?.addEventListener("click", (e) => {
      this.goesConfig.loop = !this.goesConfig.loop;
      e.currentTarget.classList.toggle("active", this.goesConfig.loop);
    });

    const slider = document.getElementById("timelineSlider");
    slider?.addEventListener("input", (e) => {
      this.pauseGoesAnimation();
      this.goesConfig.currentFrameIndex = Number(e.target.value);
      this.renderCurrentGoesFrame();
    });

    document.querySelectorAll(".speed-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".speed-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.goesConfig.playbackMultiplier = parseFloat(btn.dataset.speed);
        if (this.goesConfig.isPlaying) this.startGoesAnimation();
      });
    });

    this.setupCanvasPanAndZoom();

    document.getElementById("btnPlayerZoomIn")?.addEventListener("click", () => {
      this.setPlayerZoom((this.goesConfig.playerZoom || 1.0) * 1.3);
    });
    document.getElementById("btnPlayerZoomOut")?.addEventListener("click", () => {
      this.setPlayerZoom((this.goesConfig.playerZoom || 1.0) / 1.3);
    });
    document.getElementById("btnPlayerZoomReset")?.addEventListener("click", () => {
      this.goesConfig.playerZoom = 1.0;
      this.goesConfig.panOffsetX = 0;
      this.goesConfig.panOffsetY = 0;
      this.applyGoesZoom(true);
    });

    // Degradable Resolution Selector
    document.querySelectorAll("#resSelector .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#resSelector .seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.goesConfig.resolution = btn.dataset.res;
        this.loadGoesFrames();
      });
    });

    // Area / Territorial Scale Selector
    document.querySelectorAll("#areaSelector .seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#areaSelector .seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.goesConfig.delta = parseFloat(btn.dataset.delta);
        this.goesConfig.panOffsetX = 0;
        this.goesConfig.panOffsetY = 0;
        this.goesConfig.playerZoom = 1.0;

        let resChanged = false;
        if (this.goesConfig.delta <= 5.0 && (this.goesConfig.resolution === "low" || this.goesConfig.resolution === "medium")) {
          this.goesConfig.resolution = "high";
          resChanged = true;
          const highBtn = document.querySelector('#resSelector .seg-btn[data-res="high"]');
          if (highBtn) {
            document.querySelectorAll("#resSelector .seg-btn").forEach((b) => b.classList.remove("active"));
            highBtn.classList.add("active");
          }
        }

        this.applyGoesZoom(true);
        if (this.goesConfig.isDirectNoaa && !resChanged && this.goesConfig.frames.length > 0) {
          this.updateGoesVectorLayers();
        } else {
          this.loadGoesFrames();
        }
      });
    });

    // Satellite Product Selector
    document.querySelectorAll(".prod-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".prod-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.goesConfig.product = btn.dataset.prod;
        this.loadGoesFrames();
      });
    });

    // Vector Layer Toggles (Instant SVG toggle in Direct NOAA mode, reload in backend tile mode)
    const wireLayerToggle = (id, prop) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.checked = this.goesConfig[prop];
      el.addEventListener("change", (e) => {
        this.goesConfig[prop] = e.target.checked;
        if (this.goesConfig.isDirectNoaa) {
          this.updateGoesVectorLayers();
        } else {
          this.loadGoesFrames();
        }
      });
    };
    wireLayerToggle("toggleBordersCheck", "showBorders");
    wireLayerToggle("toggleCitiesCheck", "showCities");
    wireLayerToggle("toggleUrbanCheck", "showUrban");

    const toggleLegend = document.getElementById("toggleLegendCheck");
    if (toggleLegend) {
      toggleLegend.checked = this.goesConfig.showLegend;
      toggleLegend.addEventListener("change", (e) => {
        this.goesConfig.showLegend = e.target.checked;
        this.renderCurrentGoesFrame();
      });
    }

    document.getElementById("btnCloseLegend")?.addEventListener("click", () => {
      this.goesConfig.showLegend = false;
      if (toggleLegend) toggleLegend.checked = false;
      document.getElementById("cptecLegendBox")?.classList.add("hidden");
    });

    // Frames Count Slider
    const framesSlider = document.getElementById("framesCountSlider");
    const framesDisplay = document.getElementById("framesCountDisplay");
    if (framesSlider && framesDisplay) {
      framesSlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        this.goesConfig.numFrames = val;
        const hoursEst = (val * 10) / 60;
        framesDisplay.textContent = `${val} quadros (~${hoursEst.toFixed(1)} horas)`;
      });
      framesSlider.addEventListener("change", () => this.loadGoesFrames());
    }

    // Export GIF & Capture PNG HD
    document.getElementById("btnGenerateDownloadGif")?.addEventListener("click", () => this.generateAndDownloadGif());
    document.getElementById("btnSnapshotPng")?.addEventListener("click", () => this.captureSnapshotPng());

    // Forecast Tabs (Hourly vs 7-Day)
    const hourlyTab = document.getElementById("tabHourlyBtn");
    const dailyTab = document.getElementById("tabDailyBtn");
    const hourlyWrapper = document.getElementById("hourlyViewWrapper");
    const dailyCont = document.getElementById("dailyForecastContainer");

    if (hourlyTab && dailyTab) {
      hourlyTab.addEventListener("click", () => {
        hourlyTab.classList.add("active");
        dailyTab.classList.remove("active");
        if (hourlyWrapper) hourlyWrapper.style.display = "flex";
        if (dailyCont) dailyCont.style.display = "none";
      });
      dailyTab.addEventListener("click", () => {
        dailyTab.classList.add("active");
        hourlyTab.classList.remove("active");
        if (hourlyWrapper) hourlyWrapper.style.display = "none";
        if (dailyCont) dailyCont.style.display = "flex";
      });
    }

    // Source Selector Toggle (Open-Meteo vs INMET Solo)
    document.getElementById("btnSourceOpenMeteo")?.addEventListener("click", () => this.setDataSource("openmeteo"));
    document.getElementById("btnSourceInmet")?.addEventListener("click", () => this.setDataSource("inmet"));

    // CSV Export
    document.getElementById("btnExportCsv")?.addEventListener("click", () => this.exportCsv());

    // Global Keyboard Shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        this.togglePlayPause();
      } else if (e.code === "ArrowLeft") {
        this.stepFrame(-1);
      } else if (e.code === "ArrowRight") {
        this.stepFrame(1);
      } else if (e.key === "f" || e.key === "F") {
        this.toggleGoesFullscreen();
      }
    });
  }

  // ==========================================================================
  // CSV Export (Supports all 672 INMET Stations via activeHistory24h)
  // ==========================================================================
  exportCsv() {
    const records = this.activeHistory24h && this.activeHistory24h.length > 0
      ? this.activeHistory24h
      : (this.inmetData?.history || []);

    if (!records || records.length === 0) {
      this.showToast("Nenhum dado das últimas 24h disponível para exportar.", "warn");
      return;
    }

    const headers = [
      "Estacao", "UF", "Fonte", "Data_BRT", "Hora_BRT", "Data_UTC", "Hora_UTC",
      "Temp_Inst_C", "Temp_Max_C", "Temp_Min_C", "Sensacao_C", "Ponto_Orvalho_C",
      "Umidade_Perc", "Pressao_hPa", "VPD_kPa", "Radiacao_kJm2",
      "Vento_Vel_ms", "Vento_Dir_deg", "Ponto_Cardeal", "Vento_Rajada_ms", "Chuva_mm"
    ];

    const rows = records.map((r) => {
      const vpdVal = r.vpd !== null && r.vpd !== undefined ? r.vpd : this.computeTetensVpd(r.temp_ins, r.humidity_ins);
      return [
        this.currentStationCode,
        this.currentState || "",
        r.source === "openmeteo" ? "Open-Meteo" : "INMET_Solo",
        r.date_brt || r.date || "",
        r.hour_brt || r.hour_local || "",
        r.date_utc || "",
        r.hour_utc || "",
        r.temp_ins ?? "",
        r.temp_max ?? "",
        r.temp_min ?? "",
        r.thermal_sensation ?? "",
        r.dew_point ?? "",
        r.humidity_ins ?? "",
        r.pressure_ins ?? "",
        vpdVal ?? "",
        r.solar_radiation ?? "",
        r.wind_speed ?? "",
        r.wind_dir ?? "",
        this.getCardinalDirection(r.wind_dir),
        r.wind_gust ?? "",
        r.rain ?? 0
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((row) => row.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MyWeatherNow_${this.currentStationCode}_24h_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast(`Planilha CSV (${rows.length} registros horários) exportada! 📊`, "success");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.app = new MeteoApp();
});
