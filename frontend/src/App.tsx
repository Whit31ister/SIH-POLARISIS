import React from "react";

import Dashboard from "./components/Dashboard";
import Map from "./components/Map";
import ReplayController from "./components/ReplayController";
import { useSimulation } from "./hooks/useSimulation";
import "./App.css";

const App: React.FC = () => {
  const {
    simulation,
    isPlaying,
    speed,
    togglePlaying,
    changeSpeed,
    reset,
  } = useSimulation();

  return (
    <main className="app">
      <div className="map-container">
        <Map simulation={simulation} />
        <Dashboard simulation={simulation} />
        <ReplayController
          isPlaying={isPlaying}
          speed={speed}
          onPlayPause={togglePlaying}
          onSpeedChange={changeSpeed}
          onReset={reset}
        />
      </div>
    </main>
  );
};

export default App;
