import { useMemo } from "react";

import type { IntersectionalCell } from "../types";

export function IntersectionalHeatmap({
  cells,
  attributes,
}: {
  cells: IntersectionalCell[];
  attributes: string[];
}) {
  const [rowAttr, colAttr] = useMemo(() => {
    if (attributes.length === 0) return [null, null];
    return [attributes[0], attributes[1] ?? null];
  }, [attributes]);

  if (!rowAttr || cells.length === 0) {
    return (
      <div className="card-pad">
        <h3 className="h-section">Intersectional bias heatmap</h3>
        <p className="text-sm text-ink-500">
          Pick at least two protected attributes to see intersectional outcomes
          (e.g. age × gender).
        </p>
      </div>
    );
  }

  const rows = Array.from(new Set(cells.map((c) => c.keys[rowAttr])));
  const cols = colAttr
    ? Array.from(new Set(cells.map((c) => c.keys[colAttr])))
    : ["All"];

  const lookup = new Map<string, IntersectionalCell>();
  cells.forEach((c) => {
    const key = colAttr ? `${c.keys[rowAttr]}|${c.keys[colAttr]}` : c.keys[rowAttr];
    lookup.set(key, c);
  });

  const positiveRates = cells.map((c) => c.positive_rate);
  const minRate = Math.min(...positiveRates);
  const maxRate = Math.max(...positiveRates);

  function shade(rate: number) {
    if (maxRate === minRate) return "rgb(165, 180, 252)";
    const t = (rate - minRate) / (maxRate - minRate);
    const r = Math.round(220 - 100 * t);
    const g = Math.round(38 + 100 * t);
    const b = Math.round(38 + 90 * t);
    return `rgb(${r}, ${g}, ${b})`;
  }

  return (
    <div className="card-pad">
      <h3 className="h-section">
        Intersectional heatmap{" "}
        <span className="text-xs font-medium text-ink-500">
          ({colAttr ? `${rowAttr} × ${colAttr}` : rowAttr})
        </span>
      </h3>
      <p className="mb-4 text-xs text-ink-500">
        Each cell shows the favourable-outcome rate (and row count) for the
        intersection of two protected attributes. Look for outliers — they often
        hide the worst bias.
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="bg-transparent text-left font-medium text-ink-500"></th>
              {cols.map((c) => (
                <th
                  key={c}
                  className="rounded bg-ink-100 px-2 py-1 text-center font-medium text-ink-700"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <th className="rounded bg-ink-100 px-2 py-1 text-left font-medium text-ink-700">
                  {r}
                </th>
                {cols.map((c) => {
                  const key = colAttr ? `${r}|${c}` : r;
                  const cell = lookup.get(key);
                  if (!cell) {
                    return (
                      <td
                        key={c}
                        className="rounded border border-dashed border-ink-200 px-3 py-3 text-center text-ink-300"
                      >
                        —
                      </td>
                    );
                  }
                  return (
                    <td
                      key={c}
                      className="rounded px-3 py-3 text-center text-white"
                      style={{ backgroundColor: shade(cell.positive_rate) }}
                      title={`${(cell.positive_rate * 100).toFixed(1)}% positive · n=${cell.n}`}
                    >
                      <div className="text-sm font-semibold">
                        {(cell.positive_rate * 100).toFixed(0)}%
                      </div>
                      <div className="text-[10px] opacity-90">n={cell.n}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-500">
        <span>Lower rate</span>
        <span
          className="h-2 w-32 rounded"
          style={{
            background:
              "linear-gradient(to right, rgb(220,38,38), rgb(165,180,252), rgb(120,138,178))",
          }}
        />
        <span>Higher rate</span>
      </div>
    </div>
  );
}
