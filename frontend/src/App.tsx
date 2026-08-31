import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import Map from "./components/Map";
import Dashboard from "./components/Dashboard";
import ReplayController from "./components/ReplayController";

import {
  fetchNCPORData,
  fetchRiskDecision,
  fetchRoute,
  fetchSimulationData,
} from "./utils/api";

import {
  SimulationState,
  RoutePoint,
} from "./types";

import {
  calculateBearing,
  calculateRouteDistance,
  moveAlongRoute,
} from "./utils/navigation";

import {
  generateEnvironment,
} from "./utils/environment";

import {
  calculateIcebergHazards,
  calculateThreats,
} from "./utils/hazards";

import "./App.css";


const SIM_TICK_MS = 250;

const SIM_SECONDS_PER_TICK = 300;

const DECISION_INTERVAL_SECONDS = 1800;

const NCPOR_INITIAL_DELAY_MS = 5000;


const DESTINATION: RoutePoint = {
  lat: -64.0,
  lon: -63.0,
};


const INITIAL_VESSEL = {
  lat: -60.0,
  lon: -60.0,

  speed: 12,

  draft: 5.2,

  name: "POLARISIS",

  iceRating: "ARC3",

  heading: 0,
};


const INITIAL_ENVIRONMENT =
  generateEnvironment(
    INITIAL_VESSEL.lat,
    INITIAL_VESSEL.lon,
    0
  );


