"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatPeso } from "@/lib/format";
import type { CartItem } from "./ProductSearch";
import { EmptyState, Icon, Badge } from "@/components/ui";

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
    <p
      className="truncate text-[11px] text-text-muted"
      title={parts.join(", ")}
    >
      FIFO: {parts.join(", ")}
      {need > 0 ? " (short!)" : ""}
    </p>
  );
}

type Props = {
  items: CartItem[];
  onUpdate: (items: CartItem[]) => void;
};

export default function Cart({ items, onUpdate }: Props) {
  const total = items.reduce((sum, item) => sum + item.sellPrice * item.quantity, 0);

  function updateQty(index: number, delta: number) {
    const updated = items.map((item, i) => {
      if (i !== index) return item;
      const newQty = item.quantity + delta;
      if (newQty < 1) return item;
      return { ...item, quantity: newQty };
    });
    onUpdate(updated);
  }

  function removeItem(index: number) {
    onUpdate(items.filter((_, i) => i !== index));
  }

  return (
    <div className="flex h-full flex-col">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-text">
        <Icon name="shopping-cart" size={18} className="text-text-muted" />
        Cart
        {items.length > 0 && (
          <Badge variant="primary" aria-label={`${items.length} line items`}>
            {items.length}
          </Badge>
        )}
      </h2>

      {items.length === 0 ? (
        <EmptyState
          icon="shopping-cart"
          title="Cart is empty"
          description="Scan a barcode or tap a product to add it."
        />
      ) : (
        <>
          <ul className="flex-1 space-y-2 overflow-y-auto">
            {items.map((item, index) => {
              const lineTotal = item.sellPrice * item.quantity;
              const overStock = item.quantity > item.stockQty;
              return (
                <li
                  key={item.productId}
                  className={[
                    "rounded-lg border p-cell",
                    overStock
                      ? "border-warning-fg/40 bg-warning-bg"
                      : "border-border bg-surface",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">
                        {item.name}
                      </p>
                      <p className="text-xs text-text-muted">
                        {item.sku} &middot; {formatPeso(item.sellPrice)} each
                      </p>
                      <BatchPreview
                        productId={item.productId}
                        quantity={item.quantity}
                      />
                      {overStock && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-warning-fg">
                          <Icon name="alert-triangle" size={12} />
                          Qty exceeds stock ({item.stockQty} available)
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-danger-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`Remove ${item.name} from cart`}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateQty(index, -1)}
                        disabled={item.quantity <= 1}
                        className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-text transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Decrease quantity of ${item.name}`}
                      >
                        <Icon name="minus" size={16} />
                      </button>
                      <span
                        className="w-9 text-center text-sm font-medium tabular-nums text-text"
                        aria-label={`Quantity ${item.quantity}`}
                      >
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(index, 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-text transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`Increase quantity of ${item.name}`}
                      >
                        <Icon name="plus" size={16} />
                      </button>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-text">
                      {formatPeso(lineTotal)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm font-semibold text-text">Total</span>
            <span className="text-xl font-bold tabular-nums text-text">
              {formatPeso(total)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
