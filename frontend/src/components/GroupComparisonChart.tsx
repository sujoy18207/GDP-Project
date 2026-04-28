import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { GroupOutcome } from "../types";

const COLORS = ["#6366f1", "#0ea5e9", "#f97316", "#16a34a", "#a855f7", "#ef4444"];

export function GroupComparisonChart({
  groups,
  attribute,
}: {
  groups: GroupOutcome[];
  attribute: string;
}) {
  const data = groups.map((g) => ({
    group: g.group,
    "Positive rate": Number((g.positive_rate * 100).toFixed(1)),
    n: g.n,
  }));
  return (
    <div className="card-pad">
      <h3 className="h-section">Outcome rate by {attribute}</h3>
      <p className="mb-3 text-xs text-ink-500">
        Share of each group that received the favourable outcome.
      </p>
      <div style={{ height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 10, right: 16, left: -10, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="group" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(v) => `${v}%`}
              domain={[0, "auto"]}
            />
            <RechartsTooltip
              cursor={{ fill: "rgba(99,102,241,0.08)" }}
              formatter={(value: number, _name, item) => {
                const n = item?.payload?.n ?? 0;
                return [`${value}% (${n} rows)`, "Positive rate"];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Positive rate" radius={[6, 6, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
