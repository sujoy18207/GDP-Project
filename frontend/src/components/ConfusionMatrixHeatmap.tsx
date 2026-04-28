import clsx from "clsx";

import type { ConfusionByGroup } from "../types";

function cellShade(value: number, max: number) {
  if (max <= 0) return 0;
  return value / max;
}

export function ConfusionMatrixHeatmap({
  groups,
  attribute,
}: {
  groups: ConfusionByGroup[];
  attribute: string;
}) {
  if (!groups.length) return null;
  const maxVal = Math.max(
    ...groups.flatMap((g) => [g.tp, g.fp, g.fn, g.tn]),
    1,
  );

  return (
    <div className="card-pad">
      <h3 className="h-section">Confusion matrix per {attribute}</h3>
      <p className="mb-4 text-xs text-ink-500">
        How predictions compare to truth in each subgroup. Darker = more rows.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => {
          const cells: { label: string; value: number; color: string }[] = [
            { label: "TP", value: g.tp, color: "bg-emerald-500" },
            { label: "FP", value: g.fp, color: "bg-red-500" },
            { label: "FN", value: g.fn, color: "bg-amber-500" },
            { label: "TN", value: g.tn, color: "bg-sky-500" },
          ];
          return (
            <div
              key={g.group}
              className="rounded-lg border border-ink-200 bg-white p-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-ink-800">{g.group}</p>
                <p className="text-xs text-ink-500">
                  n = {(g.tp + g.fp + g.tn + g.fn).toLocaleString()}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {cells.map((c) => {
                  const shade = cellShade(c.value, maxVal);
                  return (
                    <div
                      key={c.label}
                      className="relative flex h-16 items-center justify-center overflow-hidden rounded-md border border-ink-200"
                    >
                      <div
                        className={clsx("absolute inset-0", c.color)}
                        style={{ opacity: 0.18 + 0.6 * shade }}
                      />
                      <div className="relative text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-700">
                          {c.label}
                        </p>
                        <p className="text-base font-semibold tabular-nums text-ink-900">
                          {c.value}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-ink-500">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded bg-emerald-500" />
          TP – correctly approved
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded bg-red-500" />
          FP – wrongly approved
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded bg-amber-500" />
          FN – missed positives
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded bg-sky-500" />
          TN – correctly denied
        </span>
      </div>
    </div>
  );
}
