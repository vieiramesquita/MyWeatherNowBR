import os
import json
import time
import math
import asyncio
import unicodedata
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional, Any
import httpx
from playwright.async_api import async_playwright

ROOT_DIR = os.path.dirname(os.path.dirname(__file__))
STATIONS_FILE = os.path.join(ROOT_DIR, "inmet_stations.json")
STATIC_STATIONS_DIR = os.path.join(ROOT_DIR, "static", "data", "stations")
CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)

CHROME_PATH = None
for candidate in [
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]:
    if os.path.exists(candidate):
        CHROME_PATH = candidate
        break


def _norm_str(s: str) -> str:
    nfd = unicodedata.normalize("NFD", str(s or ""))
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn").lower().strip()


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Returns distance in km between two GPS coordinates."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


class InmetService:
    def __init__(self):
        self.stations: List[Dict[str, Any]] = []
        self.stations_by_code: Dict[str, Dict[str, Any]] = {}
        self.active_station_code: str = "A029"  # Default Edéia
        self.load_stations()

    def load_stations(self):
        if os.path.exists(STATIONS_FILE):
            try:
                with open(STATIONS_FILE, "r", encoding="utf-8") as f:
                    self.stations = json.load(f)
                    self.stations_by_code = {s["code"].upper(): s for s in self.stations}
            except Exception as e:
                print(f"Error loading stations file: {e}")

    def find_nearest_station(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        """Find the closest operational INMET station (falling back to closest overall)."""
        if not self.stations:
            self.load_stations()
        if not self.stations:
            return None

        best_operante = None
        min_operante_dist = float("inf")
        best_any = None
        min_any_dist = float("inf")

        for s in self.stations:
            dist = haversine_distance(lat, lon, float(s["lat"]), float(s["lon"]))
            if dist < min_any_dist:
                min_any_dist = dist
                best_any = {**s, "distance_km": round(dist, 1)}
            if s.get("status") == "Operante" and dist < min_operante_dist:
                min_operante_dist = dist
                best_operante = {**s, "distance_km": round(dist, 1)}

        # Prioritize an operational physical station if within reasonable proximity (+45 km)
        if best_operante and (best_any is None or min_operante_dist <= min_any_dist + 45.0):
            return best_operante
        return best_any

    def search_stations(self, query: str = "", lat: Optional[float] = None, lon: Optional[float] = None, limit: int = 50) -> List[Dict[str, Any]]:
        """Search stations by accent-insensitive query and prioritize operational stations."""
        if not self.stations:
            self.load_stations()

        q = _norm_str(query)
        results = []
        for s in self.stations:
            s_name = _norm_str(s.get("name", ""))
            s_mun = _norm_str(s.get("municipality", ""))
            s_code = _norm_str(s.get("code", ""))
            s_uf = _norm_str(s.get("state", ""))
            if not q or (q in s_name or q in s_mun or q in s_code or q == s_uf):
                st_data = dict(s)
                if lat is not None and lon is not None:
                    st_data["distance_km"] = round(haversine_distance(lat, lon, float(s["lat"]), float(s["lon"])), 1)
                results.append(st_data)

        def sort_key(item: Dict[str, Any]):
            code_exact = 0 if _norm_str(item.get("code", "")) == q else 1
            is_operante = 0 if item.get("status") == "Operante" else 1
            if lat is not None and lon is not None:
                return (code_exact, is_operante, item.get("distance_km", 99999))
            return (code_exact, is_operante, item.get("state", ""), item.get("name", ""))

        results.sort(key=sort_key)
        return results[:limit]

    def _get_cache_path(self, station_code: str) -> str:
        return os.path.join(CACHE_DIR, f"station_{station_code.upper()}.json")

    def get_cached_data(self, station_code: str) -> Optional[Dict[str, Any]]:
        code = station_code.upper()
        for path in [
            self._get_cache_path(code),
            os.path.join(STATIC_STATIONS_DIR, f"station_{code}.json"),
        ]:
            if os.path.exists(path):
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        return json.load(f)
                except Exception as e:
                    print(f"Error reading cache {path}: {e}")
        return None

    def _save_cache(self, station_code: str, data: Dict[str, Any]):
        cache_path = self._get_cache_path(station_code)
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error saving cache for {station_code}: {e}")

    def _parse_float(self, val: Any) -> Optional[float]:
        if val is None or val == "" or val == "-":
            return None
        try:
            if isinstance(val, str):
                val = val.replace(",", ".").strip()
            return round(float(val), 1)
        except Exception:
            return None

    def _parse_inmet_records(self, station_code: str, raw_records: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        """Convert raw INMET hourly records into a structured, typed model."""
        st_meta = self.stations_by_code.get(station_code.upper(), {})

        valid_records = []
        for r in raw_records:
            date_str = r.get("DT_MEDICAO") or ""
            hour_str = str(r.get("HR_MEDICAO") or "0000").zfill(4)
            hour_formatted = f"{hour_str[:2]}:{hour_str[2:4]}"

            temp_ins = self._parse_float(r.get("TEM_INS"))
            temp_max = self._parse_float(r.get("TEM_MAX"))
            temp_min = self._parse_float(r.get("TEM_MIN"))
            temp_sen = self._parse_float(r.get("TEM_SEN"))

            hum_ins = self._parse_float(r.get("UMD_INS"))
            hum_max = self._parse_float(r.get("UMD_MAX"))
            hum_min = self._parse_float(r.get("UMD_MIN"))

            pre_ins = self._parse_float(r.get("PRE_INS"))
            pre_max = self._parse_float(r.get("PRE_MAX"))
            pre_min = self._parse_float(r.get("PRE_MIN"))

            ven_vel = self._parse_float(r.get("VEN_VEL"))
            ven_dir = self._parse_float(r.get("VEN_DIR"))
            ven_raj = self._parse_float(r.get("VEN_RAJ"))

            rain = self._parse_float(r.get("CHUVA"))
            rad = self._parse_float(r.get("RAD_GLO"))
            if rad is not None and rad < 0:
                rad = 0.0
            dew = self._parse_float(r.get("PTO_INS"))
            bat = self._parse_float(r.get("TEN_BAT"))

            date_brt = date_str
            hour_brt = hour_formatted
            date_utc_formatted = date_str
            hour_utc_formatted = hour_formatted

            try:
                h_int = int(hour_str[:2])
                m_int = int(hour_str[2:4])
                dt_utc = datetime.strptime(date_str, "%Y-%m-%d").replace(hour=h_int, minute=m_int)
                dt_brt = dt_utc - timedelta(hours=3)

                date_utc_formatted = dt_utc.strftime("%d/%m/%Y")
                hour_utc_formatted = dt_utc.strftime("%H:%M")
                date_brt = dt_brt.strftime("%d/%m/%Y")
                hour_brt = dt_brt.strftime("%H:%M")
            except Exception:
                pass

            valid_records.append({
                "source": "inmet",
                "date": date_brt,
                "date_brt": date_brt,
                "date_utc": date_utc_formatted,
                "hour_brt": hour_brt,
                "hour_local": hour_brt,
                "hour_utc": hour_utc_formatted,
                "temp_ins": temp_ins,
                "temp_max": temp_max,
                "temp_min": temp_min,
                "thermal_sensation": temp_sen,
                "humidity_ins": hum_ins,
                "humidity_max": hum_max,
                "humidity_min": hum_min,
                "pressure_ins": pre_ins,
                "pressure_max": pre_max,
                "pressure_min": pre_min,
                "wind_speed": ven_vel,
                "wind_dir": ven_dir,
                "wind_gust": ven_raj,
                "rain": rain,
                "solar_radiation": rad,
                "dew_point": dew,
                "battery": bat,
                "has_data": temp_ins is not None or hum_ins is not None or pre_ins is not None
            })

        unique_records = {}
        for r in valid_records:
            key = (r["date_utc"], r["hour_utc"])
            unique_records[key] = r
        valid_records = list(unique_records.values())

        def sort_key(rec):
            try:
                d, m, y = rec["date_utc"].split("/")
                h, mi = rec["hour_utc"].split(":")
                return datetime(int(y), int(m), int(d), int(h), int(mi))
            except Exception:
                return datetime.min

        valid_records.sort(key=sort_key)

        records_with_data = [r for r in valid_records if r["has_data"]]
        if not records_with_data:
            return None

        recent_24 = records_with_data[-24:]
        latest = recent_24[-1]

        rain_24h = round(sum(r["rain"] for r in recent_24 if r["rain"] is not None), 1)
        wind_cardinal = self._degrees_to_cardinal(latest.get("wind_dir"))

        now_utc = datetime.now(timezone.utc)
        staleness_hours = None
        has_current_data = False
        try:
            d, m, y = latest["date_utc"].split("/")
            h, mi = latest["hour_utc"].split(":")
            reading_dt = datetime(int(y), int(m), int(d), int(h), int(mi), tzinfo=timezone.utc)
            diff_sec = (now_utc - reading_dt).total_seconds()
            staleness_hours = max(0.0, round(diff_sec / 3600.0, 1))
            has_current_data = staleness_hours <= 2.5
        except Exception:
            pass

        return {
            "station": {
                "code": station_code.upper(),
                "name": st_meta.get("name", latest.get("DC_NOME", f"Estação {station_code}")),
                "state": st_meta.get("state", "GO"),
                "lat": st_meta.get("lat", float(raw_records[0].get("VL_LATITUDE", -17.3369))),
                "lon": st_meta.get("lon", float(raw_records[0].get("VL_LONGITUDE", -49.9147))),
                "altitude": st_meta.get("altitude", "608"),
                "geocode": st_meta.get("geocode"),
                "inmet_link": f"https://tempo.inmet.gov.br/TabelaEstacoes/{station_code.upper()}"
            },
            "latest": {
                **latest,
                "wind_cardinal": wind_cardinal,
                "rain_24h_accum": rain_24h,
                "reading_timestamp": f"{latest.get('date_brt')} às {latest.get('hour_brt')} (Horário de Brasília) / {latest.get('hour_utc')} UTC",
                "staleness_hours": staleness_hours,
                "has_current_data": has_current_data
            },
            "history": recent_24,
            "cached_at": time.time(),
            "updated_iso": datetime.now(timezone.utc).isoformat()
        }

    def _degrees_to_cardinal(self, d: Optional[float]) -> str:
        if d is None:
            return "N/D"
        dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
        idx = int((d + 11.25) / 22.5) % 16
        return dirs[idx]

    async def fetch_live_proxima_inmet(self, station_code: str) -> Optional[Dict[str, Any]]:
        """Fast REST call to INMET's official apiprevmet3 endpoint using IBGE geocode."""
        code = station_code.upper()
        st_meta = self.stations_by_code.get(code, {})
        geocode = st_meta.get("geocode")
        if not geocode:
            return None
        try:
            async with httpx.AsyncClient(timeout=10.0, headers={"User-Agent": "Mozilla/5.0"}) as client:
                r = await client.get(f"https://apiprevmet3.inmet.gov.br/estacao/proxima/{geocode}")
                if r.status_code == 200:
                    js = r.json()
                    dados = js.get("dados") or {}
                    if dados.get("CD_ESTACAO") == code and (
                        dados.get("TEM_INS") is not None or dados.get("UMD_INS") is not None
                    ):
                        return self._parse_inmet_records(code, [dados])
        except Exception as e:
            print(f"apiprevmet3 fallback error for {code}: {e}")
        return None

    async def fetch_station_from_inmet(self, station_code: str) -> Optional[Dict[str, Any]]:
        """Launch headless Chromium/Edge and capture the 24h JSON payload from INMET front API."""
        station_code = station_code.upper()
        captured_data: List[Dict[str, Any]] = []

        async with async_playwright() as p:
            base_args = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
            browser = None
            if CHROME_PATH:
                try:
                    browser = await p.chromium.launch(headless=True, executable_path=CHROME_PATH, args=base_args)
                except Exception:
                    browser = None
            if browser is None:
                for ch in ["msedge", "chrome", None]:
                    try:
                        if ch:
                            browser = await p.chromium.launch(headless=True, channel=ch, args=base_args)
                        else:
                            browser = await p.chromium.launch(headless=True, args=base_args)
                        break
                    except Exception:
                        continue
            if browser is None:
                return await self.fetch_live_proxima_inmet(station_code)

            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            )
            page = await context.new_page()

            async def on_response(response):
                if "estacao/front" in response.url and response.status == 200:
                    try:
                        js = await response.json()
                        if isinstance(js, list) and len(js) > 0:
                            captured_data.extend(js)
                    except Exception:
                        pass

            page.on("response", on_response)
            url = f"https://tempo.inmet.gov.br/TabelaEstacoes/{station_code}"

            try:
                await page.goto(url, timeout=20000, wait_until="networkidle")
            except Exception:
                pass

            for _ in range(8):
                valid_cnt = sum(1 for x in captured_data if x.get("TEM_INS") is not None or x.get("UMD_INS") is not None)
                if valid_cnt >= 20:
                    break
                await asyncio.sleep(0.4)

            # Request [UTC yesterday, UTC today] whenever fewer than 20 hourly rows were returned (e.g., near UTC midnight)
            valid_cnt = sum(1 for x in captured_data if x.get("TEM_INS") is not None or x.get("UMD_INS") is not None)
            if valid_cnt < 20:
                try:
                    now_utc = datetime.now(timezone.utc)
                    today_str = now_utc.strftime("%Y-%m-%d")
                    yesterday_str = (now_utc - timedelta(days=1)).strftime("%Y-%m-%d")
                    prev_len = len(captured_data)
                    await page.evaluate("""({d_start, d_end}) => {
                        const menu = document.querySelector('.ui.large.secondary.inverted.pointing.menu a') || document.querySelector('a i.sidebar');
                        if (menu) (menu.closest('a') || menu).click();

                        setTimeout(() => {
                            const inputs = document.querySelectorAll('input[type="date"]');
                            if (inputs.length >= 2) {
                                const setVal = (el, val) => {
                                    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                                    nativeSetter.call(el, val);
                                    el.dispatchEvent(new Event('input', { bubbles: true }));
                                    el.dispatchEvent(new Event('change', { bubbles: true }));
                                };
                                setVal(inputs[0], d_start);
                                setVal(inputs[1], d_end);

                                setTimeout(() => {
                                    const btns = Array.from(document.querySelectorAll('button, .ui.button'));
                                    const btn = btns.find(x => x.textContent.toLowerCase().includes('gerar tabela'));
                                    if (btn) btn.click();
                                }, 450);
                            }
                        }, 450);
                    }""", {"d_start": yesterday_str, "d_end": today_str})

                    for _ in range(18):
                        if len(captured_data) > prev_len:
                            await asyncio.sleep(0.4)
                            break
                        await asyncio.sleep(0.5)
                except Exception as e:
                    print(f"Error requesting 48h UTC range for {station_code}: {e}")

            await browser.close()

        if captured_data:
            parsed = self._parse_inmet_records(station_code, captured_data)
            if parsed and parsed.get("latest", {}).get("has_data"):
                self._save_cache(station_code, parsed)
                return parsed

        return await self.fetch_live_proxima_inmet(station_code)

    async def get_station_data(self, station_code: str = "A029", force_refresh: bool = False) -> Dict[str, Any]:
        """Fetch physical INMET station data with 1-hour cache and transparent fallback."""
        station_code = station_code.upper()
        self.active_station_code = station_code
        cached = self.get_cached_data(station_code)

        now = time.time()
        if cached and cached.get("latest", {}).get("has_data") and not force_refresh:
            age = now - cached.get("cached_at", 0)
            if age < 3600:
                cached["cache_age_seconds"] = int(age)
                cached["next_refresh_in_seconds"] = max(0, 3600 - int(age))
                cached["is_cached"] = True
                return cached

        try:
            fresh = await self.fetch_station_from_inmet(station_code)
            if fresh and fresh.get("latest", {}).get("has_data"):
                fresh["cache_age_seconds"] = 0
                fresh["next_refresh_in_seconds"] = 3600
                fresh["is_cached"] = False
                return fresh
        except Exception as e:
            print(f"Error fetching station {station_code}: {e}")

        if cached and cached.get("latest", {}).get("has_data"):
            age = now - cached.get("cached_at", 0)
            cached["cache_age_seconds"] = int(age)
            cached["next_refresh_in_seconds"] = 300
            cached["is_cached"] = True
            cached["fetch_warning"] = "Exibindo última telemetria física armazenada da estação INMET."
            return cached

        st_meta = self.stations_by_code.get(station_code, {})
        return {
            "station": {
                "code": station_code,
                "name": st_meta.get("name", f"Estação {station_code}"),
                "state": st_meta.get("state", "BR"),
                "lat": st_meta.get("lat", -17.3369),
                "lon": st_meta.get("lon", -49.9147),
                "altitude": st_meta.get("altitude", "608"),
                "geocode": st_meta.get("geocode"),
                "inmet_link": f"https://tempo.inmet.gov.br/TabelaEstacoes/{station_code}"
            },
            "latest": {
                "temp_ins": None,
                "humidity_ins": None,
                "pressure_ins": None,
                "has_data": False,
                "has_current_data": False
            },
            "history": [],
            "cached_at": now,
            "is_cached": False,
            "fetch_warning": f"Estação {station_code} sem transmissão física recente no servidor INMET."
        }


inmet_service = InmetService()
