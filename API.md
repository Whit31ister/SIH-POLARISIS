# POLARISIS API Documentation

## Base URL

```
http://localhost:8000
```

## Endpoints

### Health Check

#### GET /health

Check if the API is running.

**Response:**
```json
{
  "status": "healthy",
  "service": "POLARISIS Maritime Navigation System"
}
```

---

### Data Endpoints

#### GET /data/ship

Get current vessel state.

**Response:**
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

#### GET /data/icebergs

Get iceberg positions and drift vectors.

**Response:**
```json
[
  {
    "id": "iceberg_001",
    "lat": -60.5,
    "lon": -59.5,
    "drift_lat": -0.3,
    "drift_lon": 0.1,
    "timestamp": 0,
    "size_class": "large"
  },
  ...
]
```

#### GET /data/ice_grid

Get environmental grid data.

**Response:**
```json
[
  {
    "id": "cell_001",
    "depth": 3500,
    "ice_concentration": 0.45,
    "weather_risk": 0.65
  },
  ...
]
```

---

### Route Calculation

#### POST /route

Calculate optimal route using A* algorithm.

**Request:**
```json
{
  "start": {
    "lat": -60.0,
    "lon": -60.0
  },
  "destination": {
    "lat": -64.0,
    "lon": -63.0
  },
  "vessel_speed": 12,
  "vessel_draft": 5.2,
  "ice_capability": "ARC3"
}
```

**Response:**
```json
{
  "route": [
    {
      "lat": -60.0,
      "lon": -60.0
    },
    {
      "lat": -60.5,
      "lon": -60.5
    },
    ...
  ],
  "eta_minutes": 1970,
  "distance_km": 394.5
}
```

**Parameters:**
- `start`: Starting position (latitude, longitude)
- `destination`: Goal position (latitude, longitude)
- `vessel_speed`: Current speed in knots
- `vessel_draft`: Vessel draft in meters
- `ice_capability`: Ice class rating (e.g., "ARC3", "ARC2", "ARC1")

**Returns:**
- `route`: Array of waypoints forming the optimal path
- `eta_minutes`: Estimated time of arrival in minutes
- `distance_km`: Total route distance in kilometers

---

### Risk Assessment & Decision

#### POST /decision

Evaluate maritime hazards and recommend navigation decision.

**Request:**
```json
{
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
}
```

**Response:**
```json
{
  "risk_score": 0.62,
  "action": "REROUTE",
  "eta_minutes": 1970,
  "confidence": 0.87,
  "recommended_route": [
    {
      "lat": -60.0,
      "lon": -60.0
    },
    {
      "lat": -61.0,
      "lon": -61.0
    },
    ...
  ]
}
```

**Parameters (hazards):**
- `ice_concentration`: Sea ice concentration (0.0-1.0)
- `wind_speed`: Wind speed in knots
- `wave_height`: Wave height in meters
- `iceberg_distance`: Distance to nearest iceberg in km
- `ship_speed`: Vessel speed in knots
- `ship_draft`: Vessel draft in meters
- `ice_drift`: Ice drift speed in m/s

**Returns:**
- `risk_score`: Computed hazard probability (0.0-1.0)
  - 0.0-0.3: Low risk
  - 0.3-0.6: Moderate risk
  - 0.6-1.0: High risk
- `action`: Recommended navigation decision
  - `"PROCEED"`: Safe to continue on current course
  - `"REROUTE"`: Recommended to change course
  - `"HALT"`: Immediate course halt advised
- `eta_minutes`: Estimated time of arrival
- `confidence`: Confidence in the recommendation (0.0-1.0)
- `recommended_route`: Alternative route waypoints if action is "REROUTE"

---

### Simulation

#### POST /simulate

Run a dynamic simulation (in development).

**Request:**
```json
{
  "duration_hours": 12,
  "speed_multiplier": 1.0
}
```

**Response:**
```json
{
  "message": "Simulation endpoint - to be implemented",
  "duration_hours": 12,
  "speed_multiplier": 1.0
}
```

---

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200 OK`: Request successful
- `400 Bad Request`: Invalid input parameters
- `503 Service Unavailable`: Models/data not initialized

**Error Response:**
```json
{
  "detail": "Error description"
}
```

---

## Examples

### Example 1: Calculate Route

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

### Example 2: Get Risk Assessment

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

## Rate Limiting

No rate limiting is currently implemented. Production deployments should include appropriate rate limiting.

---

## WebSocket Support

WebSocket endpoints for real-time updates are planned for future releases.

---

## Version

API Version: 1.0  
Last Updated: August 2026
