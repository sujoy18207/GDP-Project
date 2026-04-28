"""Generate intentionally-biased sample datasets and a baseline model.

Datasets:
    - hiring.csv  : applicant features + biased `hired` label
    - loan.csv    : applicant features + biased `approved` label

Both have demographic bias baked in so the dashboard has something to find.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer

from app.config import DATA_DIR, MODELS_DIR


SAMPLE_NAMES = {
    "hiring": "Hiring (engineering applicants)",
    "loan": "Loan approval",
}


def _rng(seed: int) -> np.random.Generator:
    return np.random.default_rng(seed)


def generate_hiring(seed: int = 7, n: int = 600) -> pd.DataFrame:
    rng = _rng(seed)
    gender = rng.choice(["Male", "Female", "Non-binary"], size=n, p=[0.55, 0.42, 0.03])
    race = rng.choice(
        ["White", "Black", "Asian", "Hispanic", "Other"],
        size=n,
        p=[0.55, 0.13, 0.18, 0.10, 0.04],
    )
    age = rng.integers(21, 60, size=n)
    education = rng.choice(
        ["HighSchool", "Bachelors", "Masters", "PhD"],
        size=n,
        p=[0.10, 0.55, 0.28, 0.07],
    )
    years_experience = np.clip(
        rng.normal(loc=age - 22, scale=3.0), 0, None
    ).round(0).astype(int)
    interview_score = np.clip(rng.normal(7.0, 1.4, size=n), 1, 10).round(1)
    referrals = rng.poisson(0.5, size=n).astype(int)
    zip_code = rng.choice(
        ["94016", "10001", "60601", "30301", "73301", "98101"], size=n
    )

    edu_score = pd.Series(education).map(
        {"HighSchool": 0.0, "Bachelors": 0.4, "Masters": 0.7, "PhD": 0.9}
    ).to_numpy()
    base = (
        -2.0
        + 0.20 * (interview_score - 7)
        + 0.05 * np.clip(years_experience, 0, 20)
        + 0.5 * edu_score
        + 0.20 * referrals
    )

    bias_male = (gender == "Male").astype(int) * 1.0
    bias_white = (race == "White").astype(int) * 0.8
    bias_age = ((age >= 30) & (age <= 45)).astype(int) * 0.4
    score = base + bias_male + bias_white + bias_age + rng.normal(0, 0.4, size=n)
    prob = 1 / (1 + np.exp(-score))
    hired = (rng.uniform(size=n) < prob).astype(int)

    df = pd.DataFrame(
        {
            "applicant_id": [f"A{i:04d}" for i in range(n)],
            "gender": gender,
            "race": race,
            "age": age,
            "zip_code": zip_code,
            "education": education,
            "years_experience": years_experience,
            "interview_score": interview_score,
            "referrals": referrals,
            "hired": hired,
        }
    )
    return df


def generate_loan(seed: int = 11, n: int = 600) -> pd.DataFrame:
    rng = _rng(seed)
    gender = rng.choice(["Male", "Female"], size=n, p=[0.5, 0.5])
    race = rng.choice(
        ["White", "Black", "Asian", "Hispanic", "Other"],
        size=n,
        p=[0.55, 0.18, 0.12, 0.10, 0.05],
    )
    age = rng.integers(21, 70, size=n)
    income = np.clip(rng.normal(60000, 25000, size=n), 15000, 250000).round(0)
    credit_score = np.clip(rng.normal(680, 70, size=n), 400, 850).round(0).astype(int)
    debt = np.clip(rng.normal(15000, 9000, size=n), 0, None).round(0)
    employment_years = np.clip(rng.normal(7, 4, size=n), 0, None).round(0).astype(int)
    education = rng.choice(
        ["HighSchool", "Bachelors", "Masters"],
        size=n,
        p=[0.35, 0.50, 0.15],
    )
    zip_code = rng.choice(
        ["94016", "10001", "60601", "30301", "73301", "98101", "33101"],
        size=n,
    )

    base_score = (
        -1.8
        + 0.00002 * (income - 50000)
        + 0.015 * (credit_score - 650)
        - 0.00002 * debt
        + 0.06 * employment_years
    )
    bias_male = (gender == "Male").astype(int) * 0.7
    bias_white = (race == "White").astype(int) * 1.0
    bias_zip = np.isin(zip_code, ["94016", "10001", "98101"]).astype(int) * 0.5
    score = base_score + bias_male + bias_white + bias_zip + rng.normal(0, 0.4, size=n)
    prob = 1 / (1 + np.exp(-score))
    approved = (rng.uniform(size=n) < prob).astype(int)

    df = pd.DataFrame(
        {
            "applicant_id": [f"L{i:04d}" for i in range(n)],
            "gender": gender,
            "race": race,
            "age": age,
            "zip_code": zip_code,
            "education": education,
            "income": income,
            "credit_score": credit_score,
            "debt": debt,
            "employment_years": employment_years,
            "approved": approved,
        }
    )
    return df


def _train_demo_model(df: pd.DataFrame, target: str, name: str) -> Path:
    feature_cols = [c for c in df.columns if c != target and not c.endswith("_id")]
    X = df[feature_cols]
    y = df[target]
    cat_cols = [c for c in feature_cols if not pd.api.types.is_numeric_dtype(X[c])]
    num_cols = [c for c in feature_cols if c not in cat_cols]
    pre = ColumnTransformer(
        [
            ("num", "passthrough", num_cols),
            (
                "cat",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                cat_cols,
            ),
        ]
    )
    pipe = Pipeline(
        [
            ("pre", pre),
            ("clf", GradientBoostingClassifier(n_estimators=120, random_state=42)),
        ]
    )
    pipe.fit(X, y)
    out = MODELS_DIR / f"{name}_model.pkl"
    joblib.dump({"pipeline": pipe, "feature_cols": feature_cols, "target": target}, out)
    return out


def ensure_samples() -> dict[str, dict[str, Any]]:
    """Generate sample CSVs + a sklearn model on first run."""
    artifacts: dict[str, dict[str, Any]] = {}
    hiring_path = DATA_DIR / "hiring.csv"
    loan_path = DATA_DIR / "loan.csv"

    if not hiring_path.exists():
        df = generate_hiring()
        df.to_csv(hiring_path, index=False)
    if not loan_path.exists():
        df = generate_loan()
        df.to_csv(loan_path, index=False)

    hiring_model = MODELS_DIR / "hiring_model.pkl"
    if not hiring_model.exists():
        df = pd.read_csv(hiring_path)
        _train_demo_model(df, "hired", "hiring")
    loan_model = MODELS_DIR / "loan_model.pkl"
    if not loan_model.exists():
        df = pd.read_csv(loan_path)
        _train_demo_model(df, "approved", "loan")

    manifest = {
        "hiring": {
            "name": SAMPLE_NAMES["hiring"],
            "csv": str(hiring_path),
            "model": str(hiring_model),
            "outcome": "hired",
            "positive_label": 1,
            "protected": ["gender", "race", "age", "zip_code"],
        },
        "loan": {
            "name": SAMPLE_NAMES["loan"],
            "csv": str(loan_path),
            "model": str(loan_model),
            "outcome": "approved",
            "positive_label": 1,
            "protected": ["gender", "race", "age", "zip_code"],
        },
    }
    (DATA_DIR / "samples_manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    return manifest
