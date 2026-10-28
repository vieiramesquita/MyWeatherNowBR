import datetime
import httpx
from typing import Dict, Any, Optional

WMO_WEATHER_CODES = {
    0: {"desc": "Céu limpo", "icon": "clear-day", "badge": "Ensolarado / Limpo"},
    1: {"desc": "Principalmente limpo", "icon": "mainly-clear", "badge": "Predomínio de Sol"},
    2: {"desc": "Parcialmente nublado", "icon": "partly-cloudy", "badge": "Parcialmente Nublado"},
    3: {"desc": "Encoberto", "icon": "overcast", "badge": "Céu Encoberto"},
    45: {"desc": "Nevoeiro", "icon": "fog", "badge": "Nevoeiro"},
    48: {"desc": "Nevoeiro com geada", "icon": "fog", "badge": "Nevoeiro com Geada"},
    51: {"desc": "Garoa leve", "icon": "drizzle", "badge": "Garoa Fraca"},
    53: {"desc": "Garoa moderada", "icon": "drizzle", "badge": "Garoa"},
    55: {"desc": "Garoa densa", "icon": "drizzle", "badge": "Garoa Forte"},
    61: {"desc": "Chuva fraca", "icon": "rain-light", "badge": "Chuva Leve"},
    63: {"desc": "Chuva moderada", "icon": "rain", "badge": "Chuva Moderada"},
    65: {"desc": "Chuva forte", "icon": "rain-heavy", "badge": "Chuva Forte"},
    66: {"desc": "Chuva congelante leve", "icon": "sleet", "badge": "Chuva Fria"},
    67: {"desc": "Chuva congelante forte", "icon": "sleet", "badge": "Chuva Fria Intensa"},
    71: {"desc": "Queda de neve leve", "icon": "snow", "badge": "Neve Fraca"},
    73: {"desc": "Queda de neve moderada", "icon": "snow", "badge": "Neve Moderada"},
    75: {"desc": "Queda de neve forte", "icon": "snow", "badge": "Neve Intensa"},
    80: {"desc": "Pancadas de chuva leves", "icon": "showers", "badge": "Pancadas Isoladas"},
    81: {"desc": "Pancadas de chuva moderadas", "icon": "showers", "badge": "Pancadas de Chuva"},
    82: {"desc": "Pancadas de chuva violentas", "icon": "showers-heavy", "badge": "Pancadas Fortes"},
    95: {"desc": "Tempestade com trovões", "icon": "thunderstorm", "badge": "Trovoada / Tempestade"},
    96: {"desc": "Tempestade com granizo leve", "icon": "thunderstorm-hail", "badge": "Tempestade com Granizo"},
    99: {"desc": "Tempestade com granizo forte", "icon": "thunderstorm-hail", "badge": "Tempestade Severa"},
}


def get_weather_info(code: Optional[int], is_day: bool = True) -> Dict[str, str]:
    if code is None:
        return {"desc": "Desconhecido", "icon": "unknown", "badge": "Tempo Estável"}
    info = dict(WMO_WEATHER_CODES.get(code, {"desc": "Instável", "icon": "cloudy", "badge": "Instável"}))
    if not is_day:
        if info["icon"] in ("clear-day", "mainly-clear"):
            info["icon"] = "clear-night"
        elif info["icon"] == "partly-cloudy":
            info["icon"] = "partly-cloudy-night"
    return info


