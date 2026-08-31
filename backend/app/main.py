import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.astar import AStar
from app.hazard_model import HazardPredictor, check_collision_risk
from app.ncpor import get_all_stations


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"


# ============================================================
# LOGGING
# ============================================================

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================
# FASTAPI
# ============================================================

app = FastAPI(
    title="POLARISIS Maritime Navigation System",
    version="1.0.0",
    description=(
        "Autonomous maritime navigation and risk-analysis "
        "demonstration system."
    ),
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# GLOBAL STATE
# ============================================================

astar_router: Optional[AStar] = None
hazard_predictor: Optional[HazardPredictor] = None

grid_data: Optional[dict] = None
ship_data: Optional[dict] = None
icebergs_data: Optional[list] = None


# ============================================================
# PYDANTIC MODELS
# ============================================================

class RouteRequest(BaseModel):
    start: Dict[str, float]
    destination: Dict[str, float]

    vessel_speed: float = Field(
        gt=0,
        description="Vessel speed in knots.",
    )

    vessel_draft: float = Field(
        gt=0,
        description="Vessel draft in metres.",
    )

    ice_capability: str = "ARC3"


class RouteResponse(BaseModel):
    route: List[Dict[str, float]]
    eta_minutes: float
    distance_km: float


class DecisionRequest(BaseModel):
    vessel_speed: float = Field(gt=0)
    vessel_draft: float = Field(gt=0)
    ice_capability: str = "ARC3"

    # Actual vessel position.
    vessel_position: Dict[str, float]

    # Actual route currently being followed.
    route: List[Dict[str, float]] = Field(
        default_factory=list
    )

    # Environmental/hazard data from frontend.
    hazards: Dict[str, Any] = Field(
        default_factory=dict
    )


class DecisionResponse(BaseModel):
    risk_score: float
    action: str
    eta_minutes: int
    confidence: float
    recommended_route: List[Dict[str, float]]


# ============================================================
# UTILITY FUNCTIONS
# ============================================================

def calculate_route_distance(path: List[Any]) -> float:
    """
    Calculate approximate route distance in kilometres.

    Coordinates are expected as:
        (lat, lon)
    """

    distance_km = 0.0

    for i in range(len(path) - 1):
        lat1, lon1 = path[i]
        lat2, lon2 = path[i + 1]

        # Antarctic approximation.
        dlat = abs(lat2 - lat1) * 111.0
        dlon = abs(lon2 - lon1) * 111.0 * 0.87

        distance_km += (
            dlat ** 2 +
            dlon ** 2
        ) ** 0.5

    return distance_km


def calculate_eta_minutes(
    distance_km: float,
    speed_knots: float,
) -> int:
    """
    Convert distance and vessel speed into ETA.

    1 knot = 1 nautical mile/hour.
    1 nautical mile = 1.852 km.
    """

    if speed_knots <= 0:
        return 0

    speed_kmh = speed_knots * 1.852

    return int(
        (distance_km / speed_kmh) * 60
    )


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


# ============================================================
# STARTUP
# ============================================================

@app.on_event("startup")
async def startup_event():
    """
    Initialize simulation data and navigation models.

    NCPOR is intentionally treated as an external,
    non-critical dependency. If NCPOR is unavailable,
    POLARISIS still starts normally.
    """

    global astar_router
    global hazard_predictor
    global grid_data
    global ship_data
    global icebergs_data

    logger.info(
        "Starting up POLARISIS backend..."
    )

    # --------------------------------------------------------
    # Load mock simulation data
    # --------------------------------------------------------

    try:
        with open(
            DATA_DIR / "ice_grid.json",
            "r",
            encoding="utf-8",
        ) as f:
            grid_data = json.load(f)

        with open(
            DATA_DIR / "ship.json",
            "r",
            encoding="utf-8",
        ) as f:
            ship_data = json.load(f)

        with open(
            DATA_DIR / "icebergs.json",
            "r",
            encoding="utf-8",
        ) as f:
            icebergs_data = json.load(f)

        logger.info(
            "Mock data loaded successfully"
        )

    except FileNotFoundError as exc:
        logger.exception(
            "Required simulation data is missing: %s",
            exc,
        )
        raise RuntimeError(
            "POLARISIS simulation data could not be loaded."
        ) from exc

    except json.JSONDecodeError as exc:
        logger.exception(
            "Simulation data contains invalid JSON: %s",
            exc,
        )
        raise RuntimeError(
            "POLARISIS simulation data contains invalid JSON."
        ) from exc

    # --------------------------------------------------------
    # Validate grid
    # --------------------------------------------------------

    if not isinstance(grid_data, dict):
        raise RuntimeError(
            "ice_grid.json must contain a JSON object."
        )

    features = grid_data.get(
        "features",
        [],
    )

    if not isinstance(features, list):
        raise RuntimeError(
            "ice_grid.json 'features' must be a list."
        )

    # --------------------------------------------------------
    # Initialize A*
    # --------------------------------------------------------

    astar_router = AStar(features)

    logger.info(
        "A* router initialized with %d grid cells",
        len(features),
    )

    # --------------------------------------------------------
    # Initialize hazard predictor
    # --------------------------------------------------------

    hazard_predictor = HazardPredictor()

    logger.info(
        "Hazard model initialized"
    )

    # --------------------------------------------------------
    # NCPOR
    # --------------------------------------------------------

    try:
        stations = get_all_stations()

        live_count = sum(
            1
            for station in stations
            if station.get("status") == "LIVE"
        )

        logger.info(
            "NCPOR initialization: %d/%d stations live",
            live_count,
            len(stations),
        )

    except Exception as exc:
        # NCPOR must NEVER prevent the backend from starting.
        logger.warning(
            "NCPOR initialization failed: %s",
            exc,
        )

    logger.info(
        "POLARISIS backend ready!"
    )


# ============================================================
# SHUTDOWN
# ============================================================

@app.on_event("shutdown")
async def shutdown_event():
    logger.info(
        "Shutting down POLARISIS backend..."
    )


# ============================================================
# HEALTH
# ============================================================

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": (
            "POLARISIS Maritime Navigation System"
        ),
    }


