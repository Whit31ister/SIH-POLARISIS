import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';

import Map from './components/Map';
import Dashboard from './components/Dashboard';
import ReplayController from './components/ReplayController';

import {
  fetchSimulationData,
  fetchRoute,
  fetchRiskDecision,
  fetchNCPORData,
} from './utils/api';

import {
  SimulationState,
  RoutePoint,
} from './types';

import './App.css';

// ============================================================
// Simulation configuration
// ============================================================

// Real-time interval between simulation updates.
const SIM_TICK_MS = 250;

// Amount of simulated time represented by one tick at 1x.
// 300 seconds = 5 simulated minutes.
const SIM_SECONDS_PER_TICK = 300;

// Reroute evaluation interval.
// 1800 seconds = 30 simulated minutes.
const DECISION_INTERVAL_SECONDS = 1800;

// Destination used for the demonstration voyage.
const DESTINATION: RoutePoint = {
  lat: -64.0,
  lon: -63.0,
};

// ============================================================
// Geographic helpers
// ============================================================

const toRadians = (degrees: number): number =>
  (degrees * Math.PI) / 180;

const toDegrees = (radians: number): number =>
  (radians * 180) / Math.PI;

/**
 * Haversine distance in kilometres.
 */
const haversineDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return (
    2 *
    R *
    Math.asin(Math.sqrt(a))
  );
};

/**
 * Initial bearing from point 1 to point 2.
 */
const calculateBearing = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const lambda = toRadians(lon2 - lon1);

  const y = Math.sin(lambda) * Math.cos(phi2);

  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) *
      Math.cos(phi2) *
      Math.cos(lambda);

  return (
    (toDegrees(Math.atan2(y, x)) + 360) %
    360
  );
};

/**
 * Clamp a value between min and max.
 */
const clamp = (
  value: number,
  min: number,
  max: number
): number =>
  Math.max(min, Math.min(max, value));

// ============================================================
// Ship movement
// ============================================================

/**
 * Move a vessel along its current route by a physical distance.
 *
 * Speed is in knots.
 *
 * 1 knot = 1 nautical mile/hour
 * 1 nautical mile = 1.852 km
 */
const moveAlongRoute = (
  vessel: SimulationState['vessel'],
  route: RoutePoint[],
  distanceKm: number
): SimulationState['vessel'] => {
  if (route.length < 2 || distanceKm <= 0) {
    return vessel;
  }

  let bestSegment = 0;
  let bestDistance = Infinity;
  let bestRatio = 0;

  // ----------------------------------------------------------
  // Find the route segment closest to the current vessel.
  // ----------------------------------------------------------

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];

    const latScale = 111;
    const lonScale =
      111 *
      Math.cos(
        toRadians(vessel.lat)
      );

    const ax = a.lon * lonScale;
    const ay = a.lat * latScale;

    const bx = b.lon * lonScale;
    const by = b.lat * latScale;

    const px = vessel.lon * lonScale;
    const py = vessel.lat * latScale;

    const dx = bx - ax;
    const dy = by - ay;

    const lengthSquared =
      dx * dx + dy * dy;

    let ratio = 0;

    if (lengthSquared > 0) {
      ratio =
        ((px - ax) * dx +
          (py - ay) * dy) /
        lengthSquared;
    }

    ratio = clamp(ratio, 0, 1);

    const closestX =
      ax + dx * ratio;

    const closestY =
      ay + dy * ratio;

    const distance = Math.sqrt(
      (px - closestX) ** 2 +
        (py - closestY) ** 2
    );

    if (distance < bestDistance) {
      bestDistance = distance;
      bestSegment = i;
      bestRatio = ratio;
    }
  }

  // ----------------------------------------------------------
  // Advance through the route.
  // ----------------------------------------------------------

  let remaining = distanceKm;

  let segmentIndex = bestSegment;

  const firstPoint =
    route[segmentIndex];

  const secondPoint =
    route[segmentIndex + 1];

  const firstSegmentDistance =
    haversineDistance(
      vessel.lat,
      vessel.lon,
      secondPoint.lat,
      secondPoint.lon
    );

  // Start from the actual vessel position.
  if (
    firstSegmentDistance > 0 &&
    bestRatio < 1
  ) {
    if (remaining <= firstSegmentDistance) {
      const ratio =
        remaining /
        firstSegmentDistance;

      return {
        ...vessel,

        lat:
          vessel.lat +
          (secondPoint.lat -
            vessel.lat) *
            ratio,

        lon:
          vessel.lon +
          (secondPoint.lon -
            vessel.lon) *
            ratio,
      };
    }

    remaining -= firstSegmentDistance;
  }

  // ----------------------------------------------------------
  // Continue through following segments.
  // ----------------------------------------------------------

  for (
    let i = segmentIndex + 1;
    i < route.length - 1;
    i++
  ) {
    const current =
      route[i];

    const next =
      route[i + 1];

    const segmentDistance =
      haversineDistance(
        current.lat,
        current.lon,
        next.lat,
        next.lon
      );

    if (
      segmentDistance <= 0
    ) {
      continue;
    }

    if (
      remaining <=
      segmentDistance
    ) {
      const ratio =
        remaining /
        segmentDistance;

      return {
        ...vessel,

        lat:
          current.lat +
          (next.lat -
            current.lat) *
            ratio,

        lon:
          current.lon +
          (next.lon -
            current.lon) *
            ratio,
      };
    }

    remaining -=
      segmentDistance;
  }

  // Destination reached.
  const destination =
    route[route.length - 1];

  return {
    ...vessel,

    lat: destination.lat,
    lon: destination.lon,
  };
};

