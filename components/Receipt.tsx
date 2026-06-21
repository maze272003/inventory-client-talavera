"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatPeso, formatDate } from "@/lib/format";

type Props = {
  saleId: Id<"sales">;
};

export default function Receipt({ saleId }: Props) {
  const [is58mm, setIs58mm] = useState(false);

  const data = useQuery(api.sales.getSale, { saleId });

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500 text-sm">
        Loading receipt...
      </div>
    );
  }

  if (data === null) {
    return (
      <div className="flex items-center justify-center p-8 text-red-500 text-sm">
        Receipt not found.
      </div>
    );
  }

  const { sale, items } = data;

  function handlePrint() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  return (
    <div className="space-y-3">
      {/* Controls (hidden on print) */}
      <div className="flex gap-2 print:hidden">
        <button
          type="button"
          onClick={handlePrint}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Print Receipt
        </button>
        <button
          type="button"
          onClick={() => setIs58mm((v) => !v)}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {is58mm ? "Switch to 80mm" : "Switch to 58mm"}
        </button>
      </div>

      {/* Receipt content */}
      <div
        className={`receipt-print bg-white border border-gray-200 rounded-lg p-4 font-mono text-xs${
          is58mm ? " receipt-58" : ""
        }`}
      >
        {/* Header */}
        <div className="text-center mb-3">
          <p className="font-bold text-base">Talavera Store</p>
          <p className="text-gray-600">Official Receipt</p>
        </div>

        <div className="border-t border-dashed border-gray-400 pt-2 mb-2">
          <div className="flex justify-between">
            <span>Receipt #:</span>
            <span className="font-bold">{sale.receiptNumber}</span>
          </div>
          <div className="flex justify-between">
            <span>Date:</span>
            <span>{formatDate(sale._creationTime)}</span>
          </div>
        </div>

        {/* Items */}
        <div className="border-t border-dashed border-gray-400 pt-2 mb-2">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left font-semibold pb-1">Item</th>
                <th className="text-right font-semibold pb-1">Amt</th>
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
                            className="w-10 h-10 object-cover rounded"
                          />
                        ) : (
                          <span className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded text-gray-400 text-xs">
                            —
                          </span>
                        )}
                      </span>
                      <div>
                        <div>{item.nameSnapshot}</div>
                        <div className="text-gray-500">
                          {item.quantity} × {formatPeso(item.unitSellPrice)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="text-right py-0.5 align-top tabular-nums">
                    {formatPeso(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-dashed border-gray-400 pt-2 space-y-1">
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
        <div className="border-t border-dashed border-gray-400 mt-3 pt-2 text-center text-gray-500">
          <p>Thank you for your purchase!</p>
        </div>
      </div>
    </div>
  );
}
