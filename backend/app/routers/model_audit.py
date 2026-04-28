"""Audit a sklearn model + dataset combination."""
from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.services.model_audit import audit_model
from app.services.profiling import profile_dataframe
from app.services.sample_data import ensure_samples
from app.services.store import store

router = APIRouter(tags=["model_audit"])


def _read_dataset(filename: str, raw: bytes) -> pd.DataFrame:
    fname = filename.lower()
    if fname.endswith(".csv"):
        return pd.read_csv(io.BytesIO(raw))
    if fname.endswith(".json"):
        return pd.read_json(io.BytesIO(raw))
    if fname.endswith(".jsonl"):
        return pd.read_json(io.BytesIO(raw), lines=True)
    raise HTTPException(status_code=400, detail="Dataset must be CSV/JSON/JSONL")


@router.post("/model-audit")
async def model_audit(
    model_file: UploadFile = File(..., description="Pickled sklearn model"),
    dataset_file: UploadFile = File(..., description="CSV / JSON test dataset"),
    outcome_column: str = Form(...),
    positive_label: str = Form("1"),
    protected_attributes: str = Form("", description="Comma-separated list"),
) -> dict[str, Any]:
    model_bytes = await model_file.read()
    if not model_bytes:
        raise HTTPException(status_code=400, detail="Empty model file")
    raw_data = await dataset_file.read()
    df = _read_dataset(dataset_file.filename or "data.csv", raw_data)

    if outcome_column not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Outcome column '{outcome_column}' not in test dataset",
        )

    try:
        positive_label_value: Any = int(positive_label)
    except ValueError:
        positive_label_value = positive_label

    attrs = [a.strip() for a in protected_attributes.split(",") if a.strip()]
    missing = [a for a in attrs if a not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Protected attributes not in dataset: {missing}",
        )

    profile = profile_dataframe(df, dataset_file.filename or "data.csv")
    entry = store.add_dataset(df, dataset_file.filename or "data.csv", profile)

    result = audit_model(
        df=df,
        model_bytes=model_bytes,
        outcome_column=outcome_column,
        positive_label=positive_label_value,
        protected_attributes=attrs,
    )

    payload = {
        "dataset_id": entry.dataset_id,
        "outcome_column": outcome_column,
        "positive_label": positive_label_value,
        "protected_attributes": attrs,
        **result,
    }
    report = store.add_report(entry.dataset_id, payload)
    payload["report_id"] = report.report_id
    return payload


@router.post("/model-audit/sample/{name}")
def model_audit_sample(name: str) -> dict[str, Any]:
    """Run model-audit using one of the bundled sample model + dataset pairs."""
    manifest = ensure_samples()
    if name not in manifest:
        raise HTTPException(status_code=404, detail=f"Unknown sample: {name}")
    spec = manifest[name]
    df = pd.read_csv(spec["csv"])
    profile = profile_dataframe(df, Path(spec["csv"]).name)
    entry = store.add_dataset(df, Path(spec["csv"]).name, profile)
    with open(spec["model"], "rb") as fh:
        model_bytes = fh.read()
    result = audit_model(
        df=df,
        model_bytes=model_bytes,
        outcome_column=spec["outcome"],
        positive_label=spec["positive_label"],
        protected_attributes=spec["protected"],
    )
    payload = {
        "dataset_id": entry.dataset_id,
        "outcome_column": spec["outcome"],
        "positive_label": spec["positive_label"],
        "protected_attributes": spec["protected"],
        **result,
    }
    report = store.add_report(entry.dataset_id, payload)
    payload["report_id"] = report.report_id
    return payload
