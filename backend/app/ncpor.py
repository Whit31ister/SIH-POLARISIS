"""
NCPOR live meteorological data adapter.

POLARISIS uses NCPOR as an external source for Antarctic
meteorological observations.

Data priority:

    LIVE
        Fresh observation fetched from NCPOR.

    STALE
        Previously successful observation from local cache.

    SIMULATED
        Synthetic demonstration data.

    ERROR
        No usable data exists.

IMPORTANT:

    SIMULATED values are synthetic demonstration data.
    They must never be presented as real NCPOR observations.

SESSION BEHAVIOR:

    POLARISIS performs ONE availability check when the backend
    first requests NCPOR data.

    If that check fails, the backend permanently enters
    SIMULATED mode for the lifetime of the process.

    This prevents repeated requests to an unavailable NCPOR
    endpoint.
"""

from __future__ import annotations

import json
import html as html_module
import logging
import re
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import requests


logger = logging.getLogger(__name__)


# ============================================================
# Configuration
# ============================================================

NCPOR_BASE_URL = "https://data.ncpor.res.in"

REQUEST_TIMEOUT = 8

CACHE_FILE = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "ncpor_cache.json"
)

FALLBACK_FILE = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "ncpor_fallback.json"
)


# ============================================================
# Session state
# ============================================================

_ncpor_checked = False
_ncpor_available = False
_ncpor_error: str | None = None


# ============================================================
# Station definitions
# ============================================================

STATIONS: dict[str, dict[str, Any]] = {
    "maitri": {
        "name": "Maitri",
        "lat": -70.764444,
        "lon": 11.734167,
        "url": f"{NCPOR_BASE_URL}/maitri/live",
    },
    "bharati": {
        "name": "Bharati",
        "lat": -69.406833,
        "lon": 76.195333,
        "url": f"{NCPOR_BASE_URL}/bharati/live",
    },
}


# ============================================================
# Data model
# ============================================================

@dataclass
class StationObservation:
    id: str
    name: str
    region: str
    lat: float
    lon: float

    temperature_c: float | None = None
    relative_humidity_pct: float | None = None
    pressure_mbar: float | None = None

    wind_speed_knots: float | None = None
    wind_speed_mps: float | None = None

    observation_date: str | None = None
    fetched_at: float | None = None

    source_url: str = ""

    # LIVE / STALE / SIMULATED / ERROR
    status: str = "ERROR"

    error: str | None = None

    data_age_seconds: float | None = None

    is_cached: bool = False


# ============================================================
# Cache
# ============================================================

def _load_cache() -> dict[str, Any]:
    try:
        if not CACHE_FILE.exists():
            return {}

        with CACHE_FILE.open(
            "r",
            encoding="utf-8",
        ) as file:
            data = json.load(file)

        if not isinstance(data, dict):
            return {}

        return data

    except Exception as exc:
        logger.warning(
            "Could not read NCPOR cache: %s",
            exc,
        )
        return {}


def _save_cache(
    cache: dict[str, Any],
) -> None:
    try:
        CACHE_FILE.parent.mkdir(
            parents=True,
            exist_ok=True,
        )

        temporary_file = CACHE_FILE.with_suffix(
            ".tmp"
        )

        with temporary_file.open(
            "w",
            encoding="utf-8",
        ) as file:
            json.dump(
                cache,
                file,
                indent=2,
            )

        temporary_file.replace(CACHE_FILE)

    except Exception as exc:
        logger.warning(
            "Could not save NCPOR cache: %s",
            exc,
        )


# ============================================================
# Synthetic fallback
# ============================================================

def _load_fallback() -> dict[str, Any]:
    try:
        if not FALLBACK_FILE.exists():
            logger.warning(
                "NCPOR fallback file does not exist: %s",
                FALLBACK_FILE,
            )
            return {}

        with FALLBACK_FILE.open(
            "r",
            encoding="utf-8",
        ) as file:
            data = json.load(file)

        if not isinstance(data, dict):
            return {}

        return data

    except Exception as exc:
        logger.warning(
            "Could not read NCPOR fallback: %s",
            exc,
        )
        return {}