# ============================================================
# NCPOR
# ============================================================

@app.get("/data/ncpor")
async def get_ncpor_data():
    """
    Return the latest NCPOR station observations.

    NCPOR fetching/caching is handled entirely by
    app.ncpor.

    This endpoint does NOT directly contact NCPOR.
    """

    try:
        stations = get_all_stations()

        live_count = sum(
            1
            for station in stations
            if station.get("status") == "LIVE"
        )

        stale_count = sum(
            1
            for station in stations
            if station.get("status") == "STALE"
        )

        error_count = sum(
            1
            for station in stations
            if station.get("status") == "ERROR"
        )

        return {
            "source": (
                "NCPOR National Polar Data Center"
            ),
            "updated_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "summary": {
                "total_stations": len(stations),
                "live": live_count,
                "stale": stale_count,
                "error": error_count,
            },
            "stations": stations,
        }

    except Exception as exc:
        logger.exception(
            "NCPOR endpoint error"
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "NCPOR data is temporarily unavailable."
            ),
        ) from exc


@app.get("/data/environment")
async def get_environment_data():
    """
    Return NCPOR observations plus derived
    environmental risk indicators.
    """

    try:
        stations = get_all_stations()

    except Exception as exc:
        logger.exception(
            "Environment data error"
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Environmental data is temporarily unavailable."
            ),
        ) from exc

    valid_stations = [
        station
        for station in stations
        if (
            station.get("temperature_c") is not None
            or station.get("wind_speed_knots") is not None
            or station.get("pressure_mbar") is not None
            or station.get("relative_humidity_pct") is not None
        )
    ]

    if not valid_stations:
        return {
            "status": "UNAVAILABLE",
            "updated_at": datetime.now(
                timezone.utc
            ).isoformat(),
            "summary": {
                "temperature_c": None,
                "relative_humidity_pct": None,
                "pressure_mbar": None,
                "wind_speed_knots": None,
                "weather_risk": None,
                "severity": "UNKNOWN",
            },
            "stations": stations,
        }

    temperatures = [
        station["temperature_c"]
        for station in valid_stations
        if station.get("temperature_c") is not None
    ]

    humidity_values = [
        station["relative_humidity_pct"]
        for station in valid_stations
        if station.get("relative_humidity_pct") is not None
    ]

    pressures = [
        station["pressure_mbar"]
        for station in valid_stations
        if station.get("pressure_mbar") is not None
    ]

    winds = [
        station["wind_speed_knots"]
        for station in valid_stations
        if station.get("wind_speed_knots") is not None
    ]

    avg_temperature = (
        sum(temperatures) / len(temperatures)
        if temperatures
        else None
    )

    avg_humidity = (
        sum(humidity_values) / len(humidity_values)
        if humidity_values
        else None
    )

    avg_pressure = (
        sum(pressures) / len(pressures)
        if pressures
        else None
    )

    avg_wind = (
        sum(winds) / len(winds)
        if winds
        else None
    )

    # --------------------------------------------------------
    # Derived weather risk
    # --------------------------------------------------------

    weather_risk = 0.0

    if avg_wind is not None:
        weather_risk += (
            min(avg_wind / 50.0, 1.0) * 0.55
        )

    if avg_temperature is not None:
        if avg_temperature < -25:
            weather_risk += 0.25
        elif avg_temperature < -15:
            weather_risk += 0.15
        elif avg_temperature < -5:
            weather_risk += 0.05

    if avg_humidity is not None:
        if avg_humidity > 85:
            weather_risk += 0.10
        elif avg_humidity > 70:
            weather_risk += 0.05

    weather_risk = clamp(
        weather_risk,
        0.0,
        1.0,
    )

    if weather_risk < 0.30:
        severity = "LOW"
    elif weather_risk < 0.60:
        severity = "MODERATE"
    elif weather_risk < 0.80:
        severity = "HIGH"
    else:
        severity = "SEVERE"

    overall_status = (
        "LIVE"
        if any(
            station.get("status") == "LIVE"
            for station in stations
        )
        else "STALE"
    )

    return {
        "status": overall_status,
        "updated_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "summary": {
            "temperature_c": avg_temperature,
            "relative_humidity_pct": avg_humidity,
            "pressure_mbar": avg_pressure,
            "wind_speed_knots": avg_wind,
            "weather_risk": round(
                weather_risk,
                3,
            ),
            "severity": severity,
        },
        "stations": stations,
    }


