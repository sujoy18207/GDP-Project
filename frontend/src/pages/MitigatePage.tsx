import { useMemo, useState } from "react";

import { api } from "../api";
import { EmptyState } from "../components/Empty";
import { Spinner } from "../components/Loader";
import { StatusBadge } from "../components/StatusBadge";
import { useDataset } from "../store/DatasetContext";
import type { MetricResult, MitigateResponse } from "../types";

const STRATEGIES: {
  key: string;
  family: "Pre-processing" | "In-processing" | "Post-processing";
  title: string;
  description: string;
}[] = [
  {
    key: "reweight",
    family: "Pre-processing",
    title: "Reweighting",
    description:
      "Give each row a weight so every (group, outcome) combo contributes equally during training.",
  },
  {
    key: "resample",
    family: "Pre-processing",
    title: "Resampling",
    description:
      "Oversample under-represented (group, outcome) cells until the training set is balanced.",
  },
  {
    key: "drop_proxy",
    family: "Pre-processing",
    title: "Drop proxy features",
    description:
      "Remove columns that leak information about a protected attribute (e.g. zip code).",
  },
  {
    key: "fairness_constraint",
    family: "In-processing",
    title: "Fairness constraint",
    description:
      "Train with fairlearn's ExponentiatedGradient under DemographicParity.",
  },
  {
    key: "threshold_adjust",
    family: "Post-processing",
    title: "Per-group threshold tuning",
    description:
      "Tune the model's decision threshold separately per protected group to equalise rates.",
  },
];

export function MitigatePage() {
  const { profile, outcomeColumn, positiveLabel, protectedAttributes } =
    useDataset();
  const [strategy, setStrategy] = useState<string>("reweight");
  const [protectedAttr, setProtectedAttr] = useState<string>(
    protectedAttributes[0] ?? "",
  );
  const [proxies, setProxies] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MitigateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const proxyCandidates = useMemo(
    () =>
      profile?.columns
        .filter(
          (c) =>
            c.name !== outcomeColumn &&
            !protectedAttributes.includes(c.name) &&
            c.inferred_role !== "identifier",
        )
        .map((c) => c.name) ?? [],
    [profile, outcomeColumn, protectedAttributes],
  );

  if (!profile) {
    return (
      <EmptyState
        title="No dataset to mitigate"
        description="Upload a dataset first."
        cta={{ to: "/upload", label: "Go to upload" }}
      />
    );
  }

  async function run() {
    if (!profile || !outcomeColumn || !protectedAttr) {
      setError("Pick an outcome column and a protected attribute first.");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.mitigate({
        dataset_id: profile.dataset_id,
        outcome_column: outcomeColumn,
        positive_label: positiveLabel,
        protected_attribute: protectedAttr,
        strategy,
        proxy_features: strategy === "drop_proxy" ? proxies : [],
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
          Mitigation simulator
        </h2>
        <p className="text-sm text-ink-500">
          Pick a strategy and we'll simulate the fix, then show you the
          before/after metrics so you can compare trade-offs.
        </p>
      </header>

      <div className="card-pad space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Protected attribute</label>
            <select
              className="input"
              value={protectedAttr}
              onChange={(e) => setProtectedAttr(e.target.value)}
            >
              <option value="">Select…</option>
              {protectedAttributes.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Outcome column</label>
            <input className="input" disabled value={outcomeColumn ?? ""} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {STRATEGIES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStrategy(s.key)}
              type="button"
              className={
                "rounded-lg border p-4 text-left transition " +
                (strategy === s.key
                  ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200"
                  : "border-ink-200 bg-white hover:border-brand-400")
              }
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">
                {s.family}
              </p>
              <p className="mt-1 text-sm font-semibold text-ink-900">
                {s.title}
              </p>
              <p className="mt-1 text-xs text-ink-600">{s.description}</p>
            </button>
          ))}
        </div>

        {strategy === "drop_proxy" && (
          <div>
            <label className="label">Proxy features to drop</label>
            <div className="flex flex-wrap gap-2">
              {proxyCandidates.map((c) => {
                const active = proxies.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      setProxies(
                        active
                          ? proxies.filter((p) => p !== c)
                          : [...proxies, c],
                      );
                    }}
                    className={
                      "rounded-full border px-3 py-1 text-xs font-medium " +
                      (active
                        ? "border-bad bg-red-50 text-bad"
                        : "border-ink-300 bg-white text-ink-700 hover:border-brand-400")
                    }
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-ink-500">
              Tip: zip code, neighborhood, employer, school often leak race or
              income.
            </p>
          </div>
        )}

        <div>
          <button className="btn-primary" disabled={busy} onClick={run}>
            {busy ? <Spinner /> : null}
            Simulate fix
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {result && <BeforeAfter result={result} />}
    </div>
  );
}

function BeforeAfter({ result }: { result: MitigateResponse }) {
  return (
    <div className="space-y-4">
      <div className="card-pad">
        <h3 className="h-section">Strategy notes</h3>
        <p className="text-sm text-ink-700">{result.notes}</p>
      </div>
      <div className="card-pad">
        <h3 className="h-section">Before vs after</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink-200 text-sm">
            <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Metric</th>
                <th className="px-3 py-2 text-left font-medium">Before</th>
                <th className="px-3 py-2 text-left font-medium">After</th>
                <th className="px-3 py-2 text-left font-medium">Δ</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 bg-white">
              {result.before.map((b: MetricResult, i: number) => {
                const a = result.after[i];
                if (!a) return null;
                const isRatio = b.name.toLowerCase().includes("disparate impact");
                const delta = a.value - b.value;
                const goodChange = isRatio ? delta > 0 : delta < 0;
                return (
                  <tr key={b.name}>
                    <td className="px-3 py-2 font-medium text-ink-800">
                      {b.name}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-ink-700">
                      {b.value.toFixed(3)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-ink-900">
                      {a.value.toFixed(3)}
                    </td>
                    <td
                      className={
                        "px-3 py-2 tabular-nums font-semibold " +
                        (goodChange ? "text-ok" : delta === 0 ? "text-ink-500" : "text-bad")
                      }
                    >
                      {delta > 0 ? "+" : ""}
                      {delta.toFixed(3)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
