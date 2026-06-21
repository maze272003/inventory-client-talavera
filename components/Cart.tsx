"use client";

import { formatPeso } from "@/lib/format";
import type { CartItem } from "./ProductSearch";

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

  if (items.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <h2 className="text-base font-semibold text-gray-700 mb-3">Cart</h2>
        <p className="text-sm text-gray-400 italic">No items in cart.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-base font-semibold text-gray-700 mb-3">Cart</h2>
      <div className="flex-1 overflow-y-auto space-y-2">
        {items.map((item, index) => {
          const lineTotal = item.sellPrice * item.quantity;
          const overStock = item.quantity > item.stockQty;
          return (
            <div
              key={item.productId}
              className={`rounded-lg border p-3 ${
                overStock ? "border-amber-400 bg-amber-50" : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {item.sku} &middot; {formatPeso(item.sellPrice)} each
                  </p>
                  {overStock && (
                    <p className="text-xs text-amber-700 mt-0.5">
                      Warning: qty exceeds stock ({item.stockQty} available)
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => updateQty(index, -1)}
                    disabled={item.quantity <= 1}
                    className="w-6 h-6 rounded border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-medium tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateQty(index, 1)}
                    className="w-6 h-6 rounded border border-gray-300 text-sm font-bold text-gray-600 hover:bg-gray-100"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
                <div className="text-sm font-semibold text-gray-900 tabular-nums shrink-0 w-20 text-right">
                  {formatPeso(lineTotal)}
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="text-gray-400 hover:text-red-500 transition-colors ml-1 shrink-0"
                  aria-label="Remove item"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
        <span className="text-sm font-semibold text-gray-700">Total</span>
        <span className="text-xl font-bold text-gray-900 tabular-nums">
          {formatPeso(total)}
        </span>
      </div>
    </div>
  );
}
