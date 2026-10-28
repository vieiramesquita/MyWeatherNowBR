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

def get_weather_info(code: Optional[int]) -> Dict[str, str]:
    if code is None:
        return {"desc": "Desconhecido", "icon": "unknown", "badge": "Tempo Estável"}
    return WMO_WEATHER_CODES.get(code, {"desc": "Instável", "icon": "cloudy", "badge": "Instável"})

class OpenMeteoService:
    def __init__(self):
        self.base_url = "https://api.open-meteo.com/v1/forecast"

    async def get_forecast(self, lat: float, lon: float) -> Dict[str, Any]:
        """Fetch comprehensive Open-Meteo forecast for the given coordinate."""
        params = {
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,shortwave_radiation,direct_normal_irradiance,diffuse_radiation",
            "hourly": "temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,cloud_cover,shortwave_radiation",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,uv_index_max",
            "timezone": "America/Sao_Paulo",
            "forecast_days": 7
        }

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(self.base_url, params=params)
            resp.raise_for_status()
            raw = resp.json()

        # Format current weather
        curr = raw.get("current", {})
        w_info = get_weather_info(curr.get("weather_code"))
        shortwave_w = curr.get("shortwave_radiation", 0.0)
        if shortwave_w is None:
            shortwave_w = 0.0
        # 1 W/m² = 3.6 kJ/m² por hora acumulada
        solar_rad_kj = round(shortwave_w * 3.6, 1)

        current_formatted = {
            "time": curr.get("time"),
            "temperature": round(curr.get("temperature_2m", 0.0), 1),
            "apparent_temperature": round(curr.get("apparent_temperature", 0.0), 1),
            "humidity": curr.get("relative_humidity_2m"),
            "is_day": curr.get("is_day") == 1,
            "precipitation": curr.get("precipitation", 0.0),
            "rain": curr.get("rain", 0.0),
            "cloud_cover": curr.get("cloud_cover"),
            "pressure": round(curr.get("surface_pressure", curr.get("pressure_msl", 1013.25)), 1),
            "wind_speed": round(curr.get("wind_speed_10m", 0.0), 1),
            "wind_gusts": round(curr.get("wind_gusts_10m", 0.0), 1),
            "wind_direction": curr.get("wind_direction_10m"),
            "shortwave_radiation": round(shortwave_w, 1),
            "solar_radiation": solar_rad_kj,
            "solar_radiation_kj_m2": solar_rad_kj,
            "weather_code": curr.get("weather_code"),
            "weather_desc": w_info["desc"],
            "weather_icon": w_info["icon"],
            "weather_badge": w_info["badge"],
        }

        # Format next 24 hourly forecast items starting from now
        hourly_raw = raw.get("hourly", {})
        times = hourly_raw.get("time", [])
        h_temps = hourly_raw.get("temperature_2m", [])
        h_hum = hourly_raw.get("relative_humidity_2m", [])
        h_rain_prob = hourly_raw.get("precipitation_probability", [])
        h_rain = hourly_raw.get("precipitation", [])
        h_code = hourly_raw.get("weather_code", [])
        h_wind = hourly_raw.get("wind_speed_10m", [])
        h_cloud = hourly_raw.get("cloud_cover", [])

        h_rad = hourly_raw.get("shortwave_radiation", [])

        # Find current hour index: curr_time pode ser ex: '2026-10-27T14:45'
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

        hourly_formatted = []
        for i in range(start_idx, min(len(times), start_idx + 24)):
            t_str = times[i]
            # Time format: '2026-10-02T14:00' -> '14:00'
            hour_display = t_str.split("T")[-1] if "T" in t_str else t_str
            c = h_code[i] if i < len(h_code) else 0
            info = get_weather_info(c)
            rad_w = h_rad[i] if i < len(h_rad) and h_rad[i] is not None else 0.0
            hourly_formatted.append({
                "time_iso": t_str,
                "hour": hour_display,
                "temp": round(h_temps[i], 1) if i < len(h_temps) and h_temps[i] is not None else None,
                "humidity": h_hum[i] if i < len(h_hum) and h_hum[i] is not None else None,
                "rain_prob": h_rain_prob[i] if i < len(h_rain_prob) and h_rain_prob[i] is not None else 0,
                "rain_mm": round(h_rain[i], 1) if i < len(h_rain) and h_rain[i] is not None else 0.0,
                "wind_speed": round(h_wind[i], 1) if i < len(h_wind) and h_wind[i] is not None else None,
                "cloud_cover": h_cloud[i] if i < len(h_cloud) and h_cloud[i] is not None else None,
                "shortwave_radiation": round(rad_w, 1),
                "solar_radiation_kj_m2": round(rad_w * 3.6, 1),
                "weather_code": c,
                "weather_icon": info["icon"],
                "weather_desc": info["desc"]
            })

        # Format daily forecast (7 days)
        daily_raw = raw.get("daily", {})
        d_times = daily_raw.get("time", [])
        d_codes = daily_raw.get("weather_code", [])
        d_tmax = daily_raw.get("temperature_2m_max", [])
        d_tmin = daily_raw.get("temperature_2m_min", [])
        d_app_max = daily_raw.get("apparent_temperature_max", [])
        d_app_min = daily_raw.get("apparent_temperature_min", [])
        d_sunrise = daily_raw.get("sunrise", [])
        d_sunset = daily_raw.get("sunset", [])
        d_rain_sum = daily_raw.get("precipitation_sum", [])
        d_rain_prob = daily_raw.get("precipitation_probability_max", [])
        d_uv = daily_raw.get("uv_index_max", [])

        # Weekday names in Portuguese
        weekdays_pt = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]

        daily_formatted = []
        for i in range(len(d_times)):
            date_str = d_times[i]
            # Calculate day of week
            import datetime
            try:
                dt = datetime.date.fromisoformat(date_str)
                weekday_name = "Hoje" if i == 0 else ("Amanhã" if i == 1 else weekdays_pt[dt.weekday()])
                date_formatted = f"{dt.day:02d}/{dt.month:02d}"
            except Exception:
                weekday_name = date_str
                date_formatted = date_str

            c = d_codes[i] if i < len(d_codes) else 0
            info = get_weather_info(c)

            daily_formatted.append({
                "date": date_str,
                "date_formatted": date_formatted,
                "weekday": weekday_name,
                "temp_max": round(d_tmax[i], 1) if i < len(d_tmax) else None,
                "temp_min": round(d_tmin[i], 1) if i < len(d_tmin) else None,
                "apparent_max": round(d_app_max[i], 1) if i < len(d_app_max) else None,
                "apparent_min": round(d_app_min[i], 1) if i < len(d_app_min) else None,
                "precipitation_sum": round(d_rain_sum[i], 1) if i < len(d_rain_sum) else 0.0,
                "rain_sum": round(d_rain_sum[i], 1) if i < len(d_rain_sum) else 0.0,
                "rain_prob_max": d_rain_prob[i] if i < len(d_rain_prob) else 0,
                "uv_index_max": round(d_uv[i], 1) if i < len(d_uv) and d_uv[i] is not None else None,
                "sunrise": d_sunrise[i].split("T")[-1] if i < len(d_sunrise) and "T" in d_sunrise[i] else "",
                "sunset": d_sunset[i].split("T")[-1] if i < len(d_sunset) and "T" in d_sunset[i] else "",
                "weather_code": c,
                "weather_icon": info["icon"],
                "weather_desc": info["desc"],
                "weather_badge": info["badge"]
            })

        return {
            "latitude": lat,
            "longitude": lon,
            "elevation": raw.get("elevation"),
            "timezone": raw.get("timezone", "America/Sao_Paulo"),
            "current": current_formatted,
            "hourly": hourly_formatted,
            "daily": daily_formatted
        }

openmeteo_service = OpenMeteoService()
