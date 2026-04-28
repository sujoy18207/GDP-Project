"""Endpoints for serving the bundled biased sample datasets."""
from __future__ import annotations

import json
from typing import Any

import pandas as pd
from fastapi import APIRouter, HTTPException
from pathlib import Path

from app.services.profiling import profile_dataframe
from app.services.sample_data import ensure_samples
from app.services.store import store

router = APIRouter(prefix="/samples", tags=["samples"])


@router.get("")
def list_samples() -> dict[str, Any]:
    manifest = ensure_samples()
    return {"samples": manifest}


@router.post("/{name}/load")
def load_sample(name: str) -> dict[str, Any]:
    manifest = ensure_samples()
    if name not in manifest:
        raise HTTPException(status_code=404, detail=f"Unknown sample dataset: {name}")
    csv_path = Path(manifest[name]["csv"])
    df = pd.read_csv(csv_path)
    profile = profile_dataframe(df, csv_path.name)
    entry = store.add_dataset(df, csv_path.name, profile)
    profile["dataset_id"] = entry.dataset_id
    profile["preview"] = json.loads(df.head(15).to_json(orient="records"))
    profile["sample_meta"] = manifest[name]
    return profile
