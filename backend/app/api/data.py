from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.ncpor import get_all_stations
from app import runtime
from services import clamp

router = APIRouter(prefix="/data")


@router.get("/ship")
async def get_ship():
    if runtime.ship_data is None:
        raise HTTPException(503, "Ship data not loaded.")
    return runtime.ship_data


@router.get("/icebergs")
async def get_icebergs():
    if runtime.icebergs_data is None:
        raise HTTPException(503, "Iceberg data not loaded.")
    return runtime.icebergs_data


@router.get("/ice_grid")
async def get_ice_grid():
    if runtime.grid_data is None:
        raise HTTPException(503, "Grid data not loaded.")
    return runtime.grid_data.get("features", [])


@router.get("/ncpor")
async def get_ncpor():
    stations = get_all_stations()
    return {
        "source": "NCPOR National Polar Data Center",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_stations": len(stations),
            "live": sum(s.get("status") == "LIVE" for s in stations),
            "stale": sum(s.get("status") == "STALE" for s in stations),
            "error": sum(s.get("status") == "ERROR" for s in stations),
        },
        "stations": stations,
    }


@router.get("/environment")
async def get_environment():
    stations = get_all_stations()
    valid = [s for s in stations if any(s.get(key) is not None for key in ("temperature_c", "wind_speed_knots", "pressure_mbar", "relative_humidity_pct"))]
    if not valid:
        return {"status": "UNAVAILABLE", "stations": stations}

    def average(key: str):
        values = [s[key] for s in valid if s.get(key) is not None]
        return sum(values) / len(values) if values else None

    temperature = average("temperature_c")
    humidity = average("relative_humidity_pct")
    wind = average("wind_speed_knots")
    pressure = average("pressure_mbar")
    risk = (min(wind / 50, 1) * 0.55 if wind is not None else 0)
    if temperature is not None:
        risk += 0.25 if temperature < -25 else 0.15 if temperature < -15 else 0.05 if temperature < -5 else 0
    if humidity is not None:
        risk += 0.10 if humidity > 85 else 0.05 if humidity > 70 else 0
    risk = clamp(risk, 0, 1)
    status = "LIVE" if any(s.get("status") == "LIVE" for s in stations) else "STALE" if any(s.get("status") == "STALE" for s in stations) else "SIMULATED"
    severity = "LOW" if risk < 0.3 else "MODERATE" if risk < 0.6 else "HIGH" if risk < 0.8 else "SEVERE"
    return {"status": status, "updated_at": datetime.now(timezone.utc).isoformat(), "summary": {"temperature_c": temperature, "relative_humidity_pct": humidity, "pressure_mbar": pressure, "wind_speed_knots": wind, "weather_risk": round(risk, 3), "severity": severity}, "stations": stations}