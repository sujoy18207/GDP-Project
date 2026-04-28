"""Fairness metrics implementation.

We compute classic group-fairness metrics directly on top of pandas/numpy so
the prototype works without heavy native dependencies (AIF360 is optional).

Metrics:
    - Demographic Parity Difference: max_a P(Y_hat=1|A=a) - min_a P(Y_hat=1|A=a)
    - Disparate Impact Ratio:        min_a P(Y_hat=1|A=a) / max_a P(Y_hat=1|A=a)
    - Equalized Odds Difference:     max over a of |TPR_a - TPR_ref| OR |FPR_a - FPR_ref|
    - Predictive Parity Difference:  max_a PPV_a - min_a PPV_a
    - Individual Fairness Score:     consistency of predictions for similar inputs
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

from app.config import THRESHOLDS


# ---------- helpers ----------

def _binarize(series: pd.Series, positive_label: Any) -> np.ndarray:
    return (series == positive_label).astype(int).to_numpy()


def _safe_div(a: float, b: float) -> float:
    return float(a / b) if b not in (0, 0.0) else 0.0


def _status(value: float, threshold: float, mode: str = "below") -> str:
    """Compare value vs threshold and return pass/warning/fail.

    `mode="below"`  -> pass when value <= threshold (e.g. parity differences).
    `mode="above"`  -> pass when value >= threshold (e.g. disparate impact).
    """
    if mode == "below":
        if value <= threshold:
            return "pass"
        if value <= threshold * 2:
            return "warning"
        return "fail"
    if value >= threshold:
        return "pass"
    if value >= threshold * 0.75:
        return "warning"
    return "fail"


# ---------- per-group base ----------

def per_group_outcomes(
    df: pd.DataFrame,
    protected: str,
    y_true: np.ndarray,
    y_pred: np.ndarray | None,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    groups = df[protected].astype(str).fillna("Unknown")
    for g, idx in groups.groupby(groups).groups.items():
        idx_arr = np.array(list(idx))
        n = len(idx_arr)
        yt = y_true[idx_arr] if y_true is not None else None
        yp = y_pred[idx_arr] if y_pred is not None else None
        positive_rate = float(np.mean(yt)) if yt is not None and len(yt) > 0 else 0.0

        tpr = fpr = ppv = acc = None
        if yt is not None and yp is not None and n > 0:
            pos = yt == 1
            neg = yt == 0
            tp = int(np.sum((yp == 1) & pos))
            fn = int(np.sum((yp == 0) & pos))
            fp = int(np.sum((yp == 1) & neg))
            tn = int(np.sum((yp == 0) & neg))
            tpr = _safe_div(tp, tp + fn)
            fpr = _safe_div(fp, fp + tn)
            ppv = _safe_div(tp, tp + fp)
            acc = _safe_div(tp + tn, tp + tn + fp + fn)
        out.append(
            {
                "group": str(g),
                "n": int(n),
                "positive_rate": positive_rate,
                "tpr": tpr,
                "fpr": fpr,
                "ppv": ppv,
                "accuracy": acc,
            }
        )
    out.sort(key=lambda r: -r["n"])
    return out


# ---------- metrics ----------

def demographic_parity(group_rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not group_rows:
        return {
            "name": "Demographic Parity Difference",
            "value": 0.0,
            "threshold": THRESHOLDS["demographic_parity_difference"],
            "status": "pass",
            "explanation": "Not enough groups to compute demographic parity.",
            "by_group": [],
        }
    rates = [g["positive_rate"] for g in group_rows]
    diff = float(max(rates) - min(rates))
    return {
        "name": "Demographic Parity Difference",
        "value": diff,
        "threshold": THRESHOLDS["demographic_parity_difference"],
        "status": _status(diff, THRESHOLDS["demographic_parity_difference"], "below"),
        "explanation": (
            "Measures how much the favourable-outcome rate varies between "
            "demographic groups. 0 means every group sees the same approval rate. "
            "Values above ~0.10 typically indicate meaningful disparity."
        ),
        "by_group": group_rows,
    }


def disparate_impact(group_rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not group_rows:
        return {
            "name": "Disparate Impact Ratio",
            "value": 1.0,
            "threshold": THRESHOLDS["disparate_impact_ratio"],
            "status": "pass",
            "explanation": "Not enough groups to compute disparate impact.",
            "by_group": [],
        }
    rates = [g["positive_rate"] for g in group_rows if g["positive_rate"] is not None]
    if not rates or max(rates) == 0:
        ratio = 1.0
    else:
        ratio = float(min(rates) / max(rates))
    return {
        "name": "Disparate Impact Ratio",
        "value": ratio,
        "threshold": THRESHOLDS["disparate_impact_ratio"],
        "status": _status(ratio, THRESHOLDS["disparate_impact_ratio"], "above"),
        "explanation": (
            "Ratio of the lowest group's favourable-outcome rate to the highest. "
            "The U.S. EEOC '80% rule' flags disparate impact when this is below 0.80."
        ),
        "by_group": group_rows,
    }


def equalized_odds(group_rows: list[dict[str, Any]]) -> dict[str, Any]:
    have_rates = [g for g in group_rows if g.get("tpr") is not None and g.get("fpr") is not None]
    if not have_rates:
        return {
            "name": "Equalized Odds Difference",
            "value": 0.0,
            "threshold": THRESHOLDS["equalized_odds_difference"],
            "status": "pass",
            "explanation": (
                "Equalized odds requires predictions; train/predict was not "
                "available for this column."
            ),
            "by_group": group_rows,
        }
    tprs = [g["tpr"] for g in have_rates]
    fprs = [g["fpr"] for g in have_rates]
    diff = float(max(max(tprs) - min(tprs), max(fprs) - min(fprs)))
    return {
        "name": "Equalized Odds Difference",
        "value": diff,
        "threshold": THRESHOLDS["equalized_odds_difference"],
        "status": _status(diff, THRESHOLDS["equalized_odds_difference"], "below"),
        "explanation": (
            "Largest gap between groups in either true-positive rate (catching "
            "qualified members) or false-positive rate (wrongly approving). "
            "Lower is fairer."
        ),
        "by_group": have_rates,
    }


def predictive_parity(group_rows: list[dict[str, Any]]) -> dict[str, Any]:
    have = [g for g in group_rows if g.get("ppv") is not None]
    if not have:
        return {
            "name": "Predictive Parity Difference",
            "value": 0.0,
            "threshold": THRESHOLDS["predictive_parity_difference"],
            "status": "pass",
            "explanation": (
                "Predictive parity requires predictions and ground truth. "
                "No predictions available for this analysis."
            ),
            "by_group": have,
        }
    ppvs = [g["ppv"] for g in have]
    diff = float(max(ppvs) - min(ppvs))
    return {
        "name": "Predictive Parity Difference",
        "value": diff,
        "threshold": THRESHOLDS["predictive_parity_difference"],
        "status": _status(diff, THRESHOLDS["predictive_parity_difference"], "below"),
        "explanation": (
            "Difference in precision (positive predictive value) across groups. "
            "When this is large, a 'positive' prediction is more reliable for one "
            "group than another."
        ),
        "by_group": have,
    }


def individual_fairness(
    df: pd.DataFrame,
    feature_cols: list[str],
    y_pred: np.ndarray,
    k: int = 5,
) -> dict[str, Any]:
    """Approximate individual fairness via k-NN consistency.

    For each row we look at its k nearest neighbours in feature space and
    measure |y_pred(x) - mean(y_pred(neighbours))|. The score is 1 - average
    inconsistency (so 1.0 = perfectly consistent, 0.0 = totally inconsistent).
    We return *inconsistency* as the metric value so smaller is fairer.
    """
    if len(df) < k + 1 or not feature_cols:
        return {
            "name": "Individual Fairness (Inconsistency)",
            "value": 0.0,
            "threshold": THRESHOLDS["individual_fairness"],
            "status": "pass",
            "explanation": (
                "Not enough data or features to compute individual fairness."
            ),
            "by_group": [],
        }
    X = pd.get_dummies(df[feature_cols], drop_first=False, dummy_na=False)
    X = X.fillna(0).to_numpy(dtype=float)
    if X.shape[1] == 0:
        return {
            "name": "Individual Fairness (Inconsistency)",
            "value": 0.0,
            "threshold": THRESHOLDS["individual_fairness"],
            "status": "pass",
            "explanation": "No usable feature columns for individual fairness.",
            "by_group": [],
        }
    Xs = StandardScaler(with_mean=False).fit_transform(X)
    nn = NearestNeighbors(n_neighbors=min(k + 1, len(Xs))).fit(Xs)
    _, ind = nn.kneighbors(Xs)
    neighbor_preds = y_pred[ind[:, 1:]]  # drop self
    diffs = np.abs(y_pred[:, None] - neighbor_preds).mean(axis=1)
    inconsistency = float(np.mean(diffs))
    return {
        "name": "Individual Fairness (Inconsistency)",
        "value": inconsistency,
        "threshold": THRESHOLDS["individual_fairness"],
        "status": _status(inconsistency, THRESHOLDS["individual_fairness"], "below"),
        "explanation": (
            "Similar individuals should receive similar predictions. "
            "We compare each row's prediction to its 5 nearest neighbours; lower "
            "values mean the model is more individually fair."
        ),
        "by_group": [],
    }


# ---------- intersectional + confusion ----------

def intersectional_outcomes(
    df: pd.DataFrame, attrs: list[str], y_true: np.ndarray
) -> list[dict[str, Any]]:
    if not attrs:
        return []
    work = df[attrs].copy().astype(str).fillna("Unknown")
    work["__y__"] = y_true
    grouped = work.groupby(attrs, dropna=False)["__y__"].agg(["mean", "count"]).reset_index()
    cells: list[dict[str, Any]] = []
    for _, row in grouped.iterrows():
        keys = {a: str(row[a]) for a in attrs}
        cells.append(
            {
                "keys": keys,
                "n": int(row["count"]),
                "positive_rate": float(row["mean"]),
            }
        )
    return cells


def confusion_by_group(
    df: pd.DataFrame,
    protected: str,
    y_true: np.ndarray,
    y_pred: np.ndarray,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    groups = df[protected].astype(str).fillna("Unknown")
    for g, idx in groups.groupby(groups).groups.items():
        idx_arr = np.array(list(idx))
        yt = y_true[idx_arr]
        yp = y_pred[idx_arr]
        tp = int(np.sum((yp == 1) & (yt == 1)))
        fp = int(np.sum((yp == 1) & (yt == 0)))
        tn = int(np.sum((yp == 0) & (yt == 0)))
        fn = int(np.sum((yp == 0) & (yt == 1)))
        out.append(
            {"group": str(g), "tp": tp, "fp": fp, "tn": tn, "fn": fn}
        )
    out.sort(key=lambda r: -(r["tp"] + r["fp"] + r["tn"] + r["fn"]))
    return out


# ---------- quick model + feature importance ----------

def train_quick_model(
    df: pd.DataFrame,
    feature_cols: list[str],
    y: np.ndarray,
    random_state: int = 42,
) -> tuple[np.ndarray, list[dict[str, Any]], float]:
    """Train a lightweight gradient-boosted model and return predictions."""
    X = pd.get_dummies(df[feature_cols], drop_first=False, dummy_na=False)
    X = X.fillna(0)
    if X.shape[1] == 0 or len(np.unique(y)) < 2:
        return np.zeros_like(y), [], 0.0

    X_train, X_test, y_train, y_test, idx_train, idx_test = train_test_split(
        X, y, np.arange(len(X)), test_size=0.3, random_state=random_state, stratify=y
    )
    model = GradientBoostingClassifier(
        n_estimators=80, max_depth=3, random_state=random_state
    )
    model.fit(X_train, y_train)
    full_pred = model.predict(X)
    acc = float(accuracy_score(y_test, model.predict(X_test)))

    importances = sorted(
        zip(X.columns, model.feature_importances_),
        key=lambda kv: -kv[1],
    )
    fi_rows: list[dict[str, Any]] = []
    for col, imp in importances[:20]:
        fi_rows.append(
            {
                "feature": str(col),
                "importance": float(imp),
                "is_protected": False,  # caller annotates
            }
        )
    return full_pred, fi_rows, acc


# ---------- orchestration ----------

def compute_all_metrics(
    df: pd.DataFrame,
    outcome_column: str,
    positive_label: Any,
    protected_attributes: list[str],
    feature_cols: list[str] | None = None,
    prediction_column: str | None = None,
    train_quick: bool = True,
) -> dict[str, Any]:
    """Run the full bias-metrics suite for a dataset."""
    y_true = _binarize(df[outcome_column], positive_label)

    if prediction_column and prediction_column in df.columns:
        y_pred = _binarize(df[prediction_column], positive_label)
        feature_importance: list[dict[str, Any]] = []
        accuracy = float(np.mean(y_pred == y_true))
    elif train_quick:
        if feature_cols is None:
            feature_cols = [
                c for c in df.columns if c != outcome_column and c not in protected_attributes
            ]
        feature_cols = [c for c in feature_cols if c in df.columns]
        # also check importance of protected features by including them
        all_features = list({*feature_cols, *protected_attributes})
        all_features = [c for c in all_features if c in df.columns and c != outcome_column]
        y_pred, feature_importance, accuracy = train_quick_model(
            df, all_features, y_true
        )
        protected_set = set(protected_attributes)
        for fi in feature_importance:
            base = fi["feature"].split("_", 1)[0]
            fi["is_protected"] = (
                fi["feature"] in protected_set or base in protected_set
            )
    else:
        y_pred = y_true.copy()
        feature_importance = []
        accuracy = 1.0

    metrics_per_attr: dict[str, list[dict[str, Any]]] = {}
    confusion_per_attr: dict[str, list[dict[str, Any]]] = {}

    use_pred_for_parity = prediction_column is not None

    for attr in protected_attributes:
        if attr not in df.columns:
            continue
        rows = per_group_outcomes(df, attr, y_true, y_pred)
        if use_pred_for_parity:
            parity_rows = per_group_outcomes(df, attr, y_pred, None)
        else:
            # Auditing a *dataset*: compare historic outcomes directly so we
            # surface the bias even when a quick model has smoothed it out.
            parity_rows = per_group_outcomes(df, attr, y_true, None)
        metrics_per_attr[attr] = [
            demographic_parity(parity_rows),
            disparate_impact(parity_rows),
            equalized_odds(rows),
            predictive_parity(rows),
        ]
        confusion_per_attr[attr] = confusion_by_group(df, attr, y_true, y_pred)

    if feature_cols is None:
        feature_cols = [
            c for c in df.columns if c != outcome_column and c not in protected_attributes
        ]
    individual = individual_fairness(df, feature_cols, y_pred)
    for attr in metrics_per_attr:
        metrics_per_attr[attr].append(individual)

    intersectional = intersectional_outcomes(df, protected_attributes, y_true)

    return {
        "metrics_per_attribute": metrics_per_attr,
        "feature_importance": feature_importance,
        "confusion_by_group": confusion_per_attr,
        "intersectional": intersectional,
        "accuracy": accuracy,
        "y_pred": y_pred,
        "y_true": y_true,
    }
