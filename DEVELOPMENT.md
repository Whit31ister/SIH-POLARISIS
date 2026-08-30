# POLARISIS Development Guide

## Getting Started

### 1. Initial Setup

Clone or navigate to the project directory and run:

```bash
bash setup.sh
```

This interactive script will guide you through the setup process.

### 2. Frontend Development

#### Install Dependencies

```bash
cd frontend
npm install
```

#### Development Server

```bash
npm run dev
```

The frontend will be available at `http://localhost:5173`

#### Build for Production

```bash
npm run build
```

#### Linting

```bash
npm run lint
```

### 3. Backend Development

#### Create Virtual Environment

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

#### Install Dependencies

```bash
pip install -r requirements.txt
```

#### Development Server

```bash
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`

#### API Documentation

Interactive API docs available at: `http://localhost:8000/docs`

### 4. C++ Client Development

#### Prerequisites

- CMake 3.10+
- libcurl (development headers)
- jsoncpp

#### Ubuntu/Debian

```bash
sudo apt-get install cmake libcurl4-openssl-dev libjsoncpp-dev
```

#### macOS

```bash
brew install cmake curl jsoncpp
```

#### Build

```bash
bash build-cpp-client.sh
```

#### Run

```bash
./cpp-client/build/polarisis-client
```

---

## Project Structure

### Frontend (`frontend/`)

```
src/
├── components/
│   ├── Map.tsx              # MapLibre GL visualization
│   ├── Dashboard.tsx        # HUD dashboard
│   ├── ReplayController.tsx # Simulation controls
│   ├── Dashboard.css
│   └── ReplayController.css
├── pages/                   # Page components (future)
├── hooks/                   # Custom React hooks
├── utils/
│   ├── api.ts               # API client (axios)
│   └── helpers.ts           # Utility functions
├── types/
│   └── index.ts             # TypeScript type definitions
├── App.tsx                  # Main application component
├── App.css
├── main.tsx                 # Entry point
└── index.css
```

### Backend (`backend/`)

```
app/
├── main.py                  # FastAPI application
├── astar.py                 # A* pathfinding algorithm
├── hazard_model.py          # PyTorch ML models
└── __init__.py
data/
├── ship.json                # Vessel state mock data
├── icebergs.json            # Iceberg positions & drift
└── ice_grid.json            # Environmental grid GeoJSON
models/
└── hazard_model.pt          # Trained PyTorch model (optional)
requirements.txt
```

### C++ Client (`cpp-client/`)

```
main.cpp                      # Client implementation
CMakeLists.txt               # Build configuration
```

---

## Key Algorithms

### A* Pathfinding

Located in: `backend/app/astar.py`

The A* algorithm finds the optimal route by evaluating:
- **Distance Cost**: Haversine distance between cells
- **Ice Penalty**: Based on sea ice concentration
- **Iceberg Penalty**: Proximity to detected icebergs
- **Depth Penalty**: Shallow water risk based on vessel draft
- **Weather Penalty**: Environmental hazard risk

**Time Complexity**: O(n log n) where n is grid cells  
**Space Complexity**: O(n)

### Hazard Prediction

Located in: `backend/app/hazard_model.py`

PyTorch MLP model for risk assessment:

```
Input Layer (7 features)
  ↓
Dense Layer (64 neurons) + ReLU
  ↓
Dense Layer (32 neurons) + ReLU
  ↓
Output Layer (1 neuron) + Sigmoid
  ↓
Hazard Probability (0.0-1.0)
```

**Inference Time**: <5ms  
**Model Size**: ~50KB

---

## Data Formats

### Ship State

```json
{
  "name": "POLARISIS",
  "lat": -60.0,
  "lon": -60.0,
  "speed": 12,
  "draft": 5.2,
  "ice_capability": "ARC3",
  "heading": 180,
  "timestamp": 0
}
```

### Iceberg