def _fallback_station(
    station_id: str,
    fallback: dict[str, Any],
    error: str,
) -> StationObservation:

    station = STATIONS[station_id]

    station_values = fallback.get("stations", {})
    values = station_values.get(station_id)

    if not isinstance(values, dict):
        return StationObservation(
            id=station_id,
            name=station["name"],
            region="Antarctica",
            lat=station["lat"],
            lon=station["lon"],
            source_url=station["url"],
            status="ERROR",
            error=error,
        )

    observations = values.get("observations", [])
    if isinstance(observations, list) and observations:
        first_observation = observations[0]
        if isinstance(first_observation, dict):
            values = first_observation

    return StationObservation(
        id=station_id,
        name=station["name"],
        region="Antarctica",
        lat=station["lat"],
        lon=station["lon"],

        temperature_c=values.get(
            "temperature_c"
        ),

        relative_humidity_pct=values.get(
            "relative_humidity_pct"
        ),

        pressure_mbar=values.get(
            "pressure_mbar"
        ),

        wind_speed_knots=values.get(
            "wind_speed_knots"
        ),

        wind_speed_mps=values.get(
            "wind_speed_mps"
        ),

        observation_date=values.get(
            "observation_date",
            "SIMULATED",
        ),

        fetched_at=time.time(),

        source_url=station["url"],

        status="SIMULATED",

        error=error,

        data_age_seconds=0,

        is_cached=False,
    )


# ============================================================
# HTML parsing
# ============================================================

def _html_to_text(
    html: str,
) -> str:

    text = re.sub(
        r"<script\b[^>]*>.*?</script>",
        " ",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )

    text = re.sub(
        r"<style\b[^>]*>.*?</style>",
        " ",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )

    text = re.sub(
        r"<[^>]+>",
        " ",
        text,
    )

    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    return html_module.unescape(text).strip()


def _extract_float(
    patterns: list[str],
    text: str,
) -> float | None:

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE,
        )

        if not match:
            continue

        try:
            return float(match.group(1))
        except (
            ValueError,
            TypeError,
        ):
            continue

    return None


# ============================================================
# NCPOR parser
# ============================================================

def _parse_live_page(
    station_id: str,
    html: str,
) -> StationObservation:

    if station_id not in STATIONS:
        raise ValueError(
            f"Unknown NCPOR station: {station_id}"
        )

    station = STATIONS[station_id]

    text = _html_to_text(html)

    temperature = _extract_float(
        [
            r"Temperature\s*:\s*(-?\d+(?:\.\d+)?)\s*°?\s*C",
            r"Air\s+Temperature\s*:\s*(-?\d+(?:\.\d+)?)\s*°?\s*C",
        ],
        text,
    )

    humidity = _extract_float(
        [
            r"Relative\s+Humidity\s*:\s*(\d+(?:\.\d+)?)\s*%",
            r"Rel\.?\s*Humidity\s*:\s*(\d+(?:\.\d+)?)\s*%",
        ],
        text,
    )

    pressure = _extract_float(
        [
            r"Air\s+Pressure\s*:\s*(\d+(?:\.\d+)?)\s*mBar",
            r"Air\s+Pressure\s*:\s*(\d+(?:\.\d+)?)\s*hPa",
        ],
        text,
    )

    wind_knots = _extract_float(
        [
            r"Wind\s+Speed\s*:?\s*(\d+(?:\.\d+)?)\s*knots?",
            r"Wind\s*:?\s*(\d+(?:\.\d+)?)\s*knots?",
        ],
        text,
    )

    wind_mps = _extract_float(
        [
            r"Wind\s+Speed\s*:?\s*(\d+(?:\.\d+)?)\s*m/s",
            r"Wind\s*:?\s*(\d+(?:\.\d+)?)\s*m/s",
        ],
        text,
    )

    if (
        wind_mps is None
        and wind_knots is not None
    ):
        wind_mps = wind_knots * 0.514444

    if (
        wind_knots is None
        and wind_mps is not None
    ):
        wind_knots = wind_mps / 0.514444

    if (
        temperature is None
        and humidity is None
        and pressure is None
        and wind_knots is None
    ):
        raise ValueError(
            "NCPOR page was reached but no "
            "meteorological values could be parsed"
        )

    observation_date_match = re.search(
        r"(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})",
        text,
    )

    observation_date = (
        observation_date_match.group(1)
        if observation_date_match
        else None
    )

    return StationObservation(
        id=station_id,
        name=station["name"],
        region="Antarctica",
        lat=station["lat"],
        lon=station["lon"],

        temperature_c=temperature,
        relative_humidity_pct=humidity,
        pressure_mbar=pressure,

        wind_speed_knots=wind_knots,
        wind_speed_mps=wind_mps,

        observation_date=observation_date,

        fetched_at=time.time(),

        source_url=station["url"],

        status="LIVE",
    )


# ============================================================
# Live request
# ============================================================