# ============================================================
# SHIP DATA
# ============================================================

@app.get("/data/ship")
async def get_ship_data():
    if ship_data is None:
        raise HTTPException(
            status_code=503,
            detail="Ship data not loaded.",
        )

    return ship_data


# ============================================================
# ICEBERGS
# ============================================================

@app.get("/data/icebergs")
async def get_icebergs_data():
    if icebergs_data is None:
        raise HTTPException(
            status_code=503,
            detail="Iceberg data not loaded.",
        )

    return icebergs_data


# ============================================================
# ICE GRID
# ============================================================

@app.get("/data/ice_grid")
async def get_ice_grid():
    if grid_data is None:
        raise HTTPException(
            status_code=503,
            detail="Grid data not loaded.",
        )

    return grid_data.get(
        "features",
        [],
    )


# ============================================================
# ROUTE CALCULATION
# ============================================================

@app.post(
    "/route",
    response_model=RouteResponse,
)
async def calculate_route(
    request: RouteRequest,
):
    """
    Calculate an optimal route using A*.
    """

    if astar_router is None:
        raise HTTPException(
            status_code=503,
            detail="Router not initialized.",
        )

    try:
        start = (
            request.start["lat"],
            request.start["lon"],
        )

        destination = (
            request.destination["lat"],
            request.destination["lon"],
        )

        path = astar_router.find_path(
            start,
            destination,
            icebergs_data or [],
            request.vessel_draft,
        )

        if not path:
            raise HTTPException(
                status_code=422,
                detail="No viable route found.",
            )

        route = [
            {
                "lat": point[0],
                "lon": point[1],
            }
            for point in path
        ]

        distance_km = calculate_route_distance(
            path
        )

        eta_minutes = calculate_eta_minutes(
            distance_km,
            request.vessel_speed,
        )

        logger.info(
            "Route calculated: "
            "%d waypoints | %.1f km | ETA %d min",
            len(path),
            distance_km,
            eta_minutes,
        )

        return RouteResponse(
            route=route,
            eta_minutes=eta_minutes,
            distance_km=distance_km,
        )

    except HTTPException:
        raise

    except Exception as exc:
        logger.exception(
            "Route calculation error"
        )

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


# ============================================================
# RISK / DECISION ENGINE
# ============================================================

