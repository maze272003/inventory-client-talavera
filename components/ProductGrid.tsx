"use client";

import { useEffect, useRef } from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CartItem } from "@/components/ProductSearch";
import { formatPeso } from "@/lib/format";
import { Button, Badge, Skeleton, EmptyState, Icon } from "@/components/ui";

/** Extra info passed from a grid tap so the parent can run the fly-to-cart
 *  animation from the exact card image that was tapped. `null` for non-grid
 *  adds (e.g. barcode scan). */
export type AddSource = { rect: DOMRect; imageUrl?: string | null } | null;

type Props = {
  search: string;
  category?: string;
  stockFilter?: "all" | "inStock" | "low" | "out";
  /** Current cart, so displayed stock can deduct reserved units in real time. */
  cartItems: CartItem[];
  onAdd: (item: CartItem, source: AddSource) => void;
};

export default function ProductGrid({
  search,
  category,
  stockFilter,
  cartItems,
  onAdd,
}: Props) {
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

  // Reserved quantity per product, derived from the cart. Recomputed each
  // render so the displayed "available" stock stays live as the cart changes.
  const inCartMap = new Map<string, number>();
  for (const i of cartItems) {
    inCartMap.set(i.productId, (inCartMap.get(i.productId) ?? 0) + i.quantity);
  }

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
          const inCart = inCartMap.get(product._id) ?? 0;
          // Available = on-hand minus units already reserved in the cart.
          // This is what the POS "deducts" instantly, before the sale completes.
          const available = Math.max(0, product.stockQty - inCart);
          const outOfStock = available <= 0;
          const lowStock =
            available > 0 && available <= product.reorderThreshold;

          return (
            <button
              key={product._id}
              type="button"
              disabled={outOfStock}
              onClick={(e) => {
                const wrap = e.currentTarget.querySelector<HTMLElement>(
                  "[data-product-image]",
                );
                const img = wrap?.querySelector("img");
                onAdd(
                  {
                    productId: product._id,
                    name: product.name,
                    sku: product.sku,
                    barcode: product.barcode,
                    sellPrice: product.sellPrice,
                    stockQty: product.stockQty,
                    quantity: 1,
                  },
                  wrap
                    ? {
                        rect: wrap.getBoundingClientRect(),
                        imageUrl:
                          img?.getAttribute("src") ?? product.imageUrl ?? null,
                      }
                    : null,
                );
              }}
              aria-label={`Add ${product.name} to cart, ${formatPeso(product.sellPrice)}${
                outOfStock ? ", out of stock" : ""
              }${inCart > 0 ? `, ${inCart} in cart` : ""}`}
              className={[
                "group relative flex flex-col overflow-hidden rounded-xl border text-left transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                outOfStock
                  ? "cursor-not-allowed border-border bg-surface-2 opacity-60"
                  : "cursor-pointer border-border bg-surface shadow-sm hover:-translate-y-0.5 hover:border-primary hover:shadow-md motion-reduce:transform-none",
                inCart > 0 && !outOfStock ? "ring-2 ring-primary/40" : "",
              ].join(" ")}
            >
              <div
                data-product-image
                className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-brand-gradient-soft"
              >
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
                  <Icon
                    name="package"
                    size={36}
                    className="text-text-subtle opacity-60"
                  />
                )}
                {!outOfStock && (
                  <span
                    aria-hidden
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-fg opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none"
                  >
                    <Icon name="plus" size={18} />
                  </span>
                )}
                {inCart > 0 && !outOfStock && (
                  <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-fg shadow-sm">
                    <Icon name="shopping-cart" size={11} />
                    <span className="tabular-nums">{inCart}</span>
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
                <p className="truncate text-xs font-bold text-text">
                  SKU: {product.sku}
                </p>
                {product.barcode && (
                  <p className="truncate font-mono text-xs text-text-muted">
                    {product.barcode}
                  </p>
                )}
                <div className="mt-auto flex items-end justify-between gap-2 pt-1">
                  <span className="text-base font-bold tabular-nums text-primary">
                    {formatPeso(product.sellPrice)}
                  </span>
                  {!outOfStock &&
                    (lowStock ? (
                      <Badge variant="warning">Stock: {available}</Badge>
                    ) : (
                      <Badge variant="success">Stock: {available}</Badge>
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
          <Button variant="secondary" loading disabled>
            Loading
          </Button>
        </div>
      )}
      {status === "CanLoadMore" && (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => loadMore(24)}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