// ============================================================
// Environmental simulation
// ============================================================

/**
 * Deterministic environmental model.
 *
 * Instead of generating random weather every tick,
 * environmental conditions evolve smoothly with time
 * and geographic position.
 */
const generateEnvironment = (
  lat: number,
  lon: number,
  simulationTime: number
) => {
  const hours =
    simulationTime / 3600;

  // Further south = generally greater ice exposure.
  const latitudeFactor = clamp(
    (-lat - 55) / 30,
    0,
    1
  );

  // Slowly evolving weather system.
  const weatherCycle =
    (Math.sin(
      hours * 0.35 +
        lon * 0.08
    ) +
      1) /
    2;

  const secondaryWeather =
    (Math.sin(
      hours * 0.17 -
        lat * 0.11
    ) +
      1) /
    2;

  // ----------------------------------------------------------
  // Sea ice
  // ----------------------------------------------------------

  const seaIceConcentration =
    clamp(
      0.12 +
        latitudeFactor * 0.58 +
        weatherCycle * 0.18,
      0,
      1
    );

  const iceThickness =
    clamp(
      0.1 +
        latitudeFactor * 1.5 +
        weatherCycle * 0.35,
      0.05,
      2.5
    );

  // ----------------------------------------------------------
  // Weather
  // ----------------------------------------------------------

  const windSpeed =
    10 +
    weatherCycle * 32 +
    secondaryWeather * 10;

  const windDirection =
    (
      220 +
      Math.sin(
        hours * 0.15
      ) *
        60
    ) % 360;

  const waveHeight =
    clamp(
      1.2 +
        weatherCycle * 4.5 +
        secondaryWeather * 1.2,
      0.5,
      7
    );

  const wavePeriod =
    5 +
    weatherCycle * 5;

  const visibility =
    clamp(
      22 -
        weatherCycle * 13 -
        secondaryWeather * 4,
      1,
      25
    );

  const pressure =
    995 +
    Math.sin(
      hours * 0.12
    ) *
      22;

  // ----------------------------------------------------------
  // Temperature
  // ----------------------------------------------------------

  const airTemperature =
    -1 -
    latitudeFactor * 11 -
    weatherCycle * 3;

  const seaTemperature =
    1.5 -
    latitudeFactor * 3;

  // ----------------------------------------------------------
  // Ocean currents
  // ----------------------------------------------------------

  const currentSpeed =
    0.25 +
    secondaryWeather * 1.25;

  const currentDirection =
    (
      70 +
      Math.sin(
        hours * 0.13 +
          lon * 0.03
      ) *
        55
    ) % 360;

  return {
    sea_ice_concentration:
      seaIceConcentration,

    ice_thickness:
      iceThickness,

    wind_speed:
      windSpeed,

    wind_direction:
      windDirection,

    wave_height:
      waveHeight,

    wave_period:
      wavePeriod,

    visibility:
      visibility,

    pressure:
      pressure,

    air_temperature:
      airTemperature,

    sea_temperature:
      seaTemperature,

    current_speed:
      currentSpeed,

    current_direction:
      currentDirection,
  };
};

// ============================================================
// Threat analysis
// ============================================================

