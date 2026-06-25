"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { formatPeso } from "@/lib/format";
import { useChartColors, chartTooltipStyle } from "./chartTheme";
import { ChartContainer } from "./Chart";

export type CashFlowPoint = { label: string; revenue: number; spend: number };

export default function CashFlowChart({ data }: { data: CashFlowPoint[] }) {
  const c = useChartColors();
  return (
    <ChartContainer>
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke={c.textMuted} fontSize={12} tickLine={false} minTickGap={24} />
        <YAxis stroke={c.textMuted} fontSize={12} tickLine={false} width={72} tickFormatter={(v) => formatPeso(Number(v))} />
        <Tooltip formatter={(v, name) => [formatPeso(Number(v ?? 0)), name]} contentStyle={chartTooltipStyle(c)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="revenue" name="Sales in" fill={c.success} radius={[3, 3, 0, 0]} />
        <Bar dataKey="spend" name="Restock out" fill={c.danger} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
