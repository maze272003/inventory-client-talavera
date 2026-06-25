"use client";

import * as React from "react";
import { ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

/**
 * shadcn-style chart wrapper: applies the base Recharts CSS resets shadcn ships
 * (muted grid/axis, focus outlines off) and hosts a ResponsiveContainer so each
 * chart component only declares its Recharts tree. Series/axis colors are still
 * supplied as resolved hex by useChartColors (SVG attrs don't resolve var()).
 */
export function ChartContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactElement;
}) {
  return (
    <div
      data-chart
      className={cn(
        "h-full w-full [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line]:stroke-border/50 [&_.recharts-surface]:outline-none",
        className,
      )}
    >
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export default ChartContainer;
