import json
import logging
from pathlib import Path

from app.astar import AStar
from app.hazard_model import HazardPredictor
from app.ncpor import get_all_stations

logger = logging.getLogger(__name__)
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

astar_router: AStar | None = None
hazard_predictor: HazardPredictor | None = None
grid_data: dict | None = None
ship_data: dict | None = None
icebergs_data: list | None = None


def initialize() -> None:
    global astar_router, hazard_predictor, grid_data, ship_data, icebergs_data
    with (DATA_DIR / "ice_grid.json").open(encoding="utf-8") as file:
        grid_data = json.load(file)
    with (DATA_DIR / "ship.json").open(encoding="utf-8") as file:
        ship_data = json.load(file)
    with (DATA_DIR / "icebergs.json").open(encoding="utf-8") as file:
        icebergs_data = json.load(file)
    features = grid_data.get("features", [])
    if not isinstance(features, list):
        raise RuntimeError("ice_grid.json 'features' must be a list.")
    astar_router = AStar(features)
    hazard_predictor = HazardPredictor()
    stations = get_all_stations()
    live_count = sum(station.get("status") == "LIVE" for station in stations)
    logger.info("NCPOR initialization: %d/%d stations live", live_count, len(stations))
    logger.info("POLARISIS backend ready")