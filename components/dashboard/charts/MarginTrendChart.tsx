"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useChartColors, chartTooltipStyle } from "./chartTheme";
import { ChartContainer } from "./Chart";

export type MarginPoint = { label: string; marginPct: number };

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

export default function MarginTrendChart({ data }: { data: MarginPoint[] }) {
  const c = useChartColors();
  return (
    <ChartContainer>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke={c.textMuted} fontSize={12} tickLine={false} minTickGap={24} />
        <YAxis stroke={c.textMuted} fontSize={12} tickLine={false} width={48} domain={[0, "auto"]} tickFormatter={(v) => pct(Number(v))} />
        <Tooltip formatter={(v) => [pct(Number(v ?? 0)), "Gross margin"]} contentStyle={chartTooltipStyle(c)} />
        <Line type="monotone" dataKey="marginPct" name="Gross margin" stroke={c.success} strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  );
}
