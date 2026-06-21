"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

type Props = {
  productId: Id<"products">;
  productName: string;
  currentQty: number;
  onClose: () => void;
};

export default function AdjustDialog({
  productId,
  productName,
  currentQty,
  onClose,
}: Props) {
  const adjust = useMutation(api.inventory.adjust);

  const [newQuantity, setNewQuantity] = useState(String(currentQty));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseFloat(newQuantity);
    if (isNaN(qty) || qty < 0) {
      setError("New quantity must be a number ≥ 0.");
      return;
    }
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await adjust({ productId, newQuantity: qty, reason: reason.trim() });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setPending(false);
    }
  }

  const parsedQty = parseFloat(newQuantity);
  const delta = isNaN(parsedQty) ? null : parsedQty - currentQty;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Adjust Stock</h2>
        <p className="text-sm text-gray-500 mb-4">
          {productName} — current qty: <strong>{currentQty}</strong>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              New Quantity <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={newQuantity}
              onChange={(e) => setNewQuantity(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            {delta !== null && (
              <p
                className={`text-xs mt-1 ${
                  delta > 0
                    ? "text-green-600"
                    : delta < 0
                      ? "text-red-600"
                      : "text-gray-500"
                }`}
              >
                {delta > 0 ? `+${delta}` : delta === 0 ? "No change" : delta} units
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Damaged goods, stocktake correction"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {pending ? "Adjusting..." : "Save Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
