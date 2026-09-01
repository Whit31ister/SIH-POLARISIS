import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchNCPORData,
  fetchRiskDecision,
  fetchRoute,
  fetchSimulationData,
} from "../utils/api";
import {
  calculateBearing,
  calculateRouteDistance,
  haversineDistance,
  moveAlongRoute,
} from "../utils/navigation";
import { generateEnvironment } from "../utils/environment";
import { calculateIcebergHazards, calculateThreats } from "../utils/hazards";
import { AlternativeRoute, EnvironmentState, RoutePoint, SimulationState, VesselState } from "../types";

const TICK_MS = 250;
const SIMULATION_SECONDS_PER_TICK = 300;
const DECISION_INTERVAL_SECONDS = 1800;
const NCPOR_DELAY_MS = 5000;

const DESTINATION: RoutePoint = { lat: -64, lon: -63 };
const ALTERNATIVE_COLORS = ["#e0aa4b", "#d8895b", "#c47ac0", "#79a8d8", "#79c1b0"];
const DEFAULT_VESSEL: VesselState = {
  lat: -60,
  lon: -60,
  speed: 12,
  draft: 5.2,
  name: "POLARISIS",
  iceRating: "ARC3",
  heading: 0,
};

function createInitialState(): SimulationState {
  return {
    time: 0,
    vessel: DEFAULT_VESSEL,
    icebergs: [],
    gridCells: [],
    currentRoute: [],
    previousRoute: [],
    destination: DESTINATION,
    alternativeRoutes: [],
    riskDecision: null,
    ncporStations: [],
    environment: generateEnvironment(DEFAULT_VESSEL.lat, DEFAULT_VESSEL.lon, 0),
    iceHazards: {
      iceberg_count: 0,
      nearest_iceberg_distance_km: null,
      nearest_iceberg_id: null,
      largest_iceberg_size: null,
      collision_risk: 0,
      cpa_minutes: null,
    },
    navigation: {
      route_distance_km: 0,
      remaining_distance_km: 0,
      distance_travelled_km: 0,
      eta_minutes: 0,
      route_efficiency_pct: 100,
      risk_reduction_pct: null,
    },
    threats: {
      ice_risk: 0,
      iceberg_risk: 0,
      weather_risk: 0,
      wave_risk: 0,
      visibility_risk: 0,
      overall_risk: 0,
    },
  };
}

function preferredStation(stations: SimulationState["ncporStations"]) {
  return stations.find((station) => station.status === "LIVE")
    ?? stations.find((station) => station.status === "STALE")
    ?? stations.find((station) => station.status === "SIMULATED");
}

function applyStationEnvironment(
  environment: EnvironmentState,
  stations: SimulationState["ncporStations"],
): EnvironmentState {
  const station = preferredStation(stations);
  if (!station) return environment;

  return {
    ...environment,
    air_temperature: station.temperature_c ?? environment.air_temperature,
    humidity: station.relative_humidity_pct ?? environment.humidity,
    pressure: station.pressure_mbar ?? environment.pressure,
    wind_speed: station.wind_speed_knots ?? environment.wind_speed,
    source: station.status === "LIVE" ? "LIVE" : station.status === "STALE" ? "STALE" : "SIMULATED",
  };
}

function travelledRoute(route: RoutePoint[], origin: RoutePoint, vessel: RoutePoint) {
  if (route.length < 2) return [];
  const result = [origin];
  for (const point of route) {
    if (point.lat === origin.lat && point.lon === origin.lon) continue;
    result.push(point);
    if (Math.abs(point.lat - vessel.lat) < 0.1 && Math.abs(point.lon - vessel.lon) < 0.1) break;
  }
  return result;
}

