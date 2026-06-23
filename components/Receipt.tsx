"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatPeso, formatDate } from "@/lib/format";
import { Button, Skeleton, Icon } from "@/components/ui";

type Props = {
  saleId: Id<"sales">;
};

export default function Receipt({ saleId }: Props) {
  const [is58mm, setIs58mm] = useState(false);

  const data = useQuery(api.sales.getSale, { saleId });

  if (data === undefined) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2 print:hidden">
          <Skeleton height={44} width={140} />
          <Skeleton height={44} width={140} />
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mx-auto max-w-xs space-y-3">
            <Skeleton height={20} width="60%" className="mx-auto" />
            <Skeleton height={12} width="40%" className="mx-auto" />
            <div className="space-y-2 pt-3">
              <Skeleton height={14} />
              <Skeleton height={14} />
              <Skeleton height={14} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-danger-fg/30 bg-danger-bg p-8 text-sm text-danger-fg">
        <Icon name="alert-triangle" size={18} />
        Receipt not found.
      </div>
    );
  }

  const { sale, items, cashier } = data;

  function handlePrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  return (
    <div className="space-y-3">
      {/* Controls (hidden on print) */}
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button onClick={handlePrint} leftIcon={<Icon name="printer" size={18} />}>
          Print Receipt
        </Button>
        <Button variant="secondary" onClick={() => setIs58mm((v) => !v)}>
          {is58mm ? "Switch to 80mm" : "Switch to 58mm"}
        </Button>
      </div>

      {/* Receipt content — keep print classes (receipt-print / receipt-58 / screen-only) */}
      <div
        className={`receipt-print mx-auto max-w-sm rounded-lg border border-border bg-surface p-4 font-mono text-xs text-text${
          is58mm ? " receipt-58" : ""
        }`}
      >
        {/* Header */}
        <div className="mb-3 text-center">
          <p className="text-base font-bold">Talavera Store</p>
          <p className="text-text-muted">Official Receipt</p>
        </div>

        <div className="mb-2 border-t border-dashed border-border pt-2">
          <div className="flex justify-between">
            <span>Receipt #:</span>
            <span className="font-bold tabular-nums">{sale.receiptNumber}</span>
          </div>
          <div className="flex justify-between">
            <span>Date:</span>
            <span className="tabular-nums">{formatDate(sale._creationTime)}</span>
          </div>
          <div className="flex justify-between">
            <span>Cashier:</span>
            <div className="text-right">
              <div>{cashier.name}</div>
              {cashier.email && (
                <div className="text-text-muted text-xs">{cashier.email}</div>
              )}
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="mb-2 border-t border-dashed border-border pt-2">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-1 text-left font-semibold">Item</th>
                <th className="pb-1 text-right font-semibold">Amt</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td className="py-0.5 pr-2">
                    <div className="flex items-start gap-2">
                      {/* Thumbnail — screen only, excluded from print */}
                      <span className="screen-only flex-shrink-0">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt={item.nameSnapshot}
                            width={40}
                            height={40}
                            className="h-10 w-10 rounded object-cover"
                          />
                        ) : (
                          <span className="flex h-10 w-10 items-center justify-center rounded bg-surface-2 text-xs text-text-muted">
                            —
                          </span>
                        )}
                      </span>
                      <div>
                        <div>{item.nameSnapshot}</div>
                        <div className="text-text-muted tabular-nums">
                          {item.quantity} × {formatPeso(item.unitSellPrice)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-0.5 text-right align-top tabular-nums">
                    {formatPeso(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="space-y-1 border-t border-dashed border-border pt-2">
          <div className="flex justify-between font-bold">
            <span>TOTAL</span>
            <span className="tabular-nums">{formatPeso(sale.total)}</span>
          </div>
          <div className="flex justify-between">
            <span>Cash Tendered</span>
            <span className="tabular-nums">{formatPeso(sale.cashTendered)}</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Change</span>
            <span className="tabular-nums">{formatPeso(sale.changeGiven)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-3 border-t border-dashed border-border pt-2 text-center text-text-muted">
          <p>Thank you for your purchase!</p>
        </div>
      </div>
    </div>
  );
}
