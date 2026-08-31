import {
  RoutePoint,
  VesselState,
} from "../types";


const EARTH_RADIUS_KM = 6371;


export function toRadians(
  degrees: number
): number {
  return (
    degrees * Math.PI / 180
  );
}


export function toDegrees(
  radians: number
): number {
  return (
    radians * 180 / Math.PI
  );
}


export function clamp(
  value: number,
  min: number,
  max: number
): number {
  return Math.max(
    min,
    Math.min(max, value)
  );
}


export function haversineDistance(
  a: RoutePoint,
  b: RoutePoint
): number {

  const dLat = toRadians(
    b.lat - a.lat
  );

  const dLon = toRadians(
    b.lon - a.lon
  );

  const lat1 = toRadians(
    a.lat
  );

  const lat2 = toRadians(
    b.lat
  );

  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(dLon / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_KM *
    Math.asin(
      Math.sqrt(value)
    )
  );
}


export function calculateRouteDistance(
  route: RoutePoint[]
): number {

  let distance = 0;

  for (
    let i = 0;
    i < route.length - 1;
    i++
  ) {
    distance +=
      haversineDistance(
        route[i],
        route[i + 1]
      );
  }

  return distance;
}


export function calculateBearing(
  a: RoutePoint,
  b: RoutePoint
): number {

  const lat1 =
    toRadians(a.lat);

  const lat2 =
    toRadians(b.lat);

  const deltaLon =
    toRadians(
      b.lon - a.lon
    );

  const y =
    Math.sin(deltaLon) *
    Math.cos(lat2);

  const x =
    Math.cos(lat1) *
    Math.sin(lat2) -
    Math.sin(lat1) *
    Math.cos(lat2) *
    Math.cos(deltaLon);

  return (
    toDegrees(
      Math.atan2(y, x)
    ) + 360
  ) % 360;
}


export function moveAlongRoute(
  vessel: VesselState,
  route: RoutePoint[],
  distanceKm: number
): VesselState {

  if (
    route.length < 2 ||
    distanceKm <= 0
  ) {
    return vessel;
  }

  let nearestSegment = 0;
  let nearestDistance = Infinity;
  let nearestRatio = 0;

  const latScale = 111;

  const lonScale =
    111 *
    Math.cos(
      toRadians(vessel.lat)
    );

  const px =
    vessel.lon * lonScale;

  const py =
    vessel.lat * latScale;

  for (
    let i = 0;
    i < route.length - 1;
    i++
  ) {

    const a = route[i];
    const b = route[i + 1];

    const ax =
      a.lon * lonScale;

    const ay =
      a.lat * latScale;

    const bx =
      b.lon * lonScale;

    const by =
      b.lat * latScale;

    const dx = bx - ax;
    const dy = by - ay;

    const lengthSquared =
      dx * dx +
      dy * dy;

    let ratio = 0;

    if (lengthSquared > 0) {

      ratio =
        (
          (px - ax) * dx +
          (py - ay) * dy
        ) /
        lengthSquared;
    }

    ratio = clamp(
      ratio,
      0,
      1
    );

    const closestX =
      ax + dx * ratio;

    const closestY =
      ay + dy * ratio;

    const distance =
      Math.sqrt(
        (px - closestX) ** 2 +
        (py - closestY) ** 2
      );

    if (
      distance <
      nearestDistance
    ) {
      nearestDistance = distance;
      nearestSegment = i;
      nearestRatio = ratio;
    }
  }

  let remaining = distanceKm;

  const start =
    route[nearestSegment];

  const next =
    route[nearestSegment + 1];

  const firstDistance =
    haversineDistance(
      {
        lat: vessel.lat,
        lon: vessel.lon,
      },
      next
    );

  if (
    firstDistance > 0 &&
    nearestRatio < 1
  ) {

    if (
      remaining <= firstDistance
    ) {

      const ratio =
        remaining /
        firstDistance;

      return {
        ...vessel,

        lat:
          vessel.lat +
          (
            next.lat -
            vessel.lat
          ) *
          ratio,

        lon:
          vessel.lon +
          (
            next.lon -
            vessel.lon
          ) *
          ratio,
      };
    }

    remaining -= firstDistance;
  }

  for (
    let i =
      nearestSegment + 1;
    i < route.length - 1;
    i++
  ) {

    const current =
      route[i];

    const target =
      route[i + 1];

    const segmentDistance =
      haversineDistance(
        current,
        target
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
          (
            target.lat -
            current.lat
          ) *
          ratio,

        lon:
          current.lon +
          (
            target.lon -
            current.lon
          ) *
          ratio,
      };
    }

    remaining -=
      segmentDistance;
  }

  const destination =
    route[route.length - 1];

  return {
    ...vessel,

    lat: destination.lat,
    lon: destination.lon,
  };
}