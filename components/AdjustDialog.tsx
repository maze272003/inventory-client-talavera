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
  currentQty: number;
  onClose: () => void;
};

export default function AdjustDialog({
  open,
  productId,
  productName,
  currentQty,
  onClose,
}: Props) {
  const adjust = useMutation(api.inventory.adjust);
  const { success, error: toastError } = useToast();

  const [newQuantity, setNewQuantity] = useState(String(currentQty));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) return;
    const qty = parseInt(newQuantity, 10);
    if (isNaN(qty) || String(qty) !== newQuantity.trim() || qty < 0) {
      setError("New quantity must be a whole number ≥ 0.");
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
      success("Stock adjusted", `${productName} set to ${qty} unit${qty === 1 ? "" : "s"}.`);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred.";
      setError(message);
      toastError("Adjustment failed", message);
    } finally {
      setPending(false);
    }
  }

  const parsedQty = parseInt(newQuantity, 10);
  const delta = isNaN(parsedQty) ? null : parsedQty - currentQty;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Adjust Stock"
      description={`${productName} — current qty: ${currentQty}`}
      dismissable={!pending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="adjust-form" loading={pending}>
            Save Adjustment
          </Button>
        </>
      }
    >
      <form id="adjust-form" onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="New Quantity"
          required
          hint={
            delta !== null
              ? delta > 0
                ? `+${delta} units`
                : delta === 0
                  ? "No change"
                  : `${delta} units`
              : undefined
          }
        >
          <Input
            type="number"
            min="0"
            step="1"
            value={newQuantity}
            onChange={(e) => setNewQuantity(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Reason" required>
          <Input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Damaged goods, stocktake correction"
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
