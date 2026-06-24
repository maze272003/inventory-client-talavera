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
            className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
          >
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="flex flex-col gap-2 p-3">
              <Skeleton height={12} width="90%" />
              <Skeleton height={11} width="50%" />
              <Skeleton height={16} width="60%" />
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
          const lowStock =
            product.stockQty > 0 && product.stockQty <= product.reorderThreshold;

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
                "group relative flex flex-col overflow-hidden rounded-xl border text-left transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                outOfStock
                  ? "cursor-not-allowed border-border bg-surface-2 opacity-60"
                  : "cursor-pointer border-border bg-surface shadow-sm hover:-translate-y-0.5 hover:border-primary hover:shadow-md motion-reduce:transform-none",
              ].join(" ")}
            >
              <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-brand-gradient-soft">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
                  />
                ) : (
                  <Icon name="package" size={36} className="text-text-subtle opacity-60" />
                )}
                {!outOfStock && (
                  <span
                    aria-hidden
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-fg opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none"
                  >
                    <Icon name="plus" size={18} />
                  </span>
                )}
                {outOfStock && (
                  <span className="absolute inset-0 flex items-center justify-center bg-surface/40">
                    <Badge variant="danger" className="shadow-sm">
                      Out of stock
                    </Badge>
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-1 p-3">
                <p className="line-clamp-2 text-sm font-semibold leading-tight text-text">
                  {product.name}
                </p>
                <p className="truncate text-[11px] text-text-muted">
                  SKU {product.sku}
                </p>
                <div className="mt-auto flex items-end justify-between gap-2 pt-1">
                  <span className="text-base font-bold tabular-nums text-primary">
                    {formatPeso(product.sellPrice)}
                  </span>
                  {!outOfStock &&
                    (lowStock ? (
                      <Badge variant="warning">Stock: {product.stockQty}</Badge>
                    ) : (
                      <Badge variant="success">
                        Stock: {product.stockQty}
                      </Badge>
                    ))}
                </div>
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
