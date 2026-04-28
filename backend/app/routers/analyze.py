"""Run the full fairness analysis on a stored dataset."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from app.schemas.models import AnalyzeRequest
from app.services.bias_metrics import compute_all_metrics
from app.services.report import (
    build_findings,
    executive_summary,
    find_biased_segments,
    severity_summary,
)
from app.services.store import store

router = APIRouter(tags=["analyze"])


@router.post("/analyze")
def analyze(req: AnalyzeRequest) -> dict[str, Any]:
    entry = store.get_dataset(req.dataset_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Dataset not found")
    df = entry.df
    if req.outcome_column not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Outcome column '{req.outcome_column}' is not in the dataset",
        )
    missing = [a for a in req.protected_attributes if a not in df.columns]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Protected attribute(s) not in dataset: {missing}",
        )

    pkg = compute_all_metrics(
        df,
        outcome_column=req.outcome_column,
        positive_label=req.positive_label,
        protected_attributes=req.protected_attributes,
        prediction_column=req.prediction_column,
        train_quick=req.train_quick_model,
    )

    findings = build_findings(
        pkg["metrics_per_attribute"], pkg["feature_importance"], df, req.outcome_column
    )
    sev = severity_summary(findings)
    summary = executive_summary(findings, df, req.outcome_column, req.protected_attributes)
    biased_segments = find_biased_segments(pkg["intersectional"])

    payload = {
        "dataset_id": req.dataset_id,
        "outcome_column": req.outcome_column,
        "positive_label": req.positive_label,
        "protected_attributes": req.protected_attributes,
        "metrics_per_attribute": pkg["metrics_per_attribute"],
        "feature_importance": pkg["feature_importance"],
        "confusion_by_group": pkg["confusion_by_group"],
        "intersectional": pkg["intersectional"],
        "biased_segments": biased_segments,
        "severity_summary": sev,
        "executive_summary": summary,
        "findings": findings,
        "accuracy": pkg["accuracy"],
    }
    report = store.add_report(req.dataset_id, payload)
    payload["report_id"] = report.report_id
    return payload
