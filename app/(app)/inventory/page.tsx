"use client";

import { useState, useEffect, useRef } from "react";
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
  Input,
  Button,
  Badge,
  ResponsiveTable,
  EmptyState,
  Skeleton,
  SkeletonText,
  Spinner,
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

  return (
    <div>
      <h2 className="text-base font-semibold text-text mb-3">Products</h2>

      <div className="mb-3 max-w-sm">
        <Input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search products..."
          aria-label="Search products"
        />
      </div>

      <Card className="overflow-hidden">
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
            rows={results as ProductDoc[]}
            rowKey={(p) => p._id}
            columns={[
              {
                key: "name",
                header: "Product",
                cell: (p) => (
                  <span className="font-medium text-text">
                    {p.name}
                    {!p.isActive && (
                      <span className="ml-2 text-xs text-text-muted">(inactive)</span>
                    )}
                  </span>
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
                  const isLowStock = p.stockQty <= p.reorderThreshold;
                  return (
                    <span className="inline-flex items-center gap-2 justify-end">
                      <span
                        className={`figure-nums font-medium ${
                          isLowStock ? "text-danger-fg" : "text-text"
                        }`}
                      >
                        {p.stockQty}
                      </span>
                      {isLowStock && <Badge variant="danger">Low</Badge>}
                    </span>
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
                      onClick={() => setDialog({ type: "stockIn", product: p })}
                    >
                      Stock In
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setDialog({ type: "adjust", product: p })}
                    >
                      Adjust
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
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

      {/* Dialogs */}
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
        <div className="flex items-center gap-2 mb-3">
          <Skeleton height={20} width={160} />
        </div>
        <Card>
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
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold text-text">Low Stock Alerts</h2>
        <Badge variant="danger">{lowStock.length}</Badge>
      </div>
      <div className="rounded-xl border border-danger-fg/30 bg-danger-bg p-cell">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {lowStock.map((product) => (
            <div
              key={product._id}
              className="bg-surface rounded-lg border border-border px-cell py-row flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-text truncate">{product.name}</p>
                <p className="text-xs text-text-muted font-mono truncate">{product.sku}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-danger-fg figure-nums">
                  {product.stockQty}
                </p>
                <p className="text-xs text-text-muted">
                  threshold: <span className="figure-nums">{product.reorderThreshold}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const currentUser = useQuery(api.users.currentUser);

  if (currentUser === undefined) {
    return (
      <div>
        <PageHeader title="Inventory" />
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
        <PageHeader title="Inventory" />
        <EmptyState
          icon="info"
          title="Admins only"
          description="You do not have permission to view inventory management."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Inventory" subtitle="Manage stock levels and movements" />
      <LowStockSection />
      <ProductPickerAndActions />
    </div>
  );
}
