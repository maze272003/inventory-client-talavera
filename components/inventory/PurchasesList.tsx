"use client";

import { useState } from "react";
import { usePaginatedQuery, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatPeso, formatDate } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  cn,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Icon,
  ResponsiveTable,
  Skeleton,
  SkeletonText,
  useToast,
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

export function PurchasesSkeleton() {
  return (
    <ul
      className="divide-y divide-border"
      aria-busy="true"
      aria-label="Loading purchases"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          aria-hidden="true"
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

function ArchivedPurchasesDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { success, error } = useToast();
  const { results, status, loadMore } = usePaginatedQuery(
    api.purchases.listArchivedPurchases,
    open ? {} : "skip",
    { initialNumItems: 20 },
  );
  const restore = useMutation(api.purchases.restore);
  const [toRestore, setToRestore] = useState<PurchaseRow | null>(null);
  const [restoring, setRestoring] = useState(false);

  const isFirstLoad = status === "LoadingFirstPage";

  async function handleRestore() {
    if (!toRestore) return;
    setRestoring(true);
    try {
      await restore({ id: toRestore._id });
      success(
        "Purchase restored",
        `${toRestore.supplierName} moved back to purchases.`,
      );
      setToRestore(null);
    } catch (e) {
      error(
        "Restore failed",
        e instanceof Error ? e.message : "Could not restore purchase.",
      );
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Archived purchases"
      description="Restore a purchase to bring it back to the main list."
      size="lg"
    >
      {isFirstLoad ? (
        <PurchasesSkeleton />
      ) : results.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="No archived purchases"
          description="Purchases you archive will appear here."
        />
      ) : (
        <ul className="divide-y divide-border">
          {(results as PurchaseRow[]).map((p) => (
            <li
              key={p._id}
              className="flex flex-col gap-3 px-cell py-row sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
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
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
                <Badge variant="neutral" className="figure-nums">
                  {formatPeso(p.total)}
                </Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  className="min-h-11 sm:min-h-0"
                  leftIcon={<Icon name="refresh" size={16} />}
                  disabled={restoring}
                  onClick={() => setToRestore(p)}
                >
                  Restore
                </Button>
              </div>
            </li>
          ))}
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

      <ConfirmDialog
        open={toRestore !== null}
        onClose={() => {
          if (!restoring) setToRestore(null);
        }}
        onConfirm={handleRestore}
        title="Restore purchase?"
        description={
          toRestore
            ? `This will move the purchase from ${toRestore.supplierName} back to the main purchases list.`
            : undefined
        }
        confirmLabel="Restore"
        loading={restoring}
      />
    </Dialog>
  );
}

export type PurchasesListProps = {
  /** Suppress the outer Card chrome when embedded in a modal (the Dialog provides the frame). */
  embedded?: boolean;
};

/**
 * Purchases history list with expandable details, archive/restore, and archived
 * purchases dialog. Designed to be embedded standalone (full page) or inside a
 * modal. No auth guard or PageHeader — the host handles those.
 */
export function PurchasesList({ embedded = false }: PurchasesListProps) {
  const { success, error } = useToast();
  const [expanded, setExpanded] = useState<Id<"purchases"> | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [toArchive, setToArchive] = useState<PurchaseRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  const archive = useMutation(api.purchases.archive);

  const { results, status, loadMore } = usePaginatedQuery(
    api.purchases.listPurchases,
    {},
    { initialNumItems: 20 },
  );

  async function handleArchive() {
    if (!toArchive) return;
    setArchiving(true);
    try {
      await archive({ id: toArchive._id });
      success("Purchase archived", `${toArchive.supplierName} moved to archive.`);
      setToArchive(null);
    } catch (e) {
      error(
        "Archive failed",
        e instanceof Error ? e.message : "Could not archive purchase.",
      );
    } finally {
      setArchiving(false);
    }
  }

  const isFirstLoad = status === "LoadingFirstPage";

  const toolbar = (
    <div className="mb-3 flex items-center justify-end">
      <Button
        variant="secondary"
        size="sm"
        leftIcon={<Icon name="box" size={16} />}
        onClick={() => setArchivedOpen(true)}
      >
        Archived purchases
      </Button>
    </div>
  );

  const body = isFirstLoad ? (
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
            <div className="flex flex-col gap-3 px-cell py-row sm:flex-row sm:items-center sm:justify-between sm:gap-4">
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
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
                <Badge variant="neutral" className="figure-nums">
                  {formatPeso(p.total)}
                </Badge>
                {p.fileUrl && (
                  <a
                    href={p.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Download PDF for purchase from ${p.supplierName}`}
                    className={cn(
                      "inline-flex h-11 items-center gap-2 rounded-md border border-transparent px-3 text-sm font-medium text-text transition-colors sm:h-9",
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
                  className="min-h-11 sm:min-h-0"
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
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-11 sm:min-h-0"
                  onClick={() => setToArchive(p)}
                  aria-label={`Archive purchase from ${p.supplierName}`}
                >
                  Archive
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
  );

  const loadMoreBar = (
    <>
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
    </>
  );

  return (
    <div>
      {toolbar}
      {embedded ? (
        <div className="rounded-lg border border-border overflow-hidden bg-surface">
          {body}
          {loadMoreBar}
        </div>
      ) : (
        <Card className="overflow-hidden">
          {body}
          {loadMoreBar}
        </Card>
      )}

      <ConfirmDialog
        open={toArchive !== null}
        onClose={() => {
          if (!archiving) setToArchive(null);
        }}
        onConfirm={handleArchive}
        title="Archive purchase?"
        description={
          toArchive
            ? `This will remove the purchase from ${toArchive.supplierName} from the main list. You can restore it later from Archived purchases.`
            : undefined
        }
        confirmLabel="Archive"
        loading={archiving}
      />

      <ArchivedPurchasesDialog
        open={archivedOpen}
        onClose={() => setArchivedOpen(false)}
      />
    </div>
  );
}

export default PurchasesList;
