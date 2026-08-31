export interface VesselState {
  lat: number;
  lon: number;
  speed: number;
  draft: number;
  name: string;
  iceRating: string;
  heading?: number;
}

export interface Iceberg {
  id: string;
  lat: number;
  lon: number;
  drift_lat: number;
  drift_lon: number;
  timestamp: number;
  size_class?: "small" | "medium" | "large";
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

/* ============================================================
   NCPOR LIVE STATION DATA
   ============================================================ */

export interface NCPORStation {
  id: "maitri" | "bharati";

  name: string;
  region: "Antarctica";

  lat: number;
  lon: number;

  temperature_c: number | null;
  relative_humidity_pct: number | null;
  pressure_mbar: number | null;
  wind_speed_knots: number | null;
  wind_speed_mps: number | null;

  observation_date: string | null;
  fetched_at: string;

  source_url: string;

  status: "LIVE" | "STALE" | "ERROR";
  error?: string;
}

export interface SimulationState {
  time: number;

  vessel: VesselState;

  icebergs: Iceberg[];

  gridCells: GridCell[];

  currentRoute: RoutePoint[];

  previousRoute: RoutePoint[];

  riskDecision: RiskDecision | null;

  ncporStations: NCPORStation[];
}