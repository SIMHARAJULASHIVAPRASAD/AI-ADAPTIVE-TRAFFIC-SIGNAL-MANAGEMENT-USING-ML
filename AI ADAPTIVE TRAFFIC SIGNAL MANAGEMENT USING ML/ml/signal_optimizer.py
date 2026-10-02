"""Adaptive traffic-signal optimizer used by the local demo API.

The scoring model is intentionally transparent rather than a black-box claim:
vehicle count, density, time of day, weather, and emergency priority all feed
into a deterministic green-time recommendation.
"""
from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Dict

TIME_FACTOR = {"peak": 1.08, "mid": 1.00, "off": 0.88}
WEATHER_FACTOR = {"clear": 1.00, "cloudy": 1.03, "rainy": 1.12}
WEATHER_DELTA = {"clear": 0, "cloudy": 2, "rainy": 5}
TIME_DELTA = {"peak": 3, "mid": 1, "off": -1}
TIME_ALIASES = {
    "peak": "peak",
    "peak-hour": "peak",
    "peak_hour": "peak",
    "mid": "mid",
    "midday": "mid",
    "mid-day": "mid",
    "mid_day": "mid",
    "off": "off",
    "off-peak": "off",
    "off_peak": "off",
    "offpeak": "off",
    "off-peak-traffic": "off",
}
WEATHER_ALIASES = {
    "clear": "clear",
    "sunny": "clear",
    "cloudy": "cloudy",
    "overcast": "cloudy",
    "rainy": "rainy",
    "wet": "rainy",
    "stormy": "rainy",
}


@dataclass(frozen=True)
class DirectionRecommendation:
    direction: str
    vehicles: int
    density: int
    priority: int
    green_seconds: int
    emergency: bool


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _normalize_choice(value: Any, aliases: Mapping[str, str], default: str, field_name: str) -> str:
    if value is None:
        return default
    key = str(value).strip().lower().replace("_", "-").replace(" ", "-")
    normalized = aliases.get(key, key)
    allowed = TIME_FACTOR if field_name == "time_of_day" else WEATHER_FACTOR
    if normalized not in allowed:
        raise ValueError(f"Unsupported {field_name}: {value}")
    return normalized


def recommend_signals(payload: Dict[str, Any]) -> Dict[str, Any]:
    if payload is None:
        payload = {}
    if not isinstance(payload, Mapping):
        raise TypeError("payload must be a mapping with signal inputs")

    time_of_day = _normalize_choice(payload.get("time_of_day", "mid"), TIME_ALIASES, "mid", "time_of_day")
    weather = _normalize_choice(payload.get("weather", "clear"), WEATHER_ALIASES, "clear", "weather")
    directions = payload.get("directions", {}) or {}
    if not isinstance(directions, Mapping):
        raise TypeError("directions must be a mapping by direction name")

    results = []
    for direction in ("North", "South", "East", "West"):
        item = directions.get(direction, {}) or {}
        if not isinstance(item, Mapping):
            item = {}
        vehicles = int(item.get("vehicles", 0))
        emergency = bool(item.get("emergency", False))
        vehicles = int(clamp(vehicles, 0, 60))
        density = int(round(clamp(vehicles / 43, 0.08, 0.92) * 100))
        priority = 100 if emergency else int(round(vehicles + (density / 100) * 34))
        green = 11 + priority * 0.52
        green = green * TIME_FACTOR[time_of_day] * WEATHER_FACTOR[weather]
        green += WEATHER_DELTA[weather] + TIME_DELTA[time_of_day]
        green_seconds = int(round(clamp(green, 14, 44)))
        results.append(DirectionRecommendation(direction, vehicles, density, priority, green_seconds, emergency))

    emergency = next((r for r in results if r.emergency), None)
    active = emergency or max(results, key=lambda r: r.priority)
    cycle_seconds = sum(r.green_seconds for r in results) + 8
    return {
        "active_direction": active.direction,
        "active_green_seconds": active.green_seconds,
        "cycle_seconds": cycle_seconds,
        "recommendations": [r.__dict__ for r in results],
    }


if __name__ == "__main__":
    example = {
        "time_of_day": "mid",
        "weather": "rainy",
        "directions": {
            "North": {"vehicles": 12, "emergency": False},
            "South": {"vehicles": 8, "emergency": False},
            "East": {"vehicles": 18, "emergency": False},
            "West": {"vehicles": 5, "emergency": False},
        },
    }
    print(recommend_signals(example))
