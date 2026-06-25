"use client";

import { useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { formatPeso } from "@/lib/format";
import {
  Badge,
  Button,
  Dialog,
  Field,
  Icon,
  Input,
  cn,
} from "@/components/ui";

export type ScannedProduct = {
  _id: Id<"products">;
  name: string;
  sku: string;
  sellPrice: number;
  stockQty: number;
  isActive: boolean;
  reorderThreshold: number;
  imageUrl?: string | null;
};

export type ConfirmMode = "blocked" | "warn";

export type ConfirmReason =
  | "inactive"
  | "out-of-stock"
  | "stock-limit"
  | "low-stock";

export type ScanConfirmDialogProps = {
  open: boolean;
  product: ScannedProduct | null;
  mode: ConfirmMode;
  reason: ConfirmReason;
  /** Units that can still be added (= stockQty − qty already in cart). */
  maxQty: number;
  inCartQty: number;
  onClose: () => void;
  onConfirm: (qty: number) => void;
};

const REASON_META: Record<
  ConfirmReason,
  { tone: "danger" | "warning"; icon: "alert-triangle" | "info"; message: (ctx: { maxQty: number; stockQty: number }) => string }
> = {
  inactive: {
    tone: "danger",
    icon: "alert-triangle",
    message: () => "This product is inactive and cannot be sold.",
  },
  "out-of-stock": {
    tone: "danger",
    icon: "alert-triangle",
    message: () => "Out of stock — no units available to sell.",
  },
  "stock-limit": {
    tone: "danger",
    icon: "alert-triangle",
    message: ({ stockQty }) =>
      `Stock limit reached — all ${stockQty} unit${stockQty === 1 ? "" : "s"} are already in the cart.`,
  },
  "low-stock": {
    tone: "warning",
    icon: "alert-triangle",
    message: ({ maxQty }) =>
      `Low stock — only ${maxQty} unit${maxQty === 1 ? "" : "s"} available.`,
  },
};

/**
 * Confirm-an-item dialog shown after a barcode/SKU scan when a validation
 * issue exists (out-of-stock, inactive, low-stock, or stock-limit reached).
 * Healthy items bypass this entirely and are added directly (POS speed rule).
 * The cashier can set a quantity (capped at available stock) before confirming.
 */
export function ScanConfirmDialog({
  open,
  product,
  mode,
  reason,
  maxQty,
  inCartQty,
  onClose,
  onConfirm,
}: ScanConfirmDialogProps) {
  const [qty, setQty] = useState(1);

  // qty resets to its initial value via a `key` on this component (passed from
  // the parent), so each new confirmation starts fresh without an effect.

  if (!product) return null;

  const meta = REASON_META[reason];
  const blocked = mode === "blocked";
  const effectiveMax = Math.max(1, maxQty);
  const clampedQty = Math.max(1, Math.min(qty, effectiveMax));
  const toneCls =
    meta.tone === "danger"
      ? "border-danger/30 bg-danger-bg text-danger"
      : "border-warning/30 bg-warning-bg text-warning";

  function handleConfirm() {
    if (blocked) return;
    onConfirm(clampedQty);
  }

  function handleQtyKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Confirm item"
      description="Verify this is the right product before adding it to the sale."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {blocked ? "Close" : "Cancel"}
          </Button>
          {!blocked && (
            <Button onClick={handleConfirm} leftIcon={<Icon name="plus" size={16} />}>
              Add to Cart
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {/* Product identity */}
        <div className="flex items-start gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <Icon name="package" size={24} className="text-text-subtle" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text">{product.name}</p>
            <p className="text-xs text-text-muted">SKU: {product.sku}</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-text">
              {formatPeso(product.sellPrice)}
            </p>
          </div>
        </div>

        {/* Stock line */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs">
          <span className="text-text-muted">On-hand stock</span>
          <span className="flex items-center gap-2">
            <Badge variant={product.stockQty <= 0 ? "danger" : "neutral"}>
              <span className="tabular-nums">{product.stockQty}</span>
            </Badge>
            {inCartQty > 0 && (
              <span className="text-text-subtle">
                · <span className="tabular-nums">{inCartQty}</span> in cart
              </span>
            )}
          </span>
        </div>

        {/* Validation banner */}
        <div
          role={blocked ? "alert" : "status"}
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
            toneCls,
          )}
        >
          <Icon name={meta.icon} size={14} className="mt-0.5 shrink-0" />
          <span>{meta.message({ maxQty, stockQty: product.stockQty })}</span>
        </div>

        {/* Quantity (warn only — blocked has nothing to add) */}
        {!blocked && (
          <Field label="Quantity" hint={`Max ${effectiveMax} for available stock`}>
            <Input
              type="number"
              min={1}
              max={effectiveMax}
              value={qty}
              autoFocus
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setQty(Number.isFinite(n) ? n : 1);
              }}
              onKeyDown={handleQtyKeyDown}
            />
          </Field>
        )}
      </div>
    </Dialog>
  );
}

export default ScanConfirmDialog;
