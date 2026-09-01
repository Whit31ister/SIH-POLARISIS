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

import {
  calculateIcebergHazards,
  calculateThreats,
} from "../utils/hazards";

import {
  AlternativeRoute,
  EnvironmentState,
  RoutePoint,
  SimulationState,
  VesselState,
} from "../types";

/* ============================================================
   SIMULATION CONFIGURATION
   ============================================================ */

const TICK_MS = 250;

/*
 * Each frontend tick advances the simulation by 5 minutes.
 *
 * At 1x:
 *   250 ms real time = 300 simulation seconds
 *
 * At 8x:
 *   250 ms real time = 2400 simulation seconds
 */
const SIMULATION_SECONDS_PER_TICK = 300;

/*
 * Ask the risk engine for a new decision every 30 simulated
 * minutes.
 */
const DECISION_INTERVAL_SECONDS = 1800;

/*
 * NCPOR is deliberately queried after the simulation has loaded.
 *
 * The backend already handles the NCPOR fallback/cache behavior.
 */
const NCPOR_DELAY_MS = 5000;

const DESTINATION: RoutePoint = {
  lat: -64,
  lon: -63,
};

const ALTERNATIVE_COLORS = [
  "#e0aa4b",
  "#d8895b",
  "#c47ac0",
  "#79a8d8",
  "#79c1b0",
];

/* ============================================================
   DEFAULT VESSEL
   ============================================================ */

const DEFAULT_VESSEL: VesselState = {
  lat: -60,
  lon: -60,
  speed: 12,
  draft: 5.2,
  name: "POLARISIS",
  iceRating: "ARC3",
  heading: 0,
};

/* ============================================================
   INITIAL STATE
   ============================================================ */

