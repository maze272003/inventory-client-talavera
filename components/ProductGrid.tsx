"use client";

import { useEffect, useRef } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CartItem } from "@/components/ProductSearch";
import { formatPeso } from "@/lib/format";
import { Button, Badge, Skeleton, EmptyState, Icon } from "@/components/ui";

type Props = {
  search: string;
  category?: string;
  stockFilter?: "all" | "inStock" | "low" | "out";
  onAdd: (item: CartItem) => void;
};

export default function ProductGrid({ search, category, stockFilter, onAdd }: Props) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.products.list,
    {
      search: search.trim() || undefined,
      category: category || undefined,
      stockFilter: stockFilter ?? "all",
      activeOnly: true,
    },
    { initialNumItems: 24 },
  );

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && status === "CanLoadMore") loadMore(24);
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [status, loadMore]);

  if (status === "LoadingFirstPage") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface"
          >
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="flex flex-col gap-2 p-2">
              <Skeleton height={12} width="90%" />
              <Skeleton height={14} width="40%" />
              <Skeleton height={16} width="55%" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <EmptyState
        icon="package"
        title={
          search.trim()
            ? `No products found for "${search.trim()}"`
            : "No products available"
        }
        description={
          search.trim()
            ? "Try a different name or scan a barcode above."
            : "Add products in the inventory section to sell them here."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {results.map((product) => {
          const outOfStock = product.stockQty <= 0;
          const lowStock = product.stockQty > 0 && product.stockQty <= product.reorderThreshold;

          return (
            <button
              key={product._id}
              type="button"
              disabled={outOfStock}
              onClick={() =>
                onAdd({
                  productId: product._id,
                  name: product.name,
                  sku: product.sku,
                  sellPrice: product.sellPrice,
                  stockQty: product.stockQty,
                  quantity: 1,
                })
              }
              aria-label={`Add ${product.name} to cart, ${formatPeso(product.sellPrice)}${
                outOfStock ? ", out of stock" : ""
              }`}
              className={[
                "flex flex-col overflow-hidden rounded-xl border text-left transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                outOfStock
                  ? "cursor-not-allowed border-border bg-surface-2 opacity-50"
                  : "cursor-pointer border-border bg-surface hover:border-primary hover:shadow-md active:scale-[0.98] motion-reduce:active:scale-100",
              ].join(" ")}
            >
              {/* Product image */}
              <div className="flex aspect-square w-full items-center justify-center overflow-hidden bg-surface-2">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Icon name="package" size={36} className="text-text-muted opacity-50" />
                )}
              </div>

              {/* Product info */}
              <div className="flex flex-1 flex-col gap-1 p-2">
                <p className="line-clamp-2 text-xs font-semibold leading-tight text-text">
                  {product.name}
                </p>
                {product.model && (
                  <p className="truncate text-xs text-text-muted">{product.model}</p>
                )}
                <p className="truncate text-[11px] text-text-muted">SKU {product.sku}</p>
                {product.nextBatchNumber && (
                  <p className="truncate text-[11px] font-medium text-text-muted">
                    Batch {product.nextBatchNumber}
                    {product.activeBatchCount > 1 ? ` ·${product.activeBatchCount}` : ""}
                  </p>
                )}
                <p className="mt-auto text-sm font-bold tabular-nums text-primary">
                  {formatPeso(product.sellPrice)}
                </p>

                {/* Stock badge */}
                {outOfStock ? (
                  <Badge variant="danger">Out of stock</Badge>
                ) : lowStock ? (
                  <Badge variant="warning">Stock: {product.stockQty}</Badge>
                ) : (
                  <Badge variant="success">Stock: {product.stockQty}</Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div ref={sentinelRef} aria-hidden className="h-1" />
      {status === "LoadingMore" && (
        <div className="flex justify-center py-2">
          <Button variant="secondary" loading disabled>Loading</Button>
        </div>
      )}
      {status === "CanLoadMore" && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => loadMore(24)}>Load more</Button>
        </div>
      )}
    </div>
  );
}
