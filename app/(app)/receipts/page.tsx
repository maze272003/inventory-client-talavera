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
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
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

      {/* Card grid */}
      {results.length === 0 && status === "Exhausted" ? (
        <p className="p-6 text-sm text-gray-500 text-center">No receipts found.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {results.map((sale) => (
            <Link
              key={sale._id}
              href={`/receipts/${sale._id}`}
              className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-300 transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-lg font-bold text-blue-600">
                  #{sale.receiptNumber}
                </span>
                <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
                  {sale.itemCount} {sale.itemCount === 1 ? "item" : "items"}
                </span>
              </div>
              <div className="text-sm text-gray-500 mb-3">
                {formatDate(sale._creationTime)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">Total</span>
                <span className="text-base font-semibold text-gray-900 tabular-nums">
                  {formatPeso(sale.total)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Load more */}
      {status === "CanLoadMore" && (
        <div className="mt-6 text-center">
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
  );
}
