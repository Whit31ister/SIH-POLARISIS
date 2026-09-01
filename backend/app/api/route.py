from fastapi import APIRouter, HTTPException

from app import runtime
from app.schemas import RouteRequest, RouteResponse
from services import eta_minutes, route_distance

router = APIRouter()


@router.post("/route", response_model=RouteResponse)
async def calculate_route(request: RouteRequest):
    if runtime.astar_router is None:
        raise HTTPException(503, "Router not initialized.")
    path = runtime.astar_router.find_path((request.start["lat"], request.start["lon"]), (request.destination["lat"], request.destination["lon"]), runtime.icebergs_data or [], request.vessel_draft)
    if not path:
        raise HTTPException(422, "No viable route found.")
    distance = route_distance(path)
    return RouteResponse(route=[{"lat": lat, "lon": lon} for lat, lon in path], distance_km=distance, eta_minutes=eta_minutes(distance, request.vessel_speed))