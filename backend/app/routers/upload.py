"""Dataset upload + profiling."""
from __future__ import annotations

import io
import json
from typing import Any

import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.profiling import profile_dataframe
from app.services.store import store

router = APIRouter(tags=["upload"])


def _read_to_dataframe(filename: str, raw: bytes) -> pd.DataFrame:
    fname = filename.lower()
    if fname.endswith(".csv") or fname.endswith(".tsv"):
        sep = "," if fname.endswith(".csv") else "\t"
        return pd.read_csv(io.BytesIO(raw), sep=sep)
    if fname.endswith(".json"):
        try:
            return pd.read_json(io.BytesIO(raw))
        except ValueError:
            data = json.loads(raw.decode("utf-8"))
            if isinstance(data, dict) and "data" in data:
                data = data["data"]
            return pd.json_normalize(data)
    if fname.endswith(".jsonl") or fname.endswith(".ndjson"):
        return pd.read_json(io.BytesIO(raw), lines=True)
    raise HTTPException(
        status_code=400, detail="Unsupported file type. Use CSV, TSV, JSON, or JSONL."
    )


@router.post("/upload")
async def upload(file: UploadFile = File(...)) -> dict[str, Any]:
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    df = _read_to_dataframe(file.filename or "data.csv", raw)
    if df.empty:
        raise HTTPException(status_code=400, detail="Uploaded dataset has no rows")

    profile = profile_dataframe(df, file.filename or "data.csv")
    entry = store.add_dataset(df, file.filename or "data.csv", profile)
    profile["dataset_id"] = entry.dataset_id
    profile["preview"] = json.loads(df.head(15).to_json(orient="records"))
    return profile
