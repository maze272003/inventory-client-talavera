"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Alert,
  AlertDescription,
  Button,
  Drawer,
  Field,
  Input,
  Icon,
  useToast,
} from "@/components/ui";

type ProductDoc = {
  _id: Id<"products">;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  model?: string;
  costPrice: number;
  sellPrice: number;
  stockQty: number;
  reorderThreshold: number;
  isActive: boolean;
  batchNumber?: string;
  imageId?: Id<"_storage">;
  imageUrl?: string | null;
};

type Props = {
  product?: ProductDoc;
  open: boolean;
  onClose: () => void;
};

export default function ProductForm({ product, open, onClose }: Props) {
  const isEdit = !!product;
  const createProduct = useMutation(api.products.create);
  const updateProduct = useMutation(api.products.update);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const { success, error: errorToast } = useToast();

  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");
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
          barcode: barcode.trim(),
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
          barcode: barcode.trim(),
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
      success(
        isEdit ? "Product updated" : "Product added",
        name.trim()
      );
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred.";
      setError(message);
      errorToast(isEdit ? "Could not save changes" : "Could not add product", message);
    } finally {
      setPending(false);
    }
  }

  const isDisabled = pending || uploading;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit product" : "Add product"}
      description={isEdit ? "Update product details and pricing." : "Create a new inventory item."}
      width="min(32rem, 100vw)"
      dismissable={!isDisabled}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isDisabled}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="product-form"
            loading={isDisabled}
            disabled={isDisabled}
          >
            {uploading
              ? "Uploading…"
              : pending
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Add product"}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Name" required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Product name"
              />
            </Field>
          </div>
          <Field label="SKU" required>
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="e.g. SKU-001"
            />
          </Field>
          <Field label="Barcode" hint="EAN/UPC scanned at POS">
            <Input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="e.g. 4801234567890"
              inputMode="numeric"
            />
          </Field>
          <Field label="Category" required>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Tiles"
            />
          </Field>
          <Field label="Batch number">
            {isEdit ? (
              <Input
                value={product.batchNumber ?? ""}
                disabled
                className="font-mono"
              />
            ) : (
              <Input
                value=""
                disabled
                placeholder="Auto-generated on save"
              />
            )}
          </Field>
          <div className="col-span-2">
            <Field label="Model">
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. Honda CB500F 2023"
              />
            </Field>
          </div>
          <Field label="Cost price (₱)" required>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="0.00"
              className="tabular-nums"
            />
          </Field>
          <Field label="Sell price (₱)" required>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={sellPrice}
              onChange={(e) => setSellPrice(e.target.value)}
              placeholder="0.00"
              className="tabular-nums"
            />
          </Field>
          {!isEdit && (
            <Field label="Initial stock qty">
              <Input
                type="number"
                min="0"
                step="1"
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
                placeholder="0"
                className="tabular-nums"
              />
            </Field>
          )}
          <Field label="Reorder threshold">
            <Input
              type="number"
              min="0"
              step="1"
              value={reorderThreshold}
              onChange={(e) => setReorderThreshold(e.target.value)}
              placeholder="0"
              className="tabular-nums"
            />
          </Field>

          {/* Image upload */}
          <div className="col-span-2">
            <Field label="Product photo" hint="PNG, JPG, WEBP accepted">
              <div className="flex items-center gap-4">
                {/* Preview */}
                <div className="flex-shrink-0 w-16 h-16 rounded-lg border border-border bg-surface-2 overflow-hidden flex items-center justify-center text-text-muted">
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt="Product preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Icon name="package" className="w-6 h-6" />
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  aria-label="Product photo"
                  className="block w-full text-sm text-text-muted file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-fg hover:file:bg-primary-hover file:cursor-pointer cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                />
              </div>
            </Field>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <Icon name="alert-triangle" size={16} />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </form>
    </Drawer>
  );
}
