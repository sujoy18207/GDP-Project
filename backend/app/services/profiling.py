"""Column profiling + protected attribute detection."""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from app.config import PROTECTED_ATTRIBUTE_HINTS


def _is_binary(series: pd.Series) -> bool:
    nu = series.dropna().unique()
    if len(nu) != 2:
        return False
    try:
        cast = {int(float(v)) for v in nu}
        return cast.issubset({0, 1})
    except Exception:
        labels = {str(v).strip().lower() for v in nu}
        binary_words = {
            "yes",
            "no",
            "true",
            "false",
            "y",
            "n",
            "approved",
            "denied",
            "hired",
            "rejected",
            "positive",
            "negative",
            "1",
            "0",
        }
        return len(labels & binary_words) >= 1 and len(labels) == 2


def _infer_role(name: str, series: pd.Series) -> str:
    name_l = name.lower()
    if name_l in {"id", "user_id", "uuid"} or name_l.endswith("_id"):
        return "identifier"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    if _is_binary(series):
        return "binary"
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    n_unique = series.nunique(dropna=True)
    if not pd.api.types.is_numeric_dtype(series) and n_unique > max(50, int(0.5 * len(series))):
        return "text"
    return "categorical"


def _detect_protected(name: str, series: pd.Series) -> tuple[bool, str | None]:
    n = name.lower().replace("-", "_").replace(" ", "_")
    for kind, hints in PROTECTED_ATTRIBUTE_HINTS.items():
        for h in hints:
            if h in n:
                return True, kind
    if pd.api.types.is_object_dtype(series):
        sample = {str(v).strip().lower() for v in series.dropna().head(50)}
        if sample & {"male", "female", "m", "f", "non-binary", "nonbinary"}:
            return True, "gender"
        if sample & {"white", "black", "asian", "hispanic", "latino", "african american"}:
            return True, "race"
    return False, None


def _imbalance(series: pd.Series) -> float:
    counts = series.value_counts(dropna=True)
    if counts.empty:
        return 0.0
    p = counts / counts.sum()
    # Normalized entropy => 1 means perfectly balanced; we return 1 - that
    if len(p) <= 1:
        return 1.0
    ent = -np.sum(p * np.log(p + 1e-12))
    max_ent = math.log(len(p))
    return float(1.0 - (ent / max_ent)) if max_ent > 0 else 1.0


def _safe_float(x: Any) -> float | None:
    try:
        v = float(x)
        if math.isnan(v) or math.isinf(v):
            return None
        return v
    except Exception:
        return None


def profile_dataframe(df: pd.DataFrame, filename: str) -> dict[str, Any]:
    columns: list[dict[str, Any]] = []
    suggested_protected: list[str] = []

    for name in df.columns:
        series = df[name]
        role = _infer_role(name, series)
        is_protected, kind = _detect_protected(name, series)
        if is_protected:
            suggested_protected.append(name)

        col: dict[str, Any] = {
            "name": name,
            "dtype": str(series.dtype),
            "inferred_role": role,
            "non_null": int(series.notna().sum()),
            "nulls": int(series.isna().sum()),
            "unique": int(series.nunique(dropna=True)),
            "sample_values": [
                _coerce(v) for v in series.dropna().head(5).tolist()
            ],
            "min": None,
            "max": None,
            "mean": None,
            "std": None,
            "distribution": None,
            "is_protected_candidate": is_protected,
            "protected_kind": kind,
            "imbalance_score": _imbalance(series),
        }

        if role == "numeric":
            col["min"] = _safe_float(series.min())
            col["max"] = _safe_float(series.max())
            col["mean"] = _safe_float(series.mean())
            col["std"] = _safe_float(series.std())
            try:
                bins = pd.cut(series.dropna(), bins=8)
                col["distribution"] = {
                    str(k): int(v) for k, v in bins.value_counts().sort_index().items()
                }
            except Exception:
                col["distribution"] = None
        elif role in {"categorical", "binary"}:
            counts = series.value_counts(dropna=True).head(20)
            col["distribution"] = {str(k): int(v) for k, v in counts.items()}

        columns.append(col)

    suggested_outcome, suggested_positive = _suggest_outcome(df, columns)

    return {
        "dataset_id": "",  # filled by store
        "filename": filename,
        "rows": int(len(df)),
        "cols": int(df.shape[1]),
        "columns": columns,
        "suggested_protected": suggested_protected,
        "suggested_outcome": suggested_outcome,
        "suggested_positive_label": suggested_positive,
    }


def _suggest_outcome(
    df: pd.DataFrame, columns: list[dict[str, Any]]
) -> tuple[str | None, Any]:
    candidates = [
        c for c in columns if c["inferred_role"] == "binary" and not c["is_protected_candidate"]
    ]
    outcome_keywords = (
        "outcome",
        "label",
        "target",
        "approved",
        "hired",
        "result",
        "default",
        "churn",
        "y",
    )
    for c in candidates:
        if any(k in c["name"].lower() for k in outcome_keywords):
            pos = _pick_positive_label(df[c["name"]])
            return c["name"], pos
    if candidates:
        c = candidates[-1]
        return c["name"], _pick_positive_label(df[c["name"]])
    return None, None


def _pick_positive_label(series: pd.Series) -> Any:
    vals = series.dropna().unique().tolist()
    for v in vals:
        s = str(v).strip().lower()
        if s in {"1", "true", "yes", "y", "approved", "hired", "positive"}:
            return _coerce(v)
    return _coerce(vals[0]) if vals else 1


def _coerce(v: Any) -> Any:
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(v, (np.bool_,)):
        return bool(v)
    return v
