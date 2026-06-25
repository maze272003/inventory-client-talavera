"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatPeso } from "@/lib/format";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  EmptyState,
  Field,
  Icon,
  Input,
  Skeleton,
  SkeletonText,
  Textarea,
} from "@/components/ui";

type Props = {
  saleId: Id<"sales">;
  open: boolean;
  onClose: () => void;
};

export default function ReturnDialog({ saleId, open, onClose }: Props) {
  const data = useQuery(api.sales.getSale, { saleId });
  const existing = useQuery(api.returns.listForSale, { saleId });
  const createReturn = useMutation(api.returns.createReturn);

  const [qtyInputs, setQtyInputs] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  // Reset transient form state when the dialog opens or retargets a sale.
  // "Adjust state during render" (React docs) — avoids the setState-in-effect
  // cascading-render anti-pattern.
  const [lastOpen, setLastOpen] = useState(open);
  const [lastSaleId, setLastSaleId] = useState(saleId);
  if (open !== lastOpen || saleId !== lastSaleId) {
    setLastOpen(open);
    setLastSaleId(saleId);
    if (open) {
      setQtyInputs({});
      setReason("");
    }
  }

  // Sum prior return quantities per saleItemId across all existing returns.
  const returnedByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const ret of existing ?? []) {
      for (const it of ret.items) {
        const key = it.saleItemId as string;
        map.set(key, (map.get(key) ?? 0) + it.quantity);
      }
    }
    return map;
  }, [existing]);

  const loading = data === undefined || existing === undefined;
  const archived = data?.sale.isArchived === true;

  // Per-line derived view used both for rendering and validation.
  const lines = useMemo(() => {
    if (!data) return [];
    return data.items.map((item) => {
      const alreadyReturned = returnedByItem.get(item._id as string) ?? 0;
      const restorable = Math.max(0, item.quantity - alreadyReturned);
      const raw = qtyInputs[item._id as string] ?? 0;
      const qty = Number.isFinite(raw) && raw > 0 ? Math.min(raw, restorable) : 0;
      const lineRefund = qty * item.unitSellPrice;
      return {
        item,
        alreadyReturned,
        restorable,
        qty,
        lineRefund,
        invalid: !Number.isFinite(raw) || raw < 0 || raw > restorable,
      };
    });
  }, [data, returnedByItem, qtyInputs]);

  const totalRefund = lines.reduce((sum, l) => sum + l.lineRefund, 0);
  const anyInvalid = lines.some((l) => l.invalid);
  const canConfirm =
    !loading &&
    !pending &&
    !archived &&
    totalRefund > 0 &&
    !anyInvalid;

  function setQty(saleItemId: string, restorable: number, value: string) {
    const parsed = parseInt(value, 10);
    const next =
      Number.isNaN(parsed) || parsed < 0 ? 0 : Math.min(parsed, restorable);
    setQtyInputs((prev) => ({ ...prev, [saleItemId]: next }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const linesToSend = Object.entries(qtyInputs)
      .filter(([, q]) => q > 0)
      .map(([saleItemId, quantity]) => ({
        saleItemId: saleItemId as Id<"saleItems">,
        quantity,
      }));
    if (linesToSend.length === 0) return;

    setPending(true);
    try {
      const result = await createReturn({
        saleId,
        lines: linesToSend,
        reason: reason.trim() || undefined,
      });
      toast.success(
        `Return processed: ${formatPeso(result.totalRefund)} refunded`,
      );
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to process return";
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Process Return"
      description={data ? `Receipt #${data.sale.receiptNumber}` : undefined}
      size="lg"
      dismissable={!pending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="return-form"
            loading={pending}
            disabled={!canConfirm}
            variant="danger"
          >
            Process return
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="space-y-3">
          <SkeletonText lines={2} />
          <Skeleton height={64} width="100%" />
          <Skeleton height={64} width="100%" />
        </div>
      ) : !data ? (
        <EmptyState
          icon="alert-triangle"
          title="Sale not found"
          description="This sale no longer exists."
        />
      ) : archived ? (
        <Alert variant="destructive">
          <Icon name="alert-triangle" size={16} />
          <AlertDescription>
            This sale is archived and cannot be returned against.
          </AlertDescription>
        </Alert>
      ) : (
        <form id="return-form" onSubmit={handleSubmit} className="space-y-4">
          {data.items.length === 0 ? (
            <EmptyState
              icon="package"
              title="No items on this sale"
              description="There is nothing to return."
            />
          ) : (
            <>
              <div className="space-y-3">
                {lines.map(({ item, alreadyReturned, restorable, qty }) => (
                  <div
                    key={item._id}
                    className="rounded-lg border border-border p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text truncate">
                          {item.nameSnapshot}
                        </p>
                        <p className="text-xs text-text-muted">
                          {item.skuSnapshot}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm tabular-nums text-text">
                          {formatPeso(item.unitSellPrice)}
                        </p>
                        <p className="text-xs text-text-muted">
                          sold: {item.quantity}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-end gap-3">
                      <Field
                        className="flex-1"
                        label="Return qty"
                        hint={
                          restorable === 0
                            ? "Fully returned"
                            : `Restorable: ${restorable} · already returned: ${alreadyReturned}`
                        }
                      >
                        <Input
                          type="number"
                          min={0}
                          max={restorable}
                          step={1}
                          value={qty}
                          onChange={(e) =>
                            setQty(item._id, restorable, e.target.value)
                          }
                          disabled={restorable === 0 || pending}
                        />
                      </Field>
                      <div className="shrink-0 pb-1 text-right">
                        <p className="text-xs text-text-muted">Line refund</p>
                        <p className="text-sm font-semibold tabular-nums text-text">
                          {formatPeso(qty * item.unitSellPrice)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Field label="Reason" hint="Optional">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. defective, wrong item, change of mind"
                  rows={2}
                  disabled={pending}
                />
              </Field>

              <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3">
                <span className="text-sm text-text-muted">Total refund</span>
                <span className="text-lg font-semibold tabular-nums text-text">
                  {formatPeso(totalRefund)}
                </span>
              </div>
            </>
          )}
        </form>
      )}
    </Dialog>
  );
}