class OpenMeteoService:
    def __init__(self):
        self.base_url = "https://api.open-meteo.com/v1/forecast"

    async def get_forecast(self, lat: float, lon: float) -> Dict[str, Any]:
        """Fetch comprehensive Open-Meteo forecast + past 24h telemetry + atmospheric intelligence."""
        params = {
            "latitude": lat,
            "longitude": lon,
            "current": (
                "temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,is_day,"
                "precipitation,rain,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,"
                "pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,"
                "shortwave_radiation,direct_normal_irradiance,diffuse_radiation,uv_index,visibility,cape,vapour_pressure_deficit"
            ),
            "hourly": (
                "temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,"
                "precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,"
                "cloud_cover,shortwave_radiation,et0_fao_evapotranspiration,vapour_pressure_deficit,cape,uv_index,is_day"
            ),
            "daily": (
                "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,"
                "sunrise,sunset,daylight_duration,sunshine_duration,precipitation_sum,precipitation_probability_max,"
                "wind_speed_10m_max,wind_direction_10m_dominant,uv_index_max,et0_fao_evapotranspiration"
            ),
            "timezone": "America/Sao_Paulo",
            "past_days": 1,
            "forecast_days": 7,
        }

        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(self.base_url, params=params)
            resp.raise_for_status()
            raw = resp.json()

        curr = raw.get("current", {})
        is_day_curr = curr.get("is_day", 1) == 1
        w_info = get_weather_info(curr.get("weather_code"), is_day_curr)
        shortwave_w = curr.get("shortwave_radiation") or 0.0
        solar_rad_kj = round(shortwave_w * 3.6, 1)

        hourly_raw = raw.get("hourly", {})
        times = hourly_raw.get("time", [])
        h_temps = hourly_raw.get("temperature_2m", [])
        h_hum = hourly_raw.get("relative_humidity_2m", [])
        h_dew = hourly_raw.get("dew_point_2m", [])
        h_app = hourly_raw.get("apparent_temperature", [])
        h_rain_prob = hourly_raw.get("precipitation_probability", [])
        h_rain = hourly_raw.get("precipitation", [])
        h_code = hourly_raw.get("weather_code", [])
        h_press = hourly_raw.get("surface_pressure", [])
        h_wind = hourly_raw.get("wind_speed_10m", [])
        h_wdir = hourly_raw.get("wind_direction_10m", [])
        h_gust = hourly_raw.get("wind_gusts_10m", [])
        h_cloud = hourly_raw.get("cloud_cover", [])
        h_rad = hourly_raw.get("shortwave_radiation", [])
        h_et0 = hourly_raw.get("et0_fao_evapotranspiration", [])
        h_vpd = hourly_raw.get("vapour_pressure_deficit", [])
        h_cape = hourly_raw.get("cape", [])
        h_is_day = hourly_raw.get("is_day", [])

        curr_time = curr.get("time", "")
        start_idx = 0
        if curr_time:
            curr_hour = curr_time[:13] + ":00"
            if curr_hour in times:
                start_idx = times.index(curr_hour)
            else:
                for idx, t in enumerate(times):
                    if t >= curr_hour:
                        start_idx = idx
                        break

        et0_curr_hour = 0.0
        if start_idx < len(h_et0) and h_et0[start_idx] is not None:
            et0_curr_hour = round(h_et0[start_idx], 2)

        surface_press = curr.get("surface_pressure")
        if surface_press is None:
            surface_press = curr.get("pressure_msl", 1013.25)

        current_formatted = {
            "time": curr_time,
            "temperature": round(curr.get("temperature_2m", 0.0), 1) if curr.get("temperature_2m") is not None else None,
            "apparent_temperature": round(curr.get("apparent_temperature", 0.0), 1) if curr.get("apparent_temperature") is not None else None,
            "humidity": curr.get("relative_humidity_2m"),
            "relative_humidity": curr.get("relative_humidity_2m"),
            "dew_point": round(curr.get("dew_point_2m", 0.0), 1) if curr.get("dew_point_2m") is not None else None,
            "is_day": is_day_curr,
            "precipitation": curr.get("precipitation") or 0.0,
            "rain": curr.get("rain") or 0.0,
            "cloud_cover": curr.get("cloud_cover"),
            "cloud_cover_low": curr.get("cloud_cover_low"),
            "cloud_cover_mid": curr.get("cloud_cover_mid"),
            "cloud_cover_high": curr.get("cloud_cover_high"),
            "pressure": round(surface_press, 1) if surface_press is not None else None,
            "surface_pressure": round(surface_press, 1) if surface_press is not None else None,
            "pressure_msl": round(curr.get("pressure_msl", 1013.25), 1) if curr.get("pressure_msl") is not None else None,
            "wind_speed": round(curr.get("wind_speed_10m", 0.0), 1),
            "wind_gusts": round(curr.get("wind_gusts_10m", 0.0), 1),
            "wind_direction": curr.get("wind_direction_10m"),
            "visibility": curr.get("visibility"),
            "uv_index": round(curr.get("uv_index", 0.0), 1) if curr.get("uv_index") is not None else 0.0,
            "cape": round(curr.get("cape", 0.0), 0) if curr.get("cape") is not None else 0,
            "vpd": round(curr.get("vapour_pressure_deficit", 0.0), 2) if curr.get("vapour_pressure_deficit") is not None else 0.0,
            "et0_hour": et0_curr_hour,
            "shortwave_radiation": round(shortwave_w, 1),
            "solar_radiation": solar_rad_kj,
            "solar_radiation_kj_m2": solar_rad_kj,
            "weather_code": curr.get("weather_code"),
            "weather_desc": w_info["desc"],
            "weather_icon": w_info["icon"],
            "weather_badge": w_info["badge"],
        }

        # Build past_24h telemetry series (chronological up to start_idx)
        past_start = max(0, start_idx - 23)
        past_24h = []
        for i in range(past_start, min(len(times), start_idx + 1)):
            t_str = times[i]
            try:
                dt_brt = datetime.datetime.fromisoformat(t_str)
                dt_utc = dt_brt + datetime.timedelta(hours=3)
                date_brt = dt_brt.strftime("%d/%m/%Y")
                hour_brt = dt_brt.strftime("%H:%M")
                date_utc = dt_utc.strftime("%d/%m/%Y")
                hour_utc = dt_utc.strftime("%H:%M")
            except Exception:
                date_brt = t_str[:10]
                hour_brt = t_str.split("T")[-1] if "T" in t_str else t_str
                date_utc = "--"
                hour_utc = "--"

            t_val = round(h_temps[i], 1) if i < len(h_temps) and h_temps[i] is not None else None
            w_kmh = h_wind[i] if i < len(h_wind) and h_wind[i] is not None else None
            g_kmh = h_gust[i] if i < len(h_gust) and h_gust[i] is not None else None
            rad_w_i = h_rad[i] if i < len(h_rad) and h_rad[i] is not None else 0.0

            past_24h.append({
                "has_data": True,
                "source": "openmeteo",
                "date_brt": date_brt,
                "hour_brt": hour_brt,
                "date_utc": date_utc,
                "hour_utc": hour_utc,
                "temp_ins": t_val,
                "temp_max": t_val,
                "temp_min": t_val,
                "thermal_sensation": round(h_app[i], 1) if i < len(h_app) and h_app[i] is not None else t_val,
                "dew_point": round(h_dew[i], 1) if i < len(h_dew) and h_dew[i] is not None else None,
                "humidity_ins": h_hum[i] if i < len(h_hum) else None,
                "pressure_ins": round(h_press[i], 1) if i < len(h_press) and h_press[i] is not None else None,
                "wind_speed": round(w_kmh / 3.6, 1) if w_kmh is not None else None,
                "wind_dir": h_wdir[i] if i < len(h_wdir) else None,
                "wind_gust": round(g_kmh / 3.6, 1) if g_kmh is not None else None,
                "rain": round(h_rain[i], 1) if i < len(h_rain) and h_rain[i] is not None else 0.0,
                "solar_radiation": round(rad_w_i * 3.6, 1),
                "vpd": round(h_vpd[i], 2) if i < len(h_vpd) and h_vpd[i] is not None else None,
                "et0": round(h_et0[i], 2) if i < len(h_et0) and h_et0[i] is not None else None,
                "cape": round(h_cape[i], 0) if i < len(h_cape) and h_cape[i] is not None else 0,
            })

        # Format next 24 hourly forecast items starting from start_idx
        hourly_formatted = []
        for i in range(start_idx, min(len(times), start_idx + 24)):
            t_str = times[i]
            hour_display = t_str.split("T")[-1] if "T" in t_str else t_str
            c = h_code[i] if i < len(h_code) else 0
            day_flag = (h_is_day[i] == 1) if i < len(h_is_day) else True
            info = get_weather_info(c, day_flag)
            rad_w_i = h_rad[i] if i < len(h_rad) and h_rad[i] is not None else 0.0
            hourly_formatted.append({
                "time_iso": t_str,
                "hour": hour_display,
                "temp": round(h_temps[i], 1) if i < len(h_temps) and h_temps[i] is not None else None,
                "humidity": h_hum[i] if i < len(h_hum) and h_hum[i] is not None else None,
                "rain_prob": h_rain_prob[i] if i < len(h_rain_prob) and h_rain_prob[i] is not None else 0,
                "rain_mm": round(h_rain[i], 1) if i < len(h_rain) and h_rain[i] is not None else 0.0,
                "wind_speed": round(h_wind[i], 1) if i < len(h_wind) and h_wind[i] is not None else None,
                "cloud_cover": h_cloud[i] if i < len(h_cloud) and h_cloud[i] is not None else None,
                "shortwave_radiation": round(rad_w_i, 1),
                "solar_radiation_kj_m2": round(rad_w_i * 3.6, 1),
                "is_day": day_flag,
                "weather_code": c,
                "weather_icon": info["icon"],
                "weather_desc": info["desc"],
            })

        # Format daily forecast (7 days starting strictly from today in BRT)
        daily_raw = raw.get("daily", {})
        d_times = daily_raw.get("time", [])
        d_codes = daily_raw.get("weather_code", [])
        d_tmax = daily_raw.get("temperature_2m_max", [])
        d_tmin = daily_raw.get("temperature_2m_min", [])
        d_app_max = daily_raw.get("apparent_temperature_max", [])
        d_app_min = daily_raw.get("apparent_temperature_min", [])
        d_sunrise = daily_raw.get("sunrise", [])
        d_sunset = daily_raw.get("sunset", [])
        d_daylight = daily_raw.get("daylight_duration", [])
        d_sunshine = daily_raw.get("sunshine_duration", [])
        d_rain_sum = daily_raw.get("precipitation_sum", [])
        d_rain_prob = daily_raw.get("precipitation_probability_max", [])
        d_wind_max = daily_raw.get("wind_speed_10m_max", [])
        d_wind_dir = daily_raw.get("wind_direction_10m_dominant", [])
        d_uv = daily_raw.get("uv_index_max", [])
        d_et0 = daily_raw.get("et0_fao_evapotranspiration", [])

        today_str = curr_time[:10] if curr_time and len(curr_time) >= 10 else ""
        day_start_idx = 0
        if today_str:
            for idx, dt_s in enumerate(d_times):
                if dt_s >= today_str:
                    day_start_idx = idx
                    break

        weekdays_pt = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
        daily_formatted = []
        for rel_i, i in enumerate(range(day_start_idx, min(len(d_times), day_start_idx + 7))):
            date_str = d_times[i]
            try:
                dt = datetime.date.fromisoformat(date_str)
                weekday_name = "Hoje" if rel_i == 0 else ("Amanhã" if rel_i == 1 else weekdays_pt[dt.weekday()])
                date_formatted = f"{dt.day:02d}/{dt.month:02d}"
            except Exception:
                weekday_name = date_str
                date_formatted = date_str

            c = d_codes[i] if i < len(d_codes) else 0
            info = get_weather_info(c, True)

            daily_formatted.append({
                "date": date_str,
                "date_formatted": date_formatted,
                "weekday": weekday_name,
                "temp_max": round(d_tmax[i], 1) if i < len(d_tmax) and d_tmax[i] is not None else None,
                "temp_min": round(d_tmin[i], 1) if i < len(d_tmin) and d_tmin[i] is not None else None,
                "apparent_max": round(d_app_max[i], 1) if i < len(d_app_max) and d_app_max[i] is not None else None,
                "apparent_min": round(d_app_min[i], 1) if i < len(d_app_min) and d_app_min[i] is not None else None,
                "precipitation_sum": round(d_rain_sum[i], 1) if i < len(d_rain_sum) and d_rain_sum[i] is not None else 0.0,
                "rain_sum": round(d_rain_sum[i], 1) if i < len(d_rain_sum) and d_rain_sum[i] is not None else 0.0,
                "rain_prob_max": d_rain_prob[i] if i < len(d_rain_prob) and d_rain_prob[i] is not None else 0,
                "wind_speed_max": round(d_wind_max[i], 1) if i < len(d_wind_max) and d_wind_max[i] is not None else None,
                "wind_direction_deg": d_wind_dir[i] if i < len(d_wind_dir) else None,
                "uv_index_max": round(d_uv[i], 1) if i < len(d_uv) and d_uv[i] is not None else None,
                "et0_sum": round(d_et0[i], 2) if i < len(d_et0) and d_et0[i] is not None else None,
                "daylight_duration": d_daylight[i] if i < len(d_daylight) else None,
                "sunshine_duration": d_sunshine[i] if i < len(d_sunshine) else None,
                "sunrise": d_sunrise[i].split("T")[-1] if i < len(d_sunrise) and d_sunrise[i] and "T" in d_sunrise[i] else "",
                "sunset": d_sunset[i].split("T")[-1] if i < len(d_sunset) and d_sunset[i] and "T" in d_sunset[i] else "",
                "weather_code": c,
                "weather_icon": info["icon"],
                "weather_desc": info["desc"],
                "weather_badge": info["badge"],
            })

        return {
            "latitude": lat,
            "longitude": lon,
            "elevation": raw.get("elevation"),
            "timezone": raw.get("timezone", "America/Sao_Paulo"),
            "current": current_formatted,
            "past_24h": past_24h,
            "hourly": hourly_formatted,
            "daily": daily_formatted,
        }


openmeteo_service = OpenMeteoService()
