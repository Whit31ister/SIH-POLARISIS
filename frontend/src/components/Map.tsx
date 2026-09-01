import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { SimulationState } from '../types';

interface MapProps {
  simulation: SimulationState;
  onDestinationSelect: (point: { lat: number; lon: number }) => void;
}

const Map: React.FC<MapProps> = ({ simulation, onDestinationSelect }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const mapLoaded = useRef(false);
  const destinationMarker = useRef<maplibregl.Marker | null>(null);
  const [routeOverlay, setRouteOverlay] = useState<Array<{ points: string; color: string; active: boolean }>>([]);

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
    const overlayTimer = window.setInterval(() => {
      updateRouteOverlay(mapInstance, simulationRef.current, setRouteOverlay);
    }, 250);

    mapInstance.on('load', () => {
      mapInstance.on('click', (event) => {
        onDestinationSelect({ lat: event.lngLat.lat, lon: event.lngLat.lng });
      });
      mapLoaded.current = true;

      destinationMarker.current = new maplibregl.Marker({
        color: '#e06464',
        draggable: true,
      })
        .setLngLat([
          simulationRef.current.destination.lon,
          simulationRef.current.destination.lat,
        ])
        .addTo(mapInstance);

      destinationMarker.current.on('dragend', () => {
        const position = destinationMarker.current?.getLngLat();
        if (position) {
          onDestinationSelect({ lat: position.lat, lon: position.lng });
        }
      });

      // Render whatever simulation state exists
      // once the MapLibre style is completely ready.
      updateMapLayers(mapInstance, simulationRef.current);
      updateRouteOverlay(mapInstance, simulationRef.current, setRouteOverlay);
      mapInstance.on('move', () => updateRouteOverlay(mapInstance, simulationRef.current, setRouteOverlay));
      mapInstance.on('zoom', () => updateRouteOverlay(mapInstance, simulationRef.current, setRouteOverlay));
    });

    return () => {
      mapLoaded.current = false;

      window.clearInterval(overlayTimer);
      mapInstance.remove();
      destinationMarker.current = null;
      map.current = null;
    };
  }, []);

  // ============================================================
  // Update map whenever simulation changes
  // ============================================================

  useEffect(() => {
    if (!map.current || !mapLoaded.current) return;

    destinationMarker.current?.setLngLat([
      simulation.destination.lon,
      simulation.destination.lat,
    ]);
    updateMapLayers(map.current, simulation);
    updateRouteOverlay(map.current, simulation, setRouteOverlay);
  }, [simulation]);

  return (
    <div className="map-shell">
      <div ref={mapContainer} className="map-canvas" />
      <svg className="route-overlay" aria-hidden="true">
        {routeOverlay.map((route, index) => (
          <polyline
            key={`${route.color}-${index}`}
            points={route.points}
            fill="none"
            stroke={route.color}
            strokeWidth={route.active ? 4 : 3}
            strokeDasharray={route.active ? undefined : '8 6'}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={route.active ? 0.95 : 0.82}
          />
        ))}
      </svg>
    </div>
  );
};

function updateRouteOverlay(
  map: maplibregl.Map,
  simulation: SimulationState,
  setRoutes: React.Dispatch<React.SetStateAction<Array<{ points: string; color: string; active: boolean }>>>,
) {
  const routes = [
    { route: simulation.currentRoute, color: '#e06464', active: true },
    ...simulation.alternativeRoutes.map((alternative) => ({ route: alternative.route, color: alternative.color, active: false })),
  ];
  setRoutes(routes.map(({ route, color, active }) => ({
    color,
    active,
    points: route.map((point) => {
      const projected = projectPoint(map, point.lon, point.lat);
      return `${projected.x},${projected.y}`;
    }).join(' '),
  })));
}

function projectPoint(map: maplibregl.Map, lon: number, lat: number) {
  try {
    return map.project([lon, lat]);
  } catch {
    const container = map.getContainer();
    const width = container.clientWidth;
    const height = container.clientHeight;
    const center = map.getCenter();
    const zoomScale = 256 * 2 ** map.getZoom();
    const longitudePixels = (lon - center.lng) * zoomScale / 360;
    const latitudePixels = (center.lat - lat) * zoomScale / 360;
    return {
      x: width / 2 + longitudePixels,
      y: height / 2 + latitudePixels,
    };
  }
}

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
        'line-color': '#e06464',
        'line-width': 3,
        'line-opacity': 0.8,
      }
    );
  } else {
    removeLayerAndSource(map, 'current-route');
  }
  const destination: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [simulation.destination.lon, simulation.destination.lat] }, properties: {} }],
  };
  updateGeoJsonLayer(map, 'destination', 'circle', destination, {
    'circle-radius': 7,
    'circle-color': '#e06464',
    'circle-stroke-width': 2,
    'circle-stroke-color': '#ffffff',
  });

  simulation.alternativeRoutes.forEach((alternative) => {
    const data: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: alternative.route.map((point) => [point.lon, point.lat]) }, properties: {} }],
    };
    updateGeoJsonLayer(map, alternative.id, 'line', data, {
      'line-color': alternative.color,
      'line-width': 3,
      'line-opacity': 0.85,
      'line-dasharray': [2, 2],
    });
  });
  const alternativeIds = new Set(simulation.alternativeRoutes.map((alternative) => alternative.id));
  ['alternative-1', 'alternative-2', 'alternative-3', 'alternative-4', 'alternative-5']
    .filter((id) => !alternativeIds.has(id))
    .forEach((id) => removeLayerAndSource(map, id));
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