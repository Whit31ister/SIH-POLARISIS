import axios from 'axios';
import {    RoutePoint,
            RiskDecision,
            VesselState,
            NCPORStation, } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface NCPORResponse {
  source: string;
  updated_at: string | null;
  stations: NCPORStation[];
}

export async function fetchNCPORData(): Promise<NCPORResponse> {
  try {
    const response = await api.get<NCPORResponse>(
      '/data/ncpor'
    );

    return response.data;
  } catch (error) {
    console.error(
      'Error fetching NCPOR data:',
      error
    );

    throw error;
  }
}

export async function fetchRoute(
  start: RoutePoint,
  destination: RoutePoint,
  vessel: VesselState
): Promise<RoutePoint[]> {
  try {
    const response = await api.post('/route', {
      start,
      destination,
      vessel_speed: vessel.speed,
      vessel_draft: vessel.draft,
      ice_capability: vessel.iceRating,
    });
    return response.data.route;
  } catch (error) {
    console.error('Error fetching route:', error);
    throw error;
  }
}

export async function fetchRiskDecision(
  vessel: VesselState,
  hazards: any
): Promise<RiskDecision> {
  try {
    const response = await api.post('/decision', {
      vessel_speed: vessel.speed,
      vessel_draft: vessel.draft,
      ice_capability: vessel.iceRating,
      hazards,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching risk decision:', error);
    throw error;
  }
}

export async function fetchSimulationData(): Promise<any> {
  try {
    const [shipRes, icebergsRes, gridRes] = await Promise.all([
      api.get('/data/ship'),
      api.get('/data/icebergs'),
      api.get('/data/ice_grid'),
    ]);
    return {
      ship: shipRes.data,
      icebergs: icebergsRes.data,
      grid: gridRes.data,
    };
  } catch (error) {
    console.error('Error fetching simulation data:', error);
    throw error;
  }
}
