import heapq
import math
from typing import List, Tuple, Dict
import numpy as np


class AStar:
    """A* pathfinding algorithm for route optimization"""

    def __init__(self, grid_cells: Dict, width: float = 5.0, height: float = 5.0):
        """
        Initialize A* pathfinder with grid

        Args:
            grid_cells: Dictionary of grid cells with their properties
            width: Width of grid cell in degrees
            height: Height of grid cell in degrees
        """
        self.grid_cells = grid_cells
        self.cell_width = width
        self.cell_height = height
        self.node_map: Dict[Tuple[float, float], Dict] = {}
        self._build_grid()

    def _build_grid(self):
        """Build navigable grid from grid cells"""
        for cell in self.grid_cells:
            lat = cell["geometry"]["coordinates"][0][0][1]
            lon = cell["geometry"]["coordinates"][0][0][0]
            self.node_map[(lat, lon)] = cell["properties"]

    def heuristic(self, pos: Tuple[float, float], goal: Tuple[float, float]) -> float:
        """Calculate heuristic distance using Haversine formula"""
        lat1, lon1 = pos
        lat2, lon2 = goal
        
        R = 6371  # Earth radius in km
        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lon2 - lon1)
        
        a = math.sin(delta_phi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c

    def get_neighbors(self, pos: Tuple[float, float]) -> List[Tuple[float, float]]:
        """Get neighboring grid cells"""
        neighbors = []
        lat, lon = pos
        
        for dlat in [-self.cell_height, 0, self.cell_height]:
            for dlon in [-self.cell_width, 0, self.cell_width]:
                if dlat == 0 and dlon == 0:
                    continue
                neighbor = (lat + dlat, lon + dlon)
                if neighbor in self.node_map:
                    neighbors.append(neighbor)
        
        return neighbors

    def calculate_cost(self, pos: Tuple[float, float], icebergs: List, vessel_draft: float) -> float:
        """
        Calculate traversal cost for a grid cell

        Cost = Distance + Ice Penalty + Iceberg Penalty + Shallow Water Penalty
        """
        if pos not in self.node_map:
            return float('inf')

        cell = self.node_map[pos]
        
        # Base distance cost
        distance_cost = 1.0
        
        # Ice concentration penalty
        ice_penalty = cell.get("ice_concentration", 0) * 5.0
        
        # Shallow water penalty
        depth = cell.get("depth", 5000)
        shallow_penalty = 0
        if depth < vessel_draft * 1.5:
            shallow_penalty = (vessel_draft / depth) * 10.0
        
        # Iceberg proximity penalty
        iceberg_penalty = 0
        for iceberg in icebergs:
            dist = self.heuristic(pos, (iceberg["lat"], iceberg["lon"]))
            if dist < 2.0:  # Within 2 km
                iceberg_penalty += (2.0 - dist) * 5.0
        
        # Weather risk penalty
        weather_penalty = cell.get("weather_risk", 0) * 3.0
        
        total_cost = distance_cost + ice_penalty + shallow_penalty + iceberg_penalty + weather_penalty
        return total_cost

    def find_path(
        self,
        start: Tuple[float, float],
        goal: Tuple[float, float],
        icebergs: List,
        vessel_draft: float
    ) -> List[Tuple[float, float]]:
        """
        Find optimal path from start to goal using A*

        Args:
            start: Starting position (lat, lon)
            goal: Goal position (lat, lon)
            icebergs: List of iceberg positions
            vessel_draft: Vessel draft for shallow water penalties

        Returns:
            List of waypoints forming the optimal path
        """
        open_set = [(0, id(start), start)]
        came_from = {}
        g_score = {start: 0}
        f_score = {start: self.heuristic(start, goal)}
        closed_set = set()

        while open_set:
            _, _, current = heapq.heappop(open_set)
            
            if current in closed_set:
                continue
                
            closed_set.add(current)

            if self.heuristic(current, goal) < 0.5:  # Close enough to goal
                return self._reconstruct_path(came_from, current)

            for neighbor in self.get_neighbors(current):
                if neighbor in closed_set:
                    continue

                tentative_g = g_score[current] + self.calculate_cost(neighbor, icebergs, vessel_draft)

                if neighbor not in g_score or tentative_g < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g
                    f_score[neighbor] = tentative_g + self.heuristic(neighbor, goal)
                    heapq.heappush(open_set, (f_score[neighbor], id(neighbor), neighbor))

        return [start, goal]  # Return direct path if no route found

    def _reconstruct_path(self, came_from: Dict, current: Tuple[float, float]) -> List[Tuple[float, float]]:
        """Reconstruct path from came_from map"""
        path = [current]
        while current in came_from:
            current = came_from[current]
            path.append(current)
        return path[::-1]
