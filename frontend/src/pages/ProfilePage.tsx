import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "../components/Empty";
import { useDataset } from "../store/DatasetContext";
import type { ColumnProfile } from "../types";

export function ProfilePage() {
  const { profile, outcomeColumn, protectedAttributes } = useDataset();

  if (!profile) {
    return (
      <EmptyState
        title="No dataset loaded"
        description="Upload a CSV or load a sample to see column-level profiling and protected-attribute detection."
        cta={{ to: "/upload", label: "Go to upload" }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <SummaryHeader />
      <SuggestionsBar
        outcome={outcomeColumn}
        protectedAttrs={protectedAttributes}
      />
      <PreviewTable />
      <h3 className="h-section">Column profile</h3>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {profile.columns.map((c) => (
          <ColumnCard key={c.name} col={c} />
        ))}
      </div>
    </div>
  );
}

function SummaryHeader() {
  const { profile } = useDataset();
  if (!profile) return null;
  const totalNulls = profile.columns.reduce((s, c) => s + c.nulls, 0);
  const protectedCount = profile.columns.filter(
    (c) => c.is_protected_candidate,
  ).length;
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Stat label="Rows" value={profile.rows.toLocaleString()} />
      <Stat label="Columns" value={profile.cols.toString()} />
      <Stat label="Null cells" value={totalNulls.toLocaleString()} />
      <Stat
        label="Protected attributes detected"
        value={protectedCount.toString()}
        tone={protectedCount > 0 ? "warn" : "default"}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="card-pad">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <p
        className={
          "mt-1 text-2xl font-semibold tabular-nums " +
          (tone === "warn" ? "text-warn" : "text-ink-900")
        }
      >
        {value}
      </p>
    </div>
  );
}

function SuggestionsBar({
  outcome,
  protectedAttrs,
}: {
  outcome: string | null;
  protectedAttrs: string[];
}) {
  return (
    <div className="card flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between">
      <div className="text-sm text-ink-700">
        <span className="font-semibold">Detected outcome column:</span>{" "}
        <code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs">
          {outcome ?? "—"}
        </code>
      </div>
      <div className="text-sm text-ink-700">
        <span className="font-semibold">Suggested protected attributes:</span>{" "}
        {protectedAttrs.length === 0 ? (
          <span className="text-ink-500">none auto-detected</span>
        ) : (
          protectedAttrs.map((p) => (
            <span
              key={p}
              className="ml-1 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-warn ring-1 ring-inset ring-amber-200"
            >
              {p}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function PreviewTable() {
  const { profile } = useDataset();
  const preview = profile?.preview ?? [];
  const cols = profile?.columns.map((c) => c.name) ?? [];
  if (!preview.length) return null;
  return (
    <div className="card-pad">
      <h3 className="h-section">Preview (first 15 rows)</h3>
      <div className="overflow-x-auto rounded-md border border-ink-200">
        <table className="min-w-full divide-y divide-ink-200 text-sm">
          <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
            <tr>
              {cols.map((c) => (
                <th key={c} className="px-3 py-2 text-left font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 bg-white">
            {preview.map((row, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c} className="px-3 py-2 text-ink-700">
                    {String(row[c] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ColumnCard({ col }: { col: ColumnProfile }) {
  const distData = useMemo(() => {
    if (!col.distribution) return [] as { label: string; n: number }[];
    return Object.entries(col.distribution)
      .map(([label, n]) => ({ label, n }))
      .slice(0, 10);
  }, [col.distribution]);

  const imbalanceLabel = col.imbalance_score >= 0.5
    ? "imbalanced"
    : col.imbalance_score >= 0.2
      ? "moderate"
      : "balanced";
  const imbalanceColor =
    col.imbalance_score >= 0.5
      ? "text-bad"
      : col.imbalance_score >= 0.2
        ? "text-warn"
        : "text-ok";

  return (
    <div className="card-pad">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink-900">{col.name}</p>
          <p className="text-xs text-ink-500">
            {col.dtype} · {col.inferred_role}
          </p>
        </div>
        {col.is_protected_candidate && (
          <span className="pill bg-amber-50 text-warn ring-1 ring-inset ring-amber-200">
            protected ({col.protected_kind ?? "?"})
          </span>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Mini label="non-null" value={col.non_null.toLocaleString()} />
        <Mini label="nulls" value={col.nulls.toLocaleString()} />
        <Mini label="unique" value={col.unique.toLocaleString()} />
      </dl>

      {col.inferred_role === "numeric" && (
        <dl className="mt-2 grid grid-cols-4 gap-2 text-xs">
          <Mini label="min" value={fmt(col.min)} />
          <Mini label="max" value={fmt(col.max)} />
          <Mini label="mean" value={fmt(col.mean)} />
          <Mini label="std" value={fmt(col.std)} />
        </dl>
      )}

      {distData.length > 0 && (
        <div className="mt-3" style={{ height: 130 }}>
          <ResponsiveContainer>
            <BarChart data={distData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                interval={0}
                angle={distData.length > 5 ? -25 : 0}
                textAnchor={distData.length > 5 ? "end" : "middle"}
                height={distData.length > 5 ? 50 : 22}
              />
              <YAxis tick={{ fontSize: 10 }} />
              <RechartsTooltip />
              <Bar dataKey="n" radius={[4, 4, 0, 0]}>
                {distData.map((_, i) => (
                  <Cell
                    key={i}
                    fill={col.is_protected_candidate ? "#f59e0b" : "#6366f1"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className={"mt-2 text-[11px] font-medium " + imbalanceColor}>
        Class balance: {imbalanceLabel} ({col.imbalance_score.toFixed(2)})
      </p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-ink-400">
        {label}
      </dt>
      <dd className="font-medium tabular-nums text-ink-800">{value}</dd>
    </div>
  );
}

function fmt(v?: number | null): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return v.toFixed(2);
}
