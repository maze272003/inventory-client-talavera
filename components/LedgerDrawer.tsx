"use client";

import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatPeso, formatDate } from "@/lib/format";

type Props = {
  productId: Id<"products">;
  productName: string;
  onClose: () => void;
};

const TYPE_LABELS: Record<string, string> = {
  sale: "Sale",
  stock_in: "Stock In",
  adjustment: "Adjustment",
};

const TYPE_COLORS: Record<string, string> = {
  sale: "bg-red-100 text-red-700",
  stock_in: "bg-green-100 text-green-700",
  adjustment: "bg-orange-100 text-orange-700",
};

export default function LedgerDrawer({ productId, productName, onClose }: Props) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.inventory.ledgerForProduct,
    { productId },
    { initialNumItems: 15 }
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="bg-white w-full max-w-xl h-full flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Ledger</h2>
            <p className="text-sm text-gray-500">{productName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Ledger table */}
        <div className="flex-1 overflow-y-auto">
          {status === "LoadingFirstPage" ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              Loading...
            </div>
          ) : results.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
              No ledger entries found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Type
                    </th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Delta
                    </th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Balance
                    </th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Note
                    </th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.map((row) => (
                    <tr key={row._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            TYPE_COLORS[row.type] ?? "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {TYPE_LABELS[row.type] ?? row.type}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-medium ${
                          row.quantityDelta >= 0 ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        {row.quantityDelta >= 0 ? "+" : ""}
                        {row.quantityDelta}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">
                        {row.balanceAfter}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[160px] truncate">
                        {row.reason
                          ? row.reason
                          : row.unitCost != null
                            ? formatPeso(row.unitCost) + " /unit"
                            : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-400 whitespace-nowrap text-xs">
                        {formatDate(row._creationTime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {status === "CanLoadMore" && (
            <div className="flex justify-center py-4">
              <button
                onClick={() => loadMore(15)}
                className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Load more
              </button>
            </div>
          )}
          {status === "LoadingMore" && (
            <div className="flex justify-center py-4 text-sm text-gray-400">
              Loading...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
