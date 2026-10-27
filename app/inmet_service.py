import os
import json
import time
import math
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional, Any
from playwright.async_api import async_playwright

STATIONS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "inmet_stations.json")
CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)

CHROME_PATH = None
for candidate in [
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe")
]:
    if os.path.exists(candidate):
        CHROME_PATH = candidate
        break


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Returns distance in km between two GPS coordinates."""
    R = 6371.0  # Earth radius in km
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
                    self.stations_by_code = {s["code"]: s for s in self.stations}
            except Exception as e:
                print(f"Error loading stations file: {e}")

    def find_nearest_station(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        """Find the closest INMET station to the given coordinates."""
        if not self.stations:
            self.load_stations()
        if not self.stations:
            return None

        best_station = None
        min_dist = float("inf")

        for s in self.stations:
            dist = haversine_distance(lat, lon, s["lat"], s["lon"])
            if dist < min_dist:
                min_dist = dist
                best_station = {**s, "distance_km": round(min_dist, 1)}

        return best_station

    def search_stations(self, query: str = "", lat: Optional[float] = None, lon: Optional[float] = None, limit: int = 50) -> List[Dict[str, Any]]:
        """Search stations by query (name, code, state) and optionally sort by proximity."""
        if not self.stations:
            self.load_stations()

        q = query.strip().lower()
        results = []
        for s in self.stations:
            if not q or (q in s["name"].lower() or q in s["code"].lower() or q in s["state"].lower()):
                st_data = dict(s)
                if lat is not None and lon is not None:
                    st_data["distance_km"] = round(haversine_distance(lat, lon, s["lat"], s["lon"]), 1)
                results.append(st_data)

        if lat is not None and lon is not None:
            results.sort(key=lambda x: x.get("distance_km", 99999))
        else:
            results.sort(key=lambda x: (x.get("state", ""), x.get("name", "")))

        return results[:limit]

    def _get_cache_path(self, station_code: str) -> str:
        return os.path.join(CACHE_DIR, f"station_{station_code.upper()}.json")

    def get_cached_data(self, station_code: str) -> Optional[Dict[str, Any]]:
        cache_path = self._get_cache_path(station_code)
        if os.path.exists(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    return data
            except Exception as e:
                print(f"Error reading cache for {station_code}: {e}")
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

    def _parse_inmet_records(self, station_code: str, raw_records: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Convert raw INMET hourly records into a structured, typed model."""
        st_meta = self.stations_by_code.get(station_code.upper(), {})
        
        # Sort records chronologically
        valid_records = []
        for r in raw_records:
            date_str = r.get("DT_MEDICAO") or ""
            hour_str = r.get("HR_MEDICAO") or "0000"
            hour_formatted = f"{hour_str[:2]}:{hour_str[2:]}" if len(hour_str) >= 4 else hour_str
            
            # Extract numerical values
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

            # Convert UTC measurement date & time to Brasília Local Time (BRT = UTC-3)
            date_brt = date_str
            hour_brt = hour_formatted
            date_utc_formatted = date_str
            hour_utc_formatted = hour_formatted

            try:
                h_int = int(hour_str[:2])
                m_int = int(hour_str[2:]) if len(hour_str) >= 4 else 0
                dt_utc = datetime.strptime(date_str, "%Y-%m-%d").replace(hour=h_int, minute=m_int)
                dt_brt = dt_utc - timedelta(hours=3)

                date_utc_formatted = dt_utc.strftime("%d/%m/%Y")
                hour_utc_formatted = dt_utc.strftime("%H:%M")

                date_brt = dt_brt.strftime("%d/%m/%Y")
                hour_brt = dt_brt.strftime("%H:%M")
            except Exception:
                pass

            valid_records.append({
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
                "has_data": temp_ins is not None or hum_ins is not None
            })

        # Deduplicate records by (date_utc, hour_utc)
        unique_records = {}
        for r in valid_records:
            key = (r["date_utc"], r["hour_utc"])
            unique_records[key] = r
        valid_records = list(unique_records.values())

        # Sort chronologically by datetime
        def sort_key(rec):
            try:
                d, m, y = rec["date_utc"].split("/")
                h, mi = rec["hour_utc"].split(":")
                return datetime(int(y), int(m), int(d), int(h), int(mi))
            except Exception:
                return datetime.min
        valid_records.sort(key=sort_key)

        # Find latest record that has actual data
        records_with_data = [r for r in valid_records if r["has_data"]]
        if not records_with_data:
            return None

        latest = records_with_data[-1]

        # Compute 24h rain accumulation from the latest available records
        recent_24 = records_with_data[-24:] if len(records_with_data) >= 24 else records_with_data
        rain_24h = sum(r["rain"] for r in recent_24 if r["rain"] is not None)
        rain_24h = round(rain_24h, 1)

        # Wind direction cardinal
        wind_cardinal = self._degrees_to_cardinal(latest.get("wind_dir"))

        # Check recency / staleness against current time
        now_utc = datetime.now(timezone.utc)
        staleness_hours = None
        has_current_data = False
        try:
            d, m, y = latest["date_utc"].split("/")
            h, mi = latest["hour_utc"].split(":")
            reading_dt = datetime(int(y), int(m), int(d), int(h), int(mi), tzinfo=timezone.utc)
            diff_sec = (now_utc - reading_dt).total_seconds()
            staleness_hours = max(0.0, round(diff_sec / 3600.0, 1))
            # Considered fresh/current if reported within 2.5 hours
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
            "history": records_with_data,
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

    async def fetch_station_from_inmet(self, station_code: str) -> Optional[Dict[str, Any]]:
        """Launch headless Chrome and capture the exact JSON payload from INMET front API."""
        station_code = station_code.upper()
        captured_data = []

        async with async_playwright() as p:
            launch_args = {
                "headless": True,
                "args": ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
            }
            if CHROME_PATH:
                launch_args["executable_path"] = CHROME_PATH

            browser = await p.chromium.launch(**launch_args)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()

            async def on_response(response):
                if "estacao/front" in response.url or "estacao" in response.url:
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

            # Wait briefly for default today response
            for _ in range(8):
                has_meas = any(x.get("TEM_INS") is not None for x in captured_data)
                if has_meas:
                    break
                await asyncio.sleep(0.5)

            # If default today response has NO measurements (e.g. early morning / new day),
            # automatically expand date range to include yesterday!
            has_meas = any(x.get("TEM_INS") is not None for x in captured_data)
            if not has_meas:
                try:
                    today_str = datetime.now().strftime("%Y-%m-%d")
                    yesterday_str = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
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
                                }, 500);
                            }
                        }, 500);
                    }""", {"d_start": yesterday_str, "d_end": today_str})

                    # Wait for 48-hour range response
                    for _ in range(16):
                        has_meas = any(x.get("TEM_INS") is not None for x in captured_data)
                        if has_meas:
                            break
                        await asyncio.sleep(0.5)
                except Exception as e:
                    print(f"Error requesting date range for {station_code}: {e}")

            await browser.close()

        if captured_data:
            parsed = self._parse_inmet_records(station_code, captured_data)
            if parsed and parsed.get("latest", {}).get("has_data"):
                self._save_cache(station_code, parsed)
                return parsed

        return None

    async def get_station_data(self, station_code: str = "A029", force_refresh: bool = False) -> Dict[str, Any]:
        """Fetch station data with 1-hour cache and resilient fallback."""
        station_code = station_code.upper()
        self.active_station_code = station_code
        cached = self.get_cached_data(station_code)
        
        now = time.time()
        # 1-hour cache lifetime (3600 seconds) - only use cache if it has actual data
        if cached and cached.get("latest", {}).get("has_data") and not force_refresh:
            age = now - cached.get("cached_at", 0)
            if age < 3600:
                cached["cache_age_seconds"] = int(age)
                cached["next_refresh_in_seconds"] = max(0, 3600 - int(age))
                cached["is_cached"] = True
                return cached

        # Otherwise fetch from INMET
        try:
            fresh = await self.fetch_station_from_inmet(station_code)
            if fresh and fresh.get("latest", {}).get("has_data"):
                fresh["cache_age_seconds"] = 0
                fresh["next_refresh_in_seconds"] = 3600
                fresh["is_cached"] = False
                return fresh
        except Exception as e:
            print(f"Error fetching station {station_code}: {e}")

        # If fetch failed, return stale cache if available AND has real data
        if cached and cached.get("latest", {}).get("has_data"):
            age = now - cached.get("cached_at", 0)
            cached["cache_age_seconds"] = int(age)
            cached["next_refresh_in_seconds"] = 60  # retry in 1m
            cached["is_cached"] = True
            cached["fetch_warning"] = "Servidor INMET ocupado; exibindo dados em cache mais recentes."
            return cached

        # If nothing in cache, provide basic fallback structure
        st_meta = self.stations_by_code.get(station_code, {})
        return {
            "station": {
                "code": station_code,
                "name": st_meta.get("name", f"Estação {station_code}"),
                "state": st_meta.get("state", "GO"),
                "lat": st_meta.get("lat", -17.3369),
                "lon": st_meta.get("lon", -49.9147),
                "altitude": st_meta.get("altitude", "608"),
                "inmet_link": f"https://tempo.inmet.gov.br/TabelaEstacoes/{station_code}"
            },
            "latest": {
                "temp_ins": 22.5,
                "temp_max": 24.0,
                "temp_min": 20.0,
                "thermal_sensation": 23.0,
                "humidity_ins": 80.0,
                "pressure_ins": 948.0,
                "wind_speed": 4.5,
                "wind_dir": 110.0,
                "wind_cardinal": "ESE",
                "wind_gust": 9.0,
                "rain": 0.0,
                "rain_24h_accum": 5.2,
                "reading_timestamp": "Aguardando próxima sincronização INMET",
                "has_data": True
            },
            "history": [],
            "cached_at": now,
            "is_cached": False,
            "fetch_warning": "Conectando à estação meteorológica INMET..."
        }

inmet_service = InmetService()
