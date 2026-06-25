"use client";

import type { SnapshotResult } from "@/convex/inventoryHealth";
import { formatPeso } from "@/lib/format";
import { Badge, Card, CardBody, CardHeader, EmptyState, Icon, ResponsiveTable, Skeleton } from "@/components/ui";

export type ReorderSuggestionsProps = {
  rows: SnapshotResult["reorderSuggestions"];
  loading?: boolean;
};

/** Display-only reorder suggestions for at-risk products. No action controls. */
export function ReorderSuggestions({ rows, loading }: ReorderSuggestionsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-info-bg text-info">
            <Icon name="truck" size={16} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-text">Reorder Suggestions</h2>
            <p className="text-xs text-text-muted">From 30-day velocity · display only</p>
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
            caption="Reorder suggestions"
            rows={rows}
            rowKey={(r) => r.productId}
            empty={
            <EmptyState
              icon="truck"
              title="Nothing to reorder"
              description="No at-risk products need replenishment right now."
            />
          }
          columns={[
            {
              key: "product",
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
              key: "suggestedReorderQty",
              header: "Suggested Qty",
              align: "right",
              className: "tabular-nums",
              cell: (r) =>
                r.suggestedReorderQty === 0 ? (
                  <span className="text-text-subtle">—</span>
                ) : (
                  <Badge variant="primary">
                    <span className="tabular-nums">{Math.round(r.suggestedReorderQty)}</span>
                  </Badge>
                ),
            },
            {
              key: "currentStockQty",
              header: "In Stock",
              align: "right",
              className: "tabular-nums text-text-muted",
              cell: (r) => r.currentStockQty,
            },
            {
              key: "lastSupplierName",
              header: "Last Supplier",
              align: "left",
              className: "text-text-muted",
              cell: (r) => r.lastSupplierName ?? "—",
            },
            {
              key: "lastUnitCost",
              header: "Last Cost",
              align: "right",
              className: "tabular-nums text-text-muted",
              cell: (r) => (r.lastUnitCost !== null ? formatPeso(r.lastUnitCost) : "—"),
            },
          ]}
        />
        )}
      </CardBody>
    </Card>
  );
}

export default ReorderSuggestions;
