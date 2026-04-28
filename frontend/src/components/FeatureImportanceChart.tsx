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

import type { FeatureImportanceItem } from "../types";

export function FeatureImportanceChart({
  items,
}: {
  items: FeatureImportanceItem[];
}) {
  const data = items
    .slice()
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 12)
    .map((it) => ({
      feature: it.feature,
      importance: Number((it.importance * 100).toFixed(2)),
      protected: it.is_protected,
    }));
  const flagged = data.some((d) => d.protected);
  return (
    <div className="card-pad">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="h-section">Feature importance</h3>
          <p className="text-xs text-ink-500">
            Top drivers of the quick-trained baseline model.
          </p>
        </div>
        {flagged && (
          <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-bad ring-1 ring-inset ring-red-200">
            Protected attribute drives predictions
          </span>
        )}
      </div>
      <div className="mt-3" style={{ height: 320 }}>
        <ResponsiveContainer>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 30, left: 10, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              type="number"
              tick={{ fontSize: 11 }}
              tickFormatter={(v) => `${v}%`}
              domain={[0, "auto"]}
            />
            <YAxis
              type="category"
              dataKey="feature"
              tick={{ fontSize: 11 }}
              width={140}
            />
            <RechartsTooltip
              cursor={{ fill: "rgba(99,102,241,0.08)" }}
              formatter={(value: number) => [`${value}%`, "Importance"]}
            />
            <Bar dataKey="importance" radius={[0, 6, 6, 0]}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.protected ? "#dc2626" : "#6366f1"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
