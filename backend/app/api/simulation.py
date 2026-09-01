from fastapi import APIRouter

router = APIRouter()


@router.post("/simulate")
async def simulate(duration_hours: int = 12, speed_multiplier: float = 1.0):
    return {"message": "Simulation endpoint - frontend playback currently active", "duration_hours": duration_hours, "speed_multiplier": speed_multiplier}