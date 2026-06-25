"use client";

import { useQuery } from "convex/react";
import { useEffect, useRef } from "react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatPeso } from "@/lib/format";
import type { CartItem } from "./ProductSearch";
import { EmptyState, Icon, Badge, Button } from "@/components/ui";

function BatchPreview({
  productId,
  quantity,
}: {
  productId: Id<"products">;
  quantity: number;
}) {
  const batches = useQuery(api.batches.listForProduct, { productId });
  if (!batches || batches.length === 0) return null;
  const parts: string[] = [];
  let need = quantity;
  for (const b of batches) {
    if (need <= 0) break;
    const take = Math.min(b.qtyRemaining, need);
    parts.push(`${b.batchNumber} ×${take}`);
    need -= take;
  }
  if (parts.length === 0) return null;
  return (
    <p className="truncate text-xs text-text" title={parts.join(", ")}>
      <span className="inline-flex items-center gap-1 align-middle font-bold">
        <Icon name="layers" size={12} className="shrink-0 text-text-muted" />
        Batch: {parts.join(", ")}
      </span>
      {need > 0 ? (
        <span className="font-medium text-warning-fg"> (short!)</span>
      ) : null}
    </p>
  );
}

type Props = {
  items: CartItem[];
  onUpdate: (items: CartItem[]) => void;
  /** Increments each time an item is added; drives the cart-icon bump. */
  bumpKey?: number;
};

export default function Cart({ items, onUpdate, bumpKey = 0 }: Props) {
  const iconWrapRef = useRef<HTMLSpanElement>(null);

  // Total units (not line items) — the "how many in the cart" figure.
  const unitCount = items.reduce((s, i) => s + i.quantity, 0);

  // Re-trigger the bump animation whenever a new item is added. We remove the
  // class, force a reflow, then re-add it so the keyframe restarts each time.
  useEffect(() => {
    if (bumpKey === 0) return;
    const el = iconWrapRef.current;
    if (!el) return;
    el.classList.remove("cart-bump");
    void el.offsetWidth;
    el.classList.add("cart-bump");
  }, [bumpKey]);

  function updateQty(index: number, delta: number) {
    const updated = items.map((item, i) => {
      if (i !== index) return item;
      const newQty = item.quantity + delta;
      if (newQty < 1) return item;
      // Never exceed on-hand stock — keeps cart in sync with inventory.
      if (newQty > item.stockQty) return item;
      return { ...item, quantity: newQty };
    });
    onUpdate(updated);
  }

  function removeItem(index: number) {
    onUpdate(items.filter((_, i) => i !== index));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-cell py-row">
        <h2 className="flex items-center gap-2 text-base font-semibold text-text">
          <span
            ref={iconWrapRef}
            data-cart-fly-target
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <Icon name="shopping-cart" size={16} />
          </span>
          Current Sale
          {unitCount > 0 && (
            <Badge
              key={unitCount}
              variant="primary"
              aria-label={`${unitCount} item${unitCount === 1 ? "" : "s"} in cart`}
              className="count-pop"
            >
              {unitCount}
            </Badge>
          )}
        </h2>
        {items.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onUpdate([])}
            leftIcon={<Icon name="trash" size={14} />}
          >
            Clear
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex min-h-[180px] flex-1 items-center justify-center">
          <EmptyState
            icon="shopping-cart"
            title="Cart is empty"
            description="Scan a barcode or tap a product to add it."
          />
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-cell">
          {items.map((item, index) => {
            const lineTotal = item.sellPrice * item.quantity;
            const overStock = item.quantity > item.stockQty;
            return (
              <li
                key={item.productId}
                className={[
                  "rounded-lg border p-3 transition-colors",
                  overStock
                    ? "border-warning-fg/40 bg-warning-bg"
                    : "border-border bg-surface",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">
                      {item.name}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="truncate font-bold text-text">
                        SKU: {item.sku}
                      </span>
                      {item.barcode && (
                        <>
                          <span aria-hidden className="text-text-subtle">
                            ·
                          </span>
                          <span className="truncate font-mono text-text-muted">
                            {item.barcode}
                          </span>
                        </>
                      )}
                      <span aria-hidden className="text-text-subtle">
                        ·
                      </span>
                      <span className="text-text-muted">
                        {formatPeso(item.sellPrice)} each
                      </span>
                    </div>
                    <BatchPreview
                      productId={item.productId}
                      quantity={item.quantity}
                    />
                    {overStock && (
                      <p className="mt-1 flex items-center gap-1 text-xs font-medium text-warning-fg">
                        <Icon name="alert-triangle" size={12} />
                        Qty exceeds stock ({item.stockQty} available)
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-2 hover:text-danger-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Remove ${item.name} from cart`}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateQty(index, -1)}
                      disabled={item.quantity <= 1}
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Decrease quantity of ${item.name}`}
                    >
                      <Icon name="minus" size={16} />
                    </button>
                    <span
                      className="w-10 text-center text-sm font-semibold tabular-nums text-text"
                      aria-label={`Quantity ${item.quantity}`}
                    >
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQty(index, 1)}
                      disabled={item.quantity >= item.stockQty}
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-text transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Increase quantity of ${item.name}`}
                    >
                      <Icon name="plus" size={16} />
                    </button>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-text">
                    {formatPeso(lineTotal)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
