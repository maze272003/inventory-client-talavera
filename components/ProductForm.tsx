"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

type ProductDoc = {
  _id: Id<"products">;
  name: string;
  sku: string;
  category: string;
  model?: string;
  costPrice: number;
  sellPrice: number;
  stockQty: number;
  reorderThreshold: number;
  isActive: boolean;
  imageId?: Id<"_storage">;
  imageUrl?: string | null;
};

type Props = {
  product?: ProductDoc;
  onClose: () => void;
};

export default function ProductForm({ product, onClose }: Props) {
  const isEdit = !!product;
  const createProduct = useMutation(api.products.create);
  const updateProduct = useMutation(api.products.update);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);

  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [model, setModel] = useState(product?.model ?? "");
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
  const [uploading, setUploading] = useState(false);

  // Image state: the selected File and the object URL created from it
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  // Revoke previous object URL when it changes (or on unmount)
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  // Preview: newly selected file's object URL > existing imageUrl > null
  const previewUrl: string | null = objectUrl ?? product?.imageUrl ?? null;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    // Revoke old object URL before creating a new one
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }

  async function uploadImage(file: File): Promise<Id<"_storage">> {
    const url = await generateUploadUrl();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!res.ok) throw new Error("Image upload failed");
    const { storageId } = await res.json();
    return storageId as Id<"_storage">;
  }

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
      // Upload image if a new file was selected
      let imageId: Id<"_storage"> | undefined;
      if (selectedFile) {
        setUploading(true);
        try {
          imageId = await uploadImage(selectedFile);
        } finally {
          setUploading(false);
        }
      } else if (isEdit && product.imageId) {
        // Keep the existing imageId in edit mode
        imageId = product.imageId;
      }

      if (isEdit) {
        // Build args — model is always included (empty string clears it); imageId is conditional
        const updateArgs: Parameters<typeof updateProduct>[0] = {
          id: product._id,
          name: name.trim(),
          sku: sku.trim(),
          category: category.trim(),
          model: model.trim(),
          costPrice: parseFloat(costPrice),
          sellPrice: parseFloat(sellPrice),
          reorderThreshold: parseInt(reorderThreshold, 10),
        };
        if (imageId) updateArgs.imageId = imageId;
        await updateProduct(updateArgs);
      } else {
        const createArgs: Parameters<typeof createProduct>[0] = {
          name: name.trim(),
          sku: sku.trim(),
          category: category.trim(),
          model: model.trim(),
          costPrice: parseFloat(costPrice),
          sellPrice: parseFloat(sellPrice),
          stockQty: parseInt(stockQty || "0", 10),
          reorderThreshold: parseInt(reorderThreshold, 10),
        };
        if (imageId) createArgs.imageId = imageId;
        await createProduct(createArgs);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setPending(false);
    }
  }

  const isDisabled = pending || uploading;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
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
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Model
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Honda CB500F 2023"
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

            {/* Image upload */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Product Photo
              </label>
              <div className="flex items-center gap-4">
                {/* Preview */}
                <div className="flex-shrink-0 w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Product preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <svg
                      className="w-6 h-6 text-gray-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9H5"
                      />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    PNG, JPG, WEBP accepted
                  </p>
                </div>
              </div>
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
              disabled={isDisabled}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? "Uploading..." : pending ? "Saving..." : isEdit ? "Save Changes" : "Add Product"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
