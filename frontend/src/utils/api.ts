import axios from "axios";

import {
  RoutePoint,
  RiskDecision,
  VesselState,
  NCPORStation,
} from "../types";


const API_BASE =
  import.meta.env.VITE_API_URL ||
  "http://localhost:8000";


export const api =
  axios.create({
    baseURL: API_BASE,

    headers: {
      "Content-Type":
        "application/json",
    },

    timeout: 15000,
  });


export async function fetchRoute(
  start: RoutePoint,
  destination: RoutePoint,
  vessel: VesselState
): Promise<RoutePoint[]> {

  const response =
    await api.post(
      "/route",
      {
        start,
        destination,

        vessel_speed:
          vessel.speed,

        vessel_draft:
          vessel.draft,

        ice_capability:
          vessel.iceRating,
      }
    );

  return response.data.route;
}


export async function fetchRiskDecision(
  vessel: VesselState,
  hazards: unknown,
  route: RoutePoint[] = []
): Promise<RiskDecision> {

  const response =
    await api.post(
      "/decision",
      {
        vessel_speed:
          vessel.speed,

        vessel_draft:
          vessel.draft,

        ice_capability:
          vessel.iceRating,

        vessel_position: {
          lat: vessel.lat,
          lon: vessel.lon,
        },

        route,

        hazards,
      }
    );

  return response.data;
}


export async function fetchSimulationData() {

  const [
    shipRes,
    icebergsRes,
    gridRes,
  ] = await Promise.all([
    api.get("/data/ship"),
    api.get("/data/icebergs"),
    api.get("/data/ice_grid"),
  ]);

  return {
    ship:
      shipRes.data,

    icebergs:
      icebergsRes.data,

    grid:
      gridRes.data,
  };
}


export async function fetchNCPORData(): Promise<{
  source: string;
  updated_at: string;
  stations: NCPORStation[];
}> {

  const response =
    await api.get(
      "/data/ncpor"
    );

  return response.data;
}