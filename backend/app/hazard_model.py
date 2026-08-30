import torch
import torch.nn as nn
import numpy as np
from typing import Dict, List, Tuple
import os


class HazardModel(nn.Module):
    """
    PyTorch MLP model for maritime hazard prediction

    Inputs: [ice_concentration, ice_drift, wind, wave_height, iceberg_distance, ship_speed, draft]
    Output: hazard_probability (0.0 to 1.0)
    """

    def __init__(self, input_size: int = 7, hidden_size: int = 64):
        super(HazardModel, self).__init__()
        
        self.fc1 = nn.Linear(input_size, hidden_size)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(hidden_size, hidden_size // 2)
        self.fc3 = nn.Linear(hidden_size // 2, 1)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass through the network"""
        x = self.fc1(x)
        x = self.relu(x)
        x = self.fc2(x)
        x = self.relu(x)
        x = self.fc3(x)
        x = self.sigmoid(x)
        return x

    def predict(self, ice_concentration: float, ice_drift: float, wind: float,
                wave_height: float, iceberg_distance: float, ship_speed: float,
                draft: float) -> float:
        """
        Predict hazard probability for current conditions

        Args:
            ice_concentration: Sea ice concentration (0.0-1.0)
            ice_drift: Ice drift speed (m/s)
            wind: Wind speed (knots)
            wave_height: Wave height (meters)
            iceberg_distance: Closest iceberg distance (km)
            ship_speed: Vessel speed (knots)
            draft: Vessel draft (meters)

        Returns:
            Hazard probability (0.0-1.0)
        """
        # Normalize inputs
        inputs = torch.tensor([
            ice_concentration,  # 0-1
            ice_drift / 50.0,   # Normalize to ~0-1
            wind / 50.0,        # Normalize to ~0-1
            wave_height / 10.0, # Normalize to ~0-1
            min(iceberg_distance / 10.0, 1.0),  # Normalize 10km distance
            ship_speed / 25.0,  # Normalize to ~0-1
            draft / 10.0        # Normalize to ~0-1
        ], dtype=torch.float32)

        with torch.no_grad():
            output = self.forward(inputs.unsqueeze(0))
        
        return output.item()


class HazardPredictor:
    """Wrapper for hazard prediction with model management"""

    def __init__(self, model_path: str = None):
        self.model = HazardModel()
        self.model_path = model_path or "backend/models/hazard_model.pt"
        
        # Load model if exists, otherwise use random weights for demo
        if os.path.exists(self.model_path):
            self.model.load_state_dict(torch.load(self.model_path))
        
        self.model.eval()

    def predict_hazard(self, hazard_data: Dict) -> float:
        """
        Predict hazard probability from environmental data

        Args:
            hazard_data: Dictionary with keys:
                - ice_concentration: 0.0-1.0
                - wind_speed: knots
                - wave_height: meters
                - iceberg_distance: km
                - ship_speed: knots
                - ship_draft: meters
                - ice_drift: m/s (optional)

        Returns:
            Hazard probability (0.0-1.0)
        """
        return self.model.predict(
            ice_concentration=hazard_data.get("ice_concentration", 0.3),
            ice_drift=hazard_data.get("ice_drift", 15.0),
            wind=hazard_data.get("wind_speed", 20.0),
            wave_height=hazard_data.get("wave_height", 3.0),
            iceberg_distance=hazard_data.get("iceberg_distance", 10.0),
            ship_speed=hazard_data.get("ship_speed", 12.0),
            draft=hazard_data.get("ship_draft", 5.0)
        )

    def predict_trajectory(self, iceberg: Dict, time_window_hours: List[float]) -> List[Tuple[float, float]]:
        """
        Predict iceberg trajectory for multiple time windows

        Args:
            iceberg: Dictionary with 'lat', 'lon', 'drift_lat', 'drift_lon'
            time_window_hours: List of hours to predict (e.g., [3, 6, 12])

        Returns:
            List of (lat, lon) tuples for each time window
        """
        trajectory = []
        for hours in time_window_hours:
            new_lat = iceberg["lat"] + iceberg["drift_lat"] * (hours / 24.0)
            new_lon = iceberg["lon"] + iceberg["drift_lon"] * (hours / 24.0)
            trajectory.append((new_lat, new_lon))
        
        return trajectory


def initialize_hazard_model() -> HazardPredictor:
    """Initialize hazard prediction model"""
    return HazardPredictor()


def check_collision_risk(
    vessel_lat: float,
    vessel_lon: float,
    route: List[Tuple[float, float]],
    icebergs: List[Dict],
    predictor: HazardPredictor
) -> Tuple[bool, float]:
    """
    Check if current route has collision risk with projected iceberg positions

    Args:
        vessel_lat, vessel_lon: Current vessel position
        route: List of waypoints in route
        icebergs: List of icebergs with position and drift
        predictor: HazardPredictor instance

    Returns:
        Tuple of (collision_risk: bool, risk_score: float)
    """
    collision_threshold = 0.5
    risk_scores = []

    for iceberg in icebergs:
        trajectory = predictor.predict_trajectory(iceberg, [3, 6, 12])
        
        for projected_pos in trajectory:
            # Check distance to each route waypoint
            for waypoint in route:
                lat_diff = (waypoint[0] - projected_pos[0]) * 111  # km per degree
                lon_diff = (waypoint[1] - projected_pos[1]) * 111 * np.cos(np.radians(waypoint[0]))
                distance = np.sqrt(lat_diff**2 + lon_diff**2)
                
                if distance < 2.0:  # Within 2 km
                    risk_scores.append(1.0 - (distance / 2.0))

    if risk_scores:
        max_risk = max(risk_scores)
        return max_risk > collision_threshold, max_risk
    
    return False, 0.0
