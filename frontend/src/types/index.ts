export interface VesselState {
  lat: number;
  lon: number;

  speed: number;
  draft: number;

  name: string;
  iceRating: string;

  heading: number;
}


export interface Iceberg {
  id: string;

  lat: number;
  lon: number;

  drift_lat: number;
  drift_lon: number;

  timestamp: number;

  size?: "small" | "medium" | "large";
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

export interface AlternativeRoute {
  id: string;
  label: string;
  route: RoutePoint[];
  distance_km: number;
  risk_score: number;
  color: string;
}


export interface RiskDecision {
  risk_score: number;

  action:
    | "PROCEED"
    | "REROUTE"
    | "HALT";

  eta_minutes: number;

  confidence: number;

  recommended_route: RoutePoint[];
}


export interface NCPORStation {
  id: string;
  name: string;
  region: string;

  lat: number;
  lon: number;

  temperature_c: number | null;
  relative_humidity_pct: number | null;
  pressure_mbar: number | null;

  wind_speed_knots: number | null;
  wind_speed_mps: number | null;

  observation_date: string | null;

  fetched_at: number | null;

  source_url: string;

  status:
    | "LIVE"
    | "STALE"
    | "SIMULATED"
    | "ERROR";

  error: string | null;

  data_age_seconds: number | null;

  is_cached: boolean;
}


export interface EnvironmentState {
  air_temperature: number;

  sea_temperature: number;

  pressure: number;

  humidity: number;

  wind_speed: number;

  wind_direction: number;

  wave_height: number;

  wave_period: number;

  visibility: number;

  sea_ice_concentration: number;

  ice_thickness: number;

  current_speed: number;

  current_direction: number;

  source:
    | "LIVE"
    | "SIMULATED"
    | "STALE";
}


export interface IceHazardState {
  iceberg_count: number;

  nearest_iceberg_distance_km:
    | number
    | null;

  nearest_iceberg_id:
    | string
    | null;

  largest_iceberg_size:
    | "small"
    | "medium"
    | "large"
    | null;

  collision_risk: number;

  cpa_minutes: number | null;
}


export interface NavigationState {
  route_distance_km: number;

  remaining_distance_km: number;

  distance_travelled_km: number;

  eta_minutes: number;

  route_efficiency_pct: number;

  risk_reduction_pct: number | null;
}


export interface ThreatState {
  ice_risk: number;

  iceberg_risk: number;

  weather_risk: number;

  wave_risk: number;

  visibility_risk: number;

  overall_risk: number;
}


export interface SimulationState {
  time: number;

  vessel: VesselState;

  icebergs: Iceberg[];

  gridCells: GridCell[];

  currentRoute: RoutePoint[];

  previousRoute: RoutePoint[];
  destination: RoutePoint;
  alternativeRoutes: AlternativeRoute[];

  riskDecision: RiskDecision | null;

  ncporStations: NCPORStation[];

  environment: EnvironmentState;

  iceHazards: IceHazardState;

  navigation: NavigationState;

  threats: ThreatState;
}