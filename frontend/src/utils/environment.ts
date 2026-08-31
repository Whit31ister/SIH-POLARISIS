import {
  EnvironmentState,
} from "../types";

import {
  clamp,
} from "./navigation";


export function generateEnvironment(
  lat: number,
  lon: number,
  simulationTime: number
): EnvironmentState {

  const hours =
    simulationTime / 3600;

  const latitudeFactor =
    clamp(
      (-lat - 55) / 30,
      0,
      1
    );

  const weatherCycle =
    (
      Math.sin(
        hours * 0.35 +
        lon * 0.08
      ) + 1
    ) / 2;

  const secondaryWeather =
    (
      Math.sin(
        hours * 0.17 -
        lat * 0.11
      ) + 1
    ) / 2;

  const seaIceConcentration =
    clamp(
      0.12 +
      latitudeFactor * 0.58 +
      weatherCycle * 0.18,

      0,
      1
    );

  const iceThickness =
    clamp(
      0.1 +
      latitudeFactor * 1.5 +
      weatherCycle * 0.35,

      0.05,
      2.5
    );

  const windSpeed =
    10 +
    weatherCycle * 32 +
    secondaryWeather * 10;

  const windDirection =
    (
      220 +
      Math.sin(
        hours * 0.15
      ) * 60 +
      360
    ) % 360;

  const waveHeight =
    clamp(
      1.2 +
      weatherCycle * 4.5 +
      secondaryWeather * 1.2,

      0.5,
      7
    );

  const wavePeriod =
    5 +
    weatherCycle * 5;

  const visibility =
    clamp(
      22 -
      weatherCycle * 13 -
      secondaryWeather * 4,

      1,
      25
    );

  const pressure =
    995 +
    Math.sin(
      hours * 0.12
    ) * 22;

  const airTemperature =
    -1 -
    latitudeFactor * 11 -
    weatherCycle * 3;

  const seaTemperature =
    1.5 -
    latitudeFactor * 3;

  const currentSpeed =
    0.25 +
    secondaryWeather * 1.25;

  const currentDirection =
    (
      70 +
      Math.sin(
        hours * 0.13 +
        lon * 0.03
      ) * 55 +
      360
    ) % 360;

  const humidity =
    clamp(
      62 +
      secondaryWeather * 25 +
      latitudeFactor * 8,
      40,
      98
    );

  return {
    air_temperature:
      airTemperature,

    sea_temperature:
      seaTemperature,

    pressure,

    humidity,

    wind_speed:
      windSpeed,

    wind_direction:
      windDirection,

    wave_height:
      waveHeight,

    wave_period:
      wavePeriod,

    visibility,

    sea_ice_concentration:
      seaIceConcentration,

    ice_thickness:
      iceThickness,

    current_speed:
      currentSpeed,

    current_direction:
      currentDirection,

    source:
      "SIMULATED",
  };
}