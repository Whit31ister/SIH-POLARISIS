# POLARISIS - Autonomous Maritime Navigation System

A comprehensive system for real-time vessel route optimization in polar regions, featuring AI-driven hazard prediction and dynamic rerouting capabilities.

## System Architecture

- **Frontend:** React + TypeScript + MapLibre GL JS (Vite)
- **Backend:** FastAPI (Python) with PyTorch ML models
- **Integration:** C++ CLI client for onboard systems
- **Algorithms:** A* pathfinding + MLP hazard prediction

## Project Structure

```
SIH-POLARISIS/
├── frontend/                 # React web dashboard
│   ├── src/
│   │   ├── components/      # Map, Dashboard, ReplayController
│   │   ├── pages/           # Page components
│   │   ├── types/           # TypeScript interfaces
│   │   ├── utils/           # API client, helpers
│   │   └── App.tsx          # Main app component
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── index.html
├── backend/                  # FastAPI server
│   ├── app/
│   │   ├── main.py          # FastAPI application
│   │   ├── astar.py         # A* routing algorithm
│   │   ├── hazard_model.py  # PyTorch ML models
│   │   └── __init__.py
│   ├── data/
│   │   ├── ship.json        # Vessel state
│   │   ├── icebergs.json    # Iceberg positions & drift
│   │   └── ice_grid.json    # GeoJSON grid cells
│   ├── models/
│   │   └── hazard_model.pt  # Trained PyTorch model
│   └── requirements.txt      # Python dependencies
├── cpp-client/               # C++ integration client
│   ├── main.cpp             # Client implementation
│   └── CMakeLists.txt       # Build configuration
├── docker-compose.yml        # Multi-container deployment
└── README.md                 # This file
```

## Quick Start

### Prerequisites

- Node.js 16+ and npm
- Python 3.9+
- C++17 compiler (for C++ client)
- Docker & Docker Compose (optional)

### 1. Setup Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:5173`

### 2. Setup Backend

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

### 3. Build C++ Client (Optional)

```bash
cd cpp-client
mkdir build && cd build
cmake ..
make
./polarisis-client
```

## Features

### Step 1: Static Mock Data & API Contracts ✅

- Static JSON files in `backend/data/` directory:
  - `ship.json`: Current vessel state (position, speed, draft)
  - `icebergs.json`: Array of iceberg positions with drift vectors
  - `ice_grid.json`: GeoJSON grid of environmental conditions

- FastAPI endpoints:
  - `POST /route` - Calculate optimal route
  - `POST /decision` - Evaluate risk & recommend action
  - `GET /data/ship`, `/data/icebergs`, `/data/ice_grid` - Data access

### Step 2: Frontend Map & A* Routing ✅

- MapLibre GL JS map centered on Drake Passage (-62°S, -59°W)
- Dynamic map layers:
  - **Ship Marker** (green circle)
  - **Hazards** (icebergs as red markers, ice concentration overlays)
  - **Route Line** (green for safe, red for risky)

- A* algorithm implementation (`backend/app/astar.py`):
  - Uniform grid network across map area
  - Cost function: Distance + Ice Penalty + Iceberg Penalty + Depth Penalty + Weather Risk
  - Returns minimum-cost path as polyline

### Step 3: PyTorch Risk Prediction & Trajectory ✅

- Lightweight MLP model (`backend/app/hazard_model.py`):
  - **Inputs**: [ice_concentration, ice_drift, wind, wave_height, iceberg_distance, ship_speed, draft]
  - **Output**: hazard_probability (0.0 to 1.0)

- Iceberg trajectory prediction:
  - Linear drift projection for +3h, +6h, +12h windows
  - Collision risk evaluation
  - Dynamic rerouting triggers

### Step 4: Vessel Profile Support & C++ Client ✅

- Vessel profile integration in route cost calculation
- Draft-based shallow water penalties
- Ice capability class scaling
- C++ integration client with JSON communication

### Step 5: Polish Dashboard UI & Replay Controller ✅

- Dark-mode HUD dashboard with three panels:
  - **Vessel Info**: Name, Speed, Draft, Ice Rating, Position
  - **Threat Matrix**: Risk Score (progress bar), Iceberg count, Sea ice, Wave height
  - **AI Decision**: Alert banner, Confidence, ETA, Risk reduction metric

- Replay controller (bottom-left):
  - Play/Pause, Speed control (1x-8x), Reset
  - Real-time simulation of vessel movement and threat evolution

## API Documentation

### POST /route

Request:
```json
{
  "start": {"lat": -60.0, "lon": -60.0},
  "destination": {"lat": -64.0, "lon": -63.0},
  "vessel_speed": 12,
  "vessel_draft": 5.2,
  "ice_capability": "ARC3"
}
```

Response:
```json
{
  "route": [
    {"lat": -60.0, "lon": -60.0},
    {"lat": -61.0, "lon": -61.0},
    ...
  ],
  "eta_minutes": 1970,
  "distance_km": 394.5
}
```

### POST /decision

Request:
```json
{
  "vessel_speed": 12,
  "vessel_draft": 5.2,
  "ice_capability": "ARC3",
  "hazards": {
    "ice_concentration": 0.45,
    "wind_speed": 25.5,
    "wave_height": 3.2,
    "iceberg_distance": 8.5
  }
}
```

Response:
```json
{
  "risk_score": 0.62,
  "action": "REROUTE",
  "eta_minutes": 1970,
  "confidence": 0.87,
  "recommended_route": [...]
}
```

## Docker Deployment

```bash
docker-compose up -d
```

This will start:
- Frontend on port 5173
- Backend API on port 8000

## Configuration

### Environment Variables

**Backend** (`.env` in `backend/`):
```
API_PORT=8000
CORS_ORIGINS=["*"]
LOG_LEVEL=INFO
```

**Frontend** (`.env` in `frontend/`):
```
VITE_API_URL=http://localhost:8000
```

## Model Training

To train a custom hazard model:

```python
import torch
from app.hazard_model import HazardModel

model = HazardModel()
# ... training loop ...
torch.save(model.state_dict(), "backend/models/hazard_model.pt")
```

## Performance Metrics

- **A* Pathfinding**: ~50-100ms for Drake Passage region
- **Risk Prediction**: <5ms per evaluation
- **Frontend**: 60 FPS at 1920x1080
- **Memory Usage**: ~2GB backend (with model), ~500MB frontend

## Simulation Parameters

- **Grid Resolution**: 0.5° x 0.5° cells
- **Time Step**: 300 seconds (5 minutes)
- **Simulation Speed**: 1x-8x configurable multiplier
- **Update Frequency**: Every 30 minutes (simulated)

## Testing

### Unit Tests (Backend)
```bash
pytest backend/tests/
```

### Integration Tests
```bash
pytest backend/tests/integration/
```

## Known Limitations

1. Iceberg drift uses linear projection (doesn't account for Coriolis effect)
2. Sea ice model simplified (single concentration value)
3. Weather data is synthetic for demo purposes
4. C++ client uses JSON over HTTP (not optimized for low-latency)

## Future Enhancements

- Real-time weather data integration (NOAA API)
- Machine learning model fine-tuning with real incident data
- WebSocket support for live updates
- 3D visualization of subsurface hazards
- Multi-vessel coordination
- Satellite imagery integration

## Team & Attribution

**POLARISIS Project** - Autonomous Navigation for Polar Regions

## License

See LICENSE file

## Support

For issues, feature requests, or questions:
- Create an issue in the repository
- Contact: polarisis@example.com

---

**Last Updated**: August 2026  
**Status**: Beta  
**Version**: 0.1.0
