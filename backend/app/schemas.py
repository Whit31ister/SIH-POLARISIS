from typing import Any

from pydantic import BaseModel, Field


class RouteRequest(BaseModel):
    start: dict[str, float]
    destination: dict[str, float]
    vessel_speed: float = Field(gt=0)
    vessel_draft: float = Field(gt=0)
    ice_capability: str = "ARC3"


class RouteResponse(BaseModel):
    route: list[dict[str, float]]
    eta_minutes: float
    distance_km: float


class DecisionRequest(BaseModel):
    vessel_speed: float = Field(gt=0)
    vessel_draft: float = Field(gt=0)
    ice_capability: str = "ARC3"
    vessel_position: dict[str, float]
    route: list[dict[str, float]] = Field(default_factory=list)
    hazards: dict[str, Any] = Field(default_factory=dict)


class DecisionResponse(BaseModel):
    risk_score: float
    action: str
    eta_minutes: int
    confidence: float
    recommended_route: list[dict[str, float]]