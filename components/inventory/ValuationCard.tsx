"use client";

import type { SnapshotResult } from "@/convex/inventoryHealth";
import { formatPeso } from "@/lib/format";
import { Card, CardBody, CardHeader, EmptyState, Icon, ResponsiveTable, Skeleton } from "@/components/ui";

export type ValuationCardProps = {
  valuation: SnapshotResult["valuation"];
  loading?: boolean;
};

/** On-hand valuation at batch cost vs retail, plus a category breakdown. */
export function ValuationCard({ valuation, loading }: ValuationCardProps) {
  const margin = valuation.totalRetailValue - valuation.totalCostValue;
  const marginPct = valuation.totalRetailValue > 0
    ? (margin / valuation.totalRetailValue) * 100
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon name="dollar-sign" size={16} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-text">Inventory Valuation</h2>
            <p className="text-xs text-text-muted">At recorded batch cost</p>
          </div>
        </div>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Cost value</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-text">
              {loading ? "—" : formatPeso(valuation.totalCostValue)}
            </p>
            <p className="text-xs text-text-subtle">Cash tied up</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Retail value</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-text">
              {loading ? "—" : formatPeso(valuation.totalRetailValue)}
            </p>
            <p className="text-xs text-text-subtle">
              {loading ? "" : `+${formatPeso(margin)} (${marginPct.toFixed(0)}%) potential`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} height={20} />
            ))}
          </div>
        ) : (
          <ResponsiveTable
            caption="Inventory value by category"
            rows={valuation.byCategory}
            rowKey={(r) => r.category}
            empty={
              <EmptyState
                icon="boxes"
                title="No inventory on hand"
                description="Active stock is empty."
              />
            }
            columns={[
            {
              key: "category",
              header: "Category",
              align: "left",
              className: "font-medium text-text",
              cell: (r) => r.category,
            },
            {
              key: "share",
              header: "Share",
              align: "right",
              className: "tabular-nums text-text-muted",
              cell: (r) => {
                const total = valuation.totalCostValue || 1;
                return `${((r.costValue / total) * 100).toFixed(0)}%`;
              },
            },
            {
              key: "costValue",
              header: "Cost Value",
              align: "right",
              className: "tabular-nums font-semibold text-text",
              cell: (r) => formatPeso(r.costValue),
            },
          ]}
        />
        )}
      </CardBody>
    </Card>
  );
}

export default ValuationCard;
