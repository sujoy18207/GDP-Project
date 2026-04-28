import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api } from "../api";
import { EmptyState } from "../components/Empty";
import { Spinner } from "../components/Loader";
import { SeverityChip, StatusBadge } from "../components/StatusBadge";
import { useDataset } from "../store/DatasetContext";
import type { AnalyzeResponse } from "../types";

const STRATEGY_LABELS: Record<string, string> = {
  reweight: "Reweighting (pre-processing)",
  resample: "Resampling (pre-processing)",
  drop_proxy: "Drop proxy features (pre-processing)",
  fairness_constraint: "Fairness constraint (in-processing)",
  threshold_adjust: "Per-group threshold tuning (post-processing)",
};

export function ReportPage() {
  const { reportId: routeId } = useParams();
  const { analysis } = useDataset();
  const [report, setReport] = useState<AnalyzeResponse | null>(analysis);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reportId = routeId || analysis?.report_id || null;

  useEffect(() => {
    if (!reportId) return;
    if (analysis && analysis.report_id === reportId) {
      setReport(analysis);
      return;
    }
    setBusy(true);
    api
      .getReport(reportId)
      .then((r) => setReport(r))
      .catch((e) => setError((e as Error).message))
      .finally(() => setBusy(false));
  }, [reportId, analysis]);

  if (!reportId) {
    return (
      <EmptyState
        title="No report available"
        description="Run an analysis first, then come back here to generate a structured audit report."
        cta={{ to: "/analyze", label: "Run an analysis" }}
      />
    );
  }
  if (busy) {
    return (
      <div className="flex items-center gap-3 text-sm text-ink-500">
        <Spinner /> Loading report…
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (!report) return null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-500">
            Report ID
          </p>
          <h2 className="text-2xl font-semibold text-ink-900">
            Audit report{" "}
            <code className="rounded bg-ink-100 px-2 py-0.5 text-base font-mono text-ink-700">
              {report.report_id}
            </code>
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            className="btn-outline"
            href={api.reportPdfUrl(report.report_id)}
            target="_blank"
            rel="noreferrer"
          >
            Download PDF
          </a>
          <button
            className="btn-outline"
            onClick={() => {
              const blob = new Blob([JSON.stringify(report, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `bias-audit-${report.report_id}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download JSON
          </button>
        </div>
      </header>

      <div className="card-pad">
        <h3 className="h-section">Executive summary</h3>
        <p className="text-sm leading-relaxed text-ink-800">
          {report.executive_summary}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="Critical findings"
          tone="critical"
          value={report.severity_summary?.critical ?? 0}
        />
        <SummaryCard
          label="Warnings"
          tone="warning"
          value={report.severity_summary?.warning ?? 0}
        />
        <SummaryCard
          label="Info"
          tone="info"
          value={report.severity_summary?.info ?? 0}
        />
      </div>

      <FindingsList report={report} />
      <BiasedSegments report={report} />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "critical" | "warning" | "info";
}) {
  const map = {
    critical: "text-bad",
    warning: "text-warn",
    info: "text-ink-700",
  };
  return (
    <div className="card-pad">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <p className={"mt-1 text-3xl font-semibold tabular-nums " + map[tone]}>
        {value}
      </p>
    </div>
  );
}

function FindingsList({ report }: { report: AnalyzeResponse }) {
  if (!report.findings.length) {
    return (
      <div className="card-pad">
        <h3 className="h-section">Findings</h3>
        <p className="text-sm text-ink-500">
          No bias findings detected — every metric is within threshold.
        </p>
      </div>
    );
  }
  return (
    <div className="card-pad">
      <h3 className="h-section">Findings ({report.findings.length})</h3>
      <ul className="space-y-3">
        {report.findings.map((f, idx) => (
          <li
            key={idx}
            className="rounded-lg border border-ink-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <SeverityChip severity={f.severity} />
                  <span className="text-sm font-semibold text-ink-900">
                    {f.title}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-700">{f.description}</p>
                {f.affected_groups.length > 0 && (
                  <p className="mt-2 text-xs text-ink-500">
                    Affected groups:{" "}
                    {f.affected_groups.slice(0, 6).map((g) => (
                      <span
                        key={g}
                        className="ml-1 rounded bg-ink-100 px-1.5 py-0.5 text-[11px] text-ink-700"
                      >
                        {g}
                      </span>
                    ))}
                  </p>
                )}
              </div>
              <span className="text-xs text-ink-500">
                Impact{" "}
                <span className="font-medium tabular-nums text-ink-800">
                  {f.impact_size.toFixed(3)}
                </span>
              </span>
            </div>
            {f.suggestion_keys.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {f.suggestion_keys.map((k) => (
                  <span
                    key={k}
                    className="inline-flex items-center rounded-md bg-brand-50 px-2 py-0.5 text-xs text-brand-700 ring-1 ring-inset ring-brand-200"
                  >
                    Suggested: {STRATEGY_LABELS[k] ?? k}
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {Object.entries(report.metrics_per_attribute).map(([attr, metrics]) => (
          <div key={attr} className="rounded-lg border border-ink-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
              {attr}
            </p>
            <ul className="mt-2 space-y-1.5">
              {metrics.map((m) => (
                <li
                  key={m.name}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-ink-700">{m.name}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-medium tabular-nums text-ink-900">
                      {m.value.toFixed(3)}
                    </span>
                    <StatusBadge status={m.status} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function BiasedSegments({ report }: { report: AnalyzeResponse }) {
  const segs = report.biased_segments ?? [];
  if (!segs.length) return null;
  return (
    <div className="card-pad">
      <h3 className="h-section">Most-biased segments</h3>
      <p className="mb-3 text-xs text-ink-500">
        Subgroups whose positive-outcome rate diverges most from the overall
        average.
      </p>
      <div className="overflow-x-auto rounded-md border border-ink-200">
        <table className="min-w-full divide-y divide-ink-200 text-sm">
          <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
            <tr>
              <th className="px-3 py-2 text-left">Segment</th>
              <th className="px-3 py-2 text-left">Rows</th>
              <th className="px-3 py-2 text-left">Positive rate</th>
              <th className="px-3 py-2 text-left">Δ vs overall</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 bg-white">
            {segs.map((s, i) => {
              const keys = Object.entries(s.keys)
                .map(([k, v]) => `${k}=${v}`)
                .join(" · ");
              const tone =
                s.delta_vs_overall < -0.05
                  ? "text-bad"
                  : s.delta_vs_overall > 0.05
                    ? "text-warn"
                    : "text-ink-600";
              return (
                <tr key={i}>
                  <td className="px-3 py-2 font-medium text-ink-800">{keys}</td>
                  <td className="px-3 py-2 tabular-nums text-ink-700">{s.n}</td>
                  <td className="px-3 py-2 tabular-nums text-ink-900">
                    {(s.positive_rate * 100).toFixed(1)}%
                  </td>
                  <td className={"px-3 py-2 tabular-nums font-semibold " + tone}>
                    {s.delta_vs_overall > 0 ? "+" : ""}
                    {(s.delta_vs_overall * 100).toFixed(1)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