function createInitialState(): SimulationState {
  return {
    time: 0,

    vessel: {
      ...DEFAULT_VESSEL,
    },

    icebergs: [],

    gridCells: [],

    currentRoute: [],

    previousRoute: [],

    destination: DESTINATION,

    alternativeRoutes: [],

    riskDecision: null,

    ncporStations: [],

    environment: generateEnvironment(
      DEFAULT_VESSEL.lat,
      DEFAULT_VESSEL.lon,
      0
    ),

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

/* ============================================================
   NCPOR HELPERS
   ============================================================ */

/**
 * Prefer live observations.
 *
 * If live observations aren't available, use stale cached
 * observations.
 *
 * Simulated data remains the final fallback.
 */
function preferredStation(
  stations: SimulationState["ncporStations"]
) {
  return (
    stations.find((station) => station.status === "LIVE") ??
    stations.find((station) => station.status === "STALE") ??
    stations.find((station) => station.status === "SIMULATED")
  );
}

/**
 * Apply NCPOR station observations to the current environment.
 *
 * Any value missing from NCPOR keeps the generated simulation
 * value instead.
 */
function applyStationEnvironment(
  environment: EnvironmentState,
  stations: SimulationState["ncporStations"]
): EnvironmentState {
  const station = preferredStation(stations);

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

/* ============================================================
   NAVIGATION HELPERS
   ============================================================ */

/**
 * Build the section of the route already travelled by the vessel.
 *
 * This is used for navigation statistics and does not modify
 * the actual active route.
 */
function travelledRoute(
  route: RoutePoint[],
  origin: RoutePoint,
  vessel: RoutePoint
) {
  if (route.length < 2) {
    return [];
  }

  const result: RoutePoint[] = [origin];

  for (const point of route) {
    if (
      point.lat === origin.lat &&
      point.lon === origin.lon
    ) {
      continue;
    }

    result.push(point);

    if (
      Math.abs(point.lat - vessel.lat) < 0.1 &&
      Math.abs(point.lon - vessel.lon) < 0.1
    ) {
      break;
    }
  }

  return result;
}

/* ============================================================
   SIMULATION HOOK
   ============================================================ */

export function useSimulation() {
  const [simulation, setSimulation] =
    useState<SimulationState>(createInitialState);

  const [isPlaying, setIsPlaying] =
    useState(false);

  const [speed, setSpeed] =
    useState(1);

  /*
   * Original starting position of the voyage.
   *
   * This is deliberately kept in a ref because it should not
   * cause simulation rerenders.
   */
  const origin = useRef<RoutePoint>(DEFAULT_VESSEL);

  /*
   * Prevents multiple risk decisions from being requested
   * for the same simulation time bucket.
   */
  const lastDecisionBucket = useRef(-1);

  /*
   * Every meaningful route change increments this number.
   *
   * This solves an important asynchronous race condition:
   *
   *     AI request starts
   *          ↓
   *     user selects another route
   *          ↓
   *     routeRevision changes
   *          ↓
   *     old AI request returns
   *          ↓
   *     old response is rejected
   *
   * Without this, an old AI response could overwrite a route
   * that the user selected while the request was running.
   */
  const routeRevision = useRef(0);

  /*
   * Indicates that the operator has manually selected an
   * alternative route.
   *
   * Once true, AI decisions remain advisory.
   *
   * The AI can still report:
   *
   *     PROCEED
   *     REROUTE
   *     HALT
   *
   * but it cannot silently replace the manually selected route.
   */
  const manualRouteOverride = useRef(false);

  /*
   * Always-current simulation snapshot.
   *
   * This avoids stale React state inside callbacks and async
   * operations.
   */
  const simulationRef =
    useRef<SimulationState>(simulation);

  useEffect(() => {
    simulationRef.current = simulation;
  }, [simulation]);

  /* ==========================================================
     ALTERNATIVE ROUTE GENERATION
     ========================================================== */

  const generateAlternatives = useCallback(
    (
      start: RoutePoint,
      destination: RoutePoint,
      environment: EnvironmentState,
      icebergs: SimulationState["icebergs"]
    ): AlternativeRoute[] => {
      const latDelta =
        destination.lat - start.lat;

      const lonDelta =
        destination.lon - start.lon;

      /*
       * Five candidate corridors around the direct route.
       */
      const offsets = [
        -0.9,
        -0.45,
        0.45,
        0.9,
        1.35,
      ];

      return offsets.map((offset, index) => {
        const waypoint = {
          lat:
            start.lat +
            latDelta * 0.5 +
            offset,

          lon:
            start.lon +
            lonDelta * 0.5 +
            offset * 0.35,
        };

        const route = [
          start,
          waypoint,
          destination,
        ];

        const distance =
          calculateRouteDistance(route);

        const routeSamples = [
          start,
          waypoint,
          destination,
        ];

        /*
         * Find the closest iceberg to the candidate route.
         */
        const closestIceberg =
          icebergs.reduce(
            (minimum, iceberg) => {
              const distanceToRoute =
                Math.min(
                  ...routeSamples.map(
                    (point) =>
                      haversineDistance(
                        point,
                        iceberg
                      )
                  )
                );

              return Math.min(
                minimum,
                distanceToRoute
              );
            },
            Infinity
          );

        /*
         * Iceberg exposure.
         */
        const icebergExposure =
          Number.isFinite(closestIceberg)
            ? Math.max(
                0,
                1 - closestIceberg / 140
              ) * 0.5
            : 0;

        /*
         * Wind exposure.
         */
        const weatherExposure =
          environment.wind_speed / 140;

        /*
         * Sea-ice exposure.
         */
        const iceExposure =
          environment.sea_ice_concentration *
          0.22;

        /*
         * More southern routes receive additional
         * exposure because they move deeper into
         * Antarctic ice conditions.
         */
        const southernIceExposure =
          Math.max(
            0,
            Math.min(
              1,
              (-waypoint.lat - 60) / 5
            )
          ) * 0.22;

        /*
         * Penalize excessive detours.
         */
        const detourExposure =
          Math.max(
            0,
            distance -
              Math.abs(latDelta) * 111
          ) / 1200;

        const risk = Math.min(
          1,
          iceExposure +
            weatherExposure +
            icebergExposure +
            southernIceExposure +
            detourExposure
        );

        return {
          id: `alternative-${index + 1}`,

          label: `Alternative ${index + 1}`,

          route,

          distance_km: distance,

          risk_score: risk,

          color:
            ALTERNATIVE_COLORS[index],
        };
      });
    },
    []
  );

  /* ==========================================================
     DESTINATION SELECTION
     ========================================================== */

  const selectDestination = useCallback(
    async (destination: RoutePoint) => {
      /*
       * A new destination means a completely new navigation
       * plan.
       *
       * Therefore an old manually selected route should no
       * longer lock the navigation system.
       */
      manualRouteOverride.current = false;

      /*
       * Invalidate outstanding AI decisions calculated against
       * the previous destination/route.
       */
      routeRevision.current += 1;

      setSimulation((current) => ({
        ...current,

        destination,

        alternativeRoutes: [],
      }));

      const current =
        simulationRef.current;

      try {
        const route = await fetchRoute(
          {
            lat: current.vessel.lat,
            lon: current.vessel.lon,
          },
          destination,
          current.vessel
        );

        /*
         * Generate alternatives using the latest environmental
         * state available when the request began.
         */
        const alternatives =
          generateAlternatives(
            {
              lat: current.vessel.lat,
              lon: current.vessel.lon,
            },
            destination,
            current.environment,
            current.icebergs
          );

        const distance =
          calculateRouteDistance(route);

        setSimulation((latest) => ({
          ...latest,

          destination,

          currentRoute: route,

          alternativeRoutes:
            alternatives,

          previousRoute:
            latest.currentRoute,

          navigation: {
            ...latest.navigation,

            route_distance_km:
              distance,

            remaining_distance_km:
              distance,

            distance_travelled_km: 0,

            eta_minutes:
              latest.vessel.speed > 0
                ? (distance /
                    (latest.vessel.speed *
                      1.852)) *
                  60
                : 0,
          },
        }));
      } catch (error) {
        console.error(
          "Failed to calculate route for destination:",
          error
        );
      }
    },
    [generateAlternatives]
  );

  /* ==========================================================
     CHOOSE ALTERNATIVE ROUTE
     ========================================================== */

  const chooseAlternative = useCallback(
    (routeId: string) => {
      const current =
        simulationRef.current;

      const selected =
        current.alternativeRoutes.find(
          (alternative) =>
            alternative.id === routeId
        );

      if (!selected) {
        return;
      }

      /*
       * The operator has explicitly selected this route.
       *
       * From this point onward the AI must not silently
       * replace it.
       */
      manualRouteOverride.current = true;

      /*
       * Invalidate all outstanding AI decisions that were
       * calculated against the previous route.
       */
      routeRevision.current += 1;

      /*
       * We have already made a decision for this time bucket.
       *
       * This prevents the simulation from immediately requesting
       * another decision after the user selects an alternative.
       */
      lastDecisionBucket.current =
        Math.floor(
          current.time /
            DECISION_INTERVAL_SECONDS
        );

      setSimulation((latest) => ({
        ...latest,

        previousRoute:
          latest.currentRoute,

        currentRoute:
          selected.route,

        alternativeRoutes:
          latest.alternativeRoutes.filter(
            (alternative) =>
              alternative.id !== routeId
          ),

        navigation: {
          ...latest.navigation,

          route_distance_km:
            selected.distance_km,

          remaining_distance_km:
            selected.distance_km,

          distance_travelled_km: 0,

          risk_reduction_pct:
            Math.max(
              0,
              (
                latest.threats
                  .overall_risk -
                selected.risk_score
              ) /
                Math.max(
                  latest.threats
                    .overall_risk,
                  0.01
                )
            ) * 100,
        },
      }));
    },
    []
  );

  /* ==========================================================
     REJECT ALTERNATIVE
     ========================================================== */

  const rejectAlternative = useCallback(
    (routeId: string) => {
      setSimulation((current) => ({
        ...current,

        alternativeRoutes:
          current.alternativeRoutes.filter(
            (alternative) =>
              alternative.id !== routeId
          ),
      }));
    },
    []
  );

  /* ==========================================================
     INITIAL SIMULATION DATA
     ========================================================== */

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data =
          await fetchSimulationData();

        if (!active) {
          return;
        }

        const vessel: VesselState = {
          ...DEFAULT_VESSEL,

          lat:
            data.ship?.lat ??
            DEFAULT_VESSEL.lat,

          lon:
            data.ship?.lon ??
            DEFAULT_VESSEL.lon,

          speed:
            data.ship?.speed ??
            DEFAULT_VESSEL.speed,

          draft:
            data.ship?.draft ??
            DEFAULT_VESSEL.draft,

          name:
            data.ship?.name ??
            DEFAULT_VESSEL.name,

          iceRating:
            data.ship?.iceRating ??
            data.ship?.ice_capability ??
            DEFAULT_VESSEL.iceRating,
        };

        origin.current = {
          lat: vessel.lat,
          lon: vessel.lon,
        };

        setSimulation((current) => ({
          ...current,

          vessel,

          icebergs:
            data.icebergs ?? [],

          gridCells:
            data.grid ?? [],
        }));

        const route =
          await fetchRoute(
            origin.current,
            DESTINATION,
            vessel
          );

        if (!active) {
          return;
        }

        const distance =
          calculateRouteDistance(route);

        const iceHazards =
          calculateIcebergHazards(
            vessel,
            data.icebergs ?? [],
            vessel.speed
          );

        const environment =
          generateEnvironment(
            vessel.lat,
            vessel.lon,
            0
          );

        const threats =
          calculateThreats(
            environment,
            iceHazards.collision_risk,
            vessel.iceRating
          );

        const alternatives =
          generateAlternatives(
            origin.current,
            DESTINATION,
            environment,
            data.icebergs ?? []
          );

        setSimulation((current) => ({
          ...current,

          currentRoute: route,

          vessel,

          icebergs:
            data.icebergs ?? [],

          gridCells:
            data.grid ?? [],

          iceHazards,

          threats,

          destination:
            DESTINATION,

          alternativeRoutes:
            alternatives,

          environment,

          navigation: {
            ...current.navigation,

            route_distance_km:
              distance,

            remaining_distance_km:
              distance,

            distance_travelled_km: 0,

            eta_minutes:
              vessel.speed > 0
                ? (distance /
                    (vessel.speed *
                      1.852)) *
                  60
                : 0,
          },
        }));
      } catch (error) {
        console.error(
          "Failed to load simulation:",
          error
        );
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [generateAlternatives]);

  /* ==========================================================
     NCPOR INITIAL CHECK
     ========================================================== */

  useEffect(() => {
    let active = true;

    const timer =
      window.setTimeout(
        async () => {
          try {
            const data =
              await fetchNCPORData();

            if (!active) {
              return;
            }

            setSimulation((current) => ({
              ...current,

              ncporStations:
                data.stations ?? [],

              environment:
                applyStationEnvironment(
                  current.environment,
                  data.stations ?? []
                ),
            }));
          } catch (error) {
            console.warn(
              "NCPOR unavailable; simulated fallback remains active.",
              error
            );
          }
        },
        NCPOR_DELAY_MS
      );

    return () => {
      active = false;

      window.clearTimeout(timer);
    };
  }, []);

  /* ==========================================================
     MAIN SIMULATION LOOP
     ========================================================== */

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const interval =
      window.setInterval(() => {
        setSimulation((current) => {
          /* --------------------------------------------------
             ADVANCE TIME
             -------------------------------------------------- */

          const seconds =
            SIMULATION_SECONDS_PER_TICK *
            speed;

          const nextTime =
            current.time + seconds;

          /* --------------------------------------------------
             MOVE VESSEL
             -------------------------------------------------- */

          /*
           * Convert knots to km/h:
           *
           * 1 knot = 1.852 km/h
           */
          const distanceMoved =
            current.vessel.speed *
            1.852 *
            (seconds / 3600);

          /*
           * IMPORTANT:
           *
           * moveAlongRoute() always receives the CURRENT
           * currentRoute.
           *
           * This means when an alternative route is selected,
           * the vessel immediately continues along that route.
           */
          const moved =
            moveAlongRoute(
              current.vessel,
              current.currentRoute,
              distanceMoved
            );

          const vessel: VesselState = {
            ...moved,

            heading:
              calculateBearing(
                current.vessel,
                moved
              ),
          };

          /* --------------------------------------------------
             MOVE ICEBERGS
             -------------------------------------------------- */

          const icebergs =
            current.icebergs.map(
              (iceberg) => ({
                ...iceberg,

                lat:
                  iceberg.lat +
                  iceberg.drift_lat *
                    (seconds / 3600),

                lon:
                  iceberg.lon +
                  iceberg.drift_lon *
                    (seconds / 3600),
              })
            );

          /* --------------------------------------------------
             ENVIRONMENT
             -------------------------------------------------- */

          const generatedEnvironment =
            generateEnvironment(
              vessel.lat,
              vessel.lon,
              nextTime
            );

          const environment =
            applyStationEnvironment(
              generatedEnvironment,
              current.ncporStations
            );

          /* --------------------------------------------------
             ICE HAZARDS
             -------------------------------------------------- */

          const iceHazards =
            calculateIcebergHazards(
              vessel,
              icebergs,
              vessel.speed
            );

          /* --------------------------------------------------
             THREAT ANALYSIS
             -------------------------------------------------- */

          const threats =
            calculateThreats(
              environment,
              iceHazards.collision_risk,
              vessel.iceRating
            );

          /* --------------------------------------------------
             NAVIGATION METRICS
             -------------------------------------------------- */

          const routeDistance =
            calculateRouteDistance(
              current.currentRoute
            );

          const travelled =
            calculateRouteDistance(
              travelledRoute(
                current.currentRoute,
                origin.current,
                vessel
              )
            );

          const remaining =
            Math.max(
              0,
              routeDistance -
                travelled
            );

          const eta =
            vessel.speed > 0
              ? (
                  remaining /
                  (vessel.speed * 1.852)
                ) *
                60
              : 0;

          /* --------------------------------------------------
             AI DECISION BUCKET
             -------------------------------------------------- */

          const bucket =
            Math.floor(
              nextTime /
                DECISION_INTERVAL_SECONDS
            );

          /*
           * Request a new AI decision only once per bucket.
           */
          if (
            bucket >
            lastDecisionBucket.current
          ) {
            lastDecisionBucket.current =
              bucket;

            /*
             * Capture the route revision BEFORE making
             * the asynchronous request.
             */
            const decisionRevision =
              routeRevision.current;

            /*
             * Capture whether the operator already has
             * control of the route.
             */
            const decisionWasManual =
              manualRouteOverride.current;

            /*
             * Make a copy of the route.
             *
             * This is important because the AI request may
             * take time to complete and the simulation can
             * continue running meanwhile.
             */
            const decisionRoute =
              current.currentRoute.map(
                (point) => ({
                  ...point,
                })
              );

            void fetchRiskDecision(
              vessel,

              {
                ...environment,

                icebergs,

                nearest_iceberg_distance:
                  iceHazards.nearest_iceberg_distance_km,

                threat_vector:
                  threats,
              },

              decisionRoute
            )
              .then((decision) => {
                setSimulation(
                  (latest) => {
                    /* --------------------------------------
                       STALE REQUEST PROTECTION
                       -------------------------------------- */

                    /*
                     * The route changed while the AI request
                     * was running.
                     *
                     * Therefore this response belongs to an
                     * old navigation state.
                     *
                     * Keep the decision visible for information,
                     * but NEVER apply its route.
                     */
                    if (
                      decisionRevision !==
                      routeRevision.current
                    ) {
                      return {
                        ...latest,

                        riskDecision:
                          decision,
                      };
                    }

                    /* --------------------------------------
                       MANUAL ROUTE PROTECTION
                       -------------------------------------- */

                    /*
                     * The operator selected an alternative.
                     *
                     * The AI is now advisory only.
                     *
                     * It can tell us that a reroute would be
                     * desirable, but it cannot silently take
                     * control away from the operator.
                     */
                    if (
                      manualRouteOverride.current ||
                      decisionWasManual
                    ) {
                      return {
                        ...latest,

                        riskDecision:
                          decision,
                      };
                    }

                    /* --------------------------------------
                       NORMAL AI DECISION
                       -------------------------------------- */

                    if (
                      decision.action !==
                      "REROUTE"
                    ) {
                      return {
                        ...latest,

                        riskDecision:
                          decision,
                      };
                    }

                    /*
                     * No manual override exists.
                     *
                     * Therefore automatic AI rerouting is
                     * permitted.
                     */
                    const oldDistance =
                      calculateRouteDistance(
                        latest.currentRoute
                      );

                    const newDistance =
                      calculateRouteDistance(
                        decision.recommended_route
                      );

                    /*
                     * This route change is legitimate, so
                     * invalidate any asynchronous request
                     * that was based on the old route.
                     */
                    routeRevision.current += 1;

                    return {
                      ...latest,

                      riskDecision:
                        decision,

                      previousRoute:
                        latest.currentRoute,

                      currentRoute:
                        decision.recommended_route,

                      navigation: {
                        ...latest.navigation,

                        route_distance_km:
                          newDistance,

                        remaining_distance_km:
                          newDistance,

                        distance_travelled_km: 0,

                        eta_minutes:
                          latest.vessel.speed >
                          0
                            ? (
                                newDistance /
                                (
                                  latest.vessel.speed *
                                  1.852
                                )
                              ) *
                              60
                            : 0,

                        risk_reduction_pct:
                          oldDistance > 0
                            ? Math.max(
                                0,
                                (
                                  oldDistance -
                                  newDistance
                                ) /
                                  oldDistance
                              ) * 100
                            : 0,
                      },
                    };
                  }
                );
              })
              .catch((error) =>
                console.error(
                  "Risk decision failed:",
                  error
                )
              );
          }

          /* --------------------------------------------------
             RETURN UPDATED SIMULATION
             -------------------------------------------------- */

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

              remaining_distance_km:
                remaining,

              distance_travelled_km:
                Math.max(
                  0,
                  routeDistance -
                    remaining
                ),

              eta_minutes: eta,

              route_efficiency_pct:
                routeDistance > 0
                  ? Math.min(
                      100,
                      (
                        (
                          routeDistance -
                          remaining
                        ) /
                        routeDistance
                      ) * 100
                    )
                  : 100,
            },
          };
        });
      }, TICK_MS);

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [isPlaying, speed]);

  /* ==========================================================
     RESET
     ========================================================== */

  const reset = useCallback(() => {
    setIsPlaying(false);

    /*
     * Allow the first AI decision after reset.
     */
    lastDecisionBucket.current =
      -1;

    /*
     * Remove any manual route lock.
     */
    manualRouteOverride.current =
      false;

    /*
     * Invalidate outstanding asynchronous
     * AI decisions.
     */
    routeRevision.current += 1;

    setSimulation((current) => {
      const initial =
        createInitialState();

      return {
        ...initial,

        /*
         * Preserve loaded map data and the current
         * destination so the reset doesn't require
         * another backend request.
         */
        currentRoute:
          current.currentRoute,

        icebergs:
          current.icebergs,

        gridCells:
          current.gridCells,

        ncporStations:
          current.ncporStations,

        destination:
          current.destination,

        alternativeRoutes:
          current.alternativeRoutes,
      };
    });
  }, []);

  /* ==========================================================
     PUBLIC HOOK API
     ========================================================== */

  return {
    simulation,

    isPlaying,

    speed,

    togglePlaying: useCallback(
      () =>
        setIsPlaying(
          (playing) => !playing
        ),
      []
    ),

    changeSpeed: setSpeed,

    reset,

    selectDestination,

    chooseAlternative,

    rejectAlternative,
  };
}