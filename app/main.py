import os
import asyncio
from typing import Optional
from fastapi import FastAPI, Query, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.inmet_service import inmet_service
from app.openmeteo_service import openmeteo_service
from app.goes_service import goes_service, CACHE_DIR as GOES_CACHE_DIR

app = FastAPI(
    title="MyWeatherNow",
    description="Dashboard Meteorológico Integrado: INMET, Open-Meteo e Satélite GOES-16",
    version="1.0.0"
)

# Enable CORS for local dev / widget embedding
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_cache_control_header(request, call_next):
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# Background task for 1h periodic INMET station refresh
async def hourly_background_worker():
    """Runs continuously in the background, updating INMET station data every 1 hour (3600s)."""
    while True:
        try:
            # Sleep 1 hour
            await asyncio.sleep(3600)
            active_code = inmet_service.active_station_code
            print(f"[Worker] Running hourly auto-refresh for INMET station {active_code}...")
            await inmet_service.get_station_data(active_code, force_refresh=True)
            print(f"[Worker] Completed hourly update for {active_code} successfully.")
        except Exception as e:
            print(f"[Worker] Hourly update error: {e}")
            await asyncio.sleep(60)

@app.on_event("startup")
async def on_startup():
    # Warm up default station (A029 - Edéia)
    asyncio.create_task(inmet_service.get_station_data("A029"))
    # Start the 1h recurring background task
    asyncio.create_task(hourly_background_worker())

# ----------------- INMET Endpoints -----------------

@app.get("/api/stations")
async def list_stations(
    q: str = Query("", description="Termo de busca (nome, código ou UF)"),
    lat: Optional[float] = Query(None, description="Latitude para ordenação por proximidade"),
    lon: Optional[float] = Query(None, description="Longitude para ordenação por proximidade"),
    limit: int = Query(60, description="Limite de estações retornadas")
):
    """Busca e lista estações meteorológicas automáticas do INMET."""
    stations = inmet_service.search_stations(query=q, lat=lat, lon=lon, limit=limit)
    return {"count": len(stations), "stations": stations}

@app.get("/api/stations/nearest")
async def get_nearest_station(
    lat: float = Query(..., description="Latitude do usuário"),
    lon: float = Query(..., description="Longitude do usuário")
):
    """Encontra a estação meteorológica do INMET mais próxima das coordenadas fornecidas."""
    nearest = inmet_service.find_nearest_station(lat, lon)
    if not nearest:
        raise HTTPException(status_code=404, detail="Nenhuma estação meteorológica encontrada.")
    return {"nearest_station": nearest}

@app.get("/api/inmet/data/{station_code}")
async def get_inmet_data(
    station_code: str,
    force: bool = Query(False, description="Forçar atualização ignorando cache de 1h")
):
    """Obtém dados meteorológicos da estação INMET especificada (atualização de 1h em 1h)."""
    data = await inmet_service.get_station_data(station_code, force_refresh=force)
    return data

# ----------------- Open-Meteo Endpoints -----------------

@app.get("/api/forecast")
async def get_weather_forecast(
    lat: float = Query(-17.3369, description="Latitude"),
    lon: float = Query(-49.9147, description="Longitude")
):
    """Obtém previsão do tempo atual, horária e semanal via Open-Meteo para a coordenada."""
    try:
        forecast = await openmeteo_service.get_forecast(lat, lon)
        return forecast
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar previsão Open-Meteo: {e}")

# ----------------- GOES Satellite Endpoints -----------------

@app.get("/api/goes/frames")
async def get_goes_frames(
    lat: float = Query(-17.3369, description="Latitude"),
    lon: float = Query(-49.9147, description="Longitude"),
    delta: float = Query(2.5, description="Raio angular em graus (0.6=ultra, 1.5=local, 3.5=regional, 8=brasil, 15=amplo)"),
    resolution: str = Query("medium", description="Resolução: low (256), medium (512), high (800), ultra (1024)"),
    frames: int = Query(8, description="Número de quadros temporais (6 a 24)"),
    product: str = Query("cptec_dsa", description="Produto: cptec_dsa, cptec_sandwich, cptec_wv, cptec_ir_noaa, cptec_natural, geocolor"),
    borders: bool = Query(True, description="Sobrepor fronteiras e divisas CPTEC"),
    cities: bool = Query(True, description="Sobrepor limites municipais IBGE"),
    urban: bool = Query(True, description="Sobrepor manchas de áreas urbanizadas IBGE 2022")
):
    """Retorna a lista de quadros e metadados para reprodução temporal interativa no player web."""
    try:
        data = goes_service.get_frames_metadata(
            lat=lat, lon=lon, delta=delta, resolution_key=resolution,
            num_frames=frames, product_key=product, with_borders=borders,
            with_cities=cities, with_urban=urban
        )
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar quadros GOES: {e}")

@app.get("/api/goes/cptec_frame")
async def get_cptec_frame(
    prod: str = Query("ch13_cpt_DSA", description="ID do produto CPTEC (ex: ch13_cpt_DSA)"),
    date: str = Query(..., description="Data em formato YYYYMMDD"),
    time: str = Query(..., description="Hora em formato HHMM"),
    borders: bool = Query(True, description="Sobrepor fronteiras e divisas CPTEC"),
    cities: bool = Query(True, description="Sobrepor limites municipais IBGE"),
    urban: bool = Query(True, description="Sobrepor manchas de áreas urbanizadas IBGE 2022"),
    zoom: int = Query(2, description="Nível de zoom (2=Full Disk, 4=Regional, 5=Local)"),
    min_tx: Optional[int] = Query(None, description="Tile X inicial"),
    min_ty: Optional[int] = Query(None, description="Tile Y inicial"),
    tile_count: int = Query(3, description="Número de tiles por eixo (padrão 3)"),
    crop_half: Optional[int] = Query(None, description="Raio de recorte em pixels para Ultra Local"),
    cx: Optional[int] = Query(None, description="Centro X do recorte"),
    cy: Optional[int] = Query(None, description="Centro Y do recorte")
):
    """Retorna o quadro Full Disk ou recorte de alta resolução montado a partir dos tiles do CPTEC DSAT."""
    try:
        path = goes_service.get_or_render_cptec_frame(
            prod_id=prod, date_str=date, time_str=time, with_borders=borders,
            with_cities=cities, with_urban=urban,
            zoom=zoom, min_tx=min_tx, min_ty=min_ty, tile_count=tile_count,
            crop_half=crop_half, cx=cx, cy=cy
        )
        return FileResponse(
            path,
            media_type="image/jpeg",
            headers={"Cache-Control": "public, max-age=86400"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar quadro CPTEC: {e}")

@app.get("/api/goes/gif")
async def generate_goes_gif_endpoint(
    lat: float = Query(-17.3369, description="Latitude"),
    lon: float = Query(-49.9147, description="Longitude"),
    delta: float = Query(2.5, description="Raio da área em graus"),
    resolution: str = Query("medium", description="Resolução degradável (low, medium, high, ultra)"),
    frames: int = Query(8, description="Número de quadros"),
    product: str = Query("cptec_dsa", description="Produto GOES"),
    speed: int = Query(350, description="Duração de cada quadro em milissegundos"),
    label: str = Query("Edéia - GO", description="Rótulo da localidade na sobreposição"),
    borders: bool = Query(True, description="Sobrepor fronteiras e divisas CPTEC"),
    cities: bool = Query(True, description="Sobrepor limites municipais IBGE"),
    urban: bool = Query(True, description="Sobrepor manchas de áreas urbanizadas IBGE 2022")
):
    """Gera um GIF animado temporal das últimas composições GOES para a área especificada."""
    try:
        path, rel_url = goes_service.generate_gif(
            lat=lat, lon=lon, delta=delta, resolution_key=resolution,
            num_frames=frames, product_key=product, duration_ms=speed,
            location_label=label, with_borders=borders,
            with_cities=cities, with_urban=urban
        )
        return {
            "status": "success",
            "download_url": rel_url,
            "filename": os.path.basename(path),
            "file_size_bytes": os.path.getsize(path),
            "resolution": resolution,
            "frame_count": frames
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar GIF GOES: {e}")


@app.get("/api/goes/download/{filename}")
async def download_goes_gif(filename: str):
    """Faz o download direto do arquivo GIF gerado."""
    file_path = os.path.join(GOES_CACHE_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Arquivo GIF não encontrado ou expirado.")
    return FileResponse(file_path, media_type="image/gif", filename=filename)

# ----------------- System Health / Dashboard Status -----------------

@app.get("/api/status")
async def get_system_status():
    """Status do sistema, estações ativas e cache."""
    active_code = inmet_service.active_station_code
    cached_data = inmet_service.get_cached_data(active_code)
    
    cache_age = 0
    if cached_data and "cached_at" in cached_data:
        import time
        cache_age = int(time.time() - cached_data["cached_at"])

    return {
        "status": "online",
        "active_station": active_code,
        "auto_refresh_interval": "1 hora (3600 segundos)",
        "cache_age_seconds": cache_age,
        "next_refresh_seconds": max(0, 3600 - cache_age),
        "total_stations_available": len(inmet_service.stations)
    }

# ----------------- Static Files -----------------

STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static")
if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
async def root():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "MeteoApp API Online"}
