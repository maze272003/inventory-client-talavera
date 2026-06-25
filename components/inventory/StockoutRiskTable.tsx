"use client";

import type { SnapshotResult } from "@/convex/inventoryHealth";
import { Badge, Card, CardBody, CardHeader, EmptyState, Icon, ResponsiveTable, Skeleton } from "@/components/ui";

export type StockoutRiskTableProps = {
  rows: SnapshotResult["stockoutRisk"];
  loading?: boolean;
};

function daysLabel(d: number | null): string {
  if (d === null) return "∞";
  if (d < 1) return "<1";
  return Math.round(d).toString();
}

/** Products at or below reorder threshold, or projected to stock out soon. */
export function StockoutRiskTable({ rows, loading }: StockoutRiskTableProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger-bg text-danger">
            <Icon name="alert-triangle" size={16} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-text">Stockout Risk</h2>
            <p className="text-xs text-text-muted">Most urgent first</p>
          </div>
        </div>
        <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-text-muted tabular-nums">
          {rows.length} item{rows.length === 1 ? "" : "s"}
        </span>
      </CardHeader>
      <CardBody>
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height={20} />
            ))}
          </div>
        ) : (
          <ResponsiveTable
            caption="Products at stockout risk"
            rows={rows}
            rowKey={(r) => r.productId}
            empty={
            <EmptyState
              icon="check-circle"
              title="No stockout risk"
              description="Every active product is comfortably stocked."
            />
          }
          columns={[
            {
              key: "name",
              header: "Product",
              align: "left",
              className: "font-medium text-text",
              cell: (r) => (
                <div className="min-w-0">
                  <div className="truncate">{r.name}</div>
                  <div className="text-xs text-text-muted">{r.sku}</div>
                </div>
              ),
            },
            {
              key: "stockQty",
              header: "Stock",
              align: "right",
              className: "tabular-nums",
              cell: (r) => {
                const out = r.stockQty <= 0;
                return out ? (
                  <Badge variant="danger">Out</Badge>
                ) : (
                  <span className={r.stockQty <= r.reorderThreshold ? "text-danger font-semibold" : ""}>
                    {r.stockQty}
                  </span>
                );
              },
            },
            {
              key: "threshold",
              header: "Threshold",
              align: "right",
              className: "tabular-nums text-text-muted",
              cell: (r) => r.reorderThreshold,
            },
            {
              key: "velocity",
              header: "Velocity",
              align: "right",
              className: "tabular-nums text-text-muted",
              cell: (r) => `${r.velocityPerDay.toFixed(2)}/d`,
            },
            {
              key: "daysToStockout",
              header: "Days Left",
              align: "right",
              className: "tabular-nums font-semibold",
              cell: (r) => {
                const out = r.stockQty <= 0;
                return (
                  <span className={out ? "text-danger" : "text-text"}>
                    {out ? "—" : daysLabel(r.daysToStockout)}
                  </span>
                );
              },
            },
          ]}
        />
        )}
      </CardBody>
    </Card>
  );
}

export default StockoutRiskTable;
