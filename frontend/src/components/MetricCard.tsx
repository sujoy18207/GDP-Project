import clsx from "clsx";

import type { MetricResult } from "../types";
import { InfoIcon, Tooltip } from "./Tooltip";
import { StatusBadge } from "./StatusBadge";

export function MetricCard({ metric }: { metric: MetricResult }) {
  const isRatio = metric.name.toLowerCase().includes("disparate impact");
  const value = metric.value;
  const formatted = isRatio ? value.toFixed(2) : value.toFixed(3);
  const accent =
    metric.status === "fail"
      ? "border-red-200 bg-red-50/40"
      : metric.status === "warning"
        ? "border-amber-200 bg-amber-50/40"
        : "border-green-200 bg-green-50/30";
  return (
    <div
      className={clsx(
        "card flex flex-col justify-between p-4 ring-0",
        accent,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-500">
            {metric.name}
            <Tooltip label={metric.explanation}>
              <span className="text-ink-400 hover:text-ink-700">
                <InfoIcon />
              </span>
            </Tooltip>
          </div>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-ink-900">
            {formatted}
          </p>
        </div>
        <StatusBadge status={metric.status} />
      </div>
      <p className="mt-3 text-xs text-ink-600">
        Threshold {isRatio ? "≥" : "≤"}{" "}
        <span className="font-medium tabular-nums text-ink-800">
          {metric.threshold.toFixed(2)}
        </span>
      </p>
    </div>
  );
}