def _fetch_station(
    station_id: str,
) -> StationObservation:

    station = STATIONS[station_id]

    headers = {
        "User-Agent": (
            "Mozilla/5.0 "
            "(X11; Linux x86_64) "
            "AppleWebKit/537.36 "
            "(KHTML, like Gecko) "
            "Chrome/131.0 Safari/537.36"
        ),
        "Accept": (
            "text/html,"
            "application/xhtml+xml,"
            "application/xml;q=0.9,"
            "*/*;q=0.8"
        ),
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "close",
    }

    response = requests.get(
        station["url"],
        headers=headers,
        timeout=REQUEST_TIMEOUT,
    )

    response.raise_for_status()

    if not response.text.strip():
        raise ValueError(
            "NCPOR returned an empty response"
        )

    return _parse_live_page(
        station_id,
        response.text,
    )


# ============================================================
# Single availability check
# ============================================================

def initialize_ncpor() -> bool:
    """
    Perform the one NCPOR availability check.

    If this fails, NCPOR is considered unavailable for the
    entire lifetime of this backend process.

    No further NCPOR requests will be attempted.
    """

    global _ncpor_checked
    global _ncpor_available
    global _ncpor_error

    if _ncpor_checked:
        return _ncpor_available

    _ncpor_checked = True

    logger.info(
        "Checking NCPOR availability..."
    )

    try:

        observation = _fetch_station(
            "maitri"
        )

        _ncpor_available = True
        _ncpor_error = None

        logger.info(
            "NCPOR availability check successful"
        )

        logger.info(
            "NCPOR Maitri: %.2f°C / %.2f kt",
            observation.temperature_c
            if observation.temperature_c is not None
            else float("nan"),
            observation.wind_speed_knots
            if observation.wind_speed_knots is not None
            else float("nan"),
        )

        # Store the successful observation.
        cache = _load_cache()

        cache["maitri"] = asdict(
            observation
        )

        _save_cache(cache)

        return True

    except Exception as exc:

        _ncpor_available = False
        _ncpor_error = str(exc)

        logger.warning(
            "NCPOR unavailable: %s",
            exc,
        )

        logger.warning(
            "NCPOR disabled for this backend session"
        )

        logger.warning(
            "Using synthetic demonstration data"
        )

        return False


# ============================================================
# Cached data
# ============================================================

def _cached_station(
    station_id: str,
    cache: dict[str, Any],
    error: str,
) -> StationObservation:

    station = STATIONS[station_id]

    cached = cache.get(station_id)

    if not isinstance(cached, dict):

        return StationObservation(
            id=station_id,
            name=station["name"],
            region="Antarctica",
            lat=station["lat"],
            lon=station["lon"],
            source_url=station["url"],
            status="ERROR",
            error=error,
        )

    cached = dict(cached)

    fetched_at = cached.get(
        "fetched_at"
    )

    age_seconds = None

    if fetched_at is not None:

        try:
            age_seconds = max(
                0,
                time.time()
                - float(fetched_at),
            )
        except (
            ValueError,
            TypeError,
        ):
            pass

    cached["status"] = "STALE"
    cached["error"] = error
    cached["is_cached"] = True
    cached["data_age_seconds"] = age_seconds

    return StationObservation(
        **cached
    )


# ============================================================
# Public API
# ============================================================

def get_station(
    station_id: str,
) -> StationObservation:

    if station_id not in STATIONS:
        raise ValueError(
            f"Unknown NCPOR station: {station_id}"
        )

    # Perform the single session check.
    if not _ncpor_checked:
        initialize_ncpor()

    cache = _load_cache()

    # --------------------------------------------------------
    # NCPOR is unavailable.
    #
    # IMPORTANT:
    # Do NOT call _fetch_station here.
    # --------------------------------------------------------

    if not _ncpor_available:

        cached = _cached_station(
            station_id,
            cache,
            _ncpor_error
            or "NCPOR unavailable",
        )

        if cached.status == "STALE":
            return cached

        fallback = _load_fallback()

        return _fallback_station(
            station_id,
            fallback,
            _ncpor_error
            or "NCPOR unavailable",
        )

    # --------------------------------------------------------
    # NCPOR was successfully verified.
    # --------------------------------------------------------

    try:

        observation = _fetch_station(
            station_id
        )

        cache[station_id] = asdict(
            observation
        )

        _save_cache(cache)

        return observation

    except Exception as exc:

        error = str(exc)

        logger.warning(
            "NCPOR %s request failed after "
            "successful initialization: %s",
            STATIONS[station_id]["name"],
            error,
        )

        cached = _cached_station(
            station_id,
            cache,
            error,
        )

        if cached.status == "STALE":
            return cached

        fallback = _load_fallback()

        return _fallback_station(
            station_id,
            fallback,
            error,
        )


def get_all_stations() -> list[dict[str, Any]]:
    """
    Return all configured NCPOR stations.

    If the initial NCPOR availability check failed,
    this function uses simulated data and does not
    contact NCPOR again.
    """

    return [
        asdict(
            get_station("maitri")
        ),
        asdict(
            get_station("bharati")
        ),
    ]