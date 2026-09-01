import React from "react";

import {
  SimulationState,
} from "../types";

import "./Dashboard.css";


interface DashboardProps {
  simulation:
    SimulationState;
  onAlternativeSelect: (routeId: string) => void;
  onAlternativeReject: (routeId: string) => void;
}


const formatTime =
  (minutes: number) => {

    if (!Number.isFinite(minutes)) {
      return "--";
    }

    const hours =
      Math.floor(
        minutes / 60
      );

    const mins =
      Math.floor(
        minutes % 60
      );

    if (hours > 24) {

      const days =
        Math.floor(
          hours / 24
        );

      const remainingHours =
        hours % 24;

      return `${days}d ${remainingHours}h`;
    }

    return `${hours}h ${mins}m`;
  };


const formatCoordinate =
  (value: number) => {

    const direction =
      value < 0
        ? "S"
        : "N";

    return `${Math.abs(value).toFixed(2)}°${direction}`;
  };


const formatLongitude =
  (value: number) => {
    const direction =
      value < 0
        ? "W"
        : "E";

    return `${Math.abs(value).toFixed(2)}°${direction}`;
  };


const percent =
  (value: number) =>
    `${Math.round(value * 100)}%`;


const Dashboard:
  React.FC<
    DashboardProps
  > = ({
    simulation,
    onAlternativeSelect,
    onAlternativeReject,
  }) => {

    const {
      vessel,
      environment,
      iceHazards,
      navigation,
      threats,
      riskDecision,
      ncporStations,
    } = simulation;


    const dataSource =
      ncporStations.find(
        station =>
          station.status ===
          "LIVE"
      )
      ? "LIVE"
      : ncporStations.find(
          station =>
            station.status ===
            "STALE"
        )
        ? "STALE"
        : "SIMULATED";


    const decisionAction =
      riskDecision?.action ??
      (
        threats.overall_risk <
        0.35
          ? "PROCEED"
          : threats.overall_risk <
            0.65
            ? "REROUTE"
            : "HALT"
      );


    const decisionText =
      decisionAction ===
      "PROCEED"
        ? "SAFE TO PROCEED"
        : decisionAction ===
          "REROUTE"
          ? "ROUTE ADJUSTMENT REQUIRED"
          : "HALT / AVOID AREA";


    return (
      <aside
        className="dashboard"
      >

        <section
          className="dashboard-panel"
        >

          <PanelHeader
            title="VESSEL INFO"
          />


          <Row
            label="Name"
            value={
              vessel.name
            }
          />

          <Row
            label="Speed"
            value={
              `${vessel.speed.toFixed(1)} kt`
            }
          />

          <Row
            label="Heading"
            value={
              `${Math.round(vessel.heading)}°`
            }
          />

          <Row
            label="Draft"
            value={
              `${vessel.draft.toFixed(1)} m`
            }
          />

          <Row
            label="Ice Rating"
            value={
              vessel.iceRating
            }
          />

          <Row
            label="Position"
            value={
              `${formatCoordinate(vessel.lat)}, ${formatLongitude(vessel.lon)}`
            }
          />

        </section>


        <section
          className="dashboard-panel"
        >

          <PanelHeader
            title="ENVIRONMENT"
          />


          <Row
            label="Temperature"
            value={
              `${environment.air_temperature.toFixed(1)} °C`
            }
          />

          <Row
            label="Humidity"
            value={
              `${environment.humidity.toFixed(0)} %`
            }
          />

          <Row
            label="Pressure"
            value={
              `${environment.pressure.toFixed(1)} mbar`
            }
          />

          <Row
            label="Wind"
            value={
              `${environment.wind_speed.toFixed(1)} kt`
            }
          />

          <Row
            label="Wind Direction"
            value={
              `${Math.round(environment.wind_direction)}°`
            }
          />

          <Row
            label="Waves"
            value={
              `${environment.wave_height.toFixed(1)} m / ${environment.wave_period.toFixed(1)} s`
            }
          />

          <Row
            label="Sea Ice"
            value={
              percent(
                environment.sea_ice_concentration
              )
            }
          />

          <Row
            label="Ice Thickness"
            value={
              `${environment.ice_thickness.toFixed(2)} m`
            }
          />

          <Row
            label="Visibility"
            value={
              `${environment.visibility.toFixed(1)} km`
            }
          />

          <Row
            label="Current"
            value={
              `${environment.current_speed.toFixed(2)} kt @ ${Math.round(environment.current_direction)}°`
            }
          />

        </section>


        <section
          className="dashboard-panel"
        >

          <PanelHeader
            title="ICE HAZARDS"
          />


          <RiskBar
            value={
              iceHazards.collision_risk
            }
          />


          <Row
            label="Icebergs"
            value={
              String(
                iceHazards.iceberg_count
              )
            }
          />

          <Row
            label="Data Source"
            value="SIMULATED"
          />

          <Row
            label="Nearest"
            value={
              iceHazards
                .nearest_iceberg_distance_km
                !== null
                ? `${iceHazards.nearest_iceberg_distance_km.toFixed(1)} km`
                : "--"
            }
          />

          <Row
            label="Nearest ID"
              value={
              iceHazards
                .nearest_iceberg_id
              ?? "--"
            }
          />

          <Row
            label="Largest"
            value={
              iceHazards
                .largest_iceberg_size
              ?? "--"
            }
          />

          <Row
            label="CPA"
            value={
              iceHazards.cpa_minutes !== null
                ? `${iceHazards.cpa_minutes.toFixed(0)} min`
                : "--"
            }
          />

        </section>


        <section
          className="dashboard-panel"
        >

          <PanelHeader
            title="NAVIGATION"
          />


          <Row
            label="Route"
            value={
              `${navigation.route_distance_km.toFixed(0)} km`
            }
          />

          <Row
            label="Destination"
            value={`${formatCoordinate(simulation.destination.lat)}, ${formatLongitude(simulation.destination.lon)}`}
          />

          <Row
            label="Remaining"
            value={
              `${navigation.remaining_distance_km.toFixed(0)} km`
            }
          />

          <Row
            label="Travelled"
            value={
              `${navigation.distance_travelled_km.toFixed(0)} km`
            }
          />

          <Row
            label="ETA"
            value={
              formatTime(
                navigation.eta_minutes
              )
            }
          />

          <Row
            label="Progress"
            value={
              `${navigation.route_efficiency_pct.toFixed(0)}%`
            }
          />

          <Row
            label="Risk Reduction"
            value={
              navigation.risk_reduction_pct !== null
                ? `${navigation.risk_reduction_pct.toFixed(0)}%`
                : "--"
            }
          />

          {simulation.alternativeRoutes.length > 0 && (
            <div className="route-options">
              <div className="route-options-title">ALTERNATIVE ROUTES</div>
              {simulation.alternativeRoutes.map((alternative) => (
                <div className="route-option" key={alternative.id}>
                  <span style={{ color: alternative.color }}>{alternative.label}</span>
                  <span>{alternative.distance_km.toFixed(0)} km / {Math.round(alternative.risk_score * 100)}% risk</span>
                  <button type="button" onClick={() => onAlternativeSelect(alternative.id)}>Yes</button>
                  <button type="button" onClick={() => onAlternativeReject(alternative.id)}>No</button>
                </div>
              ))}
            </div>
          )}

        </section>


        <section
          className="dashboard-panel"
        >

          <PanelHeader
            title="AI DECISION"
          />


          <div
            className={`decision decision-${decisionAction.toLowerCase()}`}
          >
            {decisionText}
          </div>


          <Row
            label="Risk Score"
            value={
              `${Math.round(threats.overall_risk * 100)}%`
            }
          />


          <Row
            label="Ice Risk"
            value={
              `${Math.round(threats.ice_risk * 100)}%`
            }
          />


          <Row
            label="Weather Risk"
            value={
              `${Math.round(threats.weather_risk * 100)}%`
            }
          />


          <Row
            label="Confidence"
            value={
              riskDecision
                ? `${Math.round(riskDecision.confidence * 100)}%`
                : "--"
            }
          />

        </section>


        <section
          className="dashboard-panel data-panel"
        >

          <PanelHeader
            title="DATA SOURCE"
          />


          <div className="data-status">

            <span
              className={`status-dot status-${dataSource.toLowerCase()}`}
            />

            <span>
              NCPOR
            </span>

            <strong>
              {dataSource}
            </strong>

          </div>


          {dataSource ===
            "SIMULATED" && (
              <p className="data-warning">
                NCPOR unavailable.
                Synthetic demonstration
                data is active.
              </p>
          )}

        </section>

      </aside>
    );
  };


function PanelHeader({
  title,
}: {
  title: string;
}) {

  return (
    <div
      className="panel-header"
    >

      <strong>
        {title}
      </strong>

    </div>
  );
}


function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {

  return (
    <div
      className="dashboard-row"
    >

      <span>
        {label}
      </span>

      <strong>
        {value}
      </strong>

    </div>
  );
}


function RiskBar({
  value,
}: {
  value: number;
}) {

  return (
    <div
      className="risk-bar"
    >

      <div
        className="risk-bar-track"
      >

        <div
          className="risk-bar-fill"
          style={{
            width:
              `${Math.round(value * 100)}%`,
          }}
        />

      </div>

      <span>
        {Math.round(value * 100)}%
      </span>

    </div>
  );
}


export default Dashboard;