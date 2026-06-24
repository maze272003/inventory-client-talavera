"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import StockInDialog from "@/components/StockInDialog";
import AdjustDialog from "@/components/AdjustDialog";
import LedgerDrawer from "@/components/LedgerDrawer";
import {
  PageHeader,
  Card,
  CardBody,
  CardHeader,
  Input,
  Button,
  Badge,
  Icon,
  ResponsiveTable,
  EmptyState,
  Skeleton,
  SkeletonText,
  Spinner,
  cn,
} from "@/components/ui";

type ProductDoc = {
  _id: Id<"products">;
  name: string;
  sku: string;
  category: string;
  costPrice: number;
  sellPrice: number;
  stockQty: number;
  reorderThreshold: number;
  isActive: boolean;
};

type DialogState =
  | { type: "stockIn"; product: ProductDoc }
  | { type: "adjust"; product: ProductDoc }
  | { type: "ledger"; product: ProductDoc }
  | null;

function ProductPickerAndActions() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState<string | undefined>(undefined);
  const [dialog, setDialog] = useState<DialogState>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = searchInput.trim();
      setSearch(trimmed !== "" ? trimmed : undefined);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const { results, status, loadMore } = usePaginatedQuery(
    api.products.list,
    { search },
    { initialNumItems: 20 }
  );

  function closeDialog() {
    setDialog(null);
  }

  const isLoadingFirst = status === "LoadingFirstPage";
  const rows = results as ProductDoc[];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-base font-semibold text-text flex items-center gap-2">
          <Icon name="box" size={18} className="text-primary" />
          Products
        </h2>
        <div className="relative w-full sm:w-72">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <Input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search products..."
            aria-label="Search products"
            className="pl-9"
          />
        </div>
      </div>

      <Card className="overflow-hidden shadow-sm">
        {isLoadingFirst ? (
          <CardBody>
            <div className="space-y-row" aria-busy="true" aria-label="Loading products">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-cell">
                  <div className="flex-1">
                    <Skeleton height={16} width="40%" />
                    <div className="mt-2">
                      <Skeleton height={12} width="25%" />
                    </div>
                  </div>
                  <Skeleton height={28} width={120} />
                </div>
              ))}
            </div>
          </CardBody>
        ) : (
          <ResponsiveTable<ProductDoc>
            caption="Products and stock actions"
            rows={rows}
            rowKey={(p) => p._id}
            columns={[
              {
                key: "name",
                header: "Product",
                cell: (p) => (
                  <div className="min-w-0">
                    <span className="font-medium text-text">
                      {p.name}
                    </span>
                    {!p.isActive && (
                      <span className="ml-2 text-xs text-text-muted">(inactive)</span>
                    )}
                  </div>
                ),
              },
              {
                key: "category",
                header: "Category",
                cell: (p) => (
                  <Badge variant="neutral">{p.category}</Badge>
                ),
              },
              {
                key: "sku",
                header: "SKU",
                cell: (p) => (
                  <span className="font-mono text-xs text-text-muted">{p.sku}</span>
                ),
              },
              {
                key: "stock",
                header: "Stock",
                align: "right",
                cell: (p) => {
                  const isOut = p.stockQty <= 0;
                  const isLow = !isOut && p.stockQty <= p.reorderThreshold;
                  return (
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      <span
                        className={cn(
                          "font-semibold tabular-nums",
                          isOut ? "text-danger-fg" : isLow ? "text-warning-fg" : "text-text"
                        )}
                      >
                        {p.stockQty}
                      </span>
                      {isOut && <Badge variant="danger">Out</Badge>}
                      {isLow && <Badge variant="warning">Low</Badge>}
                    </div>
                  );
                },
              },
              {
                key: "actions",
                header: "Actions",
                align: "center",
                hideLabelOnCard: true,
                cell: (p) => (
                  <div className="flex flex-wrap gap-2 md:justify-center">
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={<Icon name="plus" className="w-4 h-4" />}
                      onClick={() => setDialog({ type: "stockIn", product: p })}
                    >
                      Stock In
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={<Icon name="sliders" className="w-4 h-4" />}
                      onClick={() => setDialog({ type: "adjust", product: p })}
                    >
                      Adjust
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      leftIcon={<Icon name="history" className="w-4 h-4" />}
                      onClick={() => setDialog({ type: "ledger", product: p })}
                    >
                      Ledger
                    </Button>
                  </div>
                ),
              },
            ]}
            empty={
              <EmptyState
                icon="package"
                title="No products found"
                description={
                  search
                    ? "Try a different search term."
                    : "No products are available yet."
                }
              />
            }
          />
        )}

        {status === "CanLoadMore" && (
          <div className="flex justify-center py-row border-t border-border">
            <Button variant="ghost" onClick={() => loadMore(20)}>
              Load more
            </Button>
          </div>
        )}
        {status === "LoadingMore" && (
          <div className="flex justify-center items-center gap-2 py-row text-sm text-text-muted border-t border-border">
            <Spinner size={16} />
            Loading more…
          </div>
        )}
      </Card>

      <StockInDialog
        key={dialog?.type === "stockIn" ? `stockIn-${dialog.product._id}` : "stockIn"}
        open={dialog?.type === "stockIn"}
        productId={dialog?.type === "stockIn" ? dialog.product._id : undefined}
        productName={dialog?.type === "stockIn" ? dialog.product.name : ""}
        onClose={closeDialog}
      />
      <AdjustDialog
        key={dialog?.type === "adjust" ? `adjust-${dialog.product._id}` : "adjust"}
        open={dialog?.type === "adjust"}
        productId={dialog?.type === "adjust" ? dialog.product._id : undefined}
        productName={dialog?.type === "adjust" ? dialog.product.name : ""}
        currentQty={dialog?.type === "adjust" ? dialog.product.stockQty : 0}
        onClose={closeDialog}
      />
      <LedgerDrawer
        key={dialog?.type === "ledger" ? `ledger-${dialog.product._id}` : "ledger"}
        open={dialog?.type === "ledger"}
        productId={dialog?.type === "ledger" ? dialog.product._id : undefined}
        productName={dialog?.type === "ledger" ? dialog.product.name : ""}
        onClose={closeDialog}
      />
    </div>
  );
}

