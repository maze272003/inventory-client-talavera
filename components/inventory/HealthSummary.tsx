"use client";

import { StatCard } from "@/components/ui";
import { formatPeso } from "@/lib/format";

export type HealthSummaryProps = {
  stockoutCount: number;
  deadStockValue: number;
  totalCostValue: number;
  totalRetailValue: number;
  loading?: boolean;
};

/**
 * Top KPI strip for the Inventory Health page: inventory valuation (cost +
 * retail), stockout-risk count, and dead-stock cash value.
 */
export function HealthSummary({
  stockoutCount,
  deadStockValue,
  totalCostValue,
  totalRetailValue,
  loading,
}: HealthSummaryProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        label="Inventory Value"
        icon="boxes"
        tone="primary"
        loading={loading}
        value={loading ? "—" : formatPeso(totalCostValue)}
        hint="Cash tied up at batch cost"
      />
      <StatCard
        label="Retail Value"
        icon="tag"
        tone="info"
        loading={loading}
        value={loading ? "—" : formatPeso(totalRetailValue)}
        hint="If all sold at full price"
      />
      <StatCard
        label="Stockout Risk"
        icon="alert-triangle"
        tone="danger"
        loading={loading}
        value={loading ? "—" : String(stockoutCount)}
        hint={stockoutCount === 0 ? "None flagged" : "At threshold or soon out"}
      />
      <StatCard
        label="Dead Stock"
        icon="clock"
        tone="warning"
        loading={loading}
        value={loading ? "—" : formatPeso(deadStockValue)}
        hint="Untouched 30+ days"
      />
    </div>
  );
}

export default HealthSummary;
