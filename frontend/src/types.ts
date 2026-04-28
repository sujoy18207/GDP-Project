export type Status = "pass" | "warning" | "fail";
export type Severity = "critical" | "warning" | "info";

export interface ColumnProfile {
  name: string;
  dtype: string;
  inferred_role:
    | "numeric"
    | "categorical"
    | "binary"
    | "identifier"
    | "text"
    | "datetime";
  non_null: number;
  nulls: number;
  unique: number;
  sample_values: unknown[];
  min?: number | null;
  max?: number | null;
  mean?: number | null;
  std?: number | null;
  distribution?: Record<string, number> | null;
  is_protected_candidate: boolean;
  protected_kind?: string | null;
  imbalance_score: number;
}

export interface DatasetProfile {
  dataset_id: string;
  filename: string;
  rows: number;
  cols: number;
  columns: ColumnProfile[];
  suggested_protected: string[];
  suggested_outcome: string | null;
  suggested_positive_label: unknown;
  preview?: Record<string, unknown>[];
  sample_meta?: Record<string, unknown>;
}

export interface GroupOutcome {
  group: string;
  n: number;
  positive_rate: number;
  tpr?: number | null;
  fpr?: number | null;
  ppv?: number | null;
  accuracy?: number | null;
}

export interface MetricResult {
  name: string;
  value: number;
  threshold: number;
  status: Status;
  explanation: string;
  by_group: GroupOutcome[];
}

export interface ConfusionByGroup {
  group: string;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

export interface IntersectionalCell {
  keys: Record<string, string>;
  n: number;
  positive_rate: number;
}

export interface FeatureImportanceItem {
  feature: string;
  importance: number;
  is_protected: boolean;
}

export interface Finding {
  severity: Severity;
  title: string;
  description: string;
  affected_groups: string[];
  impact_size: number;
  metric: string;
  suggestion_keys: string[];
}

export interface AnalyzeResponse {
  dataset_id: string;
  report_id: string;
  outcome_column: string;
  positive_label: unknown;
  protected_attributes: string[];
  metrics_per_attribute: Record<string, MetricResult[]>;
  feature_importance: FeatureImportanceItem[];
  confusion_by_group: Record<string, ConfusionByGroup[]>;
  intersectional: IntersectionalCell[];
  biased_segments: {
    keys: Record<string, string>;
    n: number;
    positive_rate: number;
    delta_vs_overall: number;
  }[];
  severity_summary: Record<string, number>;
  executive_summary: string;
  findings: Finding[];
  accuracy?: number;
}

export interface MitigateResponse {
  strategy: string;
  protected_attribute: string;
  before: MetricResult[];
  after: MetricResult[];
  notes: string;
  delta_summary: Record<string, number>;
}

export interface ModelAuditResponse extends AnalyzeResponse {
  tradeoff_curve: {
    threshold: number;
    accuracy: number;
    demographic_parity_diff: number;
    disparate_impact: number;
  }[];
}

export interface SamplesManifest {
  samples: Record<
    string,
    {
      name: string;
      csv: string;
      model: string;
      outcome: string;
      positive_label: number | string;
      protected: string[];
    }
  >;
}
