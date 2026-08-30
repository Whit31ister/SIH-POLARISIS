import React from 'react';
import { SimulationState } from '../types';
import './Dashboard.css';

interface DashboardProps {
  simulation: SimulationState;
}

const Dashboard: React.FC<DashboardProps> = ({ simulation }) => {
  const { vessel, riskDecision, time } = simulation;
  const riskPercentage = riskDecision ? Math.round(riskDecision.risk_score * 100) : 0;

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  return (
    <div className="dashboard">
      {/* Vessel Info Panel */}
      <div className="panel vessel-info">
        <h3>🚢 VESSEL INFO</h3>
        <div className="info-row">
          <span className="label">Name:</span>
          <span className="value">{vessel.name}</span>
        </div>
        <div className="info-row">
          <span className="label">Speed:</span>
          <span className="value">{vessel.speed} knots</span>
        </div>
        <div className="info-row">
          <span className="label">Draft:</span>
          <span className="value">{vessel.draft}m</span>
        </div>
        <div className="info-row">
          <span className="label">Ice Rating:</span>
          <span className="value">{vessel.iceRating}</span>
        </div>
        <div className="info-row">
          <span className="label">Position:</span>
          <span className="value">{vessel.lat.toFixed(2)}°S, {vessel.lon.toFixed(2)}°W</span>
        </div>
      </div>

      {/* Threat Matrix Panel */}
      <div className="panel threat-matrix">
        <h3>⚠️ THREAT MATRIX</h3>
        <div className="threat-item">
          <span className="label">Risk Score:</span>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${riskPercentage}%`, backgroundColor: riskPercentage > 50 ? '#ff6b6b' : '#4ecdc4' }}
            />
          </div>
          <span className="value">{riskPercentage}%</span>
        </div>
        <div className="threat-item">
          <span className="label">Icebergs Detected:</span>
          <span className="value status-warning">{simulation.icebergs.length}</span>
        </div>
        <div className="threat-item">
          <span className="label">Ice Concentration:</span>
          <span className="value">MODERATE</span>
        </div>
        <div className="threat-item">
          <span className="label">Wave Height:</span>
          <span className="value">3-4m</span>
        </div>
      </div>

      {/* AI Decision Panel */}
      <div className="panel ai-decision">
        <h3>🤖 AI DECISION</h3>
        {riskDecision ? (
          <>
            <div className="alert-banner" style={{ backgroundColor: riskDecision.action === 'REROUTE' ? '#ff6b6b' : '#4ecdc4' }}>
              {riskDecision.action === 'REROUTE' && '⚠️ REROUTE RECOMMENDED'}
              {riskDecision.action === 'PROCEED' && '✓ SAFE TO PROCEED'}
              {riskDecision.action === 'HALT' && '🛑 HALT ADVISED'}
            </div>
            <div className="decision-row">
              <span className="label">Confidence:</span>
              <span className="value">{Math.round(riskDecision.confidence * 100)}%</span>
            </div>
            <div className="decision-row">
              <span className="label">ETA (Current Route):</span>
              <span className="value">{formatTime(riskDecision.eta_minutes)}</span>
            </div>
            <div className="decision-row">
              <span className="label">Risk Reduction:</span>
              <span className="value status-success">
                {riskPercentage}% → {Math.round(riskDecision.risk_score * 0.2 * 100)}%
              </span>
            </div>
          </>
        ) : (
          <p className="status-info">Analyzing threats...</p>
        )}
      </div>

      {/* Simulation Time */}
      <div className="simulation-time">
        Simulation Time: {Math.floor(time / 3600)}h {Math.floor((time % 3600) / 60)}m
      </div>
    </div>
  );
};

export default Dashboard;
