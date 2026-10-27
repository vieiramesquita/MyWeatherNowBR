import os
import ssl
import json
import time
import math
import re
import urllib.request
from io import BytesIO
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFont

CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache", "goes")
BORDERS_CACHE_DIR = os.path.join(CACHE_DIR, "borders")
os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(BORDERS_CACHE_DIR, exist_ok=True)

GEO_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "data", "geo")
MUNICIPIOS_FILE = os.path.join(GEO_DIR, "goias_municipios.geojson")
URBAN_FILE = os.path.join(GEO_DIR, "goias_areas_urbanizadas_2022.geojson")

# SSL context that tolerates various government/academic certificates
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# Resolutions supported by Full Disk (FD)
RESOLUTIONS = {
    "low": {
        "code": "339x339",
        "inpe_size": 512,
        "width": 512,
        "height": 512,
        "name": "Baixa (512x512)"
    },
    "medium": {
        "code": "678x678",
        "inpe_size": 512,
        "width": 678,
        "height": 678,
        "name": "Média (678x678)"
    },
    "high": {
        "code": "1808x1808",
        "inpe_size": 512,
        "width": 1808,
        "height": 1808,
        "name": "Alta (1808x1808)"
    },
    "ultra": {
        "code": "5424x5424",
        "inpe_size": 512,
        "width": 5424,
        "height": 5424,
        "name": "Ultra (5424x5424)"
    }
}

PRODUCT_CONFIGS = {
    "cptec_dsa": {
        "id": "ch13_cpt_DSA",
        "name": "CPTEC/DSA • Realce Convectivo IR (10.35µm)",
        "badge": "DSA / INPE",
        "desc": "Realce térmico operacional do CPTEC/INPE destacando convecção profunda e topos frios (-80°C a +40°C).",
        "legend_url": "/static/img/legends/goes-ch13-dsa-celsius-pt-br.png",
        "legend_title": "10,35µm Temperatura de Brilho (°C) • CPTEC/DSA",
        "has_temp_scale": True,
        "is_cptec": True
    },
    "cptec_sandwich": {
        "id": "true_color_ch13_dsa",
        "name": "CPTEC • Sandwich (True-Color + Realce DSA)",
        "badge": "Sandwich CPTEC",
        "desc": "Fusão multiespectral True-Color diurna com realce infravermelho DSA de células convectivas sobrepostas.",
        "legend_url": "/static/img/legends/goes-ch13-dsa-celsius-pt-br.png",
        "legend_title": "Realce Sandwich • Escala Térmica DSA (°C)",
        "has_temp_scale": True,
        "is_cptec": True
    },
    "cptec_wv": {
        "id": "ch08_cpt_WVCOLOR35",
        "name": "CPTEC • Vapor d'Água (Canal 08 - 6.19µm)",
        "badge": "Vapor d'Água",
        "desc": "Vapor d'água na média/alta troposfera com realce colorido NOAA/CPTEC de umidade e correntes de jato.",
        "legend_url": "/static/img/legends/goes-ch08-WVCOLOR35-celsius-pt-br.png",
        "legend_title": "6,19µm Temperatura de Brilho (°C) • Vapor d'Água",
        "has_temp_scale": True,
        "is_cptec": True
    },
    "cptec_ir_noaa": {
        "id": "ch13_cpt_IR4AVHRR6",
        "name": "NOAA • Realce AVHRR IR (10.35µm)",
        "badge": "NOAA IR",
        "desc": "Realce térmico clássico operacional IR4AVHRR6 para detecção de topos de nuvens e gradientes sinóticos.",
        "legend_url": "/static/img/legends/goes-ch13-IR4AVHRR6-celsius-pt-br.png",
        "legend_title": "10,35µm Temperatura de Brilho (°C) • NOAA AVHRR",
        "has_temp_scale": True,
        "is_cptec": True
    },
    "cptec_cloud_phase": {
        "id": "day_cloud_phase_jma",
        "name": "Cloud Phase (JMA) • Fase de Nuvens RGB",
        "badge": "JMA Cloud Phase",
        "desc": "Composição RGB diurna da Agência Meteorológica do Japão (JMA) para diferenciar microfísica de nuvens: gelo/tempestades (ciano/azul), água líquida (verde/amarelo) e solo.",
        "legend_url": "",
        "legend_title": "Interpretação RGB • Cloud Phase JMA",
        "has_temp_scale": False,
        "is_cptec": True,
        "rgb_guide": [
            {"color": "#06b6d4", "label": "Nuvens de Gelo / Topos Convectivos"},
            {"color": "#10b981", "label": "Gotículas de Água Líquida / Cumulus"},
            {"color": "#d97706", "label": "Superfície do Solo / Relevo"},
            {"color": "#1e3a8a", "label": "Cirrus Espessos / Nuvens Altas"}
        ]
    },
    "cptec_night_micro": {
        "id": "night_microphysics",
        "name": "Nighttime Microphysics • Microfísica Noturna RGB",
        "badge": "Night Micro RGB",
        "desc": "Composição RGB noturna multiespectral para detecção de nevoeiros (verde/amarelo), nuvens baixas de água e convecção profunda sem iluminação solar.",
        "legend_url": "",
        "legend_title": "Interpretação RGB • Microfísica Noturna",
        "has_temp_scale": False,
        "is_cptec": True,
        "rgb_guide": [
            {"color": "#eab308", "label": "Nevoeiro (Fog) & Nuvens Baixas de Água"},
            {"color": "#dc2626", "label": "Nuvens Médias & Cirrus Espessos"},
            {"color": "#7c3aed", "label": "Convecção Profunda & Topos Glaciados"},
            {"color": "#2563eb", "label": "Superfície Terrestre Fria"}
        ]
    },
    "cptec_natural": {
        "id": "natural_color",
        "name": "CPTEC • Cor Natural (Multiespectral)",
        "badge": "Cor Natural",
        "desc": "Composição em cor natural realçando vegetação, massas de ar e nuvens de fase de gelo vs água.",
        "legend_url": "",
        "legend_title": "",
        "has_temp_scale": False,
        "is_cptec": True
    },
    "geocolor": {
        "id": "geocolor",
        "name": "INPE STAC • GeoColor True-Color",
        "badge": "INPE STAC",
        "desc": "Composição em cores verdadeiras Full Disk do catálogo oficial INPE STAC (GOES19-L2-CMI-1).",
        "legend_url": "",
        "legend_title": "",
        "has_temp_scale": False,
        "is_cptec": False
    },
    "clean_ir": {
        "id": "13",
        "noaa_prod": "13",
        "name": "Infravermelho Limpo (Banda 13 - 10.3µm)",
        "badge": "Clean IR",
        "desc": "Realce térmico de topos de nuvens frias e frentes de tempestades convectivas.",
        "legend_url": "/static/img/legends/goes-ch13-dsa-celsius-pt-br.png",
        "legend_title": "10,35µm Temperatura de Brilho (°C)",
        "has_temp_scale": True,
        "is_cptec": False
    },
    "sandwich": {
        "id": "Sandwich",
        "noaa_prod": "Sandwich",
        "name": "RGB IR Sandwich Convectivo",
        "badge": "Sandwich",
        "desc": "Fusão de canal visível de alta resolução com realce térmico de tempestades severas.",
        "legend_url": "/static/img/legends/goes-ch13-dsa-celsius-pt-br.png",
        "legend_title": "Sandwich Convectivo (°C)",
        "has_temp_scale": True,
        "is_cptec": False
    }
}


