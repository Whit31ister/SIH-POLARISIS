from fastapi import APIRouter, HTTPException

from app.hazard_model import check_collision_risk
from app import runtime
from app.schemas import DecisionRequest, DecisionResponse
from services import clamp, eta_minutes, route_distance

router = APIRouter()


@router.post("/decision", response_model=DecisionResponse)
async def make_decision(request: DecisionRequest):
    if runtime.hazard_predictor is None:
        raise HTTPException(503, "Hazard predictor not initialized.")
    lat, lon = request.vessel_position["lat"], request.vessel_position["lon"]
    route = [(point["lat"], point["lon"]) for point in request.route] or [(lat, lon)]
    risk = clamp(float(runtime.hazard_predictor.predict_hazard(request.hazards)), 0, 1)
    collision, collision_score = check_collision_risk(lat, lon, route, runtime.icebergs_data or [], runtime.hazard_predictor)
    if collision:
        risk = max(risk, clamp(float(collision_score), 0, 1))
    action = "HALT" if risk >= 0.7 else "REROUTE" if risk >= 0.5 or collision else "PROCEED"
    recommended = route if action == "PROCEED" else [(lat, lon), (lat - 0.75, lon - 0.5), (lat - 1.5, lon - 1), (lat - 2.25, lon - 1.5), (lat - 3, lon - 2)]
    confidence = clamp(0.9 - abs(risk - 0.5) * 0.4, 0.5, 0.98)
    return DecisionResponse(risk_score=risk, action=action, confidence=confidence, eta_minutes=eta_minutes(route_distance(route), request.vessel_speed), recommended_route=[{"lat": p[0], "lon": p[1]} for p in recommended])