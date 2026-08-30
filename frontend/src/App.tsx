import React, { useState, useEffect, useCallback } from 'react';
import Map from './components/Map';
import Dashboard from './components/Dashboard';
import ReplayController from './components/ReplayController';
import { fetchSimulationData, fetchRoute, fetchRiskDecision } from './utils/api';
import { SimulationState, RoutePoint, VesselState, Iceberg, GridCell } from './types';
import './App.css';

const App: React.FC = () => {
  const [simulation, setSimulation] = useState<SimulationState>({
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
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const data = await fetchSimulationData();
        
        setSimulation((prev) => ({
          ...prev,
          vessel: {
            ...prev.vessel,
            ...data.ship,
          },
          icebergs: data.icebergs || [],
          gridCells: data.grid || [],
        }));

        // Fetch initial route
        if (data.ship && data.grid) {
          const destination: RoutePoint = {
            lat: -64.0,
            lon: -63.0,
          };
          const route = await fetchRoute(
            { lat: data.ship.lat, lon: data.ship.lon },
            destination,
            { ...prev.vessel, ...data.ship }
          );
          
          setSimulation((prev) => ({
            ...prev,
            currentRoute: route,
          }));
        }
      } catch (error) {
        console.error('Failed to load initial data:', error);
      }
    };

    loadInitialData();
  }, []);

  // Simulation loop
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setSimulation((prev) => {
        const newTime = prev.time + 300 * speed; // 300 seconds per tick * speed multiplier
        
        // Update vessel position along current route
        let newVessel = { ...prev.vessel };
        if (prev.currentRoute.length > 1) {
          const progressRatio = (newTime % 10800) / 10800; // 3 hours cycle
          const routeIndex = Math.floor(progressRatio * (prev.currentRoute.length - 1));
          const nextIndex = Math.min(routeIndex + 1, prev.currentRoute.length - 1);
          
          const currentPoint = prev.currentRoute[routeIndex];
          const nextPoint = prev.currentRoute[nextIndex];
          
          newVessel = {
            ...newVessel,
            lat: currentPoint.lat + (nextPoint.lat - currentPoint.lat) * 0.1,
            lon: currentPoint.lon + (nextPoint.lon - currentPoint.lon) * 0.1,
          };
        }

        // Update iceberg positions
        const newIcebergs = prev.icebergs.map((iceberg) => ({
          ...iceberg,
          lat: iceberg.lat + iceberg.drift_lat * 0.01 * speed,
          lon: iceberg.lon + iceberg.drift_lon * 0.01 * speed,
        }));

        // Check for collision risk
        const timeHours = newTime / 3600;
        const hazards = {
          icebergs: newIcebergs,
          sea_ice_concentration: Math.random() * 0.5 + 0.3,
          wind_speed: Math.random() * 30 + 10,
          wave_height: Math.random() * 3 + 2,
        };

        // Trigger reroute decision periodically
        if (Math.floor(newTime / 1800) % 2 === 0 && prev.riskDecision === null) {
          fetchRiskDecision(newVessel, hazards).then((decision) => {
            setSimulation((prev) => {
              if (decision.action === 'REROUTE') {
                return {
                  ...prev,
                  riskDecision: decision,
                  previousRoute: prev.currentRoute,
                  currentRoute: decision.recommended_route,
                };
              }
              return { ...prev, riskDecision: decision };
            });
          });
        }

        return {
          ...prev,
          time: newTime,
          vessel: newVessel,
          icebergs: newIcebergs,
        };
      });
    }, 100 / speed);

    return () => clearInterval(interval);
  }, [isPlaying, speed]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const handleSpeedChange = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
  }, []);

  const handleReset = useCallback(() => {
    setIsPlaying(false);
    setSimulation((prev) => ({
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
    }));
  }, []);

  return (
    <div className="app">
      <div className="map-container">
        <Map simulation={simulation} />
        <Dashboard simulation={simulation} />
        <ReplayController
          isPlaying={isPlaying}
          speed={speed}
          onPlayPause={handlePlayPause}
          onSpeedChange={handleSpeedChange}
          onReset={handleReset}
        />
      </div>
    </div>
  );
};

export default App;
