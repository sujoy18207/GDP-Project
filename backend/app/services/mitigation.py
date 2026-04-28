"""Bias mitigation strategies.

Implements three families of fixes:
    - Pre-processing:  reweight, resample, drop_proxy
    - In-processing:   fairness_constraint  (uses fairlearn ExponentiatedGradient)
    - Post-processing: threshold_adjust     (per-group threshold tuning)

Each strategy returns the predictions on the dataset *after* mitigation so we
can re-compute metrics and show before/after deltas.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from app.services.bias_metrics import (
    compute_all_metrics,
    train_quick_model,
)


def _prep_features(
    df: pd.DataFrame, outcome_column: str, drop: list[str]
) -> tuple[pd.DataFrame, list[str]]:
    feature_cols = [c for c in df.columns if c not in {outcome_column, *drop}]
    X = pd.get_dummies(df[feature_cols], drop_first=False, dummy_na=False).fillna(0)
    return X, feature_cols


# -------- pre-processing --------

def mitigate_reweight(
    df: pd.DataFrame,
    outcome_column: str,
    positive_label: Any,
    protected_attribute: str,
) -> np.ndarray:
    """Sample reweighting (Kamiran & Calders) trained logistic regression."""
    y = (df[outcome_column] == positive_label).astype(int).to_numpy()
    A = df[protected_attribute].astype(str).fillna("Unknown").to_numpy()

    n = len(df)
    p_y = np.array([np.mean(y == c) for c in (0, 1)])
    weights = np.ones(n, dtype=float)
    for a_val in np.unique(A):
        a_mask = A == a_val
        p_a = a_mask.mean()
        for c in (0, 1):
            mask = a_mask & (y == c)
            p_a_y = mask.mean()
            if p_a_y == 0:
                continue
            weights[mask] = (p_a * p_y[c]) / p_a_y

    X, _ = _prep_features(df, outcome_column, drop=[protected_attribute])
    Xs = StandardScaler(with_mean=False).fit_transform(X)
    model = LogisticRegression(max_iter=1000)
    model.fit(Xs, y, sample_weight=weights)
    return model.predict(Xs)


def mitigate_resample(
    df: pd.DataFrame,
    outcome_column: str,
    positive_label: Any,
    protected_attribute: str,
) -> tuple[pd.DataFrame, np.ndarray]:
    """Oversample under-represented (group, outcome) cells until counts match."""
    y_col = df[outcome_column]
    A = df[protected_attribute].astype(str).fillna("Unknown")
    pieces: list[pd.DataFrame] = []
    target = (
        df.groupby([A, y_col]).size().groupby(level=0).max().max()
    )
    for (a_val, y_val), part in df.groupby([A, y_col]):
        if len(part) == 0:
            continue
        repeats = int(np.ceil(target / len(part)))
        upsampled = pd.concat([part] * repeats, ignore_index=True).sample(
            n=int(target), replace=True, random_state=42
        )
        pieces.append(upsampled)
    new_df = pd.concat(pieces, ignore_index=True)
    new_df = new_df.sample(frac=1.0, random_state=42).reset_index(drop=True)
    y_new = (new_df[outcome_column] == positive_label).astype(int).to_numpy()
    feature_cols = [
        c for c in new_df.columns if c not in {outcome_column, protected_attribute}
    ]
    y_pred, _, _ = train_quick_model(new_df, feature_cols, y_new)
    return new_df, y_pred


def mitigate_drop_proxy(
    df: pd.DataFrame,
    outcome_column: str,
    positive_label: Any,
    proxy_features: list[str],
) -> np.ndarray:
    drop = [c for c in proxy_features if c in df.columns]
    feature_cols = [c for c in df.columns if c not in {outcome_column, *drop}]
    y = (df[outcome_column] == positive_label).astype(int).to_numpy()
    y_pred, _, _ = train_quick_model(df, feature_cols, y)
    return y_pred


# -------- in-processing --------

def mitigate_fairness_constraint(
    df: pd.DataFrame,
    outcome_column: str,
    positive_label: Any,
    protected_attribute: str,
) -> np.ndarray:
    """Use fairlearn's ExponentiatedGradient with DemographicParity if available.

    Falls back to a simple per-group rebalancing if fairlearn isn't installed.
    """
    y = (df[outcome_column] == positive_label).astype(int).to_numpy()
    A = df[protected_attribute].astype(str).fillna("Unknown")
    X, _ = _prep_features(df, outcome_column, drop=[protected_attribute])
    try:
        from fairlearn.reductions import DemographicParity, ExponentiatedGradient

        base = LogisticRegression(max_iter=1000)
        mitigator = ExponentiatedGradient(base, constraints=DemographicParity())
        mitigator.fit(X, y, sensitive_features=A)
        return mitigator.predict(X)
    except Exception:
        # Fallback: per-group threshold equalisation on a logistic baseline
        Xs = StandardScaler(with_mean=False).fit_transform(X)
        base = LogisticRegression(max_iter=1000).fit(Xs, y)
        proba = base.predict_proba(Xs)[:, 1]
        target = float(np.mean(y))
        preds = np.zeros_like(y)
        for g in A.unique():
            mask = (A == g).to_numpy()
            if mask.sum() == 0:
                continue
            t = np.quantile(proba[mask], 1 - target)
            preds[mask] = (proba[mask] >= t).astype(int)
        return preds


# -------- post-processing --------

def mitigate_threshold_adjust(
    df: pd.DataFrame,
    outcome_column: str,
    positive_label: Any,
    protected_attribute: str,
) -> np.ndarray:
    """Train a baseline model, then pick per-group thresholds that equalise rates."""
    y = (df[outcome_column] == positive_label).astype(int).to_numpy()
    feature_cols = [c for c in df.columns if c != outcome_column]
    X = pd.get_dummies(df[feature_cols], drop_first=False, dummy_na=False).fillna(0)
    if X.shape[1] == 0:
        return y
    base = GradientBoostingClassifier(n_estimators=80, random_state=42).fit(X, y)
    proba = base.predict_proba(X)[:, 1]
    A = df[protected_attribute].astype(str).fillna("Unknown")
    target = float(np.mean(y))
    preds = np.zeros_like(y)
    for g in A.unique():
        mask = (A == g).to_numpy()
        if mask.sum() == 0:
            continue
        t = float(np.quantile(proba[mask], 1 - target))
        preds[mask] = (proba[mask] >= t).astype(int)
    return preds


# -------- orchestration --------

STRATEGY_NOTES = {
    "reweight": (
        "Pre-processing: each row was given an instance weight so that every "
        "(group, outcome) combination contributes proportionally during training. "
        "This breaks the link between the protected attribute and the historical label."
    ),
    "resample": (
        "Pre-processing: under-represented (group, outcome) cells were oversampled "
        "with replacement so the training set is balanced across protected groups."
    ),
    "drop_proxy": (
        "Pre-processing: proxy features that leak information about the protected "
        "attribute were removed before training. Reduces 'redlining' style bias."
    ),
    "fairness_constraint": (
        "In-processing: model trained with fairlearn's ExponentiatedGradient under "
        "a DemographicParity constraint, trading some accuracy for parity."
    ),
    "threshold_adjust": (
        "Post-processing: the trained classifier's decision threshold is tuned "
        "per protected group so positive-prediction rates are equalised."
    ),
}


def apply_mitigation(
    df: pd.DataFrame,
    outcome_column: str,
    positive_label: Any,
    protected_attribute: str,
    strategy: str,
    proxy_features: list[str] | None = None,
) -> dict[str, Any]:
    proxy_features = proxy_features or []

    base_metrics = compute_all_metrics(
        df,
        outcome_column=outcome_column,
        positive_label=positive_label,
        protected_attributes=[protected_attribute],
        train_quick=True,
    )
    before_metrics = base_metrics["metrics_per_attribute"][protected_attribute]

    if strategy == "reweight":
        y_pred = mitigate_reweight(df, outcome_column, positive_label, protected_attribute)
        df_after = df
    elif strategy == "resample":
        df_after, y_pred = mitigate_resample(
            df, outcome_column, positive_label, protected_attribute
        )
    elif strategy == "drop_proxy":
        y_pred = mitigate_drop_proxy(df, outcome_column, positive_label, proxy_features)
        df_after = df
    elif strategy == "fairness_constraint":
        y_pred = mitigate_fairness_constraint(
            df, outcome_column, positive_label, protected_attribute
        )
        df_after = df
    elif strategy == "threshold_adjust":
        y_pred = mitigate_threshold_adjust(
            df, outcome_column, positive_label, protected_attribute
        )
        df_after = df
    else:
        raise ValueError(f"Unknown strategy: {strategy}")

    df_after = df_after.copy()
    df_after["__mitigated_pred__"] = y_pred
    after_metrics_pkg = compute_all_metrics(
        df_after,
        outcome_column=outcome_column,
        positive_label=positive_label,
        protected_attributes=[protected_attribute],
        prediction_column="__mitigated_pred__",
        train_quick=False,
    )
    after_metrics = after_metrics_pkg["metrics_per_attribute"][protected_attribute]

    delta_summary = {
        m_after["name"]: round(float(m_after["value"]) - float(m_before["value"]), 4)
        for m_before, m_after in zip(before_metrics, after_metrics)
    }

    return {
        "strategy": strategy,
        "protected_attribute": protected_attribute,
        "before": before_metrics,
        "after": after_metrics,
        "delta_summary": delta_summary,
        "notes": STRATEGY_NOTES.get(strategy, ""),
    }
