import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { SimulationState } from '../types';

interface MapProps {
  simulation: SimulationState;
}

const Map: React.FC<MapProps> = ({ simulation }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const mapLoaded = useRef(false);

  // Keep the latest simulation available to the map load handler
  const simulationRef = useRef<SimulationState>(simulation);

  useEffect(() => {
    simulationRef.current = simulation;
  }, [simulation]);

  // ============================================================
  // Initialize MapLibre
  // ============================================================

  useEffect(() => {
    if (!mapContainer.current) return;

    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,

      style: 'https://demotiles.maplibre.org/style.json',

      // Drake Passage
      center: [-59, -62],
      zoom: 5,
    });

    map.current = mapInstance;

    mapInstance.on('load', () => {
      mapLoaded.current = true;

      // Render whatever simulation state exists
      // once the MapLibre style is completely ready.
      updateMapLayers(mapInstance, simulationRef.current);
    });

    return () => {
      mapLoaded.current = false;

      mapInstance.remove();
      map.current = null;
    };
  }, []);

  // ============================================================
  // Update map whenever simulation changes
  // ============================================================

  useEffect(() => {
    if (!map.current || !mapLoaded.current) return;

    updateMapLayers(map.current, simulation);
  }, [simulation]);

  return (
    <div
      ref={mapContainer}
      style={{
        width: '100%',
        height: '100%',
      }}
    />
  );
};

// ============================================================
// Update all simulation layers
// ============================================================

function updateMapLayers(
  map: maplibregl.Map,
  simulation: SimulationState
) {
  // Safety check
  if (!map.isStyleLoaded()) {
    return;
  }

  // ------------------------------------------------------------
  // Vessel
  // ------------------------------------------------------------

  const vesselGeoJson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',

    features: [
      {
        type: 'Feature',

        geometry: {
          type: 'Point',

          coordinates: [
            simulation.vessel.lon,
            simulation.vessel.lat,
          ],
        },

        properties: {
          name: simulation.vessel.name,
        },
      },
    ],
  };

  updateGeoJsonLayer(
    map,
    'vessel',
    'circle',
    vesselGeoJson,
    {
      'circle-radius': 8,
      'circle-color': '#00ff00',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    }
  );

  // ------------------------------------------------------------
  // Icebergs
  // ------------------------------------------------------------

  const icebergGeoJson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',

    features: simulation.icebergs.map((iceberg) => ({
      type: 'Feature' as const,

      geometry: {
        type: 'Point' as const,

        coordinates: [
          iceberg.lon,
          iceberg.lat,
        ],
      },

      properties: {
        id: iceberg.id,
      },
    })),
  };

  updateGeoJsonLayer(
    map,
    'icebergs',
    'circle',
    icebergGeoJson,
    {
      'circle-radius': 6,
      'circle-color': '#ff6b6b',
      'circle-stroke-width': 1,
      'circle-stroke-color': '#ffffff',
    }
  );

  // ------------------------------------------------------------
  // Previous route
  // ------------------------------------------------------------

  if (simulation.previousRoute.length > 0) {
    const previousLineGeoJson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',

      features: [
        {
          type: 'Feature',

          geometry: {
            type: 'LineString',

            coordinates: simulation.previousRoute.map(
              (point) => [point.lon, point.lat]
            ),
          },

          properties: {
            route: 'previous',
          },
        },
      ],
    };

    updateGeoJsonLayer(
      map,
      'previous-route',
      'line',
      previousLineGeoJson,
      {
        'line-color': '#ff0000',
        'line-width': 3,
        'line-opacity': 0.5,
        'line-dasharray': [4, 2],
      }
    );
  } else {
    removeLayerAndSource(map, 'previous-route');
  }

  // ------------------------------------------------------------
  // Current route
  // ------------------------------------------------------------

  if (simulation.currentRoute.length > 0) {
    const currentLineGeoJson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',

      features: [
        {
          type: 'Feature',

          geometry: {
            type: 'LineString',

            coordinates: simulation.currentRoute.map(
              (point) => [point.lon, point.lat]
            ),
          },

          properties: {
            route: 'current',
          },
        },
      ],
    };

    updateGeoJsonLayer(
      map,
      'current-route',
      'line',
      currentLineGeoJson,
      {
        'line-color': '#00ff00',
        'line-width': 3,
        'line-opacity': 0.8,
      }
    );
  } else {
    removeLayerAndSource(map, 'current-route');
  }
}

// ============================================================
// Generic GeoJSON layer updater
// ============================================================

function updateGeoJsonLayer(
  map: maplibregl.Map,
  id: string,
  layerType: 'circle' | 'line',
  data: GeoJSON.FeatureCollection,
  paint: maplibregl.CircleLayerSpecification['paint'] |
         maplibregl.LineLayerSpecification['paint']
) {
  if (!map.isStyleLoaded()) {
    return;
  }

  const existingSource = map.getSource(id);

  // ----------------------------------------------------------
  // Source already exists → update its data
  // ----------------------------------------------------------

  if (existingSource) {
    const source = existingSource as maplibregl.GeoJSONSource;

    source.setData(data);
    return;
  }

  // ----------------------------------------------------------
  // Create source
  // ----------------------------------------------------------

  map.addSource(id, {
    type: 'geojson',
    data,
  });

  // ----------------------------------------------------------
  // Create layer
  // ----------------------------------------------------------

  if (layerType === 'circle') {
    map.addLayer({
      id,

      type: 'circle',

      source: id,

      paint:
        paint as maplibregl.CircleLayerSpecification['paint'],
    });
  } else {
    map.addLayer({
      id,

      type: 'line',

      source: id,

      paint:
        paint as maplibregl.LineLayerSpecification['paint'],
    });
  }
}

// ============================================================
// Safely remove layer + source
// ============================================================

function removeLayerAndSource(
  map: maplibregl.Map,
  id: string
) {
  if (!map.isStyleLoaded()) {
    return;
  }

  // IMPORTANT:
  // Remove layer BEFORE source.

  if (map.getLayer(id)) {
    map.removeLayer(id);
  }

  if (map.getSource(id)) {
    map.removeSource(id);
  }
}

export default Map;