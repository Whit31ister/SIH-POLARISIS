import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import data_router, decision_router, health_router, route_router, simulation_router
from app.runtime import initialize

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="POLARISIS Maritime Navigation System",
    version="1.0.0",
    description="AI-assisted polar maritime navigation decision support.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(health_router)
app.include_router(data_router)
app.include_router(route_router)
app.include_router(decision_router)
app.include_router(simulation_router)


@app.on_event("startup")
async def startup_event():
    initialize()


@app.on_event("shutdown")
async def shutdown_event():
    logging.getLogger(__name__).info("Shutting down POLARISIS backend")
