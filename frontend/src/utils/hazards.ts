import {
  Iceberg,
  IceHazardState,
  RoutePoint,
} from "../types";

import {
  haversineDistance,
  clamp,
} from "./navigation";


export function calculateIcebergHazards(
  vessel: RoutePoint,
  icebergs: Iceberg[],
  vesselSpeedKnots: number
): IceHazardState {

  if (
    icebergs.length === 0
  ) {

    return {
      iceberg_count: 0,
      nearest_iceberg_distance_km: null,
      nearest_iceberg_id: null,
      largest_iceberg_size: null,
      collision_risk: 0,
      cpa_minutes: null,
    };
  }

  let nearest:
    Iceberg | null = null;

  let nearestDistance =
    Infinity;

  for (
    const iceberg of icebergs
  ) {

    const distance =
      haversineDistance(
        vessel,
        iceberg
      );

    if (
      distance <
      nearestDistance
    ) {

      nearestDistance =
        distance;

      nearest =
        iceberg;
    }
  }

  const distance =
    nearestDistance === Infinity
      ? null
      : nearestDistance;

  let collisionRisk = 0;

  if (distance !== null) {

    if (distance < 2) {
      collisionRisk = 1;
    } else if (distance < 5) {
      collisionRisk = 0.85;
    } else if (distance < 10) {
      collisionRisk = 0.55;
    } else if (distance < 20) {
      collisionRisk = 0.25;
    } else {
      collisionRisk = 0.05;
    }
  }

  let cpaMinutes:
    number | null = null;

  if (
    distance !== null &&
    vesselSpeedKnots > 0
  ) {

    const speedKmPerHour =
      vesselSpeedKnots * 1.852;

    cpaMinutes =
      (
        distance /
        speedKmPerHour
      ) * 60;
  }

  const sizeRank = {
    small: 1,
    medium: 2,
    large: 3,
  };

  let largest:
    NonNullable<Iceberg["size"]> |
    null = null;

  for (
    const iceberg of icebergs
  ) {

    if (!iceberg.size) {
      continue;
    }

    if (
      !largest ||
      sizeRank[iceberg.size] >
      sizeRank[largest]
    ) {
      largest =
        iceberg.size;
    }
  }

  return {
    iceberg_count:
      icebergs.length,

    nearest_iceberg_distance_km:
      distance,

    nearest_iceberg_id:
      nearest?.id ?? null,

    largest_iceberg_size:
      largest,

    collision_risk:
      clamp(
        collisionRisk,
        0,
        1
      ),

    cpa_minutes:
      cpaMinutes,
  };
}


export function calculateThreats(
  environment: {
    sea_ice_concentration: number;
    wind_speed: number;
    wave_height: number;
    visibility: number;
  },
  icebergRisk: number,
  iceRating: string
) {

  const iceCapability =
    iceRating === "ARC3"
      ? 0.7
      : 1.0;

  const iceRisk =
    clamp(
      environment.sea_ice_concentration *
      iceCapability,
      0,
      1
    );

  const weatherRisk =
    clamp(
      environment.wind_speed / 60,
      0,
      1
    );

  const waveRisk =
    clamp(
      environment.wave_height / 7,
      0,
      1
    );

  const visibilityRisk =
    clamp(
      1 -
      environment.visibility / 20,
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
    ice_risk: iceRisk,

    iceberg_risk:
      icebergRisk,

    weather_risk:
      weatherRisk,

    wave_risk:
      waveRisk,

    visibility_risk:
      visibilityRisk,

    overall_risk:
      clamp(
        overallRisk,
        0,
        1
      ),
  };
}