def latlon_to_geos_xy(lat_deg: float, lon_deg: float, img_w: int = 512, img_h: int = 512, lon_0_deg: float = -75.0) -> Tuple[float, float]:
    """
    Physical Geostationary Projection for GOES-19 / GOES-East (Full Disk).
    Maps any (latitude, longitude) to exact (X, Y) pixel coordinates on the Full Disk image.
    Standard GRS80 / WGS84 Geostationary Earth parameters.
    """
    r_eq = 6378137.0
    r_pol = 6356752.31414
    H = 42164160.0  # satellite distance from earth center

    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    lon_0 = math.radians(lon_0_deg)

    lat_geo = math.atan((r_pol**2 / r_eq**2) * math.tan(lat))
    r_c = r_pol / math.sqrt(1 - (1 - (r_pol**2 / r_eq**2)) * (math.cos(lat_geo)**2))

    s_x = H - r_c * math.cos(lat_geo) * math.cos(lon - lon_0)
    s_y = -r_c * math.cos(lat_geo) * math.sin(lon - lon_0)
    s_z = r_c * math.sin(lat_geo)

    x_rad = math.asin(-s_y / math.sqrt(s_x**2 + s_y**2 + s_z**2))
    y_rad = math.atan(s_z / s_x)

    # Full Disk scan angle extent: [-0.151872, +0.151872] radians
    max_scan_angle = 0.151872
    norm_x = x_rad / max_scan_angle
    norm_y = y_rad / max_scan_angle

    pixel_x = (norm_x + 1.0) * 0.5 * img_w
    pixel_y = (1.0 - norm_y) * 0.5 * img_h
    return pixel_x, pixel_y


