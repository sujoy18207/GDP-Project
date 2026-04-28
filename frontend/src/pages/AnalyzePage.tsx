import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { api } from "../api";
import { ConfusionMatrixHeatmap } from "../components/ConfusionMatrixHeatmap";
import { EmptyState } from "../components/Empty";
import { FeatureImportanceChart } from "../components/FeatureImportanceChart";
import { GroupComparisonChart } from "../components/GroupComparisonChart";
import { IntersectionalHeatmap } from "../components/IntersectionalHeatmap";
import { Spinner } from "../components/Loader";
import { MetricCard } from "../components/MetricCard";
import { SeverityChip } from "../components/StatusBadge";
import { useDataset } from "../store/DatasetContext";
import type { AnalyzeResponse } from "../types";

export function AnalyzePage() {
  const navigate = useNavigate();
  const {
    profile,
    outcomeColumn,
    setOutcomeColumn,
    positiveLabel,
    setPositiveLabel,
    protectedAttributes,
    setProtectedAttributes,
    analysis,
    setAnalysis,
  } = useDataset();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAttr, setActiveAttr] = useState<string | null>(null);

  useEffect(() => {
    if (!analysis && profile && outcomeColumn && protectedAttributes.length > 0) {
      runAnalyze();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.dataset_id]);

  const candidateOutcomes = useMemo(
    () =>
      profile?.columns.filter(
        (c) => c.inferred_role === "binary" || c.inferred_role === "categorical",
      ) ?? [],
    [profile],
  );
  const candidateProtected = useMemo(
    () =>
      profile?.columns.filter(
        (c) => c.inferred_role !== "identifier" && c.inferred_role !== "text",
      ) ?? [],
    [profile],
  );

  if (!profile) {
    return (
      <EmptyState
        title="Nothing to analyze yet"
        description="Upload a dataset first or use one of the bundled demos."
        cta={{ to: "/upload", label: "Go to upload" }}
      />
    );
  }

  async function runAnalyze() {
    if (!profile || !outcomeColumn || protectedAttributes.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.analyze({
        dataset_id: profile.dataset_id,
        outcome_column: outcomeColumn,
        positive_label: positiveLabel,
        protected_attributes: protectedAttributes,
      });
      setAnalysis(res);
      setActiveAttr(protectedAttributes[0] ?? null);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h2 className="text-2xl font-semibold text-ink-900">
            Bias metrics dashboard
          </h2>
          <p className="text-sm text-ink-500">
            Choose your outcome column and protected attributes, then run the
            full fairness audit.
          </p>
        </div>
        {analysis && (
          <button
            onClick={() => navigate(`/report/${analysis.report_id}`)}
            className="btn-outline"
          >
            View full report →
          </button>
        )}
      </header>

      <div className="card-pad grid gap-4 md:grid-cols-3">
        <div>
          <label className="label">Outcome column</label>
          <select
            className="input"
            value={outcomeColumn ?? ""}
            onChange={(e) => setOutcomeColumn(e.target.value || null)}
          >
            <option value="">Select…</option>
            {candidateOutcomes.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.inferred_role})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Positive label</label>
          <input
            className="input"
            value={String(positiveLabel ?? "")}
            onChange={(e) => {
              const v = e.target.value;
              const num = Number(v);
              setPositiveLabel(v && !Number.isNaN(num) ? num : v);
            }}
          />
        </div>
        <div>
          <label className="label">Protected attributes</label>
          <div className="flex flex-wrap gap-2">
            {candidateProtected.map((c) => {
              const active = protectedAttributes.includes(c.name);
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => {
                    setProtectedAttributes(
                      active
                        ? protectedAttributes.filter((p) => p !== c.name)
                        : [...protectedAttributes, c.name],
                    );
                  }}
                  className={
                    "rounded-full border px-3 py-1 text-xs font-medium transition " +
                    (active
                      ? "border-brand-500 bg-brand-600 text-white"
                      : "border-ink-300 bg-white text-ink-700 hover:border-brand-400")
                  }
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn-primary"
          disabled={
            busy ||
            !outcomeColumn ||
            protectedAttributes.length === 0
          }
          onClick={runAnalyze}
        >
          {busy ? <Spinner /> : null}
          Run fairness audit
        </button>
        <p className="text-xs text-ink-500">
          We train a quick gradient-boosted baseline on the spot to compute TPR /
          FPR / PPV per group.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {analysis && (
        <AnalysisResults
          analysis={analysis}
          activeAttr={activeAttr}
          onChangeAttr={setActiveAttr}
        />
      )}
    </div>
  );
}

function AnalysisResults({
  analysis,
  activeAttr,
  onChangeAttr,
}: {
  analysis: AnalyzeResponse;
  activeAttr: string | null;
  onChangeAttr: (attr: string) => void;
}) {
  const attrs = Object.keys(analysis.metrics_per_attribute);
  const current = activeAttr ?? attrs[0];
  const metrics = analysis.metrics_per_attribute[current] ?? [];
  const groups = metrics[0]?.by_group ?? [];

  return (
    <div className="space-y-6">
      <SummaryStrip analysis={analysis} />

      {attrs.length > 1 && (
        <div className="flex flex-wrap gap-2 border-b border-ink-200">
          {attrs.map((a) => (
            <button
              key={a}
              onClick={() => onChangeAttr(a)}
              className={
                "border-b-2 px-3 py-2 text-sm font-medium transition " +
                (a === current
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-ink-500 hover:text-ink-800")
              }
            >
              {a}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map((m) => (
          <MetricCard key={m.name} metric={m} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <GroupComparisonChart groups={groups} attribute={current} />
        <FeatureImportanceChart items={analysis.feature_importance} />
      </div>

      <ConfusionMatrixHeatmap
        groups={analysis.confusion_by_group[current] ?? []}
        attribute={current}
      />

      <IntersectionalHeatmap
        cells={analysis.intersectional}
        attributes={analysis.protected_attributes}
      />
    </div>
  );
}

function SummaryStrip({ analysis }: { analysis: AnalyzeResponse }) {
  const sev = analysis.severity_summary ?? {};
  return (
    <div className="card flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
          Executive summary
        </h3>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-700">
          {analysis.executive_summary}
        </p>
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        <SeverityCounter
          severity="critical"
          count={sev.critical ?? 0}
        />
        <SeverityCounter severity="warning" count={sev.warning ?? 0} />
        <SeverityCounter severity="info" count={sev.info ?? 0} />
      </div>
    </div>
  );
}

function SeverityCounter({
  severity,
  count,
}: {
  severity: "critical" | "warning" | "info";
  count: number;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-ink-200 bg-white px-4 py-2">
      <SeverityChip severity={severity} />
      <span className="mt-1 text-xl font-semibold tabular-nums text-ink-900">
        {count}
      </span>
    </div>
  );
}
