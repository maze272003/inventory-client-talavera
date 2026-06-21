"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

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

type Props = {
  product?: ProductDoc;
  onClose: () => void;
};

export default function ProductForm({ product, onClose }: Props) {
  const isEdit = !!product;
  const createProduct = useMutation(api.products.create);
  const updateProduct = useMutation(api.products.update);

  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [costPrice, setCostPrice] = useState(
    product ? String(product.costPrice) : ""
  );
  const [sellPrice, setSellPrice] = useState(
    product ? String(product.sellPrice) : ""
  );
  const [stockQty, setStockQty] = useState("");
  const [reorderThreshold, setReorderThreshold] = useState(
    product ? String(product.reorderThreshold) : "0"
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function validate(): string | null {
    if (!name.trim()) return "Name is required.";
    if (!sku.trim()) return "SKU is required.";
    if (!category.trim()) return "Category is required.";
    const cost = parseFloat(costPrice);
    if (isNaN(cost) || cost < 0) return "Cost price must be a number ≥ 0.";
    const sell = parseFloat(sellPrice);
    if (isNaN(sell) || sell < 0) return "Sell price must be a number ≥ 0.";
    const threshold = parseInt(reorderThreshold, 10);
    if (isNaN(threshold) || String(threshold) !== reorderThreshold.trim() || threshold < 0)
      return "Reorder threshold must be a whole number ≥ 0.";
    if (!isEdit) {
      const qty = parseInt(stockQty || "0", 10);
      const stockQtyTrimmed = (stockQty || "0").trim();
      if (isNaN(qty) || String(qty) !== stockQtyTrimmed || qty < 0)
        return "Initial stock must be a whole number ≥ 0.";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setPending(true);
    try {
      if (isEdit) {
        await updateProduct({
          id: product._id,
          name: name.trim(),
          sku: sku.trim(),
          category: category.trim(),
          costPrice: parseFloat(costPrice),
          sellPrice: parseFloat(sellPrice),
          reorderThreshold: parseInt(reorderThreshold, 10),
        });
      } else {
        await createProduct({
          name: name.trim(),
          sku: sku.trim(),
          category: category.trim(),
          costPrice: parseFloat(costPrice),
          sellPrice: parseFloat(sellPrice),
          stockQty: parseInt(stockQty || "0", 10),
          reorderThreshold: parseInt(reorderThreshold, 10),
        });
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {isEdit ? "Edit Product" : "Add Product"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Product name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                SKU <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. SKU-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Tiles"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cost Price (₱) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sell Price (₱) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
              />
            </div>
            {!isEdit && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Initial Stock Qty
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reorder Threshold
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={reorderThreshold}
                onChange={(e) => setReorderThreshold(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0"
              />
            </div>
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
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {pending ? "Saving..." : isEdit ? "Save Changes" : "Add Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
