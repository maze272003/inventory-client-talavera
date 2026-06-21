"use client";

import { useState } from "react";
import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatPeso, formatDate } from "@/lib/format";

function PurchaseDetails({ purchaseId }: { purchaseId: Id<"purchases"> }) {
  const data = useQuery(api.purchases.getPurchase, { purchaseId });
  if (data === undefined) {
    return <p className="px-4 py-3 text-xs text-gray-400">Loading details...</p>;
  }
  if (data === null) {
    return <p className="px-4 py-3 text-xs text-gray-400">Details unavailable.</p>;
  }
  if (data.ledgerRows.length === 0) {
    return <p className="px-4 py-3 text-xs text-gray-400">No ledger rows.</p>;
  }
  return (
    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500">
            <th className="text-left py-1 font-medium">Type</th>
            <th className="text-right py-1 font-medium">Qty</th>
            <th className="text-right py-1 font-medium">Unit cost</th>
            <th className="text-right py-1 font-medium">Balance after</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {data.ledgerRows.map((row) => (
            <tr key={row._id}>
              <td className="py-1 text-gray-700">{row.type}</td>
              <td className="py-1 text-right text-gray-700">{row.quantityDelta}</td>
              <td className="py-1 text-right text-gray-700">
                {row.unitCost !== undefined ? formatPeso(row.unitCost) : "—"}
              </td>
              <td className="py-1 text-right text-gray-700">{row.balanceAfter}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PurchasesPage() {
  const currentUser = useQuery(api.users.currentUser);
  const [expanded, setExpanded] = useState<Id<"purchases"> | null>(null);

  const { results, status, loadMore } = usePaginatedQuery(
    api.purchases.listPurchases,
    {},
    { initialNumItems: 20 },
  );

  if (currentUser === undefined) return null;
  if (currentUser?.role !== "admin") {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Purchases</h1>
        <p className="text-red-600">Admins only.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Purchases</h1>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {status === "LoadingFirstPage" ? (
          <p className="text-center py-10 text-gray-400 text-sm">Loading...</p>
        ) : results.length === 0 ? (
          <p className="text-center py-10 text-gray-400 text-sm">No purchases yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {results.map((p) => {
              const isOpen = expanded === p._id;
              return (
                <li key={p._id}>
                  <div className="flex items-center justify-between px-4 py-3 gap-4">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">{p.supplierName}</p>
                      <p className="text-xs text-gray-500">
                        {formatDate(p.purchaseDate)}
                        {p.referenceNumber ? ` · Ref ${p.referenceNumber}` : ""} ·{" "}
                        {p.itemCount} unit{p.itemCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-semibold text-gray-900">{formatPeso(p.total)}</span>
                      {p.fileUrl && (
                        <a
                          href={p.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                        >
                          View PDF
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : p._id)}
                        className="text-xs px-2 py-1 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                      >
                        {isOpen ? "Hide" : "Details"}
                      </button>
                    </div>
                  </div>
                  {isOpen && <PurchaseDetails purchaseId={p._id} />}
                </li>
              );
            })}
          </ul>
        )}

        {status === "CanLoadMore" && (
          <div className="flex justify-center py-4 border-t border-gray-100">
            <button
              onClick={() => loadMore(20)}
              className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Load more
            </button>
          </div>
        )}
        {status === "LoadingMore" && (
          <div className="flex justify-center py-4 text-sm text-gray-400 border-t border-gray-100">
            Loading...
          </div>
        )}
      </div>
    </div>
  );
}
