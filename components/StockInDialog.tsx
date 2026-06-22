"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Dialog, Button, Field, Input, useToast } from "@/components/ui";

type Props = {
  open: boolean;
  productId?: Id<"products">;
  productName: string;
  onClose: () => void;
};

export default function StockInDialog({ open, productId, productName, onClose }: Props) {
  const stockIn = useMutation(api.inventory.stockIn);
  const { success, error: toastError } = useToast();

  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) return;
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || String(qty) !== quantity.trim() || qty <= 0) {
      setError("Quantity must be a whole number greater than 0.");
      return;
    }
    const cost = unitCost.trim() ? parseFloat(unitCost) : undefined;
    if (unitCost.trim() && (isNaN(cost!) || cost! < 0)) {
      setError("Unit cost must be a number ≥ 0.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await stockIn({ productId, quantity: qty, unitCost: cost });
      success("Stock added", `${qty} unit${qty === 1 ? "" : "s"} added to ${productName}.`);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred.";
      setError(message);
      toastError("Stock In failed", message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Stock In"
      description={productName}
      dismissable={!pending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="stock-in-form" loading={pending}>
            Stock In
          </Button>
        </>
      }
    >
      <form id="stock-in-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Quantity" required>
          <Input
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Enter quantity"
            autoFocus
          />
        </Field>
        <Field label="Unit Cost (₱)" hint="Defaults to product cost price">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            placeholder="Defaults to product cost price"
          />
        </Field>

        {error && (
          <p
            role="alert"
            className="text-sm text-danger-fg bg-danger-bg rounded-lg px-cell py-2"
          >
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
