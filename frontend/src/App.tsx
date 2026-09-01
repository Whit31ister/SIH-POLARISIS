import React from "react";

import Dashboard from "./components/Dashboard";
import Map from "./components/Map";
import ReplayController from "./components/ReplayController";
import { useSimulation } from "./hooks/useSimulation";
import { shutdownProject } from "./utils/api";
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
  const [isShuttingDown, setIsShuttingDown] = React.useState(false);

  const handleShutdown = async () => {
    if (!window.confirm("Stop the POLARISIS frontend and backend?")) return;
    setIsShuttingDown(true);
    try {
      await shutdownProject();
    } catch (error) {
      console.error("Project shutdown failed:", error);
      setIsShuttingDown(false);
      window.alert("The project could not be stopped. Use Ctrl+C in the launcher terminal.");
    }
  };

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
          onShutdown={handleShutdown}
          isShuttingDown={isShuttingDown}
        />
      </div>
    </main>
  );
};

export default App;
