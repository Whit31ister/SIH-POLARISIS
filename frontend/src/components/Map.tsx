import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SimulationState, RoutePoint } from '../types';

interface MapProps {
  simulation: SimulationState;
}

const Map: React.FC<MapProps> = ({ simulation }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Initialize map centered on Drake Passage
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-59, -62],
      zoom: 5,
    });

    return () => {
      map.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;

    // Add vessel marker
    const vesselGeoJson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [simulation.vessel.lon, simulation.vessel.lat],
          },
          properties: { name: simulation.vessel.name },
        },
      ],
    };

    // Remove existing source if it exists
    if (map.current.getSource('vessel')) {
      map.current.removeSource('vessel');
    }

    map.current.addSource('vessel', {
      type: 'geojson',
      data: vesselGeoJson,
    });

    // Add vessel layer
    if (!map.current.getLayer('vessel')) {
      map.current.addLayer({
        id: 'vessel',
        type: 'circle',
        source: 'vessel',
        paint: {
          'circle-radius': 8,
          'circle-color': '#00ff00',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      });
    }
  }, [simulation.vessel]);

  useEffect(() => {
    if (!map.current) return;

    // Add icebergs
    const icebergGeoJson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: simulation.icebergs.map((iceberg) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [iceberg.lon, iceberg.lat],
        },
        properties: { id: iceberg.id },
      })),
    };

    if (map.current.getSource('icebergs')) {
      map.current.removeSource('icebergs');
    }

    map.current.addSource('icebergs', {
      type: 'geojson',
      data: icebergGeoJson,
    });

    if (!map.current.getLayer('icebergs')) {
      map.current.addLayer({
        id: 'icebergs',
        type: 'circle',
        source: 'icebergs',
        paint: {
          'circle-radius': 6,
          'circle-color': '#ff6b6b',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#ffffff',
        },
      });
    }
  }, [simulation.icebergs]);

  useEffect(() => {
    if (!map.current) return;

    // Add previous route (high risk - red)
    if (simulation.previousRoute.length > 0) {
      const previousLineGeoJson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: simulation.previousRoute.map((p) => [p.lon, p.lat]),
            },
            properties: { route: 'previous' },
          },
        ],
      };

      if (map.current.getSource('previous-route')) {
        map.current.removeSource('previous-route');
      }

      map.current.addSource('previous-route', {
        type: 'geojson',
        data: previousLineGeoJson,
      });

      if (!map.current.getLayer('previous-route')) {
        map.current.addLayer({
          id: 'previous-route',
          type: 'line',
          source: 'previous-route',
          paint: {
            'line-color': '#ff0000',
            'line-width': 3,
            'line-opacity': 0.5,
            'line-dasharray': [4, 2],
          },
        });
      }
    }

    // Add current route (low risk - green)
    if (simulation.currentRoute.length > 0) {
      const currentLineGeoJson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: simulation.currentRoute.map((p) => [p.lon, p.lat]),
            },
            properties: { route: 'current' },
          },
        ],
      };

      if (map.current.getSource('current-route')) {
        map.current.removeSource('current-route');
      }

      map.current.addSource('current-route', {
        type: 'geojson',
        data: currentLineGeoJson,
      });

      if (!map.current.getLayer('current-route')) {
        map.current.addLayer({
          id: 'current-route',
          type: 'line',
          source: 'current-route',
          paint: {
            'line-color': '#00ff00',
            'line-width': 3,
            'line-opacity': 0.8,
          },
        });
      }
    }
  }, [simulation.currentRoute, simulation.previousRoute]);

  return <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />;
};

export default Map;
