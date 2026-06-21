"use client";

import { useState } from "react";
import Link from "next/link";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatPeso, formatDate } from "@/lib/format";

export default function ReceiptsPage() {
  const [searchInput, setSearchInput] = useState("");

  // Parse a positive integer from the search input, or undefined to list all
  const searchNum = (() => {
    const n = parseInt(searchInput.trim(), 10);
    return Number.isInteger(n) && n > 0 ? n : undefined;
  })();

  const { results, status, loadMore } = usePaginatedQuery(
    api.sales.listReceipts,
    searchNum !== undefined ? { receiptNumber: searchNum } : {},
    { initialNumItems: 20 }
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Receipts</h1>

      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <label
          htmlFor="receipt-search"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Search by Receipt Number
        </label>
        <input
          id="receipt-search"
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Enter receipt number…"
          className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {results.length === 0 && status === "Exhausted" ? (
          <p className="p-6 text-sm text-gray-500 text-center">No receipts found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">
                  Receipt #
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">
                  Date
                </th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">
                  Items
                </th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.map((sale) => (
                <tr key={sale._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/receipts/${sale._id}`}
                      className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      #{sale.receiptNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDate(sale._creationTime)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 tabular-nums">
                    {sale.itemCount}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                    {formatPeso(sale.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Load more */}
        {status === "CanLoadMore" && (
          <div className="p-4 border-t border-gray-100 text-center">
            <button
              type="button"
              onClick={() => loadMore(20)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