const INITIAL_STATE:
  SimulationState = {

  time: 0,

  vessel:
    INITIAL_VESSEL,

  icebergs: [],

  gridCells: [],

  currentRoute: [],

  previousRoute: [],

  riskDecision: null,

  ncporStations: [],

  environment:
    INITIAL_ENVIRONMENT,

  iceHazards: {
    iceberg_count: 0,

    nearest_iceberg_distance_km:
      null,

    nearest_iceberg_id:
      null,

    largest_iceberg_size:
      null,

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


const App: React.FC = () => {

  const [
    simulation,
    setSimulation,
  ] = useState<SimulationState>(
    INITIAL_STATE
  );


  const [
    isPlaying,
    setIsPlaying,
  ] = useState(false);


  const [
    speed,
    setSpeed,
  ] = useState(1);


  const lastDecisionBucket =
    useRef(-1);


  const initialPosition =
    useRef({
      lat: INITIAL_VESSEL.lat,
      lon: INITIAL_VESSEL.lon,
    });


  // ==========================================================
  // Initial data
  // ==========================================================

  useEffect(() => {

    let mounted = true;


    async function load() {

      try {

        const data =
          await fetchSimulationData();

        if (!mounted) {
          return;
        }


        const vessel = {
          ...INITIAL_VESSEL,

          lat:
            data.ship?.lat ??
            INITIAL_VESSEL.lat,

          lon:
            data.ship?.lon ??
            INITIAL_VESSEL.lon,

          speed:
            data.ship?.speed ??
            INITIAL_VESSEL.speed,

          draft:
            data.ship?.draft ??
            INITIAL_VESSEL.draft,

          name:
            data.ship?.name ??
            INITIAL_VESSEL.name,

          iceRating:
            data.ship?.iceRating ??
            INITIAL_VESSEL.iceRating,

          heading: 0,
        };


        initialPosition.current = {
          lat: vessel.lat,
          lon: vessel.lon,
        };


        setSimulation(prev => ({
          ...prev,

          vessel,

          icebergs:
            data.icebergs ?? [],

          gridCells:
            data.grid ?? [],
        }));


        const route =
          await fetchRoute(
            {
              lat: vessel.lat,
              lon: vessel.lon,
            },

            DESTINATION,

            vessel
          );


        if (!mounted) {
          return;
        }


        const distance =
          calculateRouteDistance(
            route
          );


        setSimulation(prev => ({
          ...prev,

          currentRoute:
            route,

          navigation: {
            ...prev.navigation,

            route_distance_km:
              distance,

            remaining_distance_km:
              distance,
          },
        }));

      } catch (error) {

        console.error(
          "Failed to load simulation:",
          error
        );
      }
    }


    load();


    return () => {
      mounted = false;
    };

  }, []);


  // ==========================================================
  // ONE delayed NCPOR check
  // ==========================================================

  useEffect(() => {

    let mounted = true;


    const timer =
      window.setTimeout(
        async () => {

          try {

            const data =
              await fetchNCPORData();

            if (!mounted) {
              return;
            }


            setSimulation(prev => ({
              ...prev,

              ncporStations:
                data.stations ?? [],

              environment:
                applyNCPOREnvironment(
                  prev.environment,
                  data.stations ?? []
                ),
            }));

          } catch (error) {

            console.warn(
              "NCPOR unavailable. "
              + "Backend will use simulation fallback.",
              error
            );
          }
        },

        NCPOR_INITIAL_DELAY_MS
      );


    return () => {
      mounted = false;

      window.clearTimeout(
        timer
      );
    };

  }, []);


  // ==========================================================
  // Simulation loop
  // ==========================================================

  useEffect(() => {

    if (!isPlaying) {
      return;
    }


    const interval =
      window.setInterval(
        () => {

          setSimulation(prev => {

            const deltaSeconds =
              SIM_SECONDS_PER_TICK *
              speed;


            const deltaHours =
              deltaSeconds / 3600;


            const newTime =
              prev.time +
              deltaSeconds;


            const distanceKm =
              prev.vessel.speed *
              1.852 *
              deltaHours;


            const newVessel =
              moveAlongRoute(
                prev.vessel,
                prev.currentRoute,
                distanceKm
              );


            const heading =
              calculateBearing(
                {
                  lat:
                    prev.vessel.lat,

                  lon:
                    prev.vessel.lon,
                },

                {
                  lat:
                    newVessel.lat,

                  lon:
                    newVessel.lon,
                }
              );


            const vessel = {
              ...newVessel,
              heading,
            };


            const newIcebergs =
              prev.icebergs.map(
                iceberg => ({
                  ...iceberg,

                  lat:
                    iceberg.lat +
                    iceberg.drift_lat *
                    deltaHours,

                  lon:
                    iceberg.lon +
                    iceberg.drift_lon *
                    deltaHours,
                })
              );


            const generated =
              generateEnvironment(
                vessel.lat,
                vessel.lon,
                newTime
              );


            const environment =
              mergeEnvironmentSources(
                generated,
                prev.ncporStations
              );


            const iceHazards =
              calculateIcebergHazards(
                {
                  lat: vessel.lat,
                  lon: vessel.lon,
                },

                newIcebergs,

                vessel.speed
              );


            const threats =
              calculateThreats(
                environment,
                iceHazards.collision_risk,
                vessel.iceRating
              );


            const routeDistance =
              calculateRouteDistance(
                prev.currentRoute
              );


            const distanceFromStart =
              calculateRouteDistance(
                buildTravelledRoute(
                  prev.currentRoute,
                  initialPosition.current,
                  vessel
                )
              );


            const remainingDistance =
              Math.max(
                0,
                routeDistance -
                distanceFromStart
              );


            const etaMinutes =
              vessel.speed > 0
                ? (
                    remainingDistance /
                    (vessel.speed * 1.852)
                  ) * 60
                : 0;


            const decisionBucket =
              Math.floor(
                newTime /
                DECISION_INTERVAL_SECONDS
              );


            if (
              decisionBucket >
              lastDecisionBucket.current
            ) {

              lastDecisionBucket.current =
                decisionBucket;


              const hazards = {
                ...environment,

                icebergs:
                  newIcebergs,

                nearest_iceberg_distance:
                  iceHazards
                    .nearest_iceberg_distance_km,

                threat_vector:
                  threats,
              };


              fetchRiskDecision(
                vessel,
                hazards
              )
                .then(decision => {

                  setSimulation(
                    current => {

                      if (
                        decision.action ===
                        "REROUTE"
                      ) {

                        const oldDistance =
                          calculateRouteDistance(
                            current.currentRoute
                          );

                        const newDistance =
                          calculateRouteDistance(
                            decision
                              .recommended_route
                          );


                        const riskReduction =
                          decision.risk_score > 0
                            ? Math.max(
                                0,
                                (
                                  decision.risk_score -
                                  threats.overall_risk
                                ) /
                                decision.risk_score
                              ) * 100
                            : 0;


                        return {
                          ...current,

                          riskDecision:
                            decision,

                          previousRoute:
                            current.currentRoute,

                          currentRoute:
                            decision
                              .recommended_route,

                          navigation: {
                            ...current.navigation,

                            previousRouteDistance:
                              oldDistance,

                            route_distance_km:
                              newDistance,

                            risk_reduction_pct:
                              riskReduction,
                          },
                        };
                      }


                      return {
                        ...current,

                        riskDecision:
                          decision,
                      };
                    }
                  );

                })
                .catch(error => {

                  console.error(
                    "Risk decision failed:",
                    error
                  );

                });
            }


            return {
              ...prev,

              time:
                newTime,

              vessel,

              icebergs:
                newIcebergs,

              environment,

              iceHazards,

              threats,

              navigation: {
                ...prev.navigation,

                route_distance_km:
                  routeDistance,

                remaining_distance_km:
                  remainingDistance,

                distance_travelled_km:
                  Math.max(
                    0,
                    routeDistance -
                    remainingDistance
                  ),

                eta_minutes:
                  etaMinutes,

                route_efficiency_pct:
                  routeDistance > 0
                    ? Math.min(
                        100,
                        (
                          (
                            routeDistance -
                            remainingDistance
                          ) /
                          routeDistance
                        ) * 100
                      )
                    : 100,
              },
            };
          });

        },

        SIM_TICK_MS
      );


    return () => {
      window.clearInterval(
        interval
      );
    };

  }, [isPlaying, speed]);


  // ==========================================================
  // Controls
  // ==========================================================

  const handlePlayPause =
    useCallback(() => {

      setIsPlaying(
        previous => !previous
      );

    }, []);


  const handleSpeedChange =
    useCallback(
      (newSpeed: number) => {

        setSpeed(newSpeed);

      },

      []
    );


  const handleReset =
    useCallback(() => {

      setIsPlaying(false);

      lastDecisionBucket.current =
        -1;


      setSimulation(prev => ({
        ...INITIAL_STATE,

        currentRoute:
          prev.currentRoute,

        icebergs:
          prev.icebergs,

        gridCells:
          prev.gridCells,

        ncporStations:
          prev.ncporStations,
      }));

    }, []);


  return (
    <div className="app">

      <div className="map-container">

        <Map
          simulation={
            simulation
          }
        />


        <Dashboard
          simulation={
            simulation
          }
        />


        <ReplayController
          isPlaying={
            isPlaying
          }

          speed={
            speed
          }

          onPlayPause={
            handlePlayPause
          }

          onSpeedChange={
            handleSpeedChange
          }

          onReset={
            handleReset
          }
        />

      </div>

    </div>
  );
};


function applyNCPOREnvironment(
  environment:
    SimulationState["environment"],
  stations:
    SimulationState["ncporStations"]
) {

  const station =
    stations.find(
      item =>
        item.status === "LIVE"
    ) ??
    stations.find(
      item =>
        item.status === "STALE"
    ) ??
    stations.find(
      item =>
        item.status === "SIMULATED"
    );


  if (!station) {
    return environment;
  }


  return {
    ...environment,

    air_temperature:
      station.temperature_c ??
      environment.air_temperature,

    humidity:
      station.relative_humidity_pct ??
      environment.humidity,

    pressure:
      station.pressure_mbar ??
      environment.pressure,

    wind_speed:
      station.wind_speed_knots ??
      environment.wind_speed,

    source:
      station.status === "LIVE"
        ? "LIVE"
        : station.status === "STALE"
          ? "STALE"
          : "SIMULATED",
  };
}


function mergeEnvironmentSources(
  generated:
    SimulationState["environment"],
  stations:
    SimulationState["ncporStations"]
) {

  const station =
    stations.find(
      item =>
        item.status === "LIVE"
    ) ??
    stations.find(
      item =>
        item.status === "STALE"
    ) ??
    stations.find(
      item =>
        item.status === "SIMULATED"
    );


  if (!station) {
    return generated;
  }


  return {
    ...generated,

    air_temperature:
      station.temperature_c ??
      generated.air_temperature,

    humidity:
      station.relative_humidity_pct ??
      generated.humidity,

    pressure:
      station.pressure_mbar ??
      generated.pressure,

    wind_speed:
      station.wind_speed_knots ??
      generated.wind_speed,

    source:
      station.status === "LIVE"
        ? "LIVE"
        : station.status === "STALE"
          ? "STALE"
          : "SIMULATED",
  };
}


function buildTravelledRoute(
  route: RoutePoint[],
  start: RoutePoint,
  vessel: RoutePoint
): RoutePoint[] {

  if (route.length < 2) {
    return [];
  }


  const result: RoutePoint[] = [
    start,
  ];


  for (
    const point of route
  ) {

    if (
      point.lat === start.lat &&
      point.lon === start.lon
    ) {
      continue;
    }

    result.push(point);

    if (
      Math.abs(
        point.lat -
        vessel.lat
      ) < 0.1 &&
      Math.abs(
        point.lon -
        vessel.lon
      ) < 0.1
    ) {
      break;
    }
  }


  return result;
}


export default App;