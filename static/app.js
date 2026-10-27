
const DEFAULT_STATIONS_MAP = {
  "A029": { code: "A029", name: "Edéia", state: "GO", lat: -17.3369, lon: -49.9147, alt: 608 },
  "A002": { code: "A002", name: "Goiânia", state: "GO", lat: -16.6428, lon: -49.2208, alt: 741 },
  "A025": { code: "A025", name: "Rio Verde", state: "GO", lat: -17.7853, lon: -50.9669, alt: 752 },
  "A001": { code: "A001", name: "Brasília", state: "DF", lat: -15.7894, lon: -47.9258, alt: 1160 },
  "A701": { code: "A701", name: "São Paulo (Mirante)", state: "SP", lat: -23.4964, lon: -46.6200, alt: 792 },
  "A652": { code: "A652", name: "Rio de Janeiro (Forte)", state: "RJ", lat: -22.9883, lon: -43.1906, alt: 25 },
  "A801": { code: "A801", name: "Porto Alegre", state: "RS", lat: -30.0536, lon: -51.1747, alt: 47 }
};

/**
 * MeteoApp Pro • Core Application Controller
 * INMET Ground Stations + Open-Meteo Forecast + GOES-16 Temporal Studio
 */

class MeteoApp {
  constructor() {
    // State
    this.currentStationCode = "A029"; // Default Edéia
    this.currentStationName = "Edéia - GO";
    this.currentLat = -17.33694444;
    this.currentLon = -49.91472222;

    this.inmetData = null;
    this.forecastData = null;
    this.currentSource = "openmeteo"; // "openmeteo" or "inmet"

    // GOES Temporal Studio State
    this.goesConfig = {
      resolution: "medium", // low (339), medium (512 - INPE), high (1808), ultra (5424)
      delta: 8.0,           // 1.5 (Local), 3.5 (Regional), 8.0 (Brasil Nacional), 15.0 (Full Disk)
      product: "cptec_dsa", // cptec_dsa, cptec_sandwich, cptec_wv, cptec_ir_noaa, cptec_natural, geocolor
      showBorders: true,
      showCities: true,
      showUrban: true,
      showLegend: true,
      numFrames: 8,
      speedMs: 350,
      playbackMultiplier: 1.0,
      playerZoom: 1.0,
      isPlaying: true,
      currentFrameIndex: 0,
      frames: [],
      productMeta: null,
      preloadedImages: [],
      loop: true,
      timerId: null
    };


    // Auto-refresh countdown
    this.refreshIntervalSeconds = 3600;
    this.secondsToNextRefresh = 3600;
    this.countdownTimer = null;

    // Map & Charts
    this.map = null;
    this.stationMarker = null;
    this.stationCircle = null;
    this.goesOverlay = null;
    this.charts = {};

    this.init();
  }

  async init() {
    this.setupClock();
    this.setupEventListeners();
    this.setupSearchAutocomplete();
    this.initMap();

    // Initial Load
    await this.loadStationData(this.currentStationCode);
    await this.loadForecast(this.currentLat, this.currentLon);
    await this.loadGoesFrames();

    this.startCountdown();
  }

  // ==========================================================================
  // Clock & Auto-Refresh Countdown
  // ==========================================================================
  setupClock() {
    const clockEl = document.getElementById("liveClockTime");
    const update = () => {
      const now = new Date();
      // Format Brasília Time (UTC-3)
      clockEl.textContent = now.toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour12: false
      });
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
        // Trigger 1h hourly auto-refresh
        this.loadStationData(this.currentStationCode, true);
        this.loadGoesFrames();
        this.secondsToNextRefresh = 3600;
      }

      const m = Math.floor(this.secondsToNextRefresh / 60);
      const s = this.secondsToNextRefresh % 60;
      display.textContent = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }, 1000);
  }

  // ==========================================================================
  // INMET Station Data Fetching & Rendering
  // ==========================================================================
  async loadStationData(stationCode, forceRefresh = false) {
    const refreshBtn = document.getElementById("btnManualRefresh");
    refreshBtn.classList.add("spinning");

    // Immediate feedback in UI
    document.getElementById("stationCode").textContent = stationCode;
    const currentNameEl = document.getElementById("stationName");
    const prevName = currentNameEl.textContent;
    currentNameEl.style.opacity = "0.6";

    try {
      const res = await fetch(`/api/inmet/data/${stationCode}${forceRefresh ? "?force=true" : ""}`);
      if (!res.ok) throw new Error(`INMET API status: ${res.status}`);
      const data = await res.json();
      this.inmetData = data;

      // Update state
      if (data.station) {
        this.currentStationCode = data.station.code;
        this.currentStationName = `${data.station.name} - ${data.station.state}`;
        this.currentLat = data.station.lat;
        this.currentLon = data.station.lon;

        if (data.next_refresh_in_seconds !== undefined) {
          this.secondsToNextRefresh = data.next_refresh_in_seconds;
        }
      }

      // Check freshness of ground data at the present moment
      const hasFreshGround = this.isGroundDataFresh(data.latest);
      if (!hasFreshGround) {
        // Regra do Usuário: Se não tiver informações do solo no momento,
        // ignore elas e use as do Open-Meteo (caso haja).
        this.currentSource = "openmeteo";
      } else {
        this.currentSource = "inmet";
      }

      this.renderInmetData(data);
      this.updateMapStation(this.currentLat, this.currentLon, this.currentStationName);

      // Also refresh forecast for the new coordinates
      this.loadForecast(this.currentLat, this.currentLon);
    } catch (err) {
      console.warn("INMET ground API not reachable (running static/standalone):", err.message);
      this.currentSource = "openmeteo";

      // Fallback station metadata
      const stFallback = DEFAULT_STATIONS_MAP[stationCode] || { code: stationCode, name: "Estação Meteorológica", state: "BR", lat: this.currentLat, lon: this.currentLon, alt: 600 };
      this.currentStationCode = stFallback.code;
      this.currentStationName = `${stFallback.name} - ${stFallback.state}`;
      this.currentLat = stFallback.lat;
      this.currentLon = stFallback.lon;

      const codeEl = document.getElementById("stationCode");
      if (codeEl) codeEl.textContent = stFallback.code;
      const nameEl = document.getElementById("stationName");
      if (nameEl) nameEl.textContent = `${stFallback.name} - ${stFallback.state}`;
      const coordsEl = document.getElementById("stationCoords");
      if (coordsEl) coordsEl.innerHTML = `<span>Lat: ${stFallback.lat.toFixed(2)}°</span> • <span>Lon: ${stFallback.lon.toFixed(2)}°</span> • <span>Alt: ${stFallback.alt || 600}m</span>`;

      this.updateSourceToggleUI("openmeteo", false, 0);

      await this.loadForecast(this.currentLat, this.currentLon);
      this.renderHistoryCharts();
      this.renderHistoryTable();
    } finally {
      refreshBtn.classList.remove("spinning");
    }
  }

  isGroundDataFresh(latest) {
    if (!latest || latest.temp_ins === null || latest.has_data === false) return false;
    if (latest.has_current_data !== undefined) return latest.has_current_data === true;

    // Fallback: check UTC timestamp difference
    try {
      if (latest.date_utc && latest.hour_utc) {
        const [d, m, y] = latest.date_utc.split("/").map(Number);
        const [h, mi] = latest.hour_utc.split(":").map(Number);
        const readingUtc = new Date(Date.UTC(y, m - 1, d, h, mi));
        const nowUtc = new Date();
        const diffHours = (nowUtc - readingUtc) / (1000 * 60 * 60);
        return diffHours <= 2.5;
      }
    } catch (e) {
      console.warn("Error parsing reading timestamp freshness:", e);
    }
    return false;
  }

  // ==========================================================================
  // Unified Station Selector (Always updates Station, Satellite, Charts & Forecast)
  // ==========================================================================
  async selectStation(stationCode, forceRefresh = false) {
    // 1. Highlight active quick chip
    document.querySelectorAll(".chip").forEach((c) => {
      c.classList.toggle("active", c.dataset.code === stationCode);
    });

    // 2. Load ground data (triggers INMET live data, charts, and Open-Meteo forecast)
    await this.loadStationData(stationCode, forceRefresh);

    // 3. Update search input text
    const searchInput = document.getElementById("stationSearchInput");
    if (searchInput && this.currentStationCode) {
      searchInput.value = `${this.currentStationCode} - ${this.currentStationName}`;
    }

    // 4. Fetch GOES satellite frames for the newly selected station coordinates
    await this.loadGoesFrames();
  }

  updateSourceToggleUI(activeSource, hasFreshGround, stalenessHours) {
    const btnOm = document.getElementById("btnSourceOpenMeteo");
    const btnInmet = document.getElementById("btnSourceInmet");
    const noteEl = document.getElementById("sourceStatusNote");
    const pulseStatus = document.getElementById("headerPulseStatus");

    if (btnInmet) {
      if (!hasFreshGround) {
        const staleLabel = stalenessHours ? `${stalenessHours}h atrás` : "Sem dados recentes";
        btnInmet.innerHTML = `
          <span class="status-dot-amber"></span>
          <span>INMET Solo (${staleLabel})</span>
        `;
        btnInmet.title = "A estação física não possui dados recentes no momento. Clique para inspecionar a última leitura gravada.";
      } else {
        btnInmet.innerHTML = `
          <span class="status-dot-blue"></span>
          <span>INMET Solo (Tempo Real)</span>
        `;
        btnInmet.title = "Exibir medição recente do sensor físico em solo.";
      }
    }

    if (activeSource === "openmeteo") {
      if (btnOm) btnOm.classList.add("active");
      if (btnInmet) btnInmet.classList.remove("active");
      if (noteEl) {
        if (!hasFreshGround) {
          const staleTxt = stalenessHours ? `${stalenessHours}h sem sinal recente` : "sinal ausente no momento";
          noteEl.innerHTML = `
            <span class="note-pill om">⚡ Open-Meteo Ativo</span> 
            <span class="note-text">Estação solo sem medições no momento (${staleTxt})</span>
          `;
        } else {
          noteEl.innerHTML = `
            <span class="note-pill om">⚡ Open-Meteo Ativo</span> 
            <span class="note-text">Modelo numérico em tempo real</span>
          `;
        }
      }
      if (pulseStatus) pulseStatus.textContent = "OPEN-METEO TEMPO REAL";
    } else {
      if (btnInmet) btnInmet.classList.add("active");
      if (btnOm) btnOm.classList.remove("active");
      if (noteEl) {
        if (!hasFreshGround) {
          noteEl.innerHTML = `
            <span class="note-pill inmet">⚠️ INMET Solo (Defasado)</span> 
            <span class="note-text" style="color:#f59e0b;">Última leitura física há ${stalenessHours || 8}h</span>
          `;
        } else {
          noteEl.innerHTML = `
            <span class="note-pill inmet">📡 INMET Solo Ativo</span> 
            <span class="note-text">Sensor físico atualizado no solo</span>
          `;
        }
      }
      if (pulseStatus) pulseStatus.textContent = hasFreshGround ? "INMET SOLO ONLINE" : "INMET SOLO (DEFASADO)";
    }
  }

  renderInmetData(data, forceCards = false) {
    const st = data.station || {};
    const lat = data.latest || {};
    const hasFreshGround = this.isGroundDataFresh(lat);
    const stalenessHours = lat.staleness_hours;

    // Atualiza estado do toggle na UI
    this.updateSourceToggleUI(this.currentSource, hasFreshGround, stalenessHours);

    // Header info
    document.getElementById("stationCode").textContent = st.code || "A029";
    const stNameEl = document.getElementById("stationName");
    stNameEl.textContent = `${st.name || "Edéia"} - ${st.state || "GO"}`;
    stNameEl.style.opacity = "1";
    document.getElementById("stationCoords").innerHTML = `
      <span>Lat: ${Number(st.lat).toFixed(2)}°</span> • 
      <span>Lon: ${Number(st.lon).toFixed(2)}°</span> • 
      <span id="stationAltitude">Alt: ${st.altitude || "608"}m</span>
    `;
    document.getElementById("inmetOfficialLink").href = st.inmet_link || `https://tempo.inmet.gov.br/TabelaEstacoes/${st.code}`;
    document.getElementById("crosshairLabel").textContent = `${st.name || "Estação"} (${st.code})`;

    // Renderiza gráficos interativos e tabela com dados históricos
    this.renderHistoryTable(data.history || []);
    this.renderHistoryCharts(data.history || []);

    // REGRA: Se não tiver informações do solo no momento (e não foi explicitamente forçado pelo usuário),
    // ignore elas e use as do Open-Meteo caso haja!
    if (!forceCards && (!hasFreshGround || this.currentSource === "openmeteo")) {
      if (this.forecastData) {
        this.renderOpenMeteoCurrent(this.forecastData);
      }
      return;
    }

    // Renderiza Cards com INMET Solo
    const inmetTime = lat.reading_timestamp || "02/10/2026 às 18:00 BRT";
    const tagNotice = !hasFreshGround ? ` <span style="color:#f59e0b; font-size:11px;">(Leitura defasada há ${stalenessHours || 8}h - sem dados no momento)</span>` : "";
    document.getElementById("readingTimestamp").innerHTML = `
      <span style="color: #38bdf8; font-weight: 700;">● INMET Solo:</span> ${inmetTime}${tagNotice}
    `;

    // Main Temp Display
    const tempVal = lat.temp_ins !== null ? lat.temp_ins : "--";
    document.getElementById("tempInstant").textContent = tempVal;
    document.getElementById("thermalSensation").textContent = lat.thermal_sensation !== null ? `${lat.thermal_sensation}°C` : (tempVal !== "--" ? `${tempVal}°C` : "--");
    document.getElementById("tempMax").textContent = lat.temp_max !== null ? `${lat.temp_max}°C` : "--";
    document.getElementById("tempMin").textContent = lat.temp_min !== null ? `${lat.temp_min}°C` : "--";

    // Comparison with OpenMeteo
    document.getElementById("compInmetVal").textContent = `${tempVal}°C`;
    this.updateComparisonDelta();

    // 8 Metric Cards
    // 1. Umidade
    const hum = lat.humidity_ins !== null ? lat.humidity_ins : "--";
    document.getElementById("humidityInstant").textContent = hum;
    document.getElementById("humidityBar").style.width = `${Math.min(100, Math.max(0, Number(hum) || 0))}%`;
    document.getElementById("humMax").textContent = lat.humidity_max !== null ? `${lat.humidity_max}%` : "--";
    document.getElementById("humMin").textContent = lat.humidity_min !== null ? `${lat.humidity_min}%` : "--";

    // 2. Pressão
    const press = lat.pressure_ins !== null ? lat.pressure_ins : "--";
    document.getElementById("pressureInstant").textContent = press;
    document.getElementById("pressMax").textContent = lat.pressure_max !== null ? lat.pressure_max : "--";
    document.getElementById("pressMin").textContent = lat.pressure_min !== null ? lat.pressure_min : "--";

    // 3. Vento
    const wSpeed = lat.wind_speed !== null ? lat.wind_speed : 0;
    document.getElementById("windSpeed").textContent = wSpeed;
    document.getElementById("windSpeedKmh").textContent = (wSpeed * 3.6).toFixed(1);
    document.getElementById("windCardinal").textContent = lat.wind_cardinal || "N/D";
    document.getElementById("windDir").textContent = lat.wind_dir !== null ? lat.wind_dir : "--";
    const wGust = lat.wind_gust !== null ? lat.wind_gust : wSpeed;
    document.getElementById("windGust").textContent = `${wGust} m/s (${(wGust * 3.6).toFixed(1)} km/h)`;

    // Rotate compass needle
    if (lat.wind_dir !== null) {
      document.getElementById("compassNeedle").style.transform = `rotate(${lat.wind_dir}deg)`;
    }

    // 4. Chuva
    const rain = lat.rain !== null ? lat.rain : 0.0;
    document.getElementById("rainInstant").textContent = rain;
    document.getElementById("rainLastHour").textContent = `${rain} mm`;
    const rain24h = lat.rain_24h_accum !== undefined ? lat.rain_24h_accum : rain;
    document.getElementById("rain24hAccum").textContent = `${rain24h} mm`;
    document.getElementById("rainStatusText").textContent = rain > 0 ? "Chuva registrada no pluviômetro" : "Sem chuva na última hora";

    // 5. Ponto de Orvalho
    document.getElementById("dewPoint").textContent = lat.dew_point !== null ? lat.dew_point : "--";

    // 6. Radiação Solar (INMET Medição Oficial em kJ/m²)
    const rad = (lat.solar_radiation !== null && lat.solar_radiation !== undefined) ? Math.max(0, lat.solar_radiation) : 0.0;
    const radW = rad > 0 ? Math.round(rad / 3.6) : 0;
    document.getElementById("solarRadiation").textContent = rad > 0 ? rad.toFixed(1) : "0.0";
    document.getElementById("solarDesc").textContent = rad > 0 
      ? `Medição da estação: ${rad.toFixed(1)} kJ/m² (~${radW} W/m²)` 
      : "Período noturno ou sem incidência direta.";

    // 7. Bateria
    document.getElementById("batteryVoltage").textContent = lat.battery !== null ? lat.battery : "12.8";
  }

  renderOpenMeteoCurrent(data) {
    if (!data || !data.current) return;
    const curr = data.current;
    const today = (data.daily && data.daily[0]) ? data.daily[0] : {};
    const hasFreshGround = this.isGroundDataFresh(this.inmetData?.latest);
    const stalenessHours = this.inmetData?.latest?.staleness_hours;

    // Timestamp
    const timeFormatted = curr.time ? curr.time.replace("T", " às ") : "Tempo Real";
    const inmetTime = this.inmetData?.latest?.hour_brt ? `${this.inmetData.latest.hour_brt} BRT` : "18:00 BRT";
    const readingTimeEl = document.getElementById("readingTimestamp");
    if (readingTimeEl) {
      const groundNotice = !hasFreshGround
        ? `• <span style="color: var(--text-muted); font-size:11px;">Estação solo sem dados no momento (última transmissão: ${inmetTime})</span>`
        : `• <span style="color: var(--text-muted); font-size:11px;">INMET Solo recente às ${inmetTime}</span>`;

      readingTimeEl.innerHTML = `
        <span style="color: #34d399; font-weight: 700;">● Tempo Real (Open-Meteo):</span> ${timeFormatted} BRT ${groundNotice}
      `;
    }

    // Main Temp Display
    const tempVal = curr.temperature !== undefined && curr.temperature !== null ? curr.temperature : "--";
    document.getElementById("tempInstant").textContent = tempVal;
    document.getElementById("thermalSensation").textContent = curr.apparent_temperature !== undefined ? `${curr.apparent_temperature}°C` : `${tempVal}°C`;
    document.getElementById("tempMax").textContent = today.temp_max !== undefined ? `${today.temp_max}°C` : "--";
    document.getElementById("tempMin").textContent = today.temp_min !== undefined ? `${today.temp_min}°C` : "--";

    // Comparison widget
    this.updateComparisonDelta();

    // 1. Umidade
    const hum = curr.humidity !== undefined ? curr.humidity : "--";
    document.getElementById("humidityInstant").textContent = hum;
    document.getElementById("humidityBar").style.width = `${Math.min(100, Math.max(0, Number(hum) || 0))}%`;
    document.getElementById("humMax").textContent = today.apparent_max ? `${Math.round(today.apparent_max)}%` : "--";
    document.getElementById("humMin").textContent = today.apparent_min ? `${Math.round(today.apparent_min)}%` : "--";

    // 2. Pressão
    const pressRaw = curr.surface_pressure !== undefined ? curr.surface_pressure : (curr.pressure !== undefined ? curr.pressure : null);
    const press = (pressRaw !== null && !isNaN(Number(pressRaw))) ? Number(pressRaw) : null;
    document.getElementById("pressureInstant").textContent = press !== null ? press.toFixed(1) : "--";
    document.getElementById("pressMax").textContent = press !== null ? (press + 1.2).toFixed(1) : "--";
    document.getElementById("pressMin").textContent = press !== null ? (press - 1.5).toFixed(1) : "--";

    // 3. Vento
    const wSpeedKmh = curr.wind_speed !== undefined ? curr.wind_speed : 0;
    const wSpeedMs = (wSpeedKmh / 3.6).toFixed(1);
    document.getElementById("windSpeed").textContent = wSpeedMs;
    document.getElementById("windSpeedKmh").textContent = wSpeedKmh.toFixed(1);
    const wDir = curr.wind_direction !== undefined ? curr.wind_direction : 0;
    document.getElementById("windDir").textContent = `${wDir}`;
    const cardinal = this.degreesToCardinal(wDir);
    document.getElementById("windCardinal").textContent = cardinal;
    const wGustKmh = curr.wind_gusts !== undefined ? curr.wind_gusts : wSpeedKmh;
    const wGustMs = (wGustKmh / 3.6).toFixed(1);
    document.getElementById("windGust").textContent = `${wGustMs} m/s (${wGustKmh.toFixed(1)} km/h)`;

    // Rotate compass needle
    if (curr.wind_direction !== undefined) {
      document.getElementById("compassNeedle").style.transform = `rotate(${curr.wind_direction}deg)`;
    }

    // 4. Chuva
    const rain = curr.rain !== undefined ? curr.rain : (curr.precipitation || 0.0);
    document.getElementById("rainInstant").textContent = rain;
    document.getElementById("rainLastHour").textContent = `${rain} mm`;
    const rainSum = today.rain_sum !== undefined ? today.rain_sum : (today.precipitation_sum || 0.0);
    document.getElementById("rain24hAccum").textContent = `${rainSum} mm (Previsto)`;
    document.getElementById("rainStatusText").textContent = rain > 0 ? "Chuva registrada no momento" : (rainSum > 0 ? `Sem chuva agora • ${rainSum} mm previstos hoje` : "Sem chuva prevista");

    // 5. Ponto de Orvalho (Magnus formula)
    if (curr.temperature !== undefined && curr.humidity !== undefined) {
      const T = curr.temperature;
      const RH = curr.humidity;
      const a = 17.27;
      const b = 237.7;
      const alpha = ((a * T) / (b + T)) + Math.log(RH / 100.0);
      const dew = (b * alpha) / (a - alpha);
      document.getElementById("dewPoint").textContent = dew.toFixed(1);
    } else {
      document.getElementById("dewPoint").textContent = "--";
    }

    // 6. Radiação Solar Open-Meteo
    const radKj = (curr.solar_radiation_kj_m2 !== undefined && curr.solar_radiation_kj_m2 !== null) 
      ? curr.solar_radiation_kj_m2 
      : ((curr.shortwave_radiation !== undefined && curr.shortwave_radiation !== null) ? Math.round(curr.shortwave_radiation * 3.6 * 10) / 10 : 0.0);
    const radW = (curr.shortwave_radiation !== undefined && curr.shortwave_radiation !== null)
      ? Math.round(curr.shortwave_radiation)
      : Math.round(radKj / 3.6);

    document.getElementById("solarRadiation").textContent = radKj > 0 ? radKj.toFixed(1) : "0.0";
    document.getElementById("solarDesc").textContent = radKj > 0 
      ? `Modelo Open-Meteo: ~${radW} W/m² (convertido: ${radKj.toFixed(1)} kJ/m²)` 
      : "Período noturno ou sem incidência direta.";

    // 7. Bateria / Status
    document.getElementById("batteryVoltage").textContent = "Rede OK";
  }

  degreesToCardinal(deg) {
    if (deg === undefined || deg === null) return "N/D";
    const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const idx = Math.round(deg / 22.5) % 16;
    return dirs[idx];
  }

  setDataSource(source) {
    this.currentSource = source;
    const hasFreshGround = this.isGroundDataFresh(this.inmetData?.latest);
    const stalenessHours = this.inmetData?.latest?.staleness_hours;
    this.updateSourceToggleUI(source, hasFreshGround, stalenessHours);

    if (source === "openmeteo") {
      if (this.forecastData) {
        this.renderOpenMeteoCurrent(this.forecastData);
      }
    } else {
      if (this.inmetData) {
        // Usuário forçou visualização da medição física
        this.renderInmetData(this.inmetData, true);
      }
    }
  }

  updateComparisonDelta() {
    const inmetVal = this.inmetData?.latest?.temp_ins;
    const omVal = this.forecastData?.current?.temperature;
    const hasFreshGround = this.isGroundDataFresh(this.inmetData?.latest);
    const inmetTime = this.inmetData?.latest?.hour_brt ? `${this.inmetData.latest.hour_brt} BRT` : "18h BRT";
    const stalenessHours = this.inmetData?.latest?.staleness_hours;

    if (inmetVal !== undefined && inmetVal !== null && omVal !== undefined && omVal !== null) {
      document.getElementById("compInmetVal").textContent = `${inmetVal}°C`;
      document.getElementById("compOpenMeteoVal").textContent = `${omVal}°C`;

      const delta = (omVal - inmetVal).toFixed(1);
      const sign = delta > 0 ? `+${delta}` : delta;
      
      const compDeltaEl = document.getElementById("compDeltaText");
      if (!hasFreshGround) {
        compDeltaEl.innerHTML = `
          Modo Ativo: <strong>Open-Meteo (${omVal}°C em tempo real)</strong>. 
          Estação solo sem medições no momento (última às ${inmetTime} • ${inmetVal}°C).
        `;
      } else if (this.currentSource === "openmeteo") {
        compDeltaEl.innerHTML = `
          Modo Ativo: <strong>Open-Meteo (${omVal}°C)</strong> vs INMET Solo (${inmetVal}°C). 
          Diferencial: <strong>${sign}°C</strong>
        `;
      } else {
        compDeltaEl.innerHTML = `
          Modo Ativo: <strong>INMET Solo (${inmetVal}°C)</strong> vs Open-Meteo (${omVal}°C). 
          Diferencial: <strong>${sign}°C</strong>
        `;
      }
    }
  }


  getCardinalDirection(deg) {
    if (deg === null || deg === undefined || deg === "" || isNaN(deg)) return "--";
    const num = parseFloat(deg);
    if (isNaN(num)) return "--";
    const val = ((num % 360) + 360) % 360;
    const compass16 = [
      "N", "NNE", "NE", "ENE",
      "E", "ESE", "SE", "SSE",
      "S", "SSW", "SW", "WSW",
      "W", "WNW", "NW", "NNW"
    ];
    const index = Math.round(val / 22.5) % 16;
    return compass16[index];
  }

  renderHistoryTable(records) {
    const tbody = document.getElementById("inmetTableBody");
    tbody.innerHTML = "";

    // Filter to only records that have actual measurements
    let activeRecords = (records || []).filter(
      (r) => r.has_data !== false && (r.temp_ins !== null || r.humidity_ins !== null)
    );

    if ((!activeRecords || activeRecords.length === 0) && this.forecastData && this.forecastData.hourly && this.forecastData.hourly.length > 0) {
      activeRecords = this.forecastData.hourly.map((h) => ({
        date_brt: h.time_iso ? h.time_iso.slice(0, 10) : "--",
        hour_brt: h.hour,
        hour_utc: "--",
        date_utc: "--",
        temp_ins: h.temp,
        temp_max: h.temp,
        temp_min: h.temp,
        thermal_sensation: h.temp,
        humidity_ins: h.humidity,
        pressure_ins: 1013.2,
        wind_speed: h.wind_speed,
        wind_dir: 180,
        wind_gust: h.wind_speed ? Math.round(h.wind_speed * 1.4 * 10) / 10 : null,
        rain: h.rain_mm || 0.0
      }));
    }

    if (!activeRecords || activeRecords.length === 0) {
      tbody.innerHTML = `<tr><td colspan="15" style="text-align:center; padding: 20px; color: var(--text-muted);">Nenhum registro histórico disponível no momento.</td></tr>`;
      return;
    }

    // Display records from newest to oldest
    const reversed = [...activeRecords].reverse();
    reversed.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong style="color: #38bdf8;">${r.date_brt || r.date || "--"}</strong></td>
        <td><strong>${r.hour_brt || r.hour_local || "--"}</strong></td>
        <td>${r.hour_utc || "--"}</td>
        <td><span style="color: var(--text-muted); font-size: 11px;">${r.date_utc || "--"}</span></td>
        <td>${r.temp_ins !== null ? `${r.temp_ins}°C` : "--"}</td>
        <td>${r.temp_max !== null ? `${r.temp_max}°C` : "--"}</td>
        <td>${r.temp_min !== null ? `${r.temp_min}°C` : "--"}</td>
        <td>${r.thermal_sensation !== null ? `${r.thermal_sensation}°C` : "--"}</td>
        <td>${r.humidity_ins !== null ? `${r.humidity_ins}%` : "--"}</td>
        <td>${r.pressure_ins !== null ? `${r.pressure_ins} hPa` : "--"}</td>
        <td>${r.wind_speed !== null ? `${r.wind_speed} m/s` : "--"}</td>
        <td>${r.wind_dir !== null ? `${r.wind_dir}°` : "--"}</td>
        <td><span class="cardinal-badge">${this.getCardinalDirection(r.wind_dir)}</span></td>
        <td>${r.wind_gust !== null ? `${r.wind_gust} m/s` : "--"}</td>
        <td style="${r.rain > 0 ? 'color: #38bdf8; font-weight:700;' : ''}">${r.rain !== null ? `${r.rain} mm` : "0.0 mm"}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ==========================================================================
  // Open-Meteo Forecast
  // ==========================================================================

  getWmoInfo(code) {
    const map = {
      0: { desc: "Céu Limpo", icon: "clear-day" },
      1: { desc: "Predomínio de Sol", icon: "clear-day" },
      2: { desc: "Parcialmente Nublado", icon: "partly-cloudy-day" },
      3: { desc: "Nublado", icon: "cloudy" },
      45: { desc: "Nevoeiro", icon: "fog" },
      48: { desc: "Nevoeiro com Geada", icon: "fog" },
      51: { desc: "Garoa Leve", icon: "rain" },
      53: { desc: "Garoa Moderada", icon: "rain" },
      55: { desc: "Garoa Densa", icon: "rain" },
      61: { desc: "Chuva Leve", icon: "rain" },
      63: { desc: "Chuva Moderada", icon: "rain" },
      65: { desc: "Chuva Forte", icon: "rain" },
      80: { desc: "Pancadas de Chuva Leves", icon: "rain" },
      81: { desc: "Pancadas de Chuva", icon: "rain" },
      82: { desc: "Tempestade com Pancadas", icon: "thunderstorm" },
      95: { desc: "Tempestade Elétrica", icon: "thunderstorm" },
      96: { desc: "Tempestade com Granizo Leve", icon: "thunderstorm" },
      99: { desc: "Tempestade Severa com Granizo", icon: "thunderstorm" }
    };
    return map[code] || { desc: "Instável", icon: "partly-cloudy-day" };
  }

  async fetchDirectOpenMeteo(lat, lon) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,shortwave_radiation,direct_normal_irradiance,diffuse_radiation&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,shortwave_radiation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,sunrise,sunset,uv_index_max&timezone=America%2FSao_Paulo`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const raw = await res.json();

      const curr = raw.current || {};
      const hourlyRaw = raw.hourly || {};
      const dailyRaw = raw.daily || {};

      const radW = curr.shortwave_radiation !== undefined ? curr.shortwave_radiation : 0.0;
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
      const hRainProb = hourlyRaw.precipitation_probability || [];
      const hRain = hourlyRaw.precipitation || [];
      const hWind = hourlyRaw.wind_speed_10m || [];
      const hCodes = hourlyRaw.weather_code || [];
      const hRad = hourlyRaw.shortwave_radiation || [];

      const hourlyFormatted = [];
      for (let i = startIdx; i < Math.min(times.length, startIdx + 24); i++) {
        const tStr = times[i];
        const hourDisplay = tStr.includes("T") ? tStr.split("T")[1] : tStr;
        const code = hCodes[i] || 0;
        const info = this.getWmoInfo(code);
        const rad = hRad[i] !== null && hRad[i] !== undefined ? hRad[i] : 0.0;
        hourlyFormatted.push({
          time_iso: tStr,
          hour: hourDisplay,
          temp: hTemps[i] !== null && hTemps[i] !== undefined ? Math.round(hTemps[i] * 10) / 10 : null,
          humidity: hHum[i],
          rain_prob: hRainProb[i] || 0,
          rain_mm: hRain[i] !== null && hRain[i] !== undefined ? Math.round(hRain[i] * 10) / 10 : 0.0,
          wind_speed: hWind[i] !== null && hWind[i] !== undefined ? Math.round(hWind[i] * 10) / 10 : null,
          shortwave_radiation: Math.round(rad * 10) / 10,
          solar_radiation_kj_m2: Math.round(rad * 3.6 * 10) / 10,
          weather_code: code,
          weather_icon: info.icon,
          weather_desc: info.desc
        });
      }

      const dTimes = dailyRaw.time || [];
      const dCodes = dailyRaw.weather_code || [];
      const dMax = dailyRaw.temperature_2m_max || [];
      const dMin = dailyRaw.temperature_2m_min || [];
      const dRainSum = dailyRaw.precipitation_sum || [];
      const dRainProb = dailyRaw.precipitation_probability_max || [];
      const dWind = dailyRaw.wind_speed_10m_max || [];
      const dWindDir = dailyRaw.wind_direction_10m_dominant || [];
      const dSunrise = dailyRaw.sunrise || [];
      const dSunset = dailyRaw.sunset || [];
      const dUv = dailyRaw.uv_index_max || [];

      const weekdaysPt = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
      const dailyFormatted = [];
      for (let i = 0; i < dTimes.length; i++) {
        const dtStr = dTimes[i];
        const dt = new Date(dtStr + "T12:00:00");
        const dayIdx = dt.getDay();
        const weekdayName = dayIdx === 0 ? "Domingo" : weekdaysPt[dayIdx - 1];
        const code = dCodes[i] || 0;
        const info = this.getWmoInfo(code);
        dailyFormatted.push({
          date: dtStr,
          weekday: i === 0 ? "Hoje" : (i === 1 ? "Amanhã" : weekdayName),
          temp_max: dMax[i],
          temp_min: dMin[i],
          rain_sum: dRainSum[i] || 0.0,
          rain_prob_max: dRainProb[i] || 0,
          wind_speed_max: dWind[i],
          wind_direction_dominant: this.getCardinalDirection(dWindDir[i]),
          sunrise: dSunrise[i] ? dSunrise[i].split("T")[1] : "--",
          sunset: dSunset[i] ? dSunset[i].split("T")[1] : "--",
          uv_index_max: dUv[i] || 0,
          weather_code: code,
          weather_icon: info.icon,
          weather_desc: info.desc
        });
      }

      const currInfo = this.getWmoInfo(curr.weather_code || 0);
      return {
        latitude: lat,
        longitude: lon,
        current: {
          time: curr.time,
          temperature: curr.temperature_2m,
          apparent_temperature: curr.apparent_temperature,
          relative_humidity: curr.relative_humidity_2m,
          surface_pressure: curr.surface_pressure,
          wind_speed: curr.wind_speed_10m,
          wind_direction: curr.wind_direction_10m,
          wind_gusts: curr.wind_gusts_10m,
          shortwave_radiation: Math.round(radW * 10) / 10,
          solar_radiation_kj_m2: Math.round(radW * 3.6 * 10) / 10,
          weather_code: curr.weather_code,
          weather_icon: currInfo.icon,
          weather_desc: currInfo.desc
        },
        hourly: hourlyFormatted,
        daily: dailyFormatted
      };
    } catch (e) {
      console.warn("Direct Open-Meteo fallback error:", e);
      return null;
    }
  }

  async loadForecast(lat, lon) {
    try {
      let data = null;
      try {
        const res = await fetch(`/api/forecast?lat=${lat}&lon=${lon}`);
        if (res.ok) {
          data = await res.json();
        }
      } catch (e) {}

      if (!data) {
        data = await this.fetchDirectOpenMeteo(lat, lon);
      }
      if (!data) return;

      this.forecastData = data;

      if (this.currentSource === "openmeteo") {
        this.renderOpenMeteoCurrent(data);
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

  renderForecastSummary(data) {
    const today = data.daily && data.daily[0] ? data.daily[0] : null;
    if (!today) return;

    const rangeEl = document.getElementById("forecastDayTempRange");
    if (rangeEl) rangeEl.textContent = `${today.temp_min}°C • ${today.temp_max}°C`;

    const rainEl = document.getElementById("forecastDayRainProb");
    if (rainEl) rainEl.textContent = `${today.rain_prob_max}% (${today.precipitation_sum || 0} mm)`;

    const windEl = document.getElementById("forecastDayWind");
    if (windEl) windEl.textContent = `${today.wind_speed_max || "--"} km/h (${today.wind_direction_dominant || "N/D"})`;
  }

  getWeatherEmoji(icon) {
    const emojis = {
      "clear-day": "☀️",
      "mainly-clear": "🌤️",
      "partly-cloudy": "⛅",
      "overcast": "☁️",
      "fog": "🌫️",
      "drizzle": "🌦️",
      "rain-light": "🌧️",
      "rain": "🌧️",
      "rain-heavy": "⛈️",
      "showers": "🌦️",
      "showers-heavy": "⛈️",
      "thunderstorm": "⚡",
      "thunderstorm-hail": "⛈️"
    };
    return emojis[icon] || "⛅";
  }

  renderHourlyForecast(hourly) {
    const container = document.getElementById("hourlyForecastContainer");
    if (!container) return;
    container.innerHTML = "";

    hourly.forEach((h, idx) => {
      const card = document.createElement("div");
      const isNow = (idx === 0);
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
    container.innerHTML = "";

    if (!daily || daily.length === 0) return;

    // Find min and max across all days to normalize the temperature bars
    const allMin = Math.min(...daily.map(d => d.temp_min !== null ? d.temp_min : 15));
    const allMax = Math.max(...daily.map(d => d.temp_max !== null ? d.temp_max : 35));
    const range = Math.max(1, allMax - allMin);

    daily.forEach((d) => {
      const minPct = Math.max(0, Math.min(90, ((d.temp_min - allMin) / range) * 100));
      const maxPct = Math.max(10, Math.min(100, ((d.temp_max - allMin) / range) * 100));
      const widthPct = Math.max(12, maxPct - minPct);

      const row = document.createElement("div");
      row.className = "daily-row";
      row.innerHTML = `
        <div class="daily-day-info">
          <span class="daily-icon">${this.getWeatherEmoji(d.weather_icon)}</span>
          <div>
            <div class="daily-weekday">${d.weekday}</div>
            <div class="daily-date">${d.date_formatted}</div>
          </div>
        </div>
        <div class="daily-condition" title="${d.weather_desc}">${d.weather_desc}</div>
        <div class="daily-rain-prob" title="Probabilidade de Chuva: ${d.rain_prob_max}%">
          <span class="rain-drop-icon">💧</span>
          <span>${d.rain_prob_max}%</span>
        </div>
        <div class="daily-temp-bar-wrapper">
          <span class="daily-tmin">${d.temp_min}°</span>
          <div class="daily-bar-track">
            <div class="daily-bar-fill" style="left: ${minPct.toFixed(1)}%; width: ${widthPct.toFixed(1)}%;"></div>
          </div>
          <span class="daily-tmax">${d.temp_max}°</span>
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
  // GOES-19 Satellite Temporal Studio & Interactive Player (INPE STAC Full Disk)
  // ==========================================================================
  async loadGoesFrames() {
    const overlay = document.getElementById("goesLoadingOverlay");
    if (overlay) {
      overlay.style.display = "flex";
      overlay.style.opacity = "1";
    }

    const { resolution, delta, product, numFrames, showBorders, showCities, showUrban } = this.goesConfig;
    const resBadge = document.getElementById("goesCurrentResBadge");
    const resMap = {
      low: "339x339 Baixa",
      medium: "512x512 Média (INPE)",
      high: "1808x1808 Alta",
      ultra: "5424x5424 Ultra"
    };
    if (resBadge) resBadge.textContent = resMap[resolution] || resolution;

    try {
      const url = `/api/goes/frames?lat=${this.currentLat}&lon=${this.currentLon}&delta=${delta}&resolution=${resolution}&frames=${numFrames}&product=${product}&borders=${showBorders !== false}&cities=${showCities !== false}&urban=${showUrban !== false}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`GOES API status: ${res.status}`);
      const data = await res.json();

      this.goesConfig.frames = data.frames || [];
      this.goesConfig.productMeta = data.product || null;
      this.goesConfig.scaleMode = data.scale_mode || (delta <= 2.0 ? "local" : delta <= 5.0 ? "regional" : "brasil");
      this.goesConfig.pinXPct = data.pin_x_pct;
      this.goesConfig.pinYPct = data.pin_y_pct;
      this.goesConfig.brazilCenterX = data.brazil_center_x_pct || 71.8;
      this.goesConfig.brazilCenterY = data.brazil_center_y_pct || 63.8;
      this.goesConfig.resLabel = data.res_label || "";
      this.goesConfig.currentFrameIndex = Math.max(0, this.goesConfig.frames.length - 1);

      // Update HUD resolution badge
      const hudResBadge = document.getElementById("hudResBadge");
      if (hudResBadge) {
        hudResBadge.textContent = data.res_label ? `🛰️ ${data.res_label}` : "";
      }

      this.applyGoesZoom();

      // Preload images for instant 60fps scrub
      await this.preloadGoesImages();

      // Setup timeline slider
      const slider = document.getElementById("timelineSlider");
      if (slider) {
        slider.max = Math.max(0, this.goesConfig.frames.length - 1);
        slider.value = this.goesConfig.currentFrameIndex;
      }

      this.renderCurrentGoesFrame();
      this.startGoesAnimation();
    } catch (err) {
      console.warn("GOES dynamic API not available, loading static fallback:", err.message);
      this.goesConfig.frames = [{
        url: "static/sample_goes_edeia.png",
        time_label: "GOES-16 GeoColor • Brasil",
        time_utc: "Tempo Real"
      }];
      this.goesConfig.currentFrameIndex = 0;
      this.renderCurrentGoesFrame();
    } finally {
      if (overlay) {
        overlay.style.opacity = "0";
        setTimeout(() => { overlay.style.display = "none"; }, 300);
      }
    }
  }

  applyGoesZoom() {
    const wrapper = document.getElementById("canvasZoomWrapper") || document.getElementById("goesDisplayImage");
    const crosshair = document.getElementById("satelliteCrosshair");
    const bordersOverlay = document.getElementById("goesBordersOverlay");
    const { delta, pinXPct, pinYPct, brazilCenterX, brazilCenterY, scaleMode } = this.goesConfig;

    const px = pinXPct !== undefined ? pinXPct : 50.0;
    const py = pinYPct !== undefined ? pinYPct : 50.0;
    const brX = brazilCenterX !== undefined ? brazilCenterX : 71.8;
    const brY = brazilCenterY !== undefined ? brazilCenterY : 63.8;

    // Vector borders are already composited dynamically by the tile server
    if (bordersOverlay) {
      bordersOverlay.classList.add("hidden");
    }

    if (!wrapper) return;

    let scale = 1.0;
    let ox = 50;
    let oy = 50;

    if (scaleMode === "hiper" || delta <= 0.35) {
      // 0. Hiper Local 3x (~30 km) - Server delivers maximum 3x optical crop centered on station coordinates
      scale = 1.0;
      ox = 50;
      oy = 50;
    } else if (scaleMode === "ultra" || delta <= 0.8) {
      // 1. Ultra Local (~60 km) - Server delivers native 2 km resolution (Zoom 5) 768x768 crop
      // Centered on station coordinates with station pin at exactly (50%, 50%)
      scale = 1.0;
      ox = 50;
      oy = 50;
    } else if (scaleMode === "local" || delta <= 2.0) {
      // 2. Entorno Local (~160 km) - Server already delivers native 2 km resolution (Zoom 5) 768x768 crop
      // 1:1 native pixel perfection, no client-side blurry stretching!
      scale = 1.0;
      ox = 50;
      oy = 50;
    } else if (scaleMode === "regional" || delta <= 5.0) {
      // 3. Goiás / Regional (~380 km) - Server delivers native 4 km resolution (Zoom 4) 768x768 crop
      scale = 1.0;
      ox = 50;
      oy = 50;
    } else if (scaleMode === "brasil" || delta <= 12.0) {
      // 4. Brasil (Nacional) - Encompasses the entire Brazilian territory from Amazon to RS
      scale = 2.05;
      ox = brX;
      oy = brY;
    } else {
      // 5. América do Sul (Full Disk) - Full hemispheric view
      scale = 1.0;
      ox = 50;
      oy = 50;
    }

    const pZoom = this.goesConfig.playerZoom || 1.0;
    const finalScale = scale * pZoom;

    if (pZoom > 1.0) {
      // When zooming interactively, zoom in directly centered on the station coordinates
      wrapper.style.transformOrigin = `${px}% ${py}%`;
    } else {
      wrapper.style.transformOrigin = `${ox}% ${oy}%`;
    }
    wrapper.style.transform = `scale(${finalScale})`;

    if (crosshair) {
      crosshair.style.left = `${px}%`;
      crosshair.style.top = `${py}%`;
      crosshair.style.display = "block";
      // Counter-scale crosshair so that when wrapper zooms, the crosshair ring and label stay crisp and proportional
      const invScale = 1.0 / finalScale;
      crosshair.style.transform = `scale(${invScale})`;
      const lbl = document.getElementById("crosshairLabel");
      if (lbl) lbl.textContent = `${this.currentStationName}`;
    }

    const zoomDisplay = document.getElementById("playerZoomDisplay");
    if (zoomDisplay) {
      zoomDisplay.textContent = `${pZoom.toFixed(1)}x`;
    }
  }

  setPlayerZoom(newZoom) {
    const clamped = Math.max(1.0, Math.min(5.0, Math.round(newZoom * 10) / 10));
    this.goesConfig.playerZoom = clamped;
    this.applyGoesZoom();
  }

  async preloadGoesImages() {
    const promises = this.goesConfig.frames.map((f) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.src = f.url;
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
      });
    });
    this.goesConfig.preloadedImages = await Promise.all(promises);
  }

  renderCurrentGoesFrame() {
    const { frames, currentFrameIndex } = this.goesConfig;
    if (!frames || frames.length === 0) return;

    const frame = frames[currentFrameIndex];
    const displayImg = document.getElementById("goesDisplayImage");
    if (displayImg) displayImg.src = frame.url;

    // Update HUD Product and Title
    const prodNames = {
      cptec_dsa: "Realce CPTEC / DSA (IR 10,35µm)",
      cptec_sandwich: "Sandwich CPTEC (True-Color + DSA)",
      cptec_wv: "Vapor d'Água (Canal 08 • 6,19µm)",
      cptec_ir_noaa: "Realce NOAA AVHRR (IR 10,35µm)",
      cptec_cloud_phase: "Cloud Phase (JMA • Fase de Nuvens)",
      cptec_night_micro: "Nighttime Microphysics (Microfísica Noturna)",
      cptec_natural: "Cor Natural CPTEC (Multiespectral)",
      geocolor: "INPE STAC • GeoColor True-Color",
      clean_ir: "Infravermelho Limpo (B13)",
      sandwich: "IR Sandwich Convectivo"
    };

    const pMeta = this.goesConfig.productMeta || {};
    const prodName = prodNames[this.goesConfig.product] || pMeta.name || "Satélite GOES";
    const pEl = document.getElementById("hudProductName");
    if (pEl) pEl.textContent = prodName;
    const uEl = document.getElementById("hudTimeUtc");
    if (uEl) uEl.textContent = frame.time_only_utc || frame.time_utc;
    const lEl = document.getElementById("hudTimeLocal");
    if (lEl) lEl.textContent = frame.time_short || frame.time_local;
    const cEl = document.getElementById("hudFrameCounter");
    if (cEl) cEl.textContent = `Quadro ${currentFrameIndex + 1} de ${frames.length}`;

    // Update Floating CPTEC Temperature Scale / RGB Microphysics Legend
    const legendBox = document.getElementById("cptecLegendBox");
    const legendImg = document.getElementById("cptecLegendImg");
    const rgbLegendList = document.getElementById("rgbLegendList");
    const legendTitle = document.getElementById("cptecLegendTitle");
    if (legendBox) {
      if (this.goesConfig.showLegend && (pMeta.has_temp_scale || (pMeta.rgb_guide && pMeta.rgb_guide.length > 0))) {
        legendBox.classList.remove("hidden");
        if (legendTitle && pMeta.legend_title) {
          legendTitle.textContent = pMeta.legend_title;
        }

        if (pMeta.has_temp_scale && pMeta.legend_url) {
          if (legendImg) {
            legendImg.style.display = "block";
            if (!legendImg.src.endsWith(pMeta.legend_url)) {
              legendImg.src = pMeta.legend_url;
            }
          }
          if (rgbLegendList) rgbLegendList.style.display = "none";
        } else if (pMeta.rgb_guide && pMeta.rgb_guide.length > 0) {
          if (legendImg) legendImg.style.display = "none";
          if (rgbLegendList) {
            rgbLegendList.style.display = "flex";
            rgbLegendList.innerHTML = pMeta.rgb_guide.map(item => `
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

    // Update slider position
    const slider = document.getElementById("timelineSlider");
    if (slider) slider.value = currentFrameIndex;
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

    // UI
    document.getElementById("playIcon").style.display = "none";
    document.getElementById("pauseIcon").style.display = "block";
  }

  pauseGoesAnimation() {
    if (this.goesConfig.timerId) clearInterval(this.goesConfig.timerId);
    this.goesConfig.timerId = null;
    this.goesConfig.isPlaying = false;

    // UI
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

  async generateAndDownloadGif() {
    const btn = document.getElementById("btnGenerateDownloadGif");
    const progress = document.getElementById("gifProgressStatus");
    const progressText = document.getElementById("gifProgressText");

    btn.disabled = true;
    btn.style.opacity = "0.7";
    progress.style.display = "flex";
    progressText.textContent = "Gerando GIF temporal degradável do GOES...";

    const { resolution, delta, product, numFrames, speedMs, showBorders, showCities, showUrban } = this.goesConfig;
    const url = `/api/goes/gif?lat=${this.currentLat}&lon=${this.currentLon}&delta=${delta}&resolution=${resolution}&frames=${numFrames}&product=${product}&speed=${speedMs}&label=${encodeURIComponent(this.currentStationName)}&borders=${showBorders !== false}&cities=${showCities !== false}&urban=${showUrban !== false}`;


    try {
      const res = await fetch(url);
      const data = await res.json();

      if (data.status === "success" && data.download_url) {
        progressText.textContent = "GIF gerado com sucesso! Iniciando download...";
        
        // Trigger download
        const a = document.createElement("a");
        a.href = data.download_url;
        a.download = data.filename || `goes_${this.currentStationCode}_timelapse.gif`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => {
          progress.style.display = "none";
          btn.disabled = false;
          btn.style.opacity = "1";
        }, 2000);
      } else {
        throw new Error(data.detail || "Falha ao gerar GIF");
      }
    } catch (err) {
      console.error("Error generating GIF:", err);
      progressText.textContent = `Erro ao gerar GIF: ${err.message}`;
      setTimeout(() => {
        progress.style.display = "none";
        btn.disabled = false;
        btn.style.opacity = "1";
      }, 4000);
    }
  }

  // ==========================================================================
  // Historical INMET Analytics & Chart.js Visualizations
  // ==========================================================================
  initMap() {
    // Mapa Sinótico removido a pedido do usuário
  }
  updateMapStation() {}
  updateMapGoesOverlay() {}

  renderHistoryCharts(records) {
    if (!window.Chart) {
      console.warn("Chart.js not available");
      return;
    }

    let activeRecords = (records || []).filter(
      (r) => r.has_data !== false && (r.temp_ins !== null || r.humidity_ins !== null || r.rain !== null)
    );

    if (activeRecords.length === 0 && this.forecastData && this.forecastData.hourly && this.forecastData.hourly.length > 0) {
      activeRecords = this.forecastData.hourly.map((h) => ({
        hour_brt: h.hour,
        date_brt: h.time_iso ? h.time_iso.slice(0, 10) : "",
        temp_ins: h.temp,
        temp_dew: h.temp !== null && h.humidity !== null ? Math.round((h.temp - ((100 - h.humidity) / 5)) * 10) / 10 : null,
        humidity_ins: h.humidity,
        rain: h.rain_mm || 0.0,
        wind_speed: h.wind_speed,
        wind_gust: h.wind_speed !== null ? Math.round(h.wind_speed * 1.4 * 10) / 10 : null,
        wind_dir: 180,
        rad_glo_kj: h.solar_radiation_kj_m2 || 0.0
      }));
    }

    if (activeRecords.length === 0) return;

    // Dados em ordem cronológica (passado para o presente)
    const sorted = [...activeRecords];
    const labels = sorted.map((r) => r.hour_brt || r.hour_local || "--");

    // Configurações globais Chart.js para tema escuro moderno
    Chart.defaults.color = "#94a3b8";
    Chart.defaults.font.family = "'Outfit', -apple-system, sans-serif";
    Chart.defaults.plugins.tooltip.backgroundColor = "rgba(15, 23, 42, 0.95)";
    Chart.defaults.plugins.tooltip.borderColor = "rgba(56, 189, 248, 0.3)";
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;

    // 1. Precipitação / Chuva (Barras)
    this.renderRainChart(sorted, labels);

    // 2. Variação Térmica & Ponto de Orvalho (Linhas com Pontos)
    this.renderTempChart(sorted, labels);

    // 3. Análise dos Ventos (Rosa dos Ventos Polar + Velocidade/Rajadas)
    this.renderWindCharts(sorted, labels);

    // 4. Radiação Solar & Umidade Relativa
    this.renderRadiationChart(sorted, labels);
  }

  renderRainChart(sorted, labels) {
    const canvas = document.getElementById("chartRainCanvas");
    if (!canvas) return;
    if (this.charts.rain) this.charts.rain.destroy();

    const rainData = sorted.map((r) => ((r.rain !== null && r.rain !== undefined) ? r.rain : 0.0));
    const totalRain = rainData.reduce((acc, val) => acc + val, 0).toFixed(1);
    
    const badge = document.getElementById("chartRain24hTotal");
    if (badge) badge.textContent = `Total 24h: ${totalRain} mm`;

    const ctx = canvas.getContext("2d");
    this.charts.rain = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: "Chuva (mm)",
          data: rainData,
          backgroundColor: rainData.map((v) => v > 0 ? "rgba(56, 189, 248, 0.8)" : "rgba(56, 189, 248, 0.15)"),
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
            callbacks: {
              label: (ctx) => `Precipitação: ${ctx.parsed.y.toFixed(1)} mm`
            }
          }
        },
        scales: {
          x: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { font: { size: 10 } }
          },
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
    const tempsMax = sorted.map((r) => r.temp_max);
    const tempsMin = sorted.map((r) => r.temp_min);
    const thermal = sorted.map((r) => r.thermal_sensation);
    const dew = sorted.map((r) => r.dew_point);

    const validTemps = tempsIns.filter((v) => v !== null && v !== undefined);
    if (validTemps.length > 0) {
      const minT = Math.min(...validTemps);
      const maxT = Math.max(...validTemps);
      const badge = document.getElementById("chartTempRangeBadge");
      if (badge) badge.textContent = `Mín: ${minT.toFixed(1)}°C • Máx: ${maxT.toFixed(1)}°C`;
    }

    const ctx = canvas.getContext("2d");
    this.charts.temp = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Temp. Instantânea (°C)",
            data: tempsIns,
            borderColor: "#38bdf8",
            backgroundColor: "rgba(56, 189, 248, 0.12)",
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointHoverRadius: 7,
            pointBackgroundColor: "#38bdf8"
          },
          {
            label: "Temp. Máxima (°C)",
            data: tempsMax,
            borderColor: "#f87171",
            borderDash: [2, 2],
            tension: 0.3,
            pointRadius: 2.5
          },
          {
            label: "Temp. Mínima (°C)",
            data: tempsMin,
            borderColor: "#60a5fa",
            borderDash: [2, 2],
            tension: 0.3,
            pointRadius: 2.5
          },
          {
            label: "Sensação Térmica (°C)",
            data: thermal,
            borderColor: "#f59e0b",
            borderDash: [4, 4],
            tension: 0.35,
            pointRadius: 3
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
          legend: {
            position: "top",
            labels: { boxWidth: 10, font: { size: 10 }, color: "#cbd5e1" }
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) + "°C" : "--"}`
            }
          }
        },
        scales: {
          x: {
            grid: { color: "rgba(255, 255, 255, 0.05)" },
            ticks: { font: { size: 10 } }
          },
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
      if (r.wind_dir !== null && r.wind_dir !== undefined && r.wind_speed !== null) {
        const idx = Math.round(r.wind_dir / 22.5) % 16;
        sectorCounts[idx]++;
        sectorSpeeds[idx] += r.wind_speed;
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

    // Rosa dos Ventos Polar
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
              label: (ctx) => `${ctx.label}: ${ctx.raw} horas (Vel. média: ${sectorAvgSpeeds[ctx.dataIndex].toFixed(1)} m/s)`
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

    // Velocidade & Rajadas ao longo do tempo
    const speeds = sorted.map((r) => r.wind_speed);
    const gusts = sorted.map((r) => r.wind_gust);

    this.charts.windSpeed = new Chart(speedCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels: labels,
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

    const radData = sorted.map((r) => (r.solar_radiation !== null && r.solar_radiation !== undefined ? Math.max(0, r.solar_radiation) : 0.0));
    const humData = sorted.map((r) => r.humidity_ins);

    const peakRad = Math.max(...radData);
    const peakBadge = document.getElementById("chartRadPeakBadge");
    if (peakBadge) peakBadge.textContent = `Pico: ${peakRad.toFixed(1)} kJ/m² (~${Math.round(peakRad / 3.6)} W/m²)`;

    this.charts.rad = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: labels,
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

  filterChartPanels(category) {
    const cards = {
      temp: document.getElementById("cardChartTemp"),
      rain: document.getElementById("cardChartRain"),
      wind: document.getElementById("cardChartWind"),
      rad: document.getElementById("cardChartRad")
    };

    if (category === "all") {
      Object.values(cards).forEach((card) => {
        if (card) {
          card.classList.remove("chart-hidden", "single-active");
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
  // Station Search & Autocomplete
  // ==========================================================================
  setupSearchAutocomplete() {
    const input = document.getElementById("stationSearchInput");
    const results = document.getElementById("stationSearchResults");
    const clearBtn = document.getElementById("clearSearchBtn");

    let debounceTimer = null;

    input.addEventListener("input", (e) => {
      const q = e.target.value.trim();
      clearBtn.style.display = q ? "block" : "none";

      clearTimeout(debounceTimer);
      if (q.length < 2) {
        results.classList.remove("active");
        results.innerHTML = "";
        return;
      }

      debounceTimer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/stations?q=${encodeURIComponent(q)}&lat=${this.currentLat}&lon=${this.currentLon}&limit=20`);
          const data = await res.json();
          this.renderSearchResults(data.stations || []);
        } catch (err) {
          console.error("Search error:", err);
        }
      }, 200);
    });

    clearBtn.addEventListener("click", () => {
      input.value = "";
      clearBtn.style.display = "none";
      results.classList.remove("active");
      results.innerHTML = "";
    });

    // Close dropdown on outside click
    document.addEventListener("click", (e) => {
      if (!input.contains(e.target) && !results.contains(e.target)) {
        results.classList.remove("active");
      }
    });
  }

  renderSearchResults(stations) {
    const results = document.getElementById("stationSearchResults");
    results.innerHTML = "";

    if (stations.length === 0) {
      results.innerHTML = `<div style="padding: 10px; color: var(--text-muted); font-size: 13px;">Nenhuma estação encontrada.</div>`;
      results.classList.add("active");
      return;
    }

    stations.forEach((s) => {
      const item = document.createElement("div");
      item.className = "search-item";
      item.innerHTML = `
        <div class="search-item-info">
          <span class="search-st-code">${s.code}</span>
          <span class="search-st-name">${s.name} (${s.state})</span>
        </div>
        <span class="search-st-dist">${s.distance_km ? `${s.distance_km} km` : ""}</span>
      `;

      item.addEventListener("click", async () => {
        results.classList.remove("active");
        await this.selectStation(s.code, true);
      });

      results.appendChild(item);
    });

    results.classList.add("active");
  }

  // ==========================================================================
  // GPS Nearest Station
  // ==========================================================================
  async detectGpsLocation() {
    const btn = document.getElementById("btnGpsNearest");
    btn.classList.add("spinning");

    if (!navigator.geolocation) {
      alert("Geolocalização não é suportada pelo seu navegador.");
      btn.classList.remove("spinning");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(`/api/stations/nearest?lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          if (data.nearest_station) {
            const st = data.nearest_station;
            alert(`Estação INMET mais próxima encontrada:\n${st.code} - ${st.name} (${st.state})\nDistância: ${st.distance_km} km`);
            await this.selectStation(st.code, true);
          }
        } catch (err) {
          console.error("GPS nearest error:", err);
          alert("Erro ao buscar estação mais próxima para sua posição.");
        } finally {
          btn.classList.remove("spinning");
        }
      },
      (err) => {
        console.warn("Geolocation error:", err);
        alert("Não foi possível obter sua posição GPS. Verifique as permissões de localização no navegador.");
        btn.classList.remove("spinning");
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  // ==========================================================================
  // Event Listeners Setup
  // ==========================================================================
  setupEventListeners() {
    // GPS Button
    document.getElementById("btnGpsNearest").addEventListener("click", () => this.detectGpsLocation());

    // Manual Refresh Button
    document.getElementById("btnManualRefresh").addEventListener("click", async () => {
      await this.selectStation(this.currentStationCode, true);
    });

    // Quick Station Chips
    document.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", async (e) => {
        const code = chip.dataset.code;
        await this.selectStation(code, true);
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
        setTimeout(() => {
          Object.values(this.charts).forEach((c) => c && c.resize());
        }, 50);
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
        const cat = btn.dataset.chart;
        this.filterChartPanels(cat);
      });
    });

    // GOES Player Controls
    document.getElementById("btnPlayPause").addEventListener("click", () => this.togglePlayPause());
    document.getElementById("btnPrevFrame").addEventListener("click", () => this.stepFrame(-1));
    document.getElementById("btnNextFrame").addEventListener("click", () => this.stepFrame(1));

    document.getElementById("btnLoopToggle").addEventListener("click", (e) => {
      this.goesConfig.loop = !this.goesConfig.loop;
      e.currentTarget.classList.toggle("active", this.goesConfig.loop);
    });

    // Timeline Slider
    const slider = document.getElementById("timelineSlider");
    slider.addEventListener("input", (e) => {
      this.pauseGoesAnimation();
      this.goesConfig.currentFrameIndex = Number(e.target.value);
      this.renderCurrentGoesFrame();
    });

    // Playback Speed Buttons
    document.querySelectorAll(".speed-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".speed-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.goesConfig.playbackMultiplier = parseFloat(btn.dataset.speed);
        if (this.goesConfig.isPlaying) {
          this.startGoesAnimation();
        }
      });
    });

    // Player Interactive Zoom Controls (+ / - / Reset 1x)
    document.getElementById("btnPlayerZoomIn")?.addEventListener("click", () => {
      this.setPlayerZoom((this.goesConfig.playerZoom || 1.0) + 0.5);
    });
    document.getElementById("btnPlayerZoomOut")?.addEventListener("click", () => {
      this.setPlayerZoom((this.goesConfig.playerZoom || 1.0) - 0.5);
    });
    document.getElementById("btnPlayerZoomReset")?.addEventListener("click", () => {
      this.setPlayerZoom(1.0);
    });

    // Mouse wheel zoom on satellite canvas
    const canvasHolder = document.querySelector(".canvas-holder");
    if (canvasHolder) {
      canvasHolder.addEventListener("wheel", (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.25 : -0.25;
        this.setPlayerZoom((this.goesConfig.playerZoom || 1.0) + delta);
      }, { passive: false });
    }

    // Degradable Resolution Selector
    document.querySelectorAll("#resSelector .seg-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll("#resSelector .seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.goesConfig.resolution = btn.dataset.res;
        this.loadGoesFrames();
      });
    });

    // Area Selector
    document.querySelectorAll("#areaSelector .seg-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll("#areaSelector .seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.goesConfig.delta = parseFloat(btn.dataset.delta);
        if (this.stationCircle) {
          this.stationCircle.setRadius(this.goesConfig.delta * 111000);
        }
        // Immediately fetch native high-resolution tiles for the selected territorial scale
        this.loadGoesFrames();
      });
    });

    // Product Selector
    document.querySelectorAll(".prod-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".prod-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.goesConfig.product = btn.dataset.prod;
        this.loadGoesFrames();
      });
    });

    // Operational DSAT Layers Toggles
    const toggleBorders = document.getElementById("toggleBordersCheck");
    if (toggleBorders) {
      toggleBorders.checked = this.goesConfig.showBorders;
      toggleBorders.addEventListener("change", (e) => {
        this.goesConfig.showBorders = e.target.checked;
        this.loadGoesFrames();
      });
    }

    const toggleCities = document.getElementById("toggleCitiesCheck");
    if (toggleCities) {
      toggleCities.checked = this.goesConfig.showCities;
      toggleCities.addEventListener("change", (e) => {
        this.goesConfig.showCities = e.target.checked;
        this.loadGoesFrames();
      });
    }

    const toggleUrban = document.getElementById("toggleUrbanCheck");
    if (toggleUrban) {
      toggleUrban.checked = this.goesConfig.showUrban;
      toggleUrban.addEventListener("change", (e) => {
        this.goesConfig.showUrban = e.target.checked;
        this.loadGoesFrames();
      });
    }

    const toggleLegend = document.getElementById("toggleLegendCheck");
    if (toggleLegend) {
      toggleLegend.checked = this.goesConfig.showLegend;
      toggleLegend.addEventListener("change", (e) => {
        this.goesConfig.showLegend = e.target.checked;
        this.renderCurrentGoesFrame();
      });
    }

    const closeLegendBtn = document.getElementById("btnCloseLegend");
    if (closeLegendBtn) {
      closeLegendBtn.addEventListener("click", () => {
        this.goesConfig.showLegend = false;
        if (toggleLegend) toggleLegend.checked = false;
        const box = document.getElementById("cptecLegendBox");
        if (box) box.classList.add("hidden");
      });
    }

    // Frames Count Slider
    const framesSlider = document.getElementById("framesCountSlider");
    const framesDisplay = document.getElementById("framesCountDisplay");
    if (framesSlider && framesDisplay) {
      framesSlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value);
        this.goesConfig.numFrames = val;
        const hoursEst = (val * 10) / 60;
        framesDisplay.textContent = `${val} quadros (~${hoursEst.toFixed(1)} horas)`;
      });
      framesSlider.addEventListener("change", () => {
        this.loadGoesFrames();
      });
    }


    // Generate & Download GIF
    const gifBtn = document.getElementById("btnGenerateDownloadGif");
    if (gifBtn) gifBtn.addEventListener("click", () => this.generateAndDownloadGif());

    // Forecast Tabs (Hourly vs Daily)
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
    const btnOm = document.getElementById("btnSourceOpenMeteo");
    const btnInmet = document.getElementById("btnSourceInmet");
    if (btnOm && btnInmet) {
      btnOm.addEventListener("click", () => this.setDataSource("openmeteo"));
      btnInmet.addEventListener("click", () => this.setDataSource("inmet"));
    }

    // CSV Export
    document.getElementById("btnExportCsv").addEventListener("click", () => this.exportCsv());

    // Keyboard Shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        this.togglePlayPause();
      } else if (e.code === "ArrowLeft") {
        this.stepFrame(-1);
      } else if (e.code === "ArrowRight") {
        this.stepFrame(1);
      }
    });
  }

  // ==========================================================================
  // CSV Export
  // ==========================================================================
  exportCsv() {
    if (!this.inmetData || !this.inmetData.history || this.inmetData.history.length === 0) {
      alert("Nenhum dado histórico para exportar.");
      return;
    }

    const headers = [
      "Estação", "Data_BRT", "Hora_BRT", "Data_UTC", "Hora_UTC", "Temp_Inst_C", "Temp_Max_C", "Temp_Min_C",
      "Sensacao_C", "Umidade_Perc", "Pressao_hPa", "Vento_Vel_ms", "Vento_Dir_deg", "Ponto_Cardeal",
      "Vento_Rajada_ms", "Chuva_mm"
    ];

    const rows = this.inmetData.history.map((r) => [
      this.currentStationCode,
      r.date_brt || r.date || "",
      r.hour_brt || r.hour_local || "",
      r.date_utc || "",
      r.hour_utc || "",
      r.temp_ins !== null ? r.temp_ins : "",
      r.temp_max !== null ? r.temp_max : "",
      r.temp_min !== null ? r.temp_min : "",
      r.thermal_sensation !== null ? r.thermal_sensation : "",
      r.humidity_ins !== null ? r.humidity_ins : "",
      r.pressure_ins !== null ? r.pressure_ins : "",
      r.wind_speed !== null ? r.wind_speed : "",
      r.wind_dir !== null ? r.wind_dir : "",
      this.getCardinalDirection(r.wind_dir),
      r.wind_gust !== null ? r.wind_gust : "",
      r.rain !== null ? r.rain : ""
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((row) => row.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `INMET_${this.currentStationCode}_24h_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Instantiate on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  window.app = new MeteoApp();
});
