"""Audit a pre-trained sklearn model against a labelled test dataset."""
from __future__ import annotations

import io
from typing import Any

import joblib
import numpy as np
import pandas as pd

from app.services.bias_metrics import (
    compute_all_metrics,
    confusion_by_group,
    per_group_outcomes,
)
from app.services.report import (
    build_findings,
    executive_summary,
    severity_summary,
)


def load_model(model_bytes: bytes) -> dict[str, Any]:
    obj = joblib.load(io.BytesIO(model_bytes))
    if isinstance(obj, dict) and "pipeline" in obj:
        return obj
    return {"pipeline": obj, "feature_cols": None, "target": None}


def _predict(model_obj: dict[str, Any], df: pd.DataFrame) -> np.ndarray:
    pipeline = model_obj["pipeline"]
    feature_cols = model_obj.get("feature_cols")
    if feature_cols:
        feature_cols = [c for c in feature_cols if c in df.columns]
        X = df[feature_cols]
    else:
        X = df.drop(
            columns=[c for c in df.columns if c.endswith("_id")], errors="ignore"
        )
    return np.asarray(pipeline.predict(X)).astype(int)


def _tradeoff_curve(
    df: pd.DataFrame,
    outcome_column: str,
    positive_label: Any,
    protected_attr: str,
    proba: np.ndarray,
) -> list[dict[str, float]]:
    y_true = (df[outcome_column] == positive_label).astype(int).to_numpy()
    A = df[protected_attr].astype(str).fillna("Unknown")
    points: list[dict[str, float]] = []
    thresholds = np.linspace(0.05, 0.95, 19)
    for t in thresholds:
        y_pred = (proba >= t).astype(int)
        acc = float(np.mean(y_pred == y_true))
        rates = []
        for g in A.unique():
            mask = (A == g).to_numpy()
            if mask.sum() == 0:
                continue
            rates.append(float(y_pred[mask].mean()))
        if not rates:
            dp_diff = 0.0
            di = 1.0
        else:
            dp_diff = float(max(rates) - min(rates))
            mx = max(rates)
            di = float(min(rates) / mx) if mx > 0 else 1.0
        points.append(
            {
                "threshold": float(t),
                "accuracy": acc,
                "demographic_parity_diff": dp_diff,
                "disparate_impact": di,
            }
        )
    return points


def audit_model(
    df: pd.DataFrame,
    model_bytes: bytes,
    outcome_column: str,
    positive_label: Any,
    protected_attributes: list[str],
) -> dict[str, Any]:
    model_obj = load_model(model_bytes)
    feature_cols = model_obj.get("feature_cols") or [
        c for c in df.columns if c not in {outcome_column}
    ]

    pipeline = model_obj["pipeline"]
    proba = None
    try:
        used_features = [c for c in feature_cols if c in df.columns]
        X_in = df[used_features] if used_features else df
        proba = pipeline.predict_proba(X_in)[:, 1]
    except Exception:
        proba = None
    y_pred = _predict(model_obj, df)
    df = df.copy()
    df["__model_pred__"] = y_pred

    pkg = compute_all_metrics(
        df,
        outcome_column=outcome_column,
        positive_label=positive_label,
        protected_attributes=protected_attributes,
        prediction_column="__model_pred__",
        train_quick=False,
    )
    metrics_per_attr = pkg["metrics_per_attribute"]
    confusion = pkg["confusion_by_group"]

    accuracy = float(np.mean(y_pred == (df[outcome_column] == positive_label).astype(int).to_numpy()))

    feature_importance: list[dict[str, Any]] = []
    try:
        clf = pipeline.named_steps.get("clf") if hasattr(pipeline, "named_steps") else None
        if clf is not None and hasattr(clf, "feature_importances_"):
            try:
                feat_names = pipeline.named_steps["pre"].get_feature_names_out()
            except Exception:
                feat_names = [f"f{i}" for i in range(len(clf.feature_importances_))]
            pairs = sorted(
                zip(feat_names, clf.feature_importances_), key=lambda kv: -kv[1]
            )
            protected_set = set(protected_attributes)
            for name, imp in pairs[:20]:
                base = name.split("__", 1)[-1].split("_", 1)[0]
                feature_importance.append(
                    {
                        "feature": str(name),
                        "importance": float(imp),
                        "is_protected": (
                            base in protected_set or any(p in name for p in protected_set)
                        ),
                    }
                )
    except Exception:
        feature_importance = []

    tradeoff = []
    if proba is not None and protected_attributes:
        tradeoff = _tradeoff_curve(
            df, outcome_column, positive_label, protected_attributes[0], proba
        )

    findings = build_findings(metrics_per_attr, feature_importance, df, outcome_column)
    summary = executive_summary(findings, df, outcome_column, protected_attributes)
    sev = severity_summary(findings)

    return {
        "metrics_per_attribute": metrics_per_attr,
        "confusion_by_group": confusion,
        "accuracy": accuracy,
        "feature_importance": feature_importance,
        "tradeoff_curve": tradeoff,
        "findings": findings,
        "executive_summary": summary,
        "severity_summary": sev,
    }