class GoesService:
    def __init__(self):
        self._inpe_cache: List[Dict[str, Any]] = []
        self._inpe_cache_time: float = 0.0
        self._noaa_fd_cache: List[str] = []
        self._noaa_fd_cache_time: float = 0.0
        self._cptec_latest_cache: Dict[str, Tuple[float, str]] = {}
        self._mun_geo: Optional[Dict[str, Any]] = None
        self._urban_geo: Optional[Dict[str, Any]] = None


    def get_inpe_stac_items(self, limit: int = 12, max_cache_seconds: int = 60) -> List[Dict[str, Any]]:
        """
        Fetch real-time GOES-19 Full Disk items directly from the official INPE STAC Catalog:
        https://data.inpe.br/bdc/stac/v1/collections/GOES19-L2-CMI-1
        """
        now = time.time()
        if self._inpe_cache and (now - self._inpe_cache_time) < max_cache_seconds:
            return self._inpe_cache

        url = f"https://data.inpe.br/bdc/stac/v1/collections/GOES19-L2-CMI-1/items?limit={limit}"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MyWeatherNow/1.0'})
            with urllib.request.urlopen(req, timeout=12, context=SSL_CTX) as r:
                data = json.loads(r.read().decode('utf-8'))
                features = data.get("features", [])
                if features:
                    # Sort chronologically (oldest to newest)
                    features.reverse()
                    self._inpe_cache = features
                    self._inpe_cache_time = now
                    return features
        except Exception as e:
            print(f"Error fetching INPE STAC GOES-19 items: {e}")

        if self._inpe_cache:
            return self._inpe_cache
        return []

    def get_noaa_fd_timestamps(self, max_cache_seconds: int = 90) -> List[str]:
        """Fetch latest available 10-minute Full Disk timestamps from NOAA STAR."""
        now = time.time()
        if self._noaa_fd_cache and (now - self._noaa_fd_cache_time) < max_cache_seconds:
            return self._noaa_fd_cache

        url = "https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/GEOCOLOR/"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            with urllib.request.urlopen(req, timeout=10, context=SSL_CTX) as r:
                html = r.read().decode('utf-8', errors='ignore')
                files = re.findall(r'(\d{11})_GOES19-ABI-FD-GEOCOLOR-678x678\.jpg', html)
                if files:
                    sorted_ts = sorted(set(files))
                    self._noaa_fd_cache = sorted_ts
                    self._noaa_fd_cache_time = now
                    return sorted_ts
        except Exception as e:
            print(f"Error fetching NOAA STAR GOES-19 FD timestamps: {e}")

        if self._noaa_fd_cache:
            return self._noaa_fd_cache

        # Fallback timestamps
        utc_now = datetime.utcnow()
        fallback_times = []
        for i in range(12, 0, -1):
            t = utc_now - timedelta(minutes=i * 10)
            doy = t.timetuple().tm_yday
            fallback_times.append(f"{t.year}{doy:03d}{t.hour:02d}{(t.minute // 10) * 10:02d}")
        return fallback_times

    def format_iso_datetime(self, iso_str: str) -> Dict[str, str]:
        """Format an ISO datetime string into UTC and Brasília (BRT = UTC-3) strings."""
        try:
            # Handle formats like 2026-10-02T16:40:00.000000Z or 2026-10-02T16:40:00Z
            clean = iso_str.replace("Z", "+00:00")
            dt_utc = datetime.fromisoformat(clean)
            dt_local = dt_utc - timedelta(hours=3)
            return {
                "utc": dt_utc.strftime("%d/%m/%Y %H:%M UTC"),
                "local": dt_local.strftime("%d/%m/%Y %H:%M BRT"),
                "time_only_utc": dt_utc.strftime("%H:%M UTC"),
                "time_only_local": dt_local.strftime("%H:%M BRT"),
                "date_local": dt_local.strftime("%d/%m/%Y")
            }
        except Exception:
            return {
                "utc": iso_str,
                "local": iso_str,
                "time_only_utc": iso_str,
                "time_only_local": iso_str,
                "date_local": ""
            }

    def format_noaa_timestamp(self, ts: str) -> Dict[str, str]:
        """Format NOAA timestamp YYYYDDDHHMM into UTC and Brasília strings."""
        try:
            year = int(ts[:4])
            doy = int(ts[4:7])
            hour_utc = int(ts[7:9])
            minute = int(ts[9:11])
            dt_utc = datetime(year, 1, 1) + timedelta(days=doy - 1, hours=hour_utc, minutes=minute)
            dt_local = dt_utc - timedelta(hours=3)
            return {
                "utc": dt_utc.strftime("%d/%m/%Y %H:%M UTC"),
                "local": dt_local.strftime("%d/%m/%Y %H:%M BRT"),
                "time_only_utc": dt_utc.strftime("%H:%M UTC"),
                "time_only_local": dt_local.strftime("%H:%M BRT"),
                "date_local": dt_local.strftime("%d/%m/%Y")
            }
        except Exception:
            return {
                "utc": ts,
                "local": ts,
                "time_only_utc": ts,
                "time_only_local": ts,
                "date_local": ""
            }

    def get_cptec_timestamps(self, prod_id: str = "ch13_cpt_DSA", num_frames: int = 8) -> List[Dict[str, Any]]:
        """
        Fetch latest available 10-minute timestamp from CPTEC DSAT web_tiles API:
        https://s1.cptec.inpe.br/goes/goes16/web_tiles/json/{prod_id}/lastest.json
        And generate a sequence of num_frames timestamps backwards by 10 minutes each.
        """
        latest_ts = None
        now = time.time()
        cached = self._cptec_latest_cache.get(prod_id)
        if cached and (now - cached[0]) < 60:
            latest_ts = cached[1]
        else:
            url = f"https://s1.cptec.inpe.br/goes/goes16/web_tiles/json/{prod_id}/lastest.json"
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 MyWeatherNow/1.0'})
                with urllib.request.urlopen(req, timeout=6, context=SSL_CTX) as r:
                    data = json.loads(r.read().decode('utf-8'))
                    latest_ts = data.get("date")
                    if latest_ts:
                        self._cptec_latest_cache[prod_id] = (now, latest_ts)
            except Exception as e:
                print(f"Error fetching CPTEC latest for {prod_id}: {e}")

        if not latest_ts:
            utc_now = datetime.utcnow()
            dt_base = utc_now - timedelta(minutes=(utc_now.minute % 10) + 10)
        else:
            try:
                dt_base = datetime.strptime(latest_ts, "%Y%m%d%H%M")
            except Exception:
                dt_base = datetime.utcnow()

        results = []
        for i in range(num_frames - 1, -1, -1):
            t = dt_base - timedelta(minutes=i * 10)
            d_str = t.strftime("%Y%m%d")
            hm_str = t.strftime("%H%M")
            dt_local = t - timedelta(hours=3)
            results.append({
                "date": d_str,
                "time": hm_str,
                "utc": t.strftime("%d/%m/%Y %H:%M UTC"),
                "local": dt_local.strftime("%d/%m/%Y %H:%M BRT"),
                "time_only_utc": t.strftime("%H:%M UTC"),
                "time_only_local": dt_local.strftime("%H:%M BRT")
            })
        return results

    def _get_border_tile(self, z: int, tx: int, ty: int) -> Image.Image:
        """Fetch and cache a static country/state border tile from CPTEC DSAT."""
        cache_file = os.path.join(BORDERS_CACHE_DIR, f"b_z{z}_{tx}_{ty}.png")
        if os.path.exists(cache_file) and os.path.getsize(cache_file) > 100:
            try:
                return Image.open(cache_file).convert("RGBA")
            except Exception:
                pass

        url = f"https://s1.cptec.inpe.br/goes/goes16/web_tiles/references/countries/{z}/{tx}/{ty}.png"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 MyWeatherNow/1.0'})
            with urllib.request.urlopen(req, timeout=3, context=SSL_CTX) as resp:
                data = resp.read()
                with open(cache_file, "wb") as f:
                    f.write(data)
                return Image.open(BytesIO(data)).convert("RGBA")
        except Exception:
            return Image.new("RGBA", (256, 256), (0, 0, 0, 0))

    def _fetch_satellite_tile(self, date_str: str, prod_id: str, time_str: str, z: int, tx: int, ty: int) -> Tuple[int, int, Image.Image]:
        url = f"https://s1.cptec.inpe.br/goes/goes16/web_tiles/{date_str}/{prod_id}/{time_str}/{z}/{tx}/{ty}.png"
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 MyWeatherNow/1.0'})
            with urllib.request.urlopen(req, timeout=3, context=SSL_CTX) as resp:
                return (tx, ty, Image.open(BytesIO(resp.read())).convert("RGBA"))
        except Exception:
            return (tx, ty, Image.new("RGBA", (256, 256), (0, 0, 0, 0)))

    def _load_mun_geo(self) -> Optional[Dict[str, Any]]:
        """Load and cache Goiás municipal boundaries GeoJSON."""
        if self._mun_geo is None and os.path.exists(MUNICIPIOS_FILE):
            try:
                with open(MUNICIPIOS_FILE, "r", encoding="utf-8") as f:
                    self._mun_geo = json.load(f)
            except Exception as e:
                print(f"Error loading {MUNICIPIOS_FILE}: {e}")
        return self._mun_geo

    def _load_urban_geo(self) -> Optional[Dict[str, Any]]:
        """Load and cache official IBGE 2022 urbanized areas GeoJSON."""
        if self._urban_geo is None and os.path.exists(URBAN_FILE):
            try:
                with open(URBAN_FILE, "r", encoding="utf-8") as f:
                    self._urban_geo = json.load(f)
            except Exception as e:
                print(f"Error loading {URBAN_FILE}: {e}")
        return self._urban_geo

    def _draw_municipal_and_urban_layers(
        self,
        base_img: Image.Image,
        zoom: int,
        min_tx: int,
        min_ty: int,
        with_cities: bool = True,
        with_urban: bool = True,
        crop_half: Optional[int] = None,
        cx: Optional[int] = None,
        cy: Optional[int] = None
    ) -> Image.Image:
        """
        Draw official IBGE municipal limits and 2022 urban footprint polygons
        directly onto GOES geostationary pixel coordinates.
        """
        w, h = base_img.size
        grid_dim = 5424 if zoom == 5 else 2712
        overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        if crop_half is not None and cx is not None and cy is not None:
            half = crop_half
            def to_img(lat: float, lon: float) -> Tuple[float, float]:
                px, py = latlon_to_geos_xy(lat, lon, grid_dim, grid_dim)
                lx = px - (min_tx * 256)
                ly = py - (min_ty * 256)
                rx = (lx - (cx - half)) / (2.0 * half) * w
                ry = (ly - (cy - half)) / (2.0 * half) * h
                return rx, ry
        else:
            def to_img(lat: float, lon: float) -> Tuple[float, float]:
                px, py = latlon_to_geos_xy(lat, lon, grid_dim, grid_dim)
                rx = px - (min_tx * 256)
                ry = py - (min_ty * 256)
                return rx, ry

        # 1. Municipal limits (IBGE)
        if with_cities:
            mun_data = self._load_mun_geo()
            if mun_data:
                for feat in mun_data.get("features", []):
                    geom = feat.get("geometry", {})
                    coords_list = geom.get("coordinates", [])
                    polys = [coords_list] if geom.get("type") == "Polygon" else coords_list
                    for poly in polys:
                        if not poly or not poly[0]:
                            continue
                        pts = [to_img(lat, lon) for lon, lat in poly[0]]
                        if any(-40 <= p[0] <= w + 40 and -40 <= p[1] <= h + 40 for p in pts):
                            draw.line(pts, fill=(6, 182, 212, 175), width=1)

                # City name labels for close zooms (Hiper / Ultra Local)
                if crop_half is not None and crop_half <= 80:
                    try:
                        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 12)
                    except Exception:
                        font = ImageFont.load_default()

                    label_candidates = []
                    for feat in mun_data.get("features", []):
                        nome = feat.get("properties", {}).get("nome")
                        if not nome:
                            continue
                        geom = feat.get("geometry", {})
                        coords_list = geom.get("coordinates", [])
                        polys = [coords_list] if geom.get("type") == "Polygon" else coords_list
                        for poly in polys:
                            if not poly or not poly[0]:
                                continue
                            pts = [to_img(lat, lon) for lon, lat in poly[0]]
                            avg_x = sum(p[0] for p in pts) / len(pts)
                            avg_y = sum(p[1] for p in pts) / len(pts)
                            if 40 <= avg_x <= w - 40 and 40 <= avg_y <= h - 40:
                                dist = ((avg_x - w / 2.0)**2 + (avg_y - h / 2.0)**2)**0.5
                                label_candidates.append((dist, avg_x, avg_y, nome))

                    label_candidates.sort(key=lambda c: c[0])
                    # Top 12 closest cities to keep view uncluttered and pristine
                    for dist, avg_x, avg_y, nome in label_candidates[:12]:
                        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (0, 0)]:
                            draw.text((avg_x + dx, avg_y + dy), nome, font=font, fill=(0, 0, 0, 240), anchor="mm")
                        is_st = ("edeia" in nome.lower()) or ("edéia" in nome.lower())
                        color = (254, 240, 138, 255) if is_st else (240, 249, 255, 245)
                        draw.text((avg_x, avg_y), nome, font=font, fill=color, anchor="mm")

        # 2. Urbanized Areas (IBGE 2022)
        if with_urban:
            urban_data = self._load_urban_geo()
            if urban_data:
                for feat in urban_data.get("features", []):
                    geom = feat.get("geometry", {})
                    coords_list = geom.get("coordinates", [])
                    polys = [coords_list] if geom.get("type") == "Polygon" else coords_list
                    for poly in polys:
                        if not poly or not poly[0]:
                            continue
                        pts = [to_img(lat, lon) for lon, lat in poly[0]]
                        if any(-20 <= p[0] <= w + 20 and -20 <= p[1] <= h + 20 for p in pts):
                            draw.polygon(pts, fill=(245, 158, 11, 140), outline=(251, 191, 36, 230))

        return Image.alpha_composite(base_img.convert("RGBA"), overlay)

    def get_or_render_cptec_frame(
        self,
        prod_id: str,
        date_str: str,
        time_str: str,
        with_borders: bool = True,
        with_cities: bool = True,
        with_urban: bool = True,
        zoom: int = 2,
        min_tx: Optional[int] = None,
        min_ty: Optional[int] = None,
        tile_count: int = 3,
        crop_half: Optional[int] = None,
        cx: Optional[int] = None,
        cy: Optional[int] = None
    ) -> str:
        """
        Stitch tiles from CPTEC DSAT (s1.cptec.inpe.br) at the given zoom level:
        - zoom=2: Full Disk (678x678)
        - zoom=4: Regional crop (768x768 at 4 km resolution)
        - zoom=5: Local station crop (768x768 at 2 km native ABI IR resolution)
        - zoom=5 with crop_half: Ultra Local crop (~60 km) around station coordinates
        Composites vector borders, municipal limits and IBGE 2022 urban areas.
        """
        suffix = ""
        if with_borders:
            suffix += "_b"
        if with_cities:
            suffix += "_c"
        if with_urban:
            suffix += "_u"

        if zoom == 2 or min_tx is None or min_ty is None:
            cache_name = f"cptec_{prod_id}_{date_str}_{time_str}_z2{suffix}.jpg"
        elif crop_half is not None and cx is not None and cy is not None:
            cache_name = f"cptec_{prod_id}_{date_str}_{time_str}_z{zoom}_tx{min_tx}_ty{min_ty}_c{tile_count}_crop{crop_half}_{cx}_{cy}{suffix}.jpg"
        else:
            cache_name = f"cptec_{prod_id}_{date_str}_{time_str}_z{zoom}_tx{min_tx}_ty{min_ty}_c{tile_count}{suffix}.jpg"

        out_path = os.path.join(CACHE_DIR, cache_name)
        if os.path.exists(out_path) and os.path.getsize(out_path) > 5000:
            return out_path

        # If Full Disk (zoom 2)
        if zoom == 2 or min_tx is None or min_ty is None:
            full_img = Image.new("RGBA", (768, 768), (0, 0, 0, 0))
            with ThreadPoolExecutor(max_workers=9) as ex:
                futures = [ex.submit(self._fetch_satellite_tile, date_str, prod_id, time_str, 2, x, y)
                           for x in range(3) for y in range(3)]
                for fut in futures:
                    x, y, tile = fut.result()
                    full_img.paste(tile, (x * 256, y * 256))

            cropped = full_img.crop((0, 0, 678, 678))
            if with_borders:
                borders_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "img", "cptec_borders_678.png")
                if os.path.exists(borders_file):
                    try:
                        b_img = Image.open(borders_file).convert("RGBA")
                        cropped.paste(b_img, (0, 0), b_img)
                    except Exception:
                        pass
            final_rgb = cropped.convert("RGB")
            final_rgb.save(out_path, quality=92, optimize=True)
            return out_path

        # High-resolution multi-tile crop (zoom 4 or zoom 5)
        stitched = Image.new("RGBA", (tile_count * 256, tile_count * 256), (0, 0, 0, 0))
        with ThreadPoolExecutor(max_workers=tile_count * tile_count) as ex:
            futs = [ex.submit(self._fetch_satellite_tile, date_str, prod_id, time_str, zoom, min_tx + dx, min_ty + dy)
                    for dx in range(tile_count) for dy in range(tile_count)]
            for fut in futs:
                tx, ty, tile = fut.result()
                col = tx - min_tx
                row = ty - min_ty
                stitched.paste(tile, (col * 256, row * 256))

        # Composite CPTEC reference borders (state/national lines)
        if with_borders:
            borders_img = Image.new("RGBA", (tile_count * 256, tile_count * 256), (0, 0, 0, 0))
            with ThreadPoolExecutor(max_workers=tile_count * tile_count) as ex:
                b_futs = [ex.submit(self._get_border_tile, zoom, min_tx + dx, min_ty + dy)
                          for dx in range(tile_count) for dy in range(tile_count)]
                for (dx, dy), fut in zip([(dx, dy) for dx in range(tile_count) for dy in range(tile_count)], b_futs):
                    b_tile = fut.result()
                    borders_img.paste(b_tile, (dx * 256, dy * 256))
            stitched.paste(borders_img, (0, 0), borders_img)

        # Ultra-Local Crop & Upscale (if requested)
        if crop_half is not None and cx is not None and cy is not None:
            max_bound = tile_count * 256
            x0 = max(0, min(max_bound - crop_half * 2, cx - crop_half))
            y0 = max(0, min(max_bound - crop_half * 2, cy - crop_half))
            cropped_box = stitched.crop((x0, y0, x0 + crop_half * 2, y0 + crop_half * 2))
            final_im = cropped_box.resize((max_bound, max_bound), Image.Resampling.LANCZOS)
        else:
            final_im = stitched

        # Draw municipal limits and urban footprint layers
        if with_cities or with_urban:
            final_im = self._draw_municipal_and_urban_layers(
                final_im,
                zoom=zoom,
                min_tx=min_tx,
                min_ty=min_ty,
                with_cities=with_cities,
                with_urban=with_urban,
                crop_half=crop_half,
                cx=cx,
                cy=cy
            )

        final_rgb = final_im.convert("RGB")
        final_rgb.save(out_path, quality=92, optimize=True)
        return out_path

    def get_frames_metadata(self, lat: float = -17.3369, lon: float = -49.9147, delta: float = 2.5,
                            resolution_key: str = "medium", num_frames: int = 8,
                            product_key: str = "cptec_dsa", with_borders: bool = True,
                            with_cities: bool = True, with_urban: bool = True) -> Dict[str, Any]:
        """
        Return GOES-19 frame URLs and exact georeferenced pin coordinates.
        Multi-resolution territorial scaling:
        - delta <= 0.8: Ultra Local (Cidades & Áreas Urbanizadas) -> Zoom 5 com recorte ~60 km
        - 0.8 < delta <= 2.0: Entorno Local (Estação) -> Zoom 5 (2 km resolução nativa ABI)
        - 2.0 < delta <= 5.0: Regional / Estado (Goiás) -> Zoom 4 (4 km resolução)
        - 5.0 < delta <= 12.0: Brasil (Nacional) -> Zoom 2 (Full Disk centrado no Brasil)
        - delta > 12.0: América do Sul -> Zoom 2 (Full Disk hemisférico)
        """
        crop_half = None
        cx = None
        cy = None

        if delta <= 0.35:
            scale_mode = "hiper"
            zoom_level = 5
            grid_dim = 5424
            res_label = "Hiper Local 3x (Recorte ~30 km • Zoom Óptico Máximo ABI)"
        elif delta <= 0.8:
            scale_mode = "ultra"
            zoom_level = 5
            grid_dim = 5424
            res_label = "Ultra Local (Recorte ~60 km • Cidades & Mancha Urbana IBGE)"
        elif delta <= 2.0:
            scale_mode = "local"
            zoom_level = 5
            grid_dim = 5424
            res_label = "2 km (Entorno Local • Zoom 5)"
        elif delta <= 5.0:
            scale_mode = "regional"
            zoom_level = 4
            grid_dim = 2712
            res_label = "4 km (Alta Resolução Regional • Zoom 4)"
        elif delta <= 12.0:
            scale_mode = "brasil"
            zoom_level = 2
            grid_dim = 678
            res_label = "16 km (Full Disk Brasil • Zoom 2)"
        else:
            scale_mode = "fulldisk"
            zoom_level = 2
            grid_dim = 678
            res_label = "16 km (Full Disk América do Sul • Zoom 2)"

        # Calculate station pin position
        if scale_mode in ("hiper", "ultra", "local", "regional"):
            px, py = latlon_to_geos_xy(lat, lon, grid_dim, grid_dim)
            tile_cx = int(px // 256)
            tile_cy = int(py // 256)
            tile_count = 3
            min_tx = tile_cx - 1
            min_ty = tile_cy - 1
            pin_local_x = px - (min_tx * 256)
            pin_local_y = py - (min_ty * 256)

            if scale_mode == "hiper":
                crop_half = 45  # 3.11x zoom increase compared to previous 140
                cx = int(pin_local_x)
                cy = int(pin_local_y)
                pin_x_pct = 50.0
                pin_y_pct = 50.0
            elif scale_mode == "ultra":
                crop_half = 90
                cx = int(pin_local_x)
                cy = int(pin_local_y)
                pin_x_pct = 50.0
                pin_y_pct = 50.0
            else:
                pin_x_pct = round((pin_local_x / (tile_count * 256.0)) * 100, 2)
                pin_y_pct = round((pin_local_y / (tile_count * 256.0)) * 100, 2)
        else:
            st_x, st_y = latlon_to_geos_xy(lat, lon, 1000, 1000)
            pin_x_pct = round(max(1.0, min(99.0, (st_x / 1000.0) * 100)), 2)
            pin_y_pct = round(max(1.0, min(99.0, (st_y / 1000.0) * 100)), 2)
            min_tx = None
            min_ty = None
            tile_count = 3

        # Geographic Center of Brazil (-14° lat, -52° lon)
        br_x, br_y = latlon_to_geos_xy(-14.0, -52.0, 1000, 1000)
        br_x_pct = round((br_x / 1000.0) * 100, 2)
        br_y_pct = round((br_y / 1000.0) * 100, 2)

        frames = []
        prod_meta = PRODUCT_CONFIGS.get(product_key, PRODUCT_CONFIGS["cptec_dsa"])
        source_name = "CPTEC / INPE (DSAT Operacional • s1.cptec.inpe.br)"
        b_flag = "true" if with_borders else "false"
        c_flag = "true" if with_cities else "false"
        u_flag = "true" if with_urban else "false"

        # 1. If product is a CPTEC DSAT Realce
        if prod_meta.get("is_cptec"):
            cptec_id = prod_meta["id"]
            source_name = "CPTEC / INPE (DSAT Operacional • s1.cptec.inpe.br)"
            cptec_times = self.get_cptec_timestamps(cptec_id, num_frames=num_frames)
            for item in cptec_times:
                d = item["date"]
                t = item["time"]
                if scale_mode in ("hiper", "ultra"):
                    frame_url = f"/api/goes/cptec_frame?prod={cptec_id}&date={d}&time={t}&zoom={zoom_level}&min_tx={min_tx}&min_ty={min_ty}&tile_count=3&borders={b_flag}&cities={c_flag}&urban={u_flag}&crop_half={crop_half}&cx={cx}&cy={cy}"
                elif scale_mode in ("local", "regional"):
                    frame_url = f"/api/goes/cptec_frame?prod={cptec_id}&date={d}&time={t}&zoom={zoom_level}&min_tx={min_tx}&min_ty={min_ty}&tile_count=3&borders={b_flag}&cities={c_flag}&urban={u_flag}"
                else:
                    frame_url = f"/api/goes/cptec_frame?prod={cptec_id}&date={d}&time={t}&zoom=2&borders={b_flag}"

                frames.append({
                    "timestamp_raw": f"{d}_{t}",
                    "time_utc": item["utc"],
                    "time_local": item["local"],
                    "time_short": item["time_only_local"],
                    "time_only_utc": item["time_only_utc"],
                    "url": frame_url,
                    "is_cptec": True,
                    "prod_id": cptec_id,
                    "date": d,
                    "time": t,
                    "zoom": zoom_level,
                    "min_tx": min_tx,
                    "min_ty": min_ty,
                    "crop_half": crop_half,
                    "cx": cx,
                    "cy": cy
                })

        # 2. If product is geocolor, prefer INPE STAC
        elif product_key == "geocolor":
            source_name = "INPE STAC (Oficial Brasil • data.inpe.br)"
            inpe_items = self.get_inpe_stac_items(limit=max(num_frames, 8))
            if inpe_items:
                selected_items = inpe_items[-num_frames:] if len(inpe_items) >= num_frames else inpe_items
                for item in selected_items:
                    iso_time = item["properties"].get("datetime", "")
                    fmt = self.format_iso_datetime(iso_time)
                    thumb_url = item["assets"].get("thumbnail", {}).get("href")
                    if thumb_url:
                        frames.append({
                            "timestamp_raw": item["id"],
                            "time_utc": fmt["utc"],
                            "time_local": fmt["local"],
                            "time_short": fmt["time_only_local"],
                            "time_only_utc": fmt["time_only_utc"],
                            "url": thumb_url
                        })

        # 3. Fallback to NOAA STAR Full Disk (FD)
        if not frames:
            source_name = "NOAA STAR Full Disk (GOES-East FD)"
            noaa_times = self.get_noaa_fd_timestamps()
            selected_times = noaa_times[-num_frames:] if len(noaa_times) >= num_frames else noaa_times
            noaa_prod = prod_meta.get("noaa_prod", "GEOCOLOR")
            res_info = RESOLUTIONS.get(resolution_key, RESOLUTIONS["medium"])
            res_code = res_info["code"]

            for t in selected_times:
                url = f"https://cdn.star.nesdis.noaa.gov/GOES19/ABI/FD/{noaa_prod}/{t}_GOES19-ABI-FD-{noaa_prod}-{res_code}.jpg"
                fmt = self.format_noaa_timestamp(t)
                frames.append({
                    "timestamp_raw": t,
                    "time_utc": fmt["utc"],
                    "time_local": fmt["local"],
                    "time_short": fmt["time_only_local"],
                    "time_only_utc": fmt["time_only_utc"],
                    "url": url
                })

        return {
            "satellite": "GOES-19 (ABI Level-2 Full Disk)",
            "source": source_name,
            "stac_collection": "GOES19-L2-CMI-1",
            "inpe_catalog_url": "https://data.inpe.br/stac/browser/collections/GOES19-L2-CMI-1",
            "cptec_dsat_url": "https://www.cptec.inpe.br/dsat/",
            "sector": "Full Disk (Disco Completo • Cobertura Integral do Brasil)",
            "latitude": lat,
            "longitude": lon,
            "pin_x_pct": pin_x_pct,
            "pin_y_pct": pin_y_pct,
            "brazil_center_x_pct": br_x_pct,
            "brazil_center_y_pct": br_y_pct,
            "delta_deg": delta,
            "scale_mode": scale_mode,
            "zoom_level": zoom_level,
            "res_label": res_label,
            "resolution": resolution_key,
            "product": prod_meta,
            "frame_count": len(frames),
            "frames": frames
        }

    def generate_gif(self, lat: float = -17.3369, lon: float = -49.9147, delta: float = 2.5,
                     resolution_key: str = "medium", num_frames: int = 8,
                     product_key: str = "cptec_dsa", duration_ms: int = 300,
                     location_label: str = "Edéia - GO", with_borders: bool = True,
                     with_cities: bool = True, with_urban: bool = True) -> Tuple[str, str]:
        """
        Generate and save an animated GIF of real GOES satellite imagery.
        Multi-resolution territorial scaling:
        - delta <= 0.8: Ultra Local (Cidades & IBGE) -> Zoom 5 com recorte ~60 km
        - 0.8 < delta <= 2.0: Entorno Local (Estação) -> Zoom 5 (2 km resolução nativa ABI)
        - 2.0 < delta <= 5.0: Regional / Estado (Goiás) -> Zoom 4 (4 km resolução)
        - 5.0 < delta <= 12.0: Brasil (Nacional) -> Zoom 2
        - delta > 12.0: América do Sul (Full Disk) -> Zoom 2
        """
        meta = self.get_frames_metadata(lat=lat, lon=lon, delta=delta,
                                        resolution_key=resolution_key,
                                        num_frames=num_frames,
                                        product_key=product_key,
                                        with_borders=with_borders,
                                        with_cities=with_cities,
                                        with_urban=with_urban)
        frames_list = meta.get("frames", [])
        if not frames_list:
            raise RuntimeError("Nenhum dado temporal de satélite GOES disponível no momento.")

        scale_mode = meta.get("scale_mode", "local")
        last_id = frames_list[-1]["timestamp_raw"]
        b_tag = "_b" if with_borders else ""
        c_tag = "_c" if with_cities else ""
        u_tag = "_u" if with_urban else ""
        cache_filename = f"goes19_{product_key}_{len(frames_list)}f_{last_id}_{lat:.2f}_{lon:.2f}_d{delta:.1f}_{scale_mode}{b_tag}{c_tag}{u_tag}.gif"
        cache_path = os.path.join(CACHE_DIR, cache_filename)
        rel_url = f"/api/goes/download/{cache_filename}"

        if os.path.exists(cache_path) and os.path.getsize(cache_path) > 5000:
            return cache_path, rel_url

        processed_images = []
        out_size = 512

        # Geographic coordinates for centering Full Disk
        st_x, st_y = latlon_to_geos_xy(lat, lon, out_size, out_size)
        br_x, br_y = latlon_to_geos_xy(-14.0, -52.0, out_size, out_size)

        for i, fr in enumerate(frames_list):
            try:
                if fr.get("is_cptec") or fr.get("url", "").startswith("/api/goes/cptec_frame"):
                    local_p = self.get_or_render_cptec_frame(
                        prod_id=fr.get("prod_id", "ch13_cpt_DSA"),
                        date_str=fr.get("date", ""),
                        time_str=fr.get("time", ""),
                        with_borders=with_borders,
                        with_cities=with_cities,
                        with_urban=with_urban,
                        zoom=fr.get("zoom", 2),
                        min_tx=fr.get("min_tx"),
                        min_ty=fr.get("min_ty"),
                        tile_count=3,
                        crop_half=fr.get("crop_half"),
                        cx=fr.get("cx"),
                        cy=fr.get("cy")
                    )
                    im = Image.open(local_p).convert("RGBA")
                else:
                    req = urllib.request.Request(fr["url"], headers={'User-Agent': 'Mozilla/5.0 MyWeatherNow/1.0'})
                    with urllib.request.urlopen(req, timeout=10, context=SSL_CTX) as resp:
                        img_data = resp.read()
                    im = Image.open(BytesIO(img_data)).convert("RGBA")
            except Exception as e:
                print(f"Error loading frame {fr.get('url')}: {e}")
                continue

            w, h = im.size
            cur_st_x, cur_st_y = latlon_to_geos_xy(lat, lon, w, h)
            cur_br_x, cur_br_y = latlon_to_geos_xy(-14.0, -52.0, w, h)

            # Determine crop / framing based on territorial scale
            if scale_mode == "hiper":
                final_im = im.resize((out_size, out_size), Image.Resampling.LANCZOS)
                target_pin_x = (meta["pin_x_pct"] / 100.0) * out_size
                target_pin_y = (meta["pin_y_pct"] / 100.0) * out_size
                scale_title = f"Hiper Local 3x (~30 km) • {location_label}"
            elif scale_mode == "ultra":
                final_im = im.resize((out_size, out_size), Image.Resampling.LANCZOS)
                target_pin_x = (meta["pin_x_pct"] / 100.0) * out_size
                target_pin_y = (meta["pin_y_pct"] / 100.0) * out_size
                scale_title = f"Ultra Local (IBGE) • {location_label}"
            elif scale_mode == "local":
                final_im = im.resize((out_size, out_size), Image.Resampling.LANCZOS)
                target_pin_x = (meta["pin_x_pct"] / 100.0) * out_size
                target_pin_y = (meta["pin_y_pct"] / 100.0) * out_size
                scale_title = f"Entorno Local (2 km) • {location_label}"
            elif scale_mode == "regional":
                # 2. Regional / Estado (Goiás) - Already native Zoom 4 (4 km resolution)
                final_im = im.resize((out_size, out_size), Image.Resampling.LANCZOS)
                target_pin_x = (meta["pin_x_pct"] / 100.0) * out_size
                target_pin_y = (meta["pin_y_pct"] / 100.0) * out_size
                scale_title = f"Regional (4 km) • {location_label}"
            elif scale_mode == "brasil":
                # 3. Brasil (Nacional - todo o território brasileiro)
                box_rad = int(125 * (w / 512.0))
                x0 = max(0, int(cur_br_x - box_rad))
                y0 = max(0, int(cur_br_y - box_rad))
                x1 = min(w, int(cur_br_x + box_rad))
                y1 = min(h, int(cur_br_y + box_rad))
                cropped = im.crop((x0, y0, x1, y1))
                target_pin_x = (cur_st_x - x0) / (x1 - x0) * out_size
                target_pin_y = (cur_st_y - y0) / (y1 - y0) * out_size
                final_im = cropped.resize((out_size, out_size), Image.Resampling.LANCZOS)
                scale_title = "Brasil (Nacional • Todo o País)"
            else:
                # 4. América do Sul (Full Disk)
                target_pin_x = cur_st_x / w * out_size
                target_pin_y = cur_st_y / h * out_size
                final_im = im.resize((out_size, out_size), Image.Resampling.LANCZOS)
                scale_title = "América do Sul • Full Disk"

            # Draw HUD, station pin & branding
            draw = ImageDraw.Draw(final_im)

            # Draw station pin if inside frame
            if 0 <= target_pin_x <= out_size and 0 <= target_pin_y <= out_size:
                r = 7
                draw.ellipse([target_pin_x - r, target_pin_y - r, target_pin_x + r, target_pin_y + r],
                             outline=(6, 182, 212), width=3)
                draw.ellipse([target_pin_x - 2, target_pin_y - 2, target_pin_x + 2, target_pin_y + 2],
                             fill=(255, 255, 255))
                draw.rectangle([target_pin_x + 8, target_pin_y - 10, target_pin_x + 100, target_pin_y + 8],
                               fill=(10, 15, 30, 220), outline=(6, 182, 212))
                draw.text((target_pin_x + 12, target_pin_y - 8), location_label, fill=(255, 255, 255))

            # Top Header HUD
            time_local = fr["time_short"]
            time_utc = fr["time_only_utc"]
            draw.rectangle([8, 8, 300, 34], fill=(10, 15, 30, 230), outline=(6, 182, 212))
            draw.text((14, 13), f"INPE GOES-19 • {scale_title}", fill=(56, 189, 248))

            draw.rectangle([out_size - 130, 8, out_size - 8, 34], fill=(10, 15, 30, 230), outline=(16, 185, 129))
            draw.text((out_size - 122, 13), f"{time_local}", fill=(16, 185, 129))

            # Bottom info bar
            draw.rectangle([8, out_size - 28, out_size - 8, out_size - 8], fill=(6, 10, 22, 230))
            draw.text((14, out_size - 24), f"MyWeatherNow • CPTEC DSAT • {time_utc}", fill=(148, 163, 184))

            processed_images.append(final_im.convert("RGB"))

        if not processed_images:
            raise RuntimeError("Falha ao processar quadros para o GIF temporal.")

        processed_images[0].save(
            cache_path,
            save_all=True,
            append_images=processed_images[1:],
            duration=duration_ms,
            loop=0,
            optimize=True
        )

        return cache_path, rel_url


goes_service = GoesService()
