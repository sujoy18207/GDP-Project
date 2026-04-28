import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "../api";
import { ConfusionMatrixHeatmap } from "../components/ConfusionMatrixHeatmap";
import { FeatureImportanceChart } from "../components/FeatureImportanceChart";
import { GroupComparisonChart } from "../components/GroupComparisonChart";
import { Spinner } from "../components/Loader";
import { MetricCard } from "../components/MetricCard";
import { SeverityChip } from "../components/StatusBadge";
import type { ModelAuditResponse, SamplesManifest } from "../types";

export function ModelAuditPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ModelAuditResponse | null>(null);
  const [samples, setSamples] = useState<SamplesManifest["samples"] | null>(
    null,
  );

  const [modelFile, setModelFile] = useState<File | null>(null);
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [outcome, setOutcome] = useState("");
  const [positive, setPositive] = useState("1");
  const [protectedAttrs, setProtectedAttrs] = useState("");

  useEffect(() => {
    api
      .listSamples()
      .then((res) => setSamples(res.samples))
      .catch(() => setSamples(null));
  }, []);

  async function runSample(name: string) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.auditSampleModel(name);
      setResult(res);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runUpload() {
    if (!modelFile || !datasetFile || !outcome) {
      setError("Provide a model file, a test dataset, and the outcome column.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.auditModel({
        modelFile,
        datasetFile,
        outcomeColumn: outcome,
        positiveLabel: positive,
        protectedAttributes: protectedAttrs
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setResult(res);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-semibold text-ink-900">
          Model audit (bonus)
        </h2>
        <p className="text-sm text-ink-500">
          Hand us a pickled scikit-learn model and a labelled test dataset, and
          we'll run the full fairness suite on its predictions.
        </p>
      </header>

      <div className="card-pad">
        <h3 className="h-section">Quick-start with a bundled demo</h3>
        <p className="mb-3 text-xs text-ink-500">
          We pre-trained a gradient-boosted classifier on each biased sample
          dataset.
        </p>
        <div className="flex flex-wrap gap-2">
          {samples ? (
            Object.entries(samples).map(([key, meta]) => (
              <button
                key={key}
                disabled={busy}
                onClick={() => runSample(key)}
                className="btn-outline"
              >
                Audit “{meta.name}” model
              </button>
            ))
          ) : (
            <p className="text-sm text-ink-500">
              Sample list unavailable — make sure the backend is running.
            </p>
          )}
        </div>
      </div>

      <div className="card-pad">
        <h3 className="h-section">…or upload your own</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Model file (.pkl / .joblib)</label>
            <input
              className="input"
              type="file"
              accept=".pkl,.joblib"
              onChange={(e) => setModelFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <label className="label">Test dataset (.csv / .json)</label>
            <input
              className="input"
              type="file"
              accept=".csv,.json,.jsonl"
              onChange={(e) => setDatasetFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <label className="label">Outcome column</label>
            <input
              className="input"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder="e.g. hired"
            />
          </div>
          <div>
            <label className="label">Positive label</label>
            <input
              className="input"
              value={positive}
              onChange={(e) => setPositive(e.target.value)}
              placeholder="1"
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Protected attributes (comma-separated)</label>
            <input
              className="input"
              value={protectedAttrs}
              onChange={(e) => setProtectedAttrs(e.target.value)}
              placeholder="gender, race, age, zip_code"
            />
          </div>
        </div>
        <div className="mt-4">
          <button className="btn-primary" disabled={busy} onClick={runUpload}>
            {busy ? <Spinner /> : null}
            Audit my model
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && <AuditResults result={result} />}
    </div>
  );
}

function AuditResults({ result }: { result: ModelAuditResponse }) {
  const attrs = Object.keys(result.metrics_per_attribute);
  const [active, setActive] = useState<string>(attrs[0] ?? "");
  const current = active || attrs[0];
  const metrics = result.metrics_per_attribute[current] ?? [];
  const groups = metrics[0]?.by_group ?? [];

  return (
    <div className="space-y-6">
      <div className="card-pad">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="h-section">Audit summary</h3>
            <p className="text-sm leading-relaxed text-ink-700">
              {result.executive_summary}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wide text-ink-500">
                Accuracy
              </p>
              <p className="text-xl font-semibold tabular-nums text-ink-900">
                {((result.accuracy ?? 0) * 100).toFixed(1)}%
              </p>
            </div>
            <SeverityChip severity="critical" />
            <span className="font-medium text-ink-700">
              {result.severity_summary?.critical ?? 0}
            </span>
            <SeverityChip severity="warning" />
            <span className="font-medium text-ink-700">
              {result.severity_summary?.warning ?? 0}
            </span>
          </div>
        </div>
      </div>

      {attrs.length > 1 && (
        <div className="flex flex-wrap gap-2 border-b border-ink-200">
          {attrs.map((a) => (
            <button
              key={a}
              onClick={() => setActive(a)}
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
        <FeatureImportanceChart items={result.feature_importance} />
      </div>

      <ConfusionMatrixHeatmap
        groups={result.confusion_by_group[current] ?? []}
        attribute={current}
      />

      {result.tradeoff_curve && result.tradeoff_curve.length > 0 && (
        <TradeoffChart curve={result.tradeoff_curve} />
      )}
    </div>
  );
}

function TradeoffChart({
  curve,
}: {
  curve: ModelAuditResponse["tradeoff_curve"];
}) {
  const data = curve.map((p) => ({
    threshold: Number((p.threshold * 100).toFixed(0)),
    "Accuracy": Number((p.accuracy * 100).toFixed(2)),
    "DP difference": Number((p.demographic_parity_diff * 100).toFixed(2)),
    "Disparate impact": Number((p.disparate_impact * 100).toFixed(2)),
  }));
  return (
    <div className="card-pad">
      <h3 className="h-section">Performance vs fairness trade-off</h3>
      <p className="mb-3 text-xs text-ink-500">
        Sweeping the model's decision threshold from 5% → 95%. Look for the
        sweet spot where accuracy is high but demographic parity gap is small.
      </p>
      <div style={{ height: 320 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="threshold"
              tick={{ fontSize: 12 }}
              tickFormatter={(v) => `${v}%`}
              label={{
                value: "Threshold",
                position: "insideBottom",
                offset: -2,
                style: { fontSize: 11, fill: "#64748b" },
              }}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(v) => `${v}%`}
              domain={[0, 100]}
            />
            <RechartsTooltip />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="Accuracy"
              stroke="#6366f1"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="DP difference"
              stroke="#dc2626"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="Disparate impact"
              stroke="#16a34a"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
