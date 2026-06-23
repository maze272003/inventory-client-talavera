"use client";

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatPeso } from "@/lib/format";
import { useChartColors, categoryPalette } from "./chartTheme";

export type CategorySlice = { category: string; revenue: number };

export default function CategoryDonutChart({ data }: { data: CategorySlice[] }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="revenue" nameKey="category" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
          {data.map((entry, i) => (
            <Cell key={entry.category} fill={categoryPalette[i % categoryPalette.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v, name) => [formatPeso(Number(v ?? 0)), name]}
          contentStyle={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 8, color: c.text, fontSize: 12 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
