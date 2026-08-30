# POLARISIS Quick Reference

## 🚀 Quick Start (Choose One)

### Fastest Setup
```bash
bash setup.sh
# Select option 1 (Full setup)
```

### Backend Only
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

### Frontend Only
```bash
cd frontend
npm install
npm run dev
```

### Docker
```bash
docker-compose up -d
```

---

## 📍 Access Points

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:5173 | Web dashboard |
| Backend API | http://localhost:8000 | REST API |
| API Docs | http://localhost:8000/docs | Swagger UI |
| API Redoc | http://localhost:8000/redoc | ReDoc UI |

---

## 🔑 Key Files

### Frontend
- **Components:** `frontend/src/components/`
- **API Client:** `frontend/src/utils/api.ts`
- **Types:** `frontend/src/types/index.ts`
- **Config:** `frontend/vite.config.ts`

### Backend
- **Main App:** `backend/app/main.py`
- **A* Algorithm:** `backend/app/astar.py`
- **ML Model:** `backend/app/hazard_model.py`
- **Mock Data:** `backend/data/`

### C++ Client
- **Source:** `cpp-client/main.cpp`
- **Build:** `cpp-client/CMakeLists.txt`

---

## 🔧 Common Commands

### Development
```bash
# Frontend dev server
npm run dev

# Frontend build
npm run build

# Backend with hot reload
python -m uvicorn app.main:app --reload

# Run C++ client
./cpp-client/build/polarisis-client
```

### Testing
```bash
# Backend tests
cd backend && pytest tests/

# Frontend tests (if added)
cd frontend && npm run test
```

### Building
```bash
# Build C++ client
bash build-cpp-client.sh

# Build frontend for production
cd frontend && npm run build

# Build Docker images
docker-compose build
```

---

## 📊 API Quick Reference

### Get Ship Data
```bash
curl http://localhost:8000/data/ship
```

### Calculate Route
```bash
curl -X POST http://localhost:8000/route \
  -H "Content-Type: application/json" \
  -d '{
    "start": {"lat": -60.0, "lon": -60.0},
    "destination": {"lat": -64.0, "lon": -63.0},
    "vessel_speed": 12,
    "vessel_draft": 5.2,
    "ice_capability": "ARC3"
  }'
```

### Get Risk Decision
```bash
curl -X POST http://localhost:8000/decision \
  -H "Content-Type: application/json" \
  -d '{
    "vessel_speed": 12,
    "vessel_draft": 5.2,
    "ice_capability": "ARC3",
    "hazards": {
      "ice_concentration": 0.45,
      "wind_speed": 25.5,
      "wave_height": 3.2,
      "iceberg_distance": 8.5,
      "ship_speed": 12,
      "ship_draft": 5.2,
      "ice_drift": 15.0
    }
  }'
```

---

## 🧬 Project Structure

```
SIH-POLARISIS/
├── frontend/                # React app (port 5173)
├── backend/                 # FastAPI (port 8000)
├── cpp-client/              # C++ integration
├── README.md                # Project overview
├── API.md                   # API documentation
├── DEVELOPMENT.md           # Dev guide
├── IMPLEMENTATION.md        # What was built
├── docker-compose.yml       # Docker setup
└── setup.sh                 # Interactive setup
```

---

## 🎯 Features

- ✅ Real-time route optimization with A* algorithm
- ✅ PyTorch-based hazard prediction (MLP model)
- ✅ Interactive map with MapLibre GL
- ✅ Dark-mode HUD dashboard
- ✅ Live simulation with time controls
- ✅ C++ integration client
- ✅ REST API with OpenAPI docs
- ✅ Docker deployment ready

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find process using port
lsof -i :8000           # Backend
lsof -i :5173           # Frontend

# Kill process
kill -9 <PID>
```

### Python Module Errors
```bash
# Ensure Python path is correct
export PYTHONPATH="${PYTHONPATH}:/path/to/backend"

# Reinstall dependencies
pip install --upgrade -r requirements.txt
```

### Node Dependency Issues
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### CORS Errors
Check `backend/app/main.py` CORS configuration. By default allows all origins (`*`).

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| `README.md` | Project overview & setup |
| `API.md` | Complete API reference |
| `DEVELOPMENT.md` | Development guide |
| `IMPLEMENTATION.md` | Implementation details |
| Code comments | Inline documentation |

---

## 🔐 Environment Variables

### Backend (.env)
```
API_PORT=8000
API_HOST=0.0.0.0
CORS_ORIGINS=["*"]
LOG_LEVEL=INFO
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:8000
VITE_MAP_CENTER_LAT=-62
VITE_MAP_CENTER_LON=-59
VITE_MAP_INITIAL_ZOOM=5
```

---

## 💡 Tips & Tricks

1. **Watch API docs:** http://localhost:8000/docs - Perfect for testing endpoints
2. **React DevTools:** Install browser extension for debugging React components
3. **Network tab:** Use browser DevTools to inspect API calls
4. **Backend logs:** Check terminal for FastAPI request logs and debug info
5. **Simulation speed:** Use replay controller to test different scenarios

---

## 🎓 Learning Resources

- [React](https://react.dev)
- [FastAPI](https://fastapi.tiangolo.com)
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js-docs/)
- [PyTorch](https://pytorch.org/docs)
- [A* Algorithm](https://en.wikipedia.org/wiki/A*_search_algorithm)

---

## 📞 Getting Help

1. Check documentation files (`README.md`, `DEVELOPMENT.md`, etc.)
2. Review API documentation (`API.md`)
3. Check backend logs for errors
4. Look at browser console for frontend errors
5. Check FastAPI interactive docs: http://localhost:8000/docs

---

**Ready to explore POLARISIS? Start with `bash setup.sh`! 🚀**