const calculateThreatVector = (
  environment: ReturnType<
    typeof generateEnvironment
  >,
  vessel: SimulationState['vessel'],
  icebergRisk: number
) => {
  const iceCapabilityFactor =
    vessel.iceRating === 'ARC3'
      ? 0.7
      : 1.0;

  const iceRisk =
    clamp(
      environment.sea_ice_concentration *
        iceCapabilityFactor,
      0,
      1
    );

  const weatherRisk =
    clamp(
      environment.wind_speed /
        60,
      0,
      1
    );

  const waveRisk =
    clamp(
      environment.wave_height /
        7,
      0,
      1
    );

  const visibilityRisk =
    clamp(
      1 -
        environment.visibility /
          20,
      0,
      1
    );

  const overallRisk =
    iceRisk * 0.30 +
    icebergRisk * 0.30 +
    weatherRisk * 0.15 +
    waveRisk * 0.10 +
    visibilityRisk * 0.15;

  return {
    iceRisk,
    icebergRisk,
    weatherRisk,
    waveRisk,
    visibilityRisk,

    overallRisk: clamp(
      overallRisk,
      0,
      1
    ),
  };
};

// ============================================================
// Application
// ============================================================

const App: React.FC = () => {
  // ==========================================================
  // Simulation state
  // ==========================================================

  const [simulation, setSimulation] =
    useState<SimulationState>({
      time: 0,

      vessel: {
        lat: -60.0,
        lon: -60.0,
        speed: 12,
        draft: 5.2,
        name: 'POLARISIS',
        iceRating: 'ARC3',
      },

      icebergs: [],
      gridCells: [],

      currentRoute: [],
      previousRoute: [],

      riskDecision: null,

      // Real-time NCPOR Antarctic station data
      ncporStations: [],
    });

  const [isPlaying, setIsPlaying] =
    useState(false);

  const [speed, setSpeed] =
    useState(1);

  // Used to prevent repeated API calls
  // during the same simulation interval.
  const lastDecisionBucket =
    useRef(-1);

  // ==========================================================
  // Load initial data
  // ==========================================================

  useEffect(() => {
    const loadInitialData =
      async () => {
        try {
            const data =
              await fetchSimulationData();

            // --------------------------------------------------
            // Load simulation data
            // --------------------------------------------------

            setSimulation(
              (prev) => ({
                ...prev,

                vessel: {
                  ...prev.vessel,
                  ...data.ship,
                },

                icebergs:
                  data.icebergs || [],

                gridCells:
                  data.grid || [],

                // Real NCPOR observations
                ncporStations:
                  data.ncporStations || [],
              })
            );

          // --------------------------------------------------
          // Calculate initial route
          // --------------------------------------------------

          if (
            data.ship &&
            data.grid
          ) {
            const vesselForRouting =
              {
                lat:
                  data.ship.lat,

                lon:
                  data.ship.lon,

                speed:
                  data.ship.speed ??
                  12,

                draft:
                  data.ship.draft ??
                  5.2,

                name:
                  data.ship.name ??
                  'POLARISIS',

                iceRating:
                  data.ship
                    .iceRating ??
                  'ARC3',
              };

            const route =
              await fetchRoute(
                {
                  lat:
                    data.ship.lat,
                  lon:
                    data.ship.lon,
                },

                DESTINATION,

                vesselForRouting
              );

            setSimulation(
              (prev) => ({
                ...prev,
                currentRoute:
                  route,
              })
            );
          }
        } catch (error) {
          console.error(
            'Failed to load initial data:',
            error
          );
        }
      };

    loadInitialData();
  }, []);


// ==========================================================
// Real-time NCPOR data refresh
// ==========================================================

useEffect(() => {
  let mounted = true;

  const refreshNCPOR = async () => {
    try {
      const data = await fetchNCPORData();

      if (!mounted) {
        return;
      }

      setSimulation((prev) => ({
        ...prev,
        ncporStations:
          data.stations || [],
      }));
    } catch (error) {
      console.error(
        'Failed to refresh NCPOR data:',
        error
      );
    }
  };

  // Fetch immediately when the application loads
  refreshNCPOR();

  // Refresh every 5 minutes
  const interval = setInterval(
    refreshNCPOR,
    5 * 60 * 1000
  );

  return () => {
    mounted = false;
    clearInterval(interval);
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
      setInterval(() => {
        setSimulation(
          (prev) => {
            // ------------------------------------------------
            // Advance simulated time
            // ------------------------------------------------

            const deltaSeconds =
              SIM_SECONDS_PER_TICK *
              speed;

            const newTime =
              prev.time +
              deltaSeconds;

            const deltaHours =
              deltaSeconds /
              3600;

            // ------------------------------------------------
            // Move vessel physically
            // ------------------------------------------------

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

            // ------------------------------------------------
            // Calculate heading
            // ------------------------------------------------

            const heading =
              calculateBearing(
                prev.vessel.lat,
                prev.vessel.lon,
                newVessel.lat,
                newVessel.lon
              );

            const vesselWithHeading = {
              ...newVessel,

              // This property is ignored by older types
              // until you add heading to VesselState.
              heading,
            };

            // ------------------------------------------------
            // Update iceberg positions
            // ------------------------------------------------

            const newIcebergs =
              prev.icebergs.map(
                (iceberg) => ({
                  ...iceberg,

                  // Treat drift values as degrees/hour.
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

            // ------------------------------------------------
            // Generate environment
            // ------------------------------------------------

            const environment =
              generateEnvironment(
                vesselWithHeading.lat,
                vesselWithHeading.lon,
                newTime
              );

            // ------------------------------------------------
            // Estimate nearest iceberg risk
            // ------------------------------------------------

            let nearestIcebergDistance =
              Infinity;

            for (
              const iceberg of newIcebergs
            ) {
              const distance =
                haversineDistance(
                  vesselWithHeading.lat,
                  vesselWithHeading.lon,
                  iceberg.lat,
                  iceberg.lon
                );

              nearestIcebergDistance =
                Math.min(
                  nearestIcebergDistance,
                  distance
                );
            }

            const icebergRisk =
              clamp(
                1 -
                  nearestIcebergDistance /
                    50,
                0,
                1
              );

            // ------------------------------------------------
            // Calculate threat vector
            // ------------------------------------------------

            const threats =
              calculateThreatVector(
                environment,
                vesselWithHeading,
                icebergRisk
              );

            // ------------------------------------------------
            // Build hazard payload for backend
            // ------------------------------------------------

            const hazards = {
              ...environment,

              icebergs:
                newIcebergs,

              nearest_iceberg_distance:
                nearestIcebergDistance,

              threat_vector:
                threats,
            };

            // ------------------------------------------------
            // Periodic AI decision
            // ------------------------------------------------

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

              // Clear old decision so the dashboard
              // can represent the new assessment.
              fetchRiskDecision(
                vesselWithHeading,
                hazards
              )
                .then(
                  (decision) => {
                    setSimulation(
                      (current) => {
                        if (
                          decision.action ===
                          'REROUTE'
                        ) {
                          return {
                            ...current,

                            riskDecision:
                              decision,

                            previousRoute:
                              current.currentRoute,

                            currentRoute:
                              decision.recommended_route,
                          };
                        }

                        return {
                          ...current,

                          riskDecision:
                            decision,
                        };
                      }
                    );
                  }
                )
                .catch((error) => {
                  console.error(
                    'Risk decision failed:',
                    error
                  );
                });
            }

            // ------------------------------------------------
            // Return updated state
            // ------------------------------------------------

            return {
              ...prev,

              time: newTime,

              vessel:
                vesselWithHeading,

              icebergs:
                newIcebergs,

              // Store the threat vector only if
              // your SimulationState supports it.
              //
              // For now this stays internal so we don't
              // break your existing types.
            };
          }
        );
      }, SIM_TICK_MS);

    return () => {
      clearInterval(interval);
    };
  }, [isPlaying, speed]);

  // ==========================================================
  // Playback controls
  // ==========================================================

  const handlePlayPause =
    useCallback(() => {
      setIsPlaying(
        (prev) => !prev
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

      setSimulation(
        (prev) => ({
          ...prev,

          time: 0,

          vessel: {
            lat: -60.0,
            lon: -60.0,
            speed: 12,
            draft: 5.2,
            name: 'POLARISIS',
            iceRating: 'ARC3',
          },

          previousRoute: [],

          riskDecision: null,
        })
      );
    }, []);

  // ==========================================================
  // Render
  // ==========================================================

  return (
    <div className="app">
      <div className="map-container">

        <Map
          simulation={simulation}
        />

        <Dashboard
          simulation={simulation}
        />

        <ReplayController
          isPlaying={isPlaying}
          speed={speed}
          onPlayPause={
            handlePlayPause
          }
          onSpeedChange={
            handleSpeedChange
          }
          onReset={handleReset}
        />

      </div>
    </div>
  );
};

export default App;