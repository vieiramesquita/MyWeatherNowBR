#!/usr/bin/env python3
"""
Real-time INMET Station Telemetry Synchronizer for MyWeatherNow.
Fetches 24-hour meteorological observations directly from INMET's official portal
and generates fresh JSON payloads for the GitHub Pages static client.
"""

import os
import sys
import json
import time
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from app.inmet_service import inmet_service

TARGET_STATIONS = ["A029", "A002", "A025", "A001", "A701", "A652", "A801"]
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "static", "data", "stations")

async def sync_stations(stations: List[str] = TARGET_STATIONS):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    inmet_service.load_stations()
    print(f"[*] Starting Real-Time INMET Station Sync for {len(stations)} stations...")

    synced_count = 0
    for code in stations:
        code_upper = code.upper()
        print(f"[*] Fetching live observations for station {code_upper}...")
        try:
            data = await inmet_service.get_station_data(code_upper, force_refresh=True)
            if data and data.get("latest", {}).get("has_data"):
                out_path = os.path.join(OUTPUT_DIR, f"station_{code_upper}.json")
                with open(out_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                lat = data["latest"]
                print(f"[OK] {code_upper} -> Temp: {lat.get('temp_ins')}°C, Hum: {lat.get('humidity_ins')}%, Time: {lat.get('reading_timestamp')}")
                synced_count += 1
            else:
                print(f"[WARN] {code_upper} returned no valid real-time records: {data.get('fetch_warning')}")
        except Exception as e:
            print(f"[ERR] Failed to sync {code_upper}: {e}")

    print(f"\n[DONE] Successfully synced {synced_count}/{len(stations)} physical INMET stations to {OUTPUT_DIR}")

if __name__ == "__main__":
    st_args = sys.argv[1:] if len(sys.argv) > 1 else TARGET_STATIONS
    asyncio.run(sync_stations(st_args))

