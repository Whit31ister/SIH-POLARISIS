# POLARISIS

POLARISIS is an AI-assisted polar maritime navigation decision-support prototype developed by VisionSeek for SIH. It helps an operator inspect a vessel's environment, compare route hazards, and evaluate a recommended action. It does not autonomously control a vessel; the navigator remains the final decision-maker.

## What It Does

The application combines:

- A React, TypeScript, Vite, and MapLibre operator dashboard.
- A FastAPI backend with A* route planning and a PyTorch hazard predictor.
- A deterministic browser simulation for vessel movement, iceberg drift, and changing conditions.
- NCPOR station observations with explicit live, cached, simulated, and error states.
- A small C++ HTTP client for integration experiments.

The normal decision flow is environmental data, hazard analysis, vessel-aware routing, risk assessment, and a recommended `PROCEED`, `REROUTE`, or `HALT` action.

## Run Everything

Requirements:

- Python 3.10 or newer. Python 3.14 works with the current dependency versions.
- Node.js and npm.
- A C++17 compiler and CMake only if the optional client is needed.

From the repository root:

```bash
./run-project.sh
```

The launcher creates `backend/venv` when necessary, installs missing backend and frontend dependencies, and starts both development servers. It uses port `8000` for FastAPI and `5173` for Vite. Press `Ctrl+C` once to stop both processes.

Open:

- Dashboard: http://localhost:5173
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

To run services separately, use `./run-backend.sh` and `./run-frontend.sh` in separate terminals. The manual commands are:

```bash
backend/venv/bin/python -m uvicorn app.main:app --app-dir backend --reload
npm --prefix frontend run dev
```

## Repository Layout

```text
backend/
  app/
    main.py                 FastAPI assembly, middleware, and lifecycle
    api/                    Thin health, data, route, decision, and simulation routers
    runtime.py              Shared datasets and model initialization
    schemas.py              Pydantic API contracts
    astar.py                A* route planner
    hazard_model.py         PyTorch model and collision projection
    ncpor.py                NCPOR adapter, cache, and fallback handling
  services.py               Shared route distance, ETA, and numeric helpers
  data/                     Ship, iceberg, grid, and NCPOR fallback data
frontend/
  src/
    App.tsx                 Page composition
    hooks/useSimulation.ts  Simulation state and playback engine
    components/             Map, dashboard, and replay controls
    utils/                  API, navigation, environment, and hazard helpers
    types/                  Shared TypeScript models
cpp-client/                 Optional C++ integration client
run-project.sh              Combined local development launcher
setup.sh                    Interactive legacy setup menu
```

`main.py` is intentionally small. API handlers live under `backend/app/api`, calculations live in domain helpers, and startup state is owned by `runtime.py`. `App.tsx` only assembles the page; simulation behavior belongs to `useSimulation.ts`.

## API

All endpoints are available under the root API URL.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Service health |
| GET | `/data/ship` | Demo vessel state |
| GET | `/data/icebergs` | Iceberg positions and drift |
| GET | `/data/ice_grid` | GeoJSON polar grid |
| GET | `/data/ncpor` | Maitri and Bharati observations |
| GET | `/data/environment` | Aggregate weather indicators |
| POST | `/route` | Vessel-aware A* route |
| POST | `/decision` | Hazard score and recommended action |
| POST | `/simulate` | Simulation metadata endpoint; playback runs in the browser |

Example route request:

```json
{
  "start": {"lat": -60, "lon": -60},
  "destination": {"lat": -64, "lon": -63},
  "vessel_speed": 12,
  "vessel_draft": 5.2,
  "ice_capability": "ARC3"
}
```

A decision request must include the current vessel position and route:

```json
{
  "vessel_speed": 12,
  "vessel_draft": 5.2,
  "ice_capability": "ARC3",
  "vessel_position": {"lat": -60, "lon": -60},
  "route": [{"lat": -60, "lon": -60}, {"lat": -64, "lon": -63}],
  "hazards": {
    "ice_concentration": 0.45,
    "wind_speed": 25.5,
    "wave_height": 3.2,
    "iceberg_distance": 8.5,
    "ship_speed": 12,
    "ship_draft": 5.2,
    "ice_drift": 15
  }
}
```

The response contains `risk_score`, `confidence`, `eta_minutes`, `action`, and `recommended_route`.

## NCPOR Data Policy

The backend performs one availability check for the NCPOR session. If the external pages are unreachable, it does not repeatedly hammer them during that process.

Station status is explicit:

- `LIVE`: fresh observation fetched from NCPOR.
- `STALE`: previously fetched observation loaded from the local cache.
- `SIMULATED`: deterministic demo observation from `backend/data/ncpor_fallback.json`.
- `ERROR`: no usable observation or fallback record exists.

The fallback keeps the dashboard and simulation usable when NCPOR is blocked by network, VPN, TLS, or regional access conditions. Simulated data is never labeled live.

## Frontend Simulation

The replay controls advance simulated time in five-minute steps. The hook updates vessel position along the current route, iceberg drift, environmental cycles, collision indicators, route progress, ETA, and risk state. Risk decisions are periodically requested from the backend. A `REROUTE` response replaces the active route and retains the previous route for comparison.

The dashboard is intentionally operator-focused. It puts the AI decision first, uses a grayscale interface, and uses color only for meaning: green for lower-risk/proceed states, amber for caution or simulated data, and red for halt/high-risk states.

## Configuration

Frontend configuration is read from `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
```

Use `frontend/.env.example` as a starting point. The Vite development proxy also forwards `/api` requests to port 8000, although the current client uses `VITE_API_URL` directly.

The local launcher uses these optional environment variables:

- `PYTHON_BIN`: Python executable used when creating a new backend virtual environment. Defaults to `python3`.
- `API_PORT`: leave unset or set to `8000`; the launcher currently uses port 8000.

Do not commit secrets. NCPOR URLs and demo data are public/non-secret configuration.

## Optional C++ Client

Install libcurl, jsoncpp, CMake, and a C++17 compiler, then run:

```bash
./build-cpp-client.sh
```

The client sends a decision request to the local API. It is an integration demonstration, not a certified onboard control system.

## Docker

Docker configuration is available for environments that already provide Docker Compose:

```bash
docker compose up --build
```

The local launcher is preferred for development because it uses the existing Python virtual environment and current workspace files directly.

## Verification

Useful checks from the repository root:

```bash
npm --prefix frontend install
npm --prefix frontend run build
backend/venv/bin/python -m compileall -q backend/app
curl http://localhost:8000/health
```

The production frontend build currently emits a non-blocking bundle-size warning because MapLibre is included in the main chunk. ESLint is not configured in the repository, so `npm run lint` is not currently a valid check.

## Limitations

- A* operates on the small demo GeoJSON grid and is not a complete nautical charting system.
- The hazard MLP is a lightweight prototype and is not trained or validated for operational navigation.
- Iceberg projection is linear over short time windows.
- Weather and NCPOR fallback observations are demonstration data when live observations are unavailable.
- MapLibre depends on its configured public demo style and network access.
- No component or backend automated test suite is currently included.
- This software must not be used as the sole basis for real vessel navigation.

## License

See [LICENSE](LICENSE).
