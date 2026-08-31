import json
from pathlib import Path
from typing import List, Dict, Optional
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import logging
import asyncio
import re
from datetime import datetime, timezone
from html import unescape
from urllib.request import Request, urlopen

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

from app.astar import AStar
from app.hazard_model import HazardPredictor, check_collision_risk

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(title="POLARISIS Maritime Navigation System")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global state
astar_router = None
hazard_predictor = None
grid_data = None
ship_data = None
icebergs_data = None


class RouteRequest(BaseModel):
    start: Dict[str, float]  # {"lat": -60.0, "lon": -60.0}
    destination: Dict[str, float]
    vessel_speed: float
    vessel_draft: float
    ice_capability: str


class RouteResponse(BaseModel):
    route: List[Dict[str, float]]
    eta_minutes: float
    distance_km: float


class DecisionRequest(BaseModel):
    vessel_speed: float
    vessel_draft: float
    ice_capability: str
    hazards: Dict


class DecisionResponse(BaseModel):
    risk_score: float
    action: str  # "PROCEED", "REROUTE", "HALT"
    eta_minutes: int
    confidence: float
    recommended_route: List[Dict[str, float]]


# ============================================================
# NCPOR LIVE STATION DATA
# ============================================================

NCPOR_CACHE_SECONDS = 300  # 5 minutes

NCPOR_STATIONS = {
    "maitri": {
        "id": "maitri",
        "name": "Maitri",
        "region": "Antarctica",
        "lat": -70.764444,
        "lon": 11.734167,
        "url": "https://data.ncpor.res.in/maitri/live",
        "source_url": "https://data.ncpor.res.in/maitri/live",
    },
    "bharati": {
        "id": "bharati",
        "name": "Bharati",
        "region": "Antarctica",
        "lat": -69.406833,
        "lon": 76.195333,
        "url": "https://data.ncpor.res.in/bharati/live",
        "source_url": "https://data.ncpor.res.in/bharati/live",
    },
}

ncpor_cache = {
    "stations": [],
    "fetched_at": None,
}


def _clean_ncpor_html(raw_html: str) -> str:
    """
    Convert NCPOR's live HTML into searchable plain text.
    No external HTML parser dependency required.
    """
    text = re.sub(r"<script.*?</script>", " ", raw_html, flags=re.I | re.S)
    text = re.sub(r"<style.*?</style>", " ", text, flags=re.I | re.S)
    text = re.sub(r"<[^>]+>", " ", text)

    text = unescape(text)
    text = text.replace("\xa0", " ")

    return re.sub(r"\s+", " ", text).strip()


def _extract_float(pattern: str, text: str):
    match = re.search(pattern, text, flags=re.I)

    if not match:
        return None

    try:
        return float(match.group(1))
    except (TypeError, ValueError):
        return None


def _fetch_ncpor_station(config: dict) -> dict:
    """
    Fetch the latest publicly displayed NCPOR station observation.
    """

    try:
        request = Request(
            config["url"],
            headers={
                "User-Agent": (
                    "POLARISIS/1.0 "
                    "(maritime-navigation-research-demo)"
                )
            },
        )

        with urlopen(request, timeout=15) as response:
            raw_html = response.read().decode(
                "utf-8",
                errors="replace",
            )

        text = _clean_ncpor_html(raw_html)

        observation_date_match = re.search(
            r"(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s*\|",
            text,
        )

        observation_date = (
            observation_date_match.group(1)
            if observation_date_match
            else None
        )

        temperature = _extract_float(
            r"(?:Air\s+)?Temperature:\s*\|\s*"
            r"([-+]?\d+(?:\.\d+)?)",
            text,
        )

        humidity = _extract_float(
            r"Relative\s+Humidity:\s*\|\s*"
            r"([-+]?\d+(?:\.\d+)?)",
            text,
        )

        pressure = _extract_float(
            r"Air\s+Pressure:\s*\|\s*"
            r"([-+]?\d+(?:\.\d+)?)",
            text,
        )

        wind_knots = _extract_float(
            r"Wind\s+Speed\s*\|\s*"
            r"([-+]?\d+(?:\.\d+)?)\s*knots",
            text,
        )

        wind_mps = (
            wind_knots * 0.514444
            if wind_knots is not None
            else None
        )

        return {
            **config,
            "temperature_c": temperature,
            "relative_humidity_pct": humidity,
            "pressure_mbar": pressure,
            "wind_speed_knots": wind_knots,
            "wind_speed_mps": wind_mps,
            "observation_date": observation_date,
            "fetched_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "status": "LIVE",
        }

    except Exception as exc:
        logger.warning(
            "NCPOR %s fetch failed: %s",
            config["name"],
            exc,
        )

        return {
            **config,
            "temperature_c": None,
            "relative_humidity_pct": None,
            "pressure_mbar": None,
            "wind_speed_knots": None,
            "wind_speed_mps": None,
            "observation_date": None,
            "fetched_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "status": "ERROR",
            "error": str(exc),
        }


