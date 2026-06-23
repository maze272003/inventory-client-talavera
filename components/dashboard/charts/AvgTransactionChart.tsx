"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { formatPeso } from "@/lib/format";
import { useChartColors } from "./chartTheme";

export type AovPoint = { label: string; transactions: number; avg: number };

export default function AvgTransactionChart({ data }: { data: AovPoint[] }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={c.border} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke={c.textMuted} fontSize={12} tickLine={false} minTickGap={24} />
        <YAxis yAxisId="left" stroke={c.textMuted} fontSize={12} tickLine={false} width={40} allowDecimals={false} />
        <YAxis yAxisId="right" orientation="right" stroke={c.textMuted} fontSize={12} tickLine={false} width={72} tickFormatter={(v) => formatPeso(Number(v))} />
        <Tooltip
          formatter={(v, name) => (name === "Avg value" ? [formatPeso(Number(v ?? 0)), name] : [String(v ?? ""), name])}
          contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="left" dataKey="transactions" name="Transactions" fill={c.primary} fillOpacity={0.6} radius={[3, 3, 0, 0]} />
        <Line yAxisId="right" type="monotone" dataKey="avg" name="Avg value" stroke={c.warning} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
