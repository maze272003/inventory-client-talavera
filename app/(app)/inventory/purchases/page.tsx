"use client";

import { useState } from "react";
import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatPeso, formatDate } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  cn,
  EmptyState,
  Icon,
  PageHeader,
  ResponsiveTable,
  Skeleton,
  SkeletonText,
} from "@/components/ui";

type PurchaseRow = {
  _id: Id<"purchases">;
  supplierName: string;
  purchaseDate: number;
  referenceNumber?: string;
  itemCount: number;
  total: number;
  fileUrl?: string | null;
};

function PurchaseDetails({ purchaseId }: { purchaseId: Id<"purchases"> }) {
  const data = useQuery(api.purchases.getPurchase, { purchaseId });

  if (data === undefined) {
    return (
      <div className="bg-surface-2 border-t border-border p-cell">
        <SkeletonText lines={3} />
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="bg-surface-2 border-t border-border px-cell py-row">
        <p className="text-xs text-text-muted">Details unavailable.</p>
      </div>
    );
  }
  if (data.ledgerRows.length === 0) {
    return (
      <div className="bg-surface-2 border-t border-border p-cell">
        <EmptyState
          icon="receipt"
          title="No ledger rows"
          description="This purchase has no associated stock movements."
        />
      </div>
    );
  }

  return (
    <div className="bg-surface-2 border-t border-border p-cell">
      <ResponsiveTable
        rows={data.ledgerRows}
        rowKey={(r) => r._id}
        caption="Stock ledger rows for this purchase"
        columns={[
          {
            key: "type",
            header: "Type",
            cell: (r) => <span className="text-text">{r.type}</span>,
          },
          {
            key: "qty",
            header: "Qty",
            align: "right",
            cell: (r) => (
              <span className="figure-nums text-text">{r.quantityDelta}</span>
            ),
          },
          {
            key: "unitCost",
            header: "Unit cost",
            align: "right",
            cell: (r) => (
              <span className="figure-nums text-text">
                {r.unitCost !== undefined ? formatPeso(r.unitCost) : "—"}
              </span>
            ),
          },
          {
            key: "balanceAfter",
            header: "Balance after",
            align: "right",
            cell: (r) => (
              <span className="figure-nums text-text">{r.balanceAfter}</span>
            ),
          },
        ]}
      />
    </div>
  );
}

function PurchasesSkeleton() {
  return (
    <ul className="divide-y divide-border" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="flex items-center justify-between gap-4 px-cell py-row"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton height={16} width="40%" />
            <Skeleton height={12} width="60%" />
          </div>
          <Skeleton height={20} width={80} />
        </li>
      ))}
    </ul>
  );
}

export default function PurchasesPage() {
  const currentUser = useQuery(api.users.currentUser);
  const [expanded, setExpanded] = useState<Id<"purchases"> | null>(null);

  const { results, status, loadMore } = usePaginatedQuery(
    api.purchases.listPurchases,
    {},
    { initialNumItems: 20 },
  );

  if (currentUser === undefined) {
    return (
      <div>
        <PageHeader title="Purchases" />
        <Card className="mt-6">
          <PurchasesSkeleton />
        </Card>
      </div>
    );
  }

  if (currentUser?.role !== "admin") {
    return (
      <div>
        <PageHeader title="Purchases" />
        <Card className="mt-6">
          <EmptyState
            icon="alert-triangle"
            title="Admins only"
            description="You do not have permission to view purchase records."
          />
        </Card>
      </div>
    );
  }

  const isFirstLoad = status === "LoadingFirstPage";

  return (
    <div>
      <PageHeader
        title="Purchases"
        subtitle={
          !isFirstLoad
            ? `${results.length} purchase${results.length === 1 ? "" : "s"}`
            : undefined
        }
      />

      <Card className="mt-6 overflow-hidden">
        {isFirstLoad ? (
          <PurchasesSkeleton />
        ) : results.length === 0 ? (
          <EmptyState
            icon="receipt"
            title="No purchases yet"
            description="Recorded supplier purchases will appear here."
          />
        ) : (
          <ul className="divide-y divide-border">
            {(results as PurchaseRow[]).map((p) => {
              const isOpen = expanded === p._id;
              return (
                <li key={p._id}>
                  <div className="flex items-center justify-between gap-4 px-cell py-row">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text">
                        {p.supplierName}
                      </p>
                      <p className="text-xs text-text-muted">
                        {formatDate(p.purchaseDate)}
                        {p.referenceNumber ? ` · Ref ${p.referenceNumber}` : ""} ·{" "}
                        {p.itemCount} unit{p.itemCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                      <Badge variant="neutral" className="figure-nums">
                        {formatPeso(p.total)}
                      </Badge>
                      {p.fileUrl && (
                        <a
                          href={p.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "inline-flex h-9 items-center gap-2 rounded-md border border-transparent px-3 text-sm font-medium text-text transition-colors",
                            "hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                          )}
                        >
                          <Icon name="download" size={16} />
                          PDF
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpanded(isOpen ? null : p._id)}
                        aria-expanded={isOpen}
                        aria-controls={`purchase-details-${p._id}`}
                        rightIcon={
                          <Icon
                            name={isOpen ? "chevron-up" : "chevron-down"}
                            size={16}
                          />
                        }
                      >
                        {isOpen ? "Hide" : "Details"}
                      </Button>
                    </div>
                  </div>
                  {isOpen && (
                    <div
                      id={`purchase-details-${p._id}`}
                      role="region"
                      aria-label={`Details for ${p.supplierName}`}
                    >
                      <PurchaseDetails purchaseId={p._id} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {status === "CanLoadMore" && (
          <div className="flex justify-center border-t border-border py-row">
            <Button variant="secondary" size="sm" onClick={() => loadMore(20)}>
              Load more
            </Button>
          </div>
        )}
        {status === "LoadingMore" && (
          <div className="flex justify-center border-t border-border py-row">
            <Button variant="ghost" size="sm" loading disabled>
              Loading
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
