"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import ProductSearch, { CartItem } from "@/components/ProductSearch";
import Cart from "@/components/Cart";
import Receipt from "@/components/Receipt";
import { formatPeso } from "@/lib/format";

export default function PosPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cashTendered, setCashTendered] = useState("");
  const [completedSaleId, setCompletedSaleId] = useState<Id<"sales"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const createSale = useMutation(api.sales.createSale);

  const total = cart.reduce((sum, item) => sum + item.sellPrice * item.quantity, 0);
  const tendered = parseFloat(cashTendered) || 0;
  const change = tendered - total;
  const canComplete = cart.length > 0 && tendered >= total && !isSubmitting;

  function handleAddToCart(item: CartItem) {
    setCart((prev) => {
      // If the same product already exists, increment its quantity
      const existing = prev.findIndex((i) => i.productId === item.productId);
      if (existing >= 0) {
        return prev.map((i, idx) =>
          idx === existing ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, item];
    });
  }

  function handleNewSale() {
    setCart([]);
    setCashTendered("");
    setCompletedSaleId(null);
    setError(null);
  }

  async function handleCompleteSale() {
    if (!canComplete) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await createSale({
        items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        cashTendered: tendered,
      });
      setCompletedSaleId(result.saleId);
      // Don't clear cart yet — keep visible until "New Sale" is clicked
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Receipt view (after successful sale) ──────────────────────────────────
  if (completedSaleId !== null) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Sale Complete</h1>
          <button
            type="button"
            onClick={handleNewSale}
            className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 transition-colors"
          >
            New Sale
          </button>
        </div>
        <Receipt saleId={completedSaleId} />
      </div>
    );
  }

  // ── POS view ──────────────────────────────────────────────────────────────
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Point of Sale</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: product search + cart */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <ProductSearch onAddToCart={handleAddToCart} />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 min-h-[200px]">
            <Cart items={cart} onUpdate={setCart} />
          </div>
        </div>

        {/* Right column: payment */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <h2 className="text-base font-semibold text-gray-700">Payment</h2>

          {/* Order total */}
          <div className="flex justify-between items-center py-3 border-t border-b border-gray-100">
            <span className="text-sm text-gray-600">Order Total</span>
            <span className="text-2xl font-bold text-gray-900 tabular-nums">
              {formatPeso(total)}
            </span>
          </div>

          {/* Cash tendered */}
          <div>
            <label
              htmlFor="cash-tendered"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Cash Tendered (₱)
            </label>
            <input
              id="cash-tendered"
              type="number"
              min="0"
              step="0.01"
              value={cashTendered}
              onChange={(e) => setCashTendered(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Change */}
          {tendered >= total && tendered > 0 && (
            <div className="flex justify-between items-center bg-green-50 rounded-lg px-4 py-3">
              <span className="text-sm font-medium text-green-700">Change</span>
              <span className="text-xl font-bold text-green-700 tabular-nums">
                {formatPeso(change)}
              </span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Complete Sale */}
          <button
            type="button"
            onClick={handleCompleteSale}
            disabled={!canComplete}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Processing…" : "Complete Sale"}
          </button>

          {cart.length === 0 && (
            <p className="text-xs text-center text-gray-400">
              Add items to the cart to begin.
            </p>
          )}
          {cart.length > 0 && tendered < total && (
            <p className="text-xs text-center text-amber-600">
              Enter cash tendered ≥ {formatPeso(total)} to proceed.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
