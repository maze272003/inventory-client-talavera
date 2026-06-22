"use client";

import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatPeso, formatDate } from "@/lib/format";
import {
  Drawer,
  Badge,
  Button,
  Spinner,
  ResponsiveTable,
  EmptyState,
  Skeleton,
} from "@/components/ui";
import type { BadgeVariant } from "@/components/ui";

type Props = {
  open: boolean;
  productId?: Id<"products">;
  productName: string;
  onClose: () => void;
};

type LedgerRow = {
  _id: string;
  _creationTime: number;
  type: string;
  quantityDelta: number;
  balanceAfter: number;
  reason?: string | null;
  unitCost?: number | null;
};

const TYPE_LABELS: Record<string, string> = {
  sale: "Sale",
  stock_in: "Stock In",
  adjustment: "Adjustment",
};

const TYPE_VARIANTS: Record<string, BadgeVariant> = {
  sale: "danger",
  stock_in: "success",
  adjustment: "warning",
};

export default function LedgerDrawer({ open, productId, productName, onClose }: Props) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.inventory.ledgerForProduct,
    productId ? { productId } : "skip",
    { initialNumItems: 15 }
  );

  const isLoadingFirst = status === "LoadingFirstPage";
  const rows = results as LedgerRow[];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Ledger"
      description={productName}
      width="min(36rem, 100vw)"
    >
      {isLoadingFirst ? (
        <div className="space-y-row" aria-busy="true" aria-label="Loading ledger">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-cell">
              <Skeleton height={20} width={80} />
              <Skeleton height={16} width={40} />
              <Skeleton height={16} width={40} />
              <Skeleton height={12} width={90} />
            </div>
          ))}
        </div>
      ) : (
        <ResponsiveTable<LedgerRow>
          caption={`Stock ledger for ${productName}`}
          rows={rows}
          rowKey={(r) => r._id}
          columns={[
            {
              key: "type",
              header: "Type",
              cell: (r) => (
                <Badge variant={TYPE_VARIANTS[r.type] ?? "neutral"}>
                  {TYPE_LABELS[r.type] ?? r.type}
                </Badge>
              ),
            },
            {
              key: "delta",
              header: "Delta",
              align: "right",
              cell: (r) => (
                <span
                  className={`font-mono font-medium figure-nums ${
                    r.quantityDelta >= 0 ? "text-success-fg" : "text-danger-fg"
                  }`}
                >
                  {r.quantityDelta >= 0 ? "+" : ""}
                  {r.quantityDelta}
                </span>
              ),
            },
            {
              key: "balance",
              header: "Balance",
              align: "right",
              cell: (r) => (
                <span className="font-mono text-text figure-nums">{r.balanceAfter}</span>
              ),
            },
            {
              key: "note",
              header: "Note",
              cell: (r) => (
                <span className="text-text-muted">
                  {r.reason
                    ? r.reason
                    : r.unitCost != null
                      ? formatPeso(r.unitCost) + " /unit"
                      : "—"}
                </span>
              ),
            },
            {
              key: "date",
              header: "Date",
              cell: (r) => (
                <span className="text-text-muted whitespace-nowrap text-xs">
                  {formatDate(r._creationTime)}
                </span>
              ),
            },
          ]}
          empty={
            <EmptyState
              icon="receipt"
              title="No ledger entries"
              description="Stock movements for this product will appear here."
            />
          }
        />
      )}

      {status === "CanLoadMore" && (
        <div className="flex justify-center py-row">
          <Button variant="ghost" onClick={() => loadMore(15)}>
            Load more
          </Button>
        </div>
      )}
      {status === "LoadingMore" && (
        <div className="flex justify-center items-center gap-2 py-row text-sm text-text-muted">
          <Spinner size={16} />
          Loading more…
        </div>
      )}
    </Drawer>
  );
}
