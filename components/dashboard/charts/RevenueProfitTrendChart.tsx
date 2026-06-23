"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { formatPeso } from "@/lib/format";
import { useChartColors } from "./chartTheme";

export type TrendPoint = { label: string; revenue: number; profit: number };

export default function RevenueProfitTrendChart({ data }: { data: TrendPoint[] }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke={c.textMuted} fontSize={12} tickLine={false} minTickGap={24} />
        <YAxis stroke={c.textMuted} fontSize={12} tickLine={false} width={72} tickFormatter={(v) => formatPeso(Number(v))} />
        <Tooltip
          formatter={(v, name) => [formatPeso(Number(v ?? 0)), name]}
          contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="revenue" name="Revenue" stroke={c.primary} fill={c.primary} fillOpacity={0.15} strokeWidth={2} />
        <Area type="monotone" dataKey="profit" name="Profit" stroke={c.success} fill={c.success} fillOpacity={0.15} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