function LowStockSection() {
  const lowStock = useQuery(api.products.lowStock, {});

  if (lowStock === undefined) {
    return (
      <div className="mb-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Skeleton height={32} width={32} rounded />
              <Skeleton height={20} width={160} />
            </div>
          </CardHeader>
          <CardBody>
            <SkeletonText lines={2} />
          </CardBody>
        </Card>
      </div>
    );
  }

  if (lowStock.length === 0) return null;

  return (
    <div className="mb-6">
      <Card className="overflow-hidden border-danger-fg/30 shadow-sm">
        <CardHeader className="bg-danger-bg/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger-bg text-danger-fg">
              <Icon name="alert-triangle" size={18} />
            </span>
            <h2 className="text-base font-semibold text-text truncate">
              Low Stock Alerts
            </h2>
            <Badge variant="danger" className="tabular-nums">
              {lowStock.length}
            </Badge>
          </div>
          <Link
            href="/inventory/import"
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border bg-surface px-3 text-sm font-medium text-text shadow-sm transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <Icon name="truck" size={16} />
            <span className="hidden sm:inline">Restock</span>
          </Link>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {lowStock.map((product) => {
              const isOut = product.stockQty <= 0;
              return (
                <div
                  key={product._id}
                  className={cn(
                    "bg-surface rounded-lg border px-cell py-row flex items-center justify-between gap-3 transition-shadow hover:shadow-sm",
                    isOut ? "border-danger-fg/30" : "border-border"
                  )}
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        isOut ? "bg-danger-bg text-danger-fg" : "bg-warning-bg text-warning-fg"
                      )}
                    >
                      <Icon name="package" size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text truncate">
                        {product.name}
                      </p>
                      <p className="text-xs text-text-muted font-mono truncate">
                        {product.sku}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-base font-bold text-danger-fg tabular-nums">
                      {product.stockQty}
                    </p>
                    <p className="text-xs text-text-muted">
                      of <span className="tabular-nums">{product.reorderThreshold}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export default function InventoryPage() {
  const currentUser = useQuery(api.users.currentUser);

  if (currentUser === undefined) {
    return (
      <div>
        <PageHeader title="Inventory" subtitle="Stock levels & movements" icon="boxes" />
        <div className="space-y-6">
          <Card>
            <CardBody>
              <SkeletonText lines={2} />
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <SkeletonText lines={6} />
            </CardBody>
          </Card>
        </div>
      </div>
    );
  }

  if (currentUser?.role !== "admin") {
    return (
      <div>
        <PageHeader title="Inventory" subtitle="Stock levels & movements" icon="boxes" />
        <EmptyState
          icon="shield"
          title="Admins only"
          description="You do not have permission to view inventory management."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Inventory" subtitle="Stock levels & movements" icon="boxes" />
      <LowStockSection />
      <ProductPickerAndActions />
    </div>
  );
}