async def refresh_ncpor_data(force: bool = False) -> list:
    """
    Fetch NCPOR station data concurrently.

    Data is cached for 5 minutes unless force=True.
    """

    now = datetime.now(timezone.utc)

    cached_at = ncpor_cache["fetched_at"]

    if (
        not force
        and cached_at is not None
        and (
            now - cached_at
        ).total_seconds() < NCPOR_CACHE_SECONDS
    ):
        return ncpor_cache["stations"]

    stations = await asyncio.gather(
        *[
            asyncio.to_thread(
                _fetch_ncpor_station,
                config,
            )
            for config in NCPOR_STATIONS.values()
        ]
    )

    ncpor_cache["stations"] = stations
    ncpor_cache["fetched_at"] = now

    logger.info(
        "NCPOR station data refreshed: %d stations",
        len(stations),
    )

    return stations

@app.get("/data/ncpor")
async def get_ncpor_data():
    """
    Return latest publicly available NCPOR
    Antarctic station observations.
    """

    stations = await refresh_ncpor_data()

    return {
        "source": "NCPOR National Polar Data Center",
        "updated_at": ncpor_cache["fetched_at"].isoformat()
        if ncpor_cache["fetched_at"]
        else None,
        "stations": stations,
    }


@app.on_event("startup")
async def startup_event():
    """Initialize models and load data on startup"""
    global astar_router, hazard_predictor, grid_data, ship_data, icebergs_data
    
    logger.info("Starting up POLARISIS backend...")
    
    try:
        with open(DATA_DIR / "ice_grid.json", "r") as f:
            grid_data = json.load(f)

        with open(DATA_DIR / "ship.json", "r") as f:
            ship_data = json.load(f)

        with open(DATA_DIR / "icebergs.json", "r") as f:
            icebergs_data = json.load(f)

        logger.info("Mock data loaded successfully")

    except (FileNotFoundError, json.JSONDecodeError) as e:
        logger.error(f"Failed to load mock data: {e}")
        raise RuntimeError("POLARISIS mock data could not be loaded") from e

    # Initialize A* router
    astar_router = AStar(grid_data.get("features", []))
    logger.info("A* router initialized")
    
    # Initialize hazard predictor
    hazard_predictor = HazardPredictor()
    logger.info("Hazard model initialized")
    
    logger.info("POLARISIS backend ready!")


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    logger.info("Shutting down POLARISIS backend...")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "POLARISIS Maritime Navigation System"
    }


@app.get("/data/ship")
async def get_ship_data():
    """Get current ship state"""
    if not ship_data:
        raise HTTPException(status_code=503, detail="Ship data not loaded")
    return ship_data


@app.get("/data/icebergs")
async def get_icebergs_data():
    """Get iceberg positions and trajectories"""
    if not icebergs_data:
        raise HTTPException(status_code=503, detail="Iceberg data not loaded")
    return icebergs_data


@app.get("/data/ice_grid")
async def get_ice_grid():
    """Get ice grid data"""
    if not grid_data:
        raise HTTPException(status_code=503, detail="Grid data not loaded")
    return grid_data.get("features", [])


