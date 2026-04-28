"""Pydantic request/response schemas."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ---------- Profiling ----------

class ColumnProfile(BaseModel):
    name: str
    dtype: str
    inferred_role: Literal[
        "numeric", "categorical", "binary", "identifier", "text", "datetime"
    ]
    non_null: int
    nulls: int
    unique: int
    sample_values: list[Any]
    min: Optional[float] = None
    max: Optional[float] = None
    mean: Optional[float] = None
    std: Optional[float] = None
    distribution: Optional[dict[str, int]] = None
    is_protected_candidate: bool = False
    protected_kind: Optional[str] = None
    imbalance_score: float = 0.0  # 0 = balanced, 1 = single class


class DatasetProfile(BaseModel):
    dataset_id: str
    filename: str
    rows: int
    cols: int
    columns: list[ColumnProfile]
    suggested_protected: list[str]
    suggested_outcome: Optional[str]
    suggested_positive_label: Optional[Any]


# ---------- Analysis ----------

class AnalyzeRequest(BaseModel):
    dataset_id: str
    outcome_column: str
    positive_label: Any = 1
    protected_attributes: list[str] = Field(default_factory=list)
    prediction_column: Optional[str] = None
    train_quick_model: bool = True


class GroupOutcome(BaseModel):
    group: str
    n: int
    positive_rate: float
    tpr: Optional[float] = None
    fpr: Optional[float] = None
    ppv: Optional[float] = None  # precision / predictive parity
    accuracy: Optional[float] = None


class MetricResult(BaseModel):
    name: str
    value: float
    threshold: float
    status: Literal["pass", "warning", "fail"]
    explanation: str
    by_group: list[GroupOutcome] = Field(default_factory=list)


class IntersectionalCell(BaseModel):
    keys: dict[str, str]
    n: int
    positive_rate: float


class FeatureImportanceItem(BaseModel):
    feature: str
    importance: float
    is_protected: bool = False


class ConfusionByGroup(BaseModel):
    group: str
    tp: int
    fp: int
    tn: int
    fn: int


class AnalyzeResponse(BaseModel):
    dataset_id: str
    report_id: str
    outcome_column: str
    positive_label: Any
    protected_attributes: list[str]
    metrics_per_attribute: dict[str, list[MetricResult]]
    feature_importance: list[FeatureImportanceItem]
    confusion_by_group: dict[str, list[ConfusionByGroup]]
    intersectional: list[IntersectionalCell]
    severity_summary: dict[str, int]
    executive_summary: str
    findings: list["Finding"]


class Finding(BaseModel):
    severity: Literal["critical", "warning", "info"]
    title: str
    description: str
    affected_groups: list[str]
    impact_size: float
    metric: str
    suggestion_keys: list[str] = Field(default_factory=list)


AnalyzeResponse.model_rebuild()


# ---------- Mitigation ----------

class MitigateRequest(BaseModel):
    dataset_id: str
    outcome_column: str
    positive_label: Any = 1
    protected_attribute: str
    strategy: Literal[
        "reweight",
        "resample",
        "drop_proxy",
        "fairness_constraint",
        "threshold_adjust",
    ]
    proxy_features: list[str] = Field(default_factory=list)


class MitigateResponse(BaseModel):
    strategy: str
    protected_attribute: str
    before: list[MetricResult]
    after: list[MetricResult]
    notes: str
    delta_summary: dict[str, float]


# ---------- Report ----------

class ReportSummary(BaseModel):
    report_id: str
    dataset_id: str
    created_at: str
    outcome_column: str
    protected_attributes: list[str]
    severity_summary: dict[str, int]


# ---------- Model Audit ----------

class ModelAuditResponse(BaseModel):
    dataset_id: str
    report_id: str
    accuracy: float
    metrics_per_attribute: dict[str, list[MetricResult]]
    tradeoff_curve: list[dict[str, float]]
    feature_importance: list[FeatureImportanceItem]
    findings: list[Finding]
    executive_summary: str
