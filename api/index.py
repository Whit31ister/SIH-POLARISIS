from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
import requests
import re


app = FastAPI(
    title="POLARISIS Vercel API",
    version="1.0.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


NCPOR_STATIONS = {
    "maitri": {
        "name": "Maitri",
        "lat": -70.764444,
        "lon": 11.734167,
        "url": "https://data.ncpor.res.in/maitri/live",
    },
    "bharati": {
        "name": "Bharati",
        "lat": -69.406833,
        "lon": 76.195333,
        "url": "https://data.ncpor.res.in/bharati/live",
    },
}


def extract_float(patterns, text):
    for pattern in patterns:
        match = re.search(
            pattern,
            text,
            re.IGNORECASE,
        )

        if match:
            try:
                return float(match.group(1))
            except (ValueError, TypeError):
                pass

    return None


def fetch_ncpor_station(station_id):
    station = NCPOR_STATIONS[station_id]

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
    }

    response = requests.get(
        station["url"],
        headers=headers,
        timeout=8,
    )

    response.raise_for_status()

    text = re.sub(
        r"<script\b[^>]*>.*?</script>",
        " ",
        response.text,
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
    ).strip()

    temperature = extract_float(
        [
            r"Temperature\s*:\s*(-?\d+(?:\.\d+)?)\s*°?\s*C",
        ],
        text,
    )

    humidity = extract_float(
        [
            r"Relative\s+Humidity\s*:\s*(\d+(?:\.\d+)?)\s*%",
        ],
        text,
    )

    pressure = extract_float(
        [
            r"Air\s+Pressure\s*:\s*(\d+(?:\.\d+)?)\s*mBar",
            r"Air\s+Pressure\s*:\s*(\d+(?:\.\d+)?)\s*hPa",
        ],
        text,
    )

    wind_knots = extract_float(
        [
            r"Wind\s+Speed\s*:\s*(\d+(?:\.\d+)?)\s*knots?",
        ],
        text,
    )

    wind_mps = extract_float(
        [
            r"Wind\s+Speed\s*:\s*(\d+(?:\.\d+)?)\s*m/s",
        ],
        text,
    )

    if wind_mps is None and wind_knots is not None:
        wind_mps = wind_knots * 0.514444

    if wind_knots is None and wind_mps is not None:
        wind_knots = wind_mps / 0.514444

    return {
        "id": station_id,
        "name": station["name"],
        "region": "Antarctica",
        "lat": station["lat"],
        "lon": station["lon"],
        "temperature_c": temperature,
        "relative_humidity_pct": humidity,
        "pressure_mbar": pressure,
        "wind_speed_knots": wind_knots,
        "wind_speed_mps": wind_mps,
        "fetched_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "source_url": station["url"],
        "status": "LIVE",
    }


@app.get("/api")
def root():
    return {
        "service": "POLARISIS",
        "status": "online",
        "platform": "Vercel",
    }


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "service": "POLARISIS Maritime Navigation System",
        "platform": "Vercel",
    }


@app.get("/api/ncpor")
def ncpor():
    stations = []

    for station_id in NCPOR_STATIONS:
        try:
            stations.append(
                fetch_ncpor_station(station_id)
            )

        except Exception as exc:
            station = NCPOR_STATIONS[station_id]

            stations.append(
                {
                    "id": station_id,
                    "name": station["name"],
                    "region": "Antarctica",
                    "lat": station["lat"],
                    "lon": station["lon"],
                    "temperature_c": None,
                    "relative_humidity_pct": None,
                    "pressure_mbar": None,
                    "wind_speed_knots": None,
                    "wind_speed_mps": None,
                    "fetched_at": datetime.now(
                        timezone.utc
                    ).isoformat(),
                    "source_url": station["url"],
                    "status": "ERROR",
                    "error": str(exc),
                }
            )

    return {
        "source": "NCPOR National Polar Data Center",
        "updated_at": datetime.now(
            timezone.utc
        ).isoformat(),
        "stations": stations,
    }