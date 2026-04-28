"""Central configuration & filesystem paths for the backend."""
from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent

DATA_DIR = PROJECT_ROOT / "data"
MODELS_DIR = PROJECT_ROOT / "models"
REPORTS_DIR = PROJECT_ROOT / "reports"
UPLOADS_DIR = BACKEND_DIR / "uploads"

for _p in (DATA_DIR, MODELS_DIR, REPORTS_DIR, UPLOADS_DIR):
    _p.mkdir(parents=True, exist_ok=True)

CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "FAIRAUDIT_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000",
    ).split(",")
    if o.strip()
]

# Heuristic vocabulary used to flag likely protected attributes.
PROTECTED_ATTRIBUTE_HINTS: dict[str, list[str]] = {
    "gender": ["gender", "sex", "male_female"],
    "race": ["race", "ethnicity", "ethnic"],
    "age": ["age", "birth_year", "dob"],
    "religion": ["religion", "faith"],
    "nationality": ["nationality", "country", "national_origin"],
    "disability": ["disability", "handicap"],
    "marital_status": ["marital", "marriage", "married"],
    "sexual_orientation": ["orientation", "lgbt"],
    "zip_code": ["zip", "zipcode", "postal", "postcode"],
    "pregnancy": ["pregnant", "pregnancy"],
}

# Default fairness thresholds.
THRESHOLDS = {
    "demographic_parity_difference": 0.10,  # |P(Y=1|A=a) - P(Y=1|A=b)| should be small
    "disparate_impact_ratio": 0.80,         # 80% rule
    "equalized_odds_difference": 0.10,
    "predictive_parity_difference": 0.10,
    "individual_fairness": 0.10,
}
