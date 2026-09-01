from datetime import datetime, timezone
import os
import signal
import sys
import threading

from fastapi import APIRouter

from app import runtime
from app.ncpor import get_all_stations

router = APIRouter()


@router.get("/health")
async def health_check():
    checks = {
        "datasets": {
            "status": "pass" if all(
                value is not None
                for value in (
                    runtime.ship_data,
                    runtime.icebergs_data,
                    runtime.grid_data,
                )
            ) else "fail",
            "ship_loaded": runtime.ship_data is not None,
            "icebergs_loaded": runtime.icebergs_data is not None,
            "grid_loaded": runtime.grid_data is not None,
        },
        "routing": {
            "status": "pass" if runtime.astar_router is not None else "fail",
            "engine": "A*",
            "grid_cells": len(runtime.astar_router.node_map)
            if runtime.astar_router is not None
            else 0,
        },
        "hazard_model": {
            "status": "pass" if runtime.hazard_predictor is not None else "fail",
            "engine": "PyTorch MLP",
            "ready": runtime.hazard_predictor is not None,
        },
    }

    try:
        stations = get_all_stations()
        station_statuses = [station.get("status") for station in stations]
        source_status = (
            "LIVE" if "LIVE" in station_statuses
            else "STALE" if "STALE" in station_statuses
            else "SIMULATED" if "SIMULATED" in station_statuses
            else "ERROR"
        )
        checks["ncpor"] = {
            "status": "pass" if source_status != "ERROR" else "warn",
            "source_status": source_status,
            "stations": len(stations),
            "live": station_statuses.count("LIVE"),
            "stale": station_statuses.count("STALE"),
            "simulated": station_statuses.count("SIMULATED"),
            "error": station_statuses.count("ERROR"),
            "note": "Fallback data is active when NCPOR is unreachable.",
        }
    except Exception as error:
        checks["ncpor"] = {
            "status": "warn",
            "source_status": "ERROR",
            "error": str(error),
        }

    required_checks = ("datasets", "routing", "hazard_model")
    ready = all(checks[name]["status"] == "pass" for name in required_checks)

    return {
        "status": "healthy" if ready else "starting",
        "service": "POLARISIS Maritime Navigation System",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ready": ready,
        "checks": checks,
        "data_summary": {
            "ship": 1 if runtime.ship_data is not None else 0,
            "icebergs": len(runtime.icebergs_data or []),
            "grid_cells": len(runtime.grid_data.get("features", []))
            if runtime.grid_data is not None
            else 0,
        },
        "runtime": {
            "python": sys.version.split()[0],
            "simulation": "browser playback",
            "decision_support": True,
        },
        "endpoints": [
            "GET /health",
            "POST /shutdown",
            "GET /data/ship",
            "GET /data/icebergs",
            "GET /data/ice_grid",
            "GET /data/ncpor",
            "GET /data/environment",
            "POST /route",
            "POST /decision",
            "POST /simulate",
        ],
    }


@router.post("/shutdown")
async def shutdown_project():
    launcher_pid = os.environ.get("POLARISIS_LAUNCHER_PID")
    if not launcher_pid or not launcher_pid.isdigit():
        return {
            "status": "unavailable",
            "message": "Start the project with run-project.sh to enable full shutdown.",
        }

    pid = int(launcher_pid)

    def stop_launcher():
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass

    threading.Timer(0.2, stop_launcher).start()
    return {
        "status": "shutting_down",
        "message": "POLARISIS frontend and backend are shutting down.",
    }
