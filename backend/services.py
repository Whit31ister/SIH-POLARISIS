from typing import Any


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def route_distance(path: list[Any]) -> float:
    distance = 0.0
    for first, second in zip(path, path[1:]):
        dlat = abs(second[0] - first[0]) * 111
        dlon = abs(second[1] - first[1]) * 111 * 0.87
        distance += (dlat**2 + dlon**2) ** 0.5
    return distance


def eta_minutes(distance_km: float, speed_knots: float) -> int:
    return int(distance_km / (speed_knots * 1.852) * 60) if speed_knots > 0 else 0