"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatPeso, formatDate } from "@/lib/format";
import {
  PageHeader,
  Card,
  CardBody,
  Field,
  Input,
  Button,
  Badge,
  Skeleton,
  SkeletonText,
  EmptyState,
  ResponsiveTable,
  Dialog,
  ConfirmDialog,
  Icon,
  useToast,
  type Column,
} from "@/components/ui";

type ReceiptRow = {
  _id: Id<"sales">;
  _creationTime: number;
  receiptNumber: number;
  itemCount: number;
  cashierName: string;
  total: number;
};

export default function ReceiptsPage() {
  const router = useRouter();
  const { success, error } = useToast();
  const currentUser = useQuery(api.users.currentUser);
  const isAdmin = currentUser?.role === "admin";

  const [searchInput, setSearchInput] = useState("");

  // Parse a positive integer from the search input, or undefined to list all
  const searchNum = (() => {
    const n = parseInt(searchInput.trim(), 10);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  })();

  const { results, status, loadMore } = usePaginatedQuery(
    api.sales.listReceipts,
    searchNum !== undefined ? { receiptNumber: searchNum } : {},
    { initialNumItems: 20 }
  );

  const isLoadingFirstPage = status === "LoadingFirstPage";
  const isEmpty = results.length === 0 && status === "Exhausted";

  // Archive flow
  const archiveSale = useMutation(api.sales.archive);
  const [toArchive, setToArchive] = useState<ReceiptRow | null>(null);
  const [archiving, setArchiving] = useState(false);

  async function confirmArchive() {
    if (!toArchive) return;
    setArchiving(true);
    try {
      await archiveSale({ saleId: toArchive._id });
      success(
        "Receipt archived",
        `Receipt #${toArchive.receiptNumber} moved to archive.`
      );
      setToArchive(null);
    } catch (e) {
      error(
        "Couldn’t archive receipt",
        e instanceof Error ? e.message : "Please try again."
      );
    } finally {
      setArchiving(false);
    }
  }

  // Archived receipts dialog
  const [archivedOpen, setArchivedOpen] = useState(false);

  const columns: Column<ReceiptRow>[] = [
    {
      key: "receiptNumber",
      header: "Receipt",
      cell: (sale) => (
        <span className="font-semibold text-primary figure-nums">
          #{sale.receiptNumber}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      cell: (sale) => (
        <span className="text-text-muted">{formatDate(sale._creationTime)}</span>
      ),
    },
    {
      key: "cashier",
      header: "Cashier",
      cell: (sale) => <span className="text-text">{sale.cashierName}</span>,
    },
    {
      key: "items",
      header: "Items",
      align: "center",
      cell: (sale) => (
        <Badge variant="neutral">
          {sale.itemCount} {sale.itemCount === 1 ? "item" : "items"}
        </Badge>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      cell: (sale) => (
        <span className="font-semibold text-text figure-nums">
          {formatPeso(sale.total)}
        </span>
      ),
    },
  ];

  // Admins get an Archive action column.
  if (isAdmin) {
    columns.push({
      key: "actions",
      header: "",
      align: "right",
      hideLabelOnCard: true,
      cell: (sale) => (
        <Button
          variant="ghost"
          size="sm"
          leftIcon={<Icon name="package" size={16} />}
          onClick={(e) => {
            e.stopPropagation();
            setToArchive(sale);
          }}
          aria-label={`Archive receipt #${sale.receiptNumber}`}
        >
          Archive
        </Button>
      ),
    });
  }

  return (
    <div>
      <PageHeader
        title="Receipts"
        subtitle="Browse and search past sales"
        actions={
          isAdmin ? (
            <Button
              variant="secondary"
              leftIcon={<Icon name="package" size={16} />}
              onClick={() => setArchivedOpen(true)}
            >
              Archived receipts
            </Button>
          ) : undefined
        }
      />

      {/* Search */}
      <Card className="mb-6">
        <CardBody>
          <Field
            label="Search by receipt number"
            hint="Enter a receipt number to filter, or leave blank to list all."
            className="max-w-xs"
          >
            <Input
              type="text"
              inputMode="numeric"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Enter receipt number…"
              aria-label="Search by receipt number"
            />
          </Field>
        </CardBody>
      </Card>

      {/* List */}
      {isLoadingFirstPage ? (
        <Card>
          <CardBody>
            <div className="space-y-4" aria-busy="true" aria-live="polite">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 border-b border-border py-row last:border-0"
                >
                  <Skeleton height={18} width="20%" />
                  <Skeleton height={14} width="25%" />
                  <Skeleton height={14} width="20%" />
                  <Skeleton height={18} width="15%" />
                </div>
              ))}
              <span className="sr-only">Loading receipts…</span>
            </div>
          </CardBody>
        </Card>
      ) : isEmpty ? (
        <EmptyState
          icon="receipt"
          title="No receipts found"
          description={
            searchNum !== undefined
              ? `No receipt matches #${searchNum}. Try a different number.`
              : "Completed sales will appear here once you ring up an order."
          }
          action={
            searchNum !== undefined ? (
              <Button variant="secondary" onClick={() => setSearchInput("")}>
                Clear search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ResponsiveTable<ReceiptRow>
            caption="Receipts"
            rows={results as ReceiptRow[]}
            rowKey={(sale) => sale._id}
            columns={columns}
            onRowClick={(sale) => router.push(`/receipts/${sale._id}`)}
          />

          {/* Load more */}
          {status === "CanLoadMore" && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="secondary"
                onClick={() => loadMore(20)}
                leftIcon={<Icon name="chevron-down" size={16} />}
              >
                Load more
              </Button>
            </div>
          )}
          {status === "LoadingMore" && (
            <div className="mt-6" aria-busy="true" aria-live="polite">
              <SkeletonText lines={2} />
              <span className="sr-only">Loading more receipts…</span>
            </div>
          )}
        </>
      )}

      {/* Archive confirmation */}
      <ConfirmDialog
        open={toArchive !== null}
        onClose={() => {
          if (!archiving) setToArchive(null);
        }}
        onConfirm={confirmArchive}
        title="Archive this receipt?"
        description={
          toArchive
            ? `Receipt #${toArchive.receiptNumber} (${formatPeso(
                toArchive.total
              )}) will be hidden from the receipts list. You can restore it later from Archived receipts.`
            : undefined
        }
        confirmLabel="Archive"
        loading={archiving}
      />

      {/* Archived receipts */}
      {isAdmin && (
        <ArchivedReceiptsDialog
          open={archivedOpen}
          onClose={() => setArchivedOpen(false)}
        />
      )}
    </div>
  );
}

function ArchivedReceiptsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const restoreSale = useMutation(api.sales.restore);
  const [restoringId, setRestoringId] = useState<Id<"sales"> | null>(null);

  const { results, status, loadMore } = usePaginatedQuery(
    api.sales.listArchivedReceipts,
    open ? {} : "skip",
    { initialNumItems: 20 }
  );

  const isLoadingFirstPage = status === "LoadingFirstPage";
  const isEmpty = results.length === 0 && status === "Exhausted";

  async function handleRestore(sale: ReceiptRow) {
    setRestoringId(sale._id);
    try {
      await restoreSale({ saleId: sale._id });
      success(
        "Receipt restored",
        `Receipt #${sale.receiptNumber} is back in the receipts list.`
      );
    } catch (e) {
      error(
        "Couldn’t restore receipt",
        e instanceof Error ? e.message : "Please try again."
      );
    } finally {
      setRestoringId(null);
    }
  }

  const columns: Column<ReceiptRow>[] = [
    {
      key: "receiptNumber",
      header: "Receipt",
      cell: (sale) => (
        <button
          type="button"
          onClick={() => router.push(`/receipts/${sale._id}`)}
          className="font-semibold text-primary figure-nums hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          #{sale.receiptNumber}
        </button>
      ),
    },
    {
      key: "date",
      header: "Date",
      cell: (sale) => (
        <span className="text-text-muted">{formatDate(sale._creationTime)}</span>
      ),
    },
    {
      key: "cashier",
      header: "Cashier",
      cell: (sale) => <span className="text-text">{sale.cashierName}</span>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      cell: (sale) => (
        <span className="font-semibold text-text figure-nums">
          {formatPeso(sale.total)}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      hideLabelOnCard: true,
      cell: (sale) => (
        <Button
          variant="secondary"
          size="sm"
          loading={restoringId === sale._id}
          leftIcon={<Icon name="refresh" size={16} />}
          onClick={() => handleRestore(sale)}
          aria-label={`Restore receipt #${sale.receiptNumber}`}
        >
          Restore
        </Button>
      ),
    },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Archived receipts"
      description="Receipts hidden from the main list. Restore one to bring it back."
      size="lg"
    >
      {isLoadingFirstPage ? (
        <div className="space-y-4" aria-busy="true" aria-live="polite">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 border-b border-border py-row last:border-0"
            >
              <Skeleton height={18} width="20%" />
              <Skeleton height={14} width="25%" />
              <Skeleton height={18} width="15%" />
            </div>
          ))}
          <span className="sr-only">Loading archived receipts…</span>
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon="package"
          title="No archived receipts"
          description="Receipts you archive will appear here."
        />
      ) : (
        <>
          <ResponsiveTable<ReceiptRow>
            caption="Archived receipts"
            rows={results as ReceiptRow[]}
            rowKey={(sale) => sale._id}
            columns={columns}
          />

          {status === "CanLoadMore" && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="secondary"
                onClick={() => loadMore(20)}
                leftIcon={<Icon name="chevron-down" size={16} />}
              >
                Load more
              </Button>
            </div>
          )}
          {status === "LoadingMore" && (
            <div className="mt-6" aria-busy="true" aria-live="polite">
              <SkeletonText lines={2} />
              <span className="sr-only">Loading more archived receipts…</span>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