@app.post(
    "/decision",
    response_model=DecisionResponse,
)
async def make_risk_decision(
    request: DecisionRequest,
):
    """
    Evaluate current maritime risk.

    Uses:
      - environmental hazard model
      - actual vessel position
      - actual route
      - actual iceberg data

    No dummy (0,0) coordinates are used.
    """

    if hazard_predictor is None:
        raise HTTPException(
            status_code=503,
            detail="Hazard predictor not initialized.",
        )

    try:
        # ----------------------------------------------------
        # Base hazard prediction
        # ----------------------------------------------------

        risk_score = float(
            hazard_predictor.predict_hazard(
                request.hazards
            )
        )

        risk_score = clamp(
            risk_score,
            0.0,
            1.0,
        )

        # ----------------------------------------------------
        # Actual vessel position
        # ----------------------------------------------------

        vessel_lat = request.vessel_position["lat"]
        vessel_lon = request.vessel_position["lon"]

        # ----------------------------------------------------
        # Actual route
        # ----------------------------------------------------

        route = [
            (
                point["lat"],
                point["lon"],
            )
            for point in request.route
        ]

        if not route:
            route = [
                (
                    vessel_lat,
                    vessel_lon,
                )
            ]

        # ----------------------------------------------------
        # Collision analysis
        # ----------------------------------------------------

        collision_risk = False
        collision_score = 0.0

        try:
            (
                collision_risk,
                collision_score,
            ) = check_collision_risk(
                vessel_lat,
                vessel_lon,
                route,
                icebergs_data or [],
                hazard_predictor,
            )

            collision_score = clamp(
                float(collision_score),
                0.0,
                1.0,
            )

        except Exception as exc:
            logger.warning(
                "Collision analysis failed: %s",
                exc,
            )

        # ----------------------------------------------------
        # Combine risk
        # ----------------------------------------------------

        if collision_risk:
            risk_score = max(
                risk_score,
                collision_score,
            )

        # ----------------------------------------------------
        # Decision thresholds
        # ----------------------------------------------------

        if risk_score >= 0.70:
            action = "HALT"

        elif risk_score >= 0.50:
            action = "REROUTE"

        else:
            action = "PROCEED"

        if collision_risk and action != "HALT":
            action = "REROUTE"

        # ----------------------------------------------------
        # Recommended route
        # ----------------------------------------------------

        if action == "REROUTE":

            recommended_route = [
                {
                    "lat": vessel_lat,
                    "lon": vessel_lon,
                },
                {
                    "lat": vessel_lat - 0.75,
                    "lon": vessel_lon - 0.50,
                },
                {
                    "lat": vessel_lat - 1.50,
                    "lon": vessel_lon - 1.00,
                },
                {
                    "lat": vessel_lat - 2.25,
                    "lon": vessel_lon - 1.50,
                },
                {
                    "lat": vessel_lat - 3.00,
                    "lon": vessel_lon - 2.00,
                },
            ]

        else:

            recommended_route = [
                {
                    "lat": lat,
                    "lon": lon,
                }
                for lat, lon in route
            ]

        # ----------------------------------------------------
        # Confidence
        # ----------------------------------------------------

        confidence = (
            0.90
            - (
                abs(risk_score - 0.50)
                * 0.40
            )
        )

        confidence = clamp(
            confidence,
            0.50,
            0.98,
        )

        # ----------------------------------------------------
        # ETA
        # ----------------------------------------------------

        distance_km = calculate_route_distance(
            route
        )

        eta_minutes = calculate_eta_minutes(
            distance_km,
            request.vessel_speed,
        )

        # ----------------------------------------------------
        # Logging
        # ----------------------------------------------------

        logger.info(
            "Risk decision: %s | "
            "risk=%.2f | "
            "collision=%s | "
            "collision_score=%.2f | "
            "confidence=%.2f",
            action,
            risk_score,
            collision_risk,
            collision_score,
            confidence,
        )

        return DecisionResponse(
            risk_score=risk_score,
            action=action,
            eta_minutes=eta_minutes,
            confidence=confidence,
            recommended_route=recommended_route,
        )

    except HTTPException:
        raise

    except Exception as exc:
        logger.exception(
            "Decision making error"
        )

        raise HTTPException(
            status_code=500,
            detail=str(exc),
        ) from exc


# ============================================================
# SIMULATION ENDPOINT
# ============================================================

@app.post("/simulate")
async def run_simulation(
    duration_hours: int = 12,
    speed_multiplier: float = 1.0,
):
    """
    Server-side simulation placeholder.

    Current POLARISIS demo performs playback
    in the React frontend.
    """

    return {
        "message": (
            "Simulation endpoint - "
            "frontend playback currently active"
        ),
        "duration_hours": duration_hours,
        "speed_multiplier": speed_multiplier,
    }


# ============================================================
# DIRECT EXECUTION
# ============================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
    )