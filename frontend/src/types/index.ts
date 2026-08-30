export interface VesselState {
  lat: number;
  lon: number;
  speed: number;
  draft: number;
  name: string;
  iceRating: string;
}

export interface Iceberg {
  id: string;
  lat: number;
  lon: number;
  drift_lat: number;
  drift_lon: number;
  timestamp: number;
}

export interface GridCell {
  id: string;
  lat: number;
  lon: number;
  depth: number;
  ice_concentration: number;
  weather_risk: number;
}

export interface RoutePoint {
  lat: number;
  lon: number;
}

export interface RiskDecision {
  risk_score: number;
  action: "PROCEED" | "REROUTE" | "HALT";
  eta_minutes: number;
  confidence: number;
  recommended_route: RoutePoint[];
}

export interface SimulationState {
  time: number;
  vessel: VesselState;
  icebergs: Iceberg[];
  gridCells: GridCell[];
  currentRoute: RoutePoint[];
  previousRoute: RoutePoint[];
  riskDecision: RiskDecision | null;
}
