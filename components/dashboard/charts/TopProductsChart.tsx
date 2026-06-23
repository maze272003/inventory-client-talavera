"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { formatPeso } from "@/lib/format";
import { useChartColors } from "./chartTheme";

export type TopProduct = { name: string; units: number; revenue: number };
export type TopMetric = "units" | "revenue";

export default function TopProductsChart({
  data, metric, onMetricChange,
}: {
  data: TopProduct[];
  metric: TopMetric;
  onMetricChange: (m: TopMetric) => void;
}) {
  const c = useChartColors();
  const fmt = (v: number) => (metric === "revenue" ? formatPeso(v) : String(v));
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex justify-end gap-1">
        {(["units", "revenue"] as TopMetric[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMetricChange(m)}
            className={`rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${
              metric === m ? "bg-primary text-primary-fg" : "text-text-muted hover:bg-surface-2"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={c.border} strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" stroke={c.textMuted} fontSize={12} tickLine={false} tickFormatter={fmt} />
            <YAxis type="category" dataKey="name" stroke={c.textMuted} fontSize={12} tickLine={false} width={110} />
            <Tooltip
              formatter={(v) => [fmt(Number(v ?? 0)), metric === "revenue" ? "Revenue" : "Units"]}
              contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 12 }}
            />
            <Bar dataKey={metric} fill={c.primary} radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