export function useSimulation() {
  const [simulation, setSimulation] = useState(createInitialState);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const origin = useRef<RoutePoint>(DEFAULT_VESSEL);
  const lastDecisionBucket = useRef(-1);
  const simulationRef = useRef<SimulationState>(simulation);

  useEffect(() => {
    simulationRef.current = simulation;
  }, [simulation]);

  const generateAlternatives = useCallback((start: RoutePoint, destination: RoutePoint, environment: EnvironmentState, icebergs: SimulationState["icebergs"]): AlternativeRoute[] => {
    const latDelta = destination.lat - start.lat;
    const lonDelta = destination.lon - start.lon;
    const offsets = [-0.9, -0.45, 0.45, 0.9, 1.35];
    return offsets.map((offset, index) => {
      const waypoint = {
        lat: start.lat + latDelta * 0.5 + offset,
        lon: start.lon + lonDelta * 0.5 + offset * 0.35,
      };
      const route = [start, waypoint, destination];
      const distance = calculateRouteDistance(route);
      const routeSamples = [start, waypoint, destination];
      const closestIceberg = icebergs.reduce((minimum, iceberg) => {
        const distanceToRoute = Math.min(
          ...routeSamples.map((point) => haversineDistance(point, iceberg)),
        );
        return Math.min(minimum, distanceToRoute);
      }, Infinity);
      const icebergExposure = Number.isFinite(closestIceberg)
        ? Math.max(0, 1 - closestIceberg / 140) * 0.5
        : 0;
      const weatherExposure = environment.wind_speed / 140;
      const iceExposure = environment.sea_ice_concentration * 0.22;
      const southernIceExposure = Math.max(0, Math.min(1, (-waypoint.lat - 60) / 5)) * 0.22;
      const detourExposure = Math.max(0, distance - Math.abs(latDelta) * 111) / 1200;
      const risk = Math.min(1, iceExposure + weatherExposure + icebergExposure + southernIceExposure + detourExposure);
      return { id: `alternative-${index + 1}`, label: `Alternative ${index + 1}`, route, distance_km: distance, risk_score: risk, color: ALTERNATIVE_COLORS[index] };
    });
  }, []);

  const selectDestination = useCallback(async (destination: RoutePoint) => {
    setSimulation((current) => ({ ...current, destination, alternativeRoutes: [] }));
    const current = simulationRef.current;
    try {
      const route = await fetchRoute({ lat: current.vessel.lat, lon: current.vessel.lon }, destination, current.vessel);
      const alternatives = generateAlternatives({ lat: current.vessel.lat, lon: current.vessel.lon }, destination, current.environment, current.icebergs);
      setSimulation((latest) => ({ ...latest, destination, currentRoute: route, alternativeRoutes: alternatives, navigation: { ...latest.navigation, route_distance_km: calculateRouteDistance(route), remaining_distance_km: calculateRouteDistance(route) } }));
    } catch (error) {
      console.error("Failed to calculate route for destination:", error);
    }
  }, [generateAlternatives]);

  const chooseAlternative = useCallback((routeId: string) => {
    setSimulation((current) => {
      const selected = current.alternativeRoutes.find((alternative) => alternative.id === routeId);
      if (!selected) return current;
      return { ...current, previousRoute: current.currentRoute, currentRoute: selected.route, alternativeRoutes: current.alternativeRoutes.filter((alternative) => alternative.id !== routeId), navigation: { ...current.navigation, route_distance_km: selected.distance_km, remaining_distance_km: selected.distance_km, risk_reduction_pct: Math.max(0, (current.threats.overall_risk - selected.risk_score) / Math.max(current.threats.overall_risk, 0.01)) * 100 } };
    });
  }, []);

  const rejectAlternative = useCallback((routeId: string) => {
    setSimulation((current) => ({
      ...current,
      alternativeRoutes: current.alternativeRoutes.filter((alternative) => alternative.id !== routeId),
    }));
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await fetchSimulationData();
        if (!active) return;
        const vessel: VesselState = {
          ...DEFAULT_VESSEL,
          lat: data.ship?.lat ?? DEFAULT_VESSEL.lat,
          lon: data.ship?.lon ?? DEFAULT_VESSEL.lon,
          speed: data.ship?.speed ?? DEFAULT_VESSEL.speed,
          draft: data.ship?.draft ?? DEFAULT_VESSEL.draft,
          name: data.ship?.name ?? DEFAULT_VESSEL.name,
          iceRating: data.ship?.iceRating ?? data.ship?.ice_capability ?? DEFAULT_VESSEL.iceRating,
        };
        origin.current = { lat: vessel.lat, lon: vessel.lon };
        setSimulation((current) => ({ ...current, vessel, icebergs: data.icebergs ?? [], gridCells: data.grid ?? [] }));
        const route = await fetchRoute(origin.current, DESTINATION, vessel);
        if (!active) return;
        const distance = calculateRouteDistance(route);
        const iceHazards = calculateIcebergHazards(vessel, data.icebergs ?? [], vessel.speed);
        const threats = calculateThreats(
          generateEnvironment(vessel.lat, vessel.lon, 0),
          iceHazards.collision_risk,
          vessel.iceRating,
        );
        setSimulation((current) => ({
          ...current,
          currentRoute: route,
          vessel,
          icebergs: data.icebergs ?? [],
          gridCells: data.grid ?? [],
          iceHazards,
          threats,
          destination: DESTINATION,
          alternativeRoutes: generateAlternatives(
            origin.current,
            DESTINATION,
            current.environment,
            data.icebergs ?? [],
          ),
          navigation: { ...current.navigation, route_distance_km: distance, remaining_distance_km: distance },
        }));
      } catch (error) {
        console.error("Failed to load simulation:", error);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const data = await fetchNCPORData();
        if (!active) return;
        setSimulation((current) => ({
          ...current,
          ncporStations: data.stations ?? [],
          environment: applyStationEnvironment(current.environment, data.stations ?? []),
        }));
      } catch (error) {
        console.warn("NCPOR unavailable; simulated fallback remains active.", error);
      }
    }, NCPOR_DELAY_MS);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = window.setInterval(() => {
      setSimulation((current) => {
        const seconds = SIMULATION_SECONDS_PER_TICK * speed;
        const nextTime = current.time + seconds;
        const distanceMoved = current.vessel.speed * 1.852 * (seconds / 3600);
        const moved = moveAlongRoute(current.vessel, current.currentRoute, distanceMoved);
        const vessel = {
          ...moved,
          heading: calculateBearing(current.vessel, moved),
        };
        const icebergs = current.icebergs.map((iceberg) => ({
          ...iceberg,
          lat: iceberg.lat + iceberg.drift_lat * (seconds / 3600),
          lon: iceberg.lon + iceberg.drift_lon * (seconds / 3600),
        }));
        const environment = applyStationEnvironment(
          generateEnvironment(vessel.lat, vessel.lon, nextTime), current.ncporStations,
        );
        const iceHazards = calculateIcebergHazards(vessel, icebergs, vessel.speed);
        const threats = calculateThreats(environment, iceHazards.collision_risk, vessel.iceRating);
        const routeDistance = calculateRouteDistance(current.currentRoute);
        const travelled = calculateRouteDistance(travelledRoute(current.currentRoute, origin.current, vessel));
        const remaining = Math.max(0, routeDistance - travelled);
        const eta = vessel.speed > 0 ? (remaining / (vessel.speed * 1.852)) * 60 : 0;
        const bucket = Math.floor(nextTime / DECISION_INTERVAL_SECONDS);
        if (bucket > lastDecisionBucket.current) {
          lastDecisionBucket.current = bucket;
          void fetchRiskDecision(vessel, { ...environment, icebergs, nearest_iceberg_distance: iceHazards.nearest_iceberg_distance_km, threat_vector: threats }, current.currentRoute)
            .then((decision) => setSimulation((latest) => {
              if (decision.action !== "REROUTE") {
                return { ...latest, riskDecision: decision };
              }
              const oldDistance = calculateRouteDistance(latest.currentRoute);
              const newDistance = calculateRouteDistance(decision.recommended_route);
              return {
                ...latest,
                riskDecision: decision,
                previousRoute: latest.currentRoute,
                currentRoute: decision.recommended_route,
                navigation: {
                  ...latest.navigation,
                  route_distance_km: newDistance,
                  risk_reduction_pct: oldDistance > 0 ? Math.max(0, (oldDistance - newDistance) / oldDistance) * 100 : 0,
                },
              };
            }))
            .catch((error) => console.error("Risk decision failed:", error));
        }
        return {
          ...current,
          time: nextTime,
          vessel,
          icebergs,
          environment,
          iceHazards,
          threats,
          navigation: {
            ...current.navigation,
            remaining_distance_km: remaining,
            distance_travelled_km: Math.max(0, routeDistance - remaining),
            eta_minutes: eta,
            route_efficiency_pct: routeDistance > 0 ? Math.min(100, ((routeDistance - remaining) / routeDistance) * 100) : 100,
          },
        };
      });
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [isPlaying, speed]);

  const reset = useCallback(() => {
    setIsPlaying(false);
    lastDecisionBucket.current = -1;
    setSimulation((current) => ({ ...createInitialState(), currentRoute: current.currentRoute, icebergs: current.icebergs, gridCells: current.gridCells, ncporStations: current.ncporStations, destination: current.destination, alternativeRoutes: current.alternativeRoutes }));
  }, []);

  return {
    simulation,
    isPlaying,
    speed,
    togglePlaying: useCallback(() => setIsPlaying((playing) => !playing), []),
    changeSpeed: setSpeed,
    reset,
    selectDestination,
    chooseAlternative,
    rejectAlternative,
  };
}