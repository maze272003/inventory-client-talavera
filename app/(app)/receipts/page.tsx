"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
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
  Icon,
  type Column,
} from "@/components/ui";

type ReceiptRow = {
  _id: string;
  _creationTime: number;
  receiptNumber: number;
  itemCount: number;
  cashierName: string;
  total: number;
};

export default function ReceiptsPage() {
  const router = useRouter();
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

  const columns: Column<ReceiptRow>[] = [
    {
      key: "receiptNumber",
      header: "Receipt",
      cell: (sale) => (
        <span className="font-semibold text-primary tabular-nums">
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

  return (
    <div>
      <PageHeader
        title="Receipts"
        subtitle="Browse and search past sales"
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
    </div>
  );
}
