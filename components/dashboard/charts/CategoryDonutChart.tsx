"use client";

import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { formatPeso } from "@/lib/format";
import { useChartColors, categoryPalette, chartTooltipStyle } from "./chartTheme";
import { ChartContainer } from "./Chart";

export type CategorySlice = { category: string; revenue: number };

export default function CategoryDonutChart({ data }: { data: CategorySlice[] }) {
  const c = useChartColors();
  return (
    <ChartContainer>
      <PieChart>
        <Pie data={data} dataKey="revenue" nameKey="category" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
          {data.map((entry, i) => (
            <Cell key={entry.category} fill={categoryPalette[i % categoryPalette.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v, name) => [formatPeso(Number(v ?? 0)), name]} contentStyle={chartTooltipStyle(c)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ChartContainer>
  );
}
