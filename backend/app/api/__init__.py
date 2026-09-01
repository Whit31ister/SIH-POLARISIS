from .data import router as data_router
from .decision import router as decision_router
from .health import router as health_router
from .route import router as route_router
from .simulation import router as simulation_router

__all__ = ["data_router", "decision_router", "health_router", "route_router", "simulation_router"]