@app.post("/route", response_model=RouteResponse)
async def calculate_route(request: RouteRequest):
    """
    Calculate optimal route from start to destination

    Uses A* algorithm considering ice concentration, water depth,
    icebergs, and vessel capabilities.
    """
    if not astar_router:
        raise HTTPException(status_code=503, detail="Router not initialized")
    
    try:
        start = (request.start["lat"], request.start["lon"])
        destination = (request.destination["lat"], request.destination["lon"])
        
        # Find optimal path
        path = astar_router.find_path(
            start,
            destination,
            icebergs_data or [],
            request.vessel_draft
        )
        
        # Convert to response format
        route = [{"lat": p[0], "lon": p[1]} for p in path]
        
        # Simple ETA calculation: distance / speed
        distance_km = 0
        for i in range(len(path) - 1):
            lat1, lon1 = path[i]
            lat2, lon2 = path[i + 1]
            
            # Haversine approximation
            dlat = abs(lat2 - lat1) * 111  # km per degree
            dlon = abs(lon2 - lon1) * 111 * 0.87  # km per degree (at 60S)
            distance_km += (dlat**2 + dlon**2) ** 0.5
        
        eta_minutes = int((distance_km / request.vessel_speed) * 60) if request.vessel_speed > 0 else 0
        
        logger.info(f"Route calculated: {len(path)} waypoints, {distance_km:.1f}km, ETA {eta_minutes}min")
        
        return RouteResponse(
            route=route,
            eta_minutes=eta_minutes,
            distance_km=distance_km
        )
    
    except Exception as e:
        logger.error(f"Route calculation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/decision", response_model=DecisionResponse)
async def make_risk_decision(request: DecisionRequest):
    """
    Evaluate risk and recommend decision (PROCEED, REROUTE, HALT)

    Analyzes current hazards and vessel position to determine
    optimal course of action.
    """
    if not hazard_predictor:
        raise HTTPException(status_code=503, detail="Predictor not initialized")
    
    try:
        # Predict hazard probability
        risk_score = hazard_predictor.predict_hazard(request.hazards)
        
        # Determine action based on risk
        if risk_score > 0.7:
            action = "HALT"
        elif risk_score > 0.5:
            action = "REROUTE"
        else:
            action = "PROCEED"
        
        # Check for collision risk
        collision_risk, collision_score = check_collision_risk(
            0, 0,  # Using dummy vessel position
            [(0, 0), (1, 1)],  # Using dummy route
            icebergs_data or [],
            hazard_predictor
        )
        
        # Adjust risk score if collision detected
        if collision_risk:
            risk_score = max(risk_score, collision_score)
            action = "REROUTE" if action != "HALT" else "HALT"
        
        # Generate recommended route (simple: destination south-west)
        recommended_route = [
            {"lat": -60.0, "lon": -60.0},
            {"lat": -61.0, "lon": -61.0},
            {"lat": -62.0, "lon": -62.0},
            {"lat": -63.0, "lon": -63.0},
            {"lat": -64.0, "lon": -64.0}
        ]
        
        # Calculate confidence
        confidence = 0.9 - (abs(risk_score - 0.5) * 0.4)
        
        logger.info(f"Risk decision: {action}, risk_score={risk_score:.2f}, confidence={confidence:.2f}")
        
        return DecisionResponse(
            risk_score=risk_score,
            action=action,
            eta_minutes=1970,
            confidence=confidence,
            recommended_route=recommended_route
        )
    
    except Exception as e:
        logger.error(f"Decision making error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/simulate")
async def run_simulation(duration_hours: int = 12, speed_multiplier: float = 1.0):
    """
    Run a simulation of the vessel route with dynamic threat updates

    This endpoint simulates vessel movement and threat evolution,
    returning periodic decision updates.
    """
    return {
        "message": "Simulation endpoint - to be implemented",
        "duration_hours": duration_hours,
        "speed_multiplier": speed_multiplier
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
