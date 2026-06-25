"use client";

import type { AgingBandKey } from "@/convex/lib/inventoryHealth";
import type { SnapshotResult } from "@/convex/inventoryHealth";
import { formatPeso, formatDate } from "@/lib/format";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Icon,
  ResponsiveTable,
  Skeleton,
  cn,
} from "@/components/ui";

export type DeadStockTableProps = {
  rows: SnapshotResult["deadStock"];
  loading?: boolean;
};

const BAND_META: Record<AgingBandKey, { label: string; sub: string }> = {
  "30": { label: "30–90 days", sub: "Slow movers" },
  "90": { label: "90–180 days", sub: "Very slow" },
  "180": { label: "180+ days", sub: "Likely dead" },
};

/** On-hand batches grouped by aging band, worst first. */
export function DeadStockTable({ rows, loading }: DeadStockTableProps) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-bg text-warning">
              <Icon name="clock" size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-text">Dead Stock</h2>
              <p className="text-xs text-text-muted">Batches untouched 30+ days</p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height={20} />
            ))}
          </div>
        </CardBody>
      </Card>
    );
  }

  const bands: AgingBandKey[] = ["180", "90", "30"];
  const grouped: Record<AgingBandKey, SnapshotResult["deadStock"]> = { "180": [], "90": [], "30": [] };
  for (const r of rows) grouped[r.band].push(r);
  const bandValue = (b: AgingBandKey) => grouped[b].reduce((s, r) => s + r.cashValue, 0);

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success-bg text-success">
              <Icon name="check-circle" size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-text">Dead Stock</h2>
              <p className="text-xs text-text-muted">Batches untouched 30+ days</p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <EmptyState
            icon="check-circle"
            title="No dead stock"
            description="Every on-hand batch has moved in the last 30 days."
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {bands.map((b) => {
        const list = grouped[b];
        if (list.length === 0) return null;
        const meta = BAND_META[b];
        return (
          <Card key={b}>
            <CardHeader>
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-bg text-warning">
                  <Icon name="clock" size={16} />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-text">{meta.label}</h2>
                  <p className="text-xs text-text-muted">{meta.sub}</p>
                </div>
              </div>
              <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-medium text-text-muted tabular-nums">
                {formatPeso(bandValue(b))}
              </span>
            </CardHeader>
            <CardBody>
              <ResponsiveTable
                caption={`Dead stock aged ${meta.label}`}
                rows={list}
                rowKey={(r) => r.batchId}
                columns={[
                  {
                    key: "product",
                    header: "Product",
                    align: "left",
                    className: "font-medium text-text",
                    cell: (r) => (
                      <div className="min-w-0">
                        <div className="truncate">{r.productName}</div>
                        <div className="text-xs text-text-muted">{r.batchNumber}</div>
                      </div>
                    ),
                  },
                  {
                    key: "qtyRemaining",
                    header: "Qty",
                    align: "right",
                    className: "tabular-nums text-text-muted",
                    cell: (r) => r.qtyRemaining,
                  },
                  {
                    key: "unitCost",
                    header: "Unit Cost",
                    align: "right",
                    className: "tabular-nums text-text-muted",
                    cell: (r) => formatPeso(r.unitCost),
                  },
                  {
                    key: "cashValue",
                    header: "Cash Tied Up",
                    align: "right",
                    className: "tabular-nums font-semibold text-text",
                    cell: (r) => formatPeso(r.cashValue),
                  },
                  {
                    key: "lastMovement",
                    header: "Last Movement",
                    align: "right",
                    className: "tabular-nums text-text-muted",
                    cell: (r) => (
                      <span className={cn(b === "180" && "text-danger")}>
                        {formatDate(r.lastMovementMs)}
                      </span>
                    ),
                  },
                ]}
                empty={undefined}
              />
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

export default DeadStockTable;
