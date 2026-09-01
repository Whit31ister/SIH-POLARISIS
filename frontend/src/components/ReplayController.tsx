import React from 'react';
import './ReplayController.css';

interface ReplayControllerProps {
  isPlaying: boolean;
  speed: number;
  onPlayPause: () => void;
  onSpeedChange: (speed: number) => void;
  onReset: () => void;
  onShutdown: () => void;
  isShuttingDown: boolean;
}

const ReplayController: React.FC<ReplayControllerProps> = ({
  isPlaying,
  speed,
  onPlayPause,
  onSpeedChange,
  onReset,
  onShutdown,
  isShuttingDown,
}) => {
  return (
    <div className="replay-controller">
      <button 
        className="control-btn play-pause-btn"
        onClick={onPlayPause}
        title={isPlaying ? 'Pause simulation' : 'Play simulation'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      <div className="speed-control">
        <label>Speed:</label>
        <select 
          value={speed} 
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          className="speed-select"
        >
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
          <option value={8}>8x</option>
        </select>
      </div>

      <button 
        className="control-btn reset-btn"
        onClick={onReset}
        title="Reset simulation"
      >
        ↻
      </button>

      <button
        className="control-btn shutdown-btn"
        onClick={onShutdown}
        disabled={isShuttingDown}
        title="Stop frontend and backend"
      >
        {isShuttingDown ? 'Stopping' : 'Stop project'}
      </button>
    </div>
  );
};

export default ReplayController;
