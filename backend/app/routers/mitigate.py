"""Apply a bias mitigation strategy and return before/after metrics."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.schemas.models import MitigateRequest
from app.services.mitigation import apply_mitigation
from app.services.store import store

router = APIRouter(tags=["mitigate"])


@router.post("/mitigate")
def mitigate(req: MitigateRequest) -> dict[str, Any]:
    entry = store.get_dataset(req.dataset_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    df = entry.df
    if req.outcome_column not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Outcome column '{req.outcome_column}' is not in the dataset",
        )
    if req.protected_attribute not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Protected attribute '{req.protected_attribute}' is not in the dataset",
        )
    return apply_mitigation(
        df=df,
        outcome_column=req.outcome_column,
        positive_label=req.positive_label,
        protected_attribute=req.protected_attribute,
        strategy=req.strategy,
        proxy_features=req.proxy_features,
    )
