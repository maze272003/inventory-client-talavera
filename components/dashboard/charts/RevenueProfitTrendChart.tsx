"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { formatPeso } from "@/lib/format";
import { useChartColors, chartTooltipStyle } from "./chartTheme";
import { ChartContainer } from "./Chart";

export type TrendPoint = { label: string; revenue: number; profit: number };

export default function RevenueProfitTrendChart({ data }: { data: TrendPoint[] }) {
  const c = useChartColors();
  return (
    <ChartContainer>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke={c.textMuted} fontSize={12} tickLine={false} minTickGap={24} />
        <YAxis stroke={c.textMuted} fontSize={12} tickLine={false} width={72} tickFormatter={(v) => formatPeso(Number(v))} />
        <Tooltip formatter={(v, name) => [formatPeso(Number(v ?? 0)), name]} contentStyle={chartTooltipStyle(c)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="revenue" name="Revenue" stroke={c.primary} fill={c.primary} fillOpacity={0.15} strokeWidth={2} />
        <Area type="monotone" dataKey="profit" name="Profit" stroke={c.success} fill={c.success} fillOpacity={0.15} strokeWidth={2} />
      </AreaChart>
    </ChartContainer>
  );
}
