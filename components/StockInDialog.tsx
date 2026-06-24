"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Dialog, Button, Field, Input, Select, SegmentedControl, useToast } from "@/components/ui";

type Mode = "new" | "existing";

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "new", label: "New batch" },
  { value: "existing", label: "Add to existing" },
];

type Props = {
  open: boolean;
  productId?: Id<"products">;
  productName: string;
  onClose: () => void;
};

export default function StockInDialog({ open, productId, productName, onClose }: Props) {
  const stockIn = useMutation(api.inventory.stockIn);
  const { success, error: toastError } = useToast();

  const [mode, setMode] = useState<Mode>("new");
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const batches = useQuery(
    api.batches.listForProduct,
    productId ? { productId } : "skip",
  );

  function handleModeChange(next: Mode) {
    setMode(next);
    setSelectedBatchId("");
    setError(null);
  }

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
    if (mode === "existing") {
      if (!batches || batches.length === 0) {
        setError("No active batches for this product. Use New batch instead.");
        return;
      }
      if (!selectedBatchId) {
        setError("Select a batch to add stock to.");
        return;
      }
    }
    setError(null);
    setPending(true);
    try {
      await stockIn({
        productId,
        quantity: qty,
        unitCost: cost,
        targetBatchId: mode === "existing" ? (selectedBatchId as Id<"batches">) : undefined,
      });
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

  const noBatches = batches !== undefined && batches.length === 0;

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
        <SegmentedControl
          options={MODE_OPTIONS}
          value={mode}
          onChange={handleModeChange}
          ariaLabel="Batch mode"
          fullWidth
        />

        {mode === "existing" && (
          <Field
            label="Batch"
            required
            hint={noBatches ? "No active batches — use New batch instead." : undefined}
          >
            <Select
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              disabled={noBatches || pending}
              aria-invalid={!selectedBatchId && !noBatches ? true : undefined}
            >
              <option value="">Select a batch…</option>
              {batches?.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.batchNumber} ({b.qtyRemaining} left)
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Quantity" required>
          <Input
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Enter quantity"
            autoFocus={mode === "new"}
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