```json
{
  "id": "iceberg_001",
  "lat": -60.5,
  "lon": -59.5,
  "drift_lat": -0.3,
  "drift_lon": 0.1,
  "timestamp": 0,
  "size_class": "large"
}
```

### Grid Cell (GeoJSON Feature)

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[-60, -60], [-59.5, -60], ...]]
  },
  "properties": {
    "id": "cell_001",
    "depth": 3500,
    "ice_concentration": 0.45,
    "weather_risk": 0.65
  }
}
```

---

## Environmental Variables

### Backend

Create `backend/.env`:

```env
API_PORT=8000
API_HOST=0.0.0.0
CORS_ORIGINS=["*"]
LOG_LEVEL=INFO
```

### Frontend

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
VITE_MAP_CENTER_LAT=-62
VITE_MAP_CENTER_LON=-59
VITE_MAP_INITIAL_ZOOM=5
```

---

## Testing

### Backend Unit Tests

```bash
cd backend
pip install pytest
pytest tests/
```

### Frontend Tests

```bash
cd frontend
npm install --save-dev vitest
npm run test
```

---

## Docker Development

### Run All Services

```bash
docker-compose up -d
```

### View Logs

```bash
docker-compose logs -f
```

### Stop Services

```bash
docker-compose down
```

---

## Debugging

### Backend

1. **Enable detailed logging:**
   ```python
   import logging
   logging.basicConfig(level=logging.DEBUG)
   ```

2. **Use FastAPI debugger:**
   - Visit `http://localhost:8000/docs` for API testing
   - Use Swagger UI for endpoint exploration

3. **VSCode Debug Configuration:**
   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "name": "Python: FastAPI",
         "type": "python",
         "request": "launch",
         "module": "uvicorn",
         "args": ["app.main:app", "--reload"],
         "jinja": true,
         "cwd": "${workspaceFolder}/backend"
       }
     ]
   }
   ```

### Frontend

1. **React DevTools:** Install browser extension
2. **Vite Debug:** Built-in source maps in dev mode
3. **Network Tab:** Check API calls in browser DevTools

---

## Performance Optimization

### Frontend

- Use React.memo() for component memoization
- Implement virtual scrolling for large lists
- Lazy load map layers
- Optimize bundle size with dynamic imports

### Backend

- Cache grid data at startup
- Use numpy for vectorized operations
- Consider Redis caching for frequently computed routes
- Profile with py-spy: `py-spy record -o profile.svg -- python -m uvicorn app.main:app`

---

## Common Issues & Solutions

### Issue: CORS errors

**Solution:** Check backend CORS configuration in `app/main.py`

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change to specific origins in production
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Issue: Port already in use

**Solution:** Use different ports

```bash
# Frontend
npm run dev -- --port 5174

# Backend
uvicorn app.main:app --port 8001
```

### Issue: Module not found

**Solution:** Ensure Python path is correct

```bash
export PYTHONPATH="${PYTHONPATH}:/path/to/backend"
```

---

## Deployment

### Heroku Deployment

1. Create `Procfile`:
   ```
   web: gunicorn app.main:app
   ```

2. Deploy:
   ```bash
   heroku create your-app-name
   git push heroku main
   ```

### AWS Deployment

1. Use AWS Amplify for frontend
2. Use AWS Lambda + API Gateway for backend
3. Use AWS S3 for static files

---

## Contributing

1. Create feature branch: `git checkout -b feature/your-feature`
2. Make changes and test
3. Commit: `git commit -m "Add feature description"`
4. Push: `git push origin feature/your-feature`
5. Create Pull Request

---

## Resources

- [React Documentation](https://react.dev)
- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js-docs/)
- [PyTorch Documentation](https://pytorch.org/docs)

---

## Support

For issues or questions, create an issue in the repository or contact the development team.

---

**Last Updated**: August 2026  
**Maintained By**: POLARISIS Team
