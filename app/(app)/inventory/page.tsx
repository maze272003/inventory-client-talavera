"use client";

import { useState } from "react";
import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import StockInDialog from "@/components/StockInDialog";
import AdjustDialog from "@/components/AdjustDialog";
import LedgerDrawer from "@/components/LedgerDrawer";

type ProductDoc = {
  _id: Id<"products">;
  name: string;
  sku: string;
  category: string;
  costPrice: number;
  sellPrice: number;
  stockQty: number;
  reorderThreshold: number;
  isActive: boolean;
};

type DialogState =
  | { type: "stockIn"; product: ProductDoc }
  | { type: "adjust"; product: ProductDoc }
  | { type: "ledger"; product: ProductDoc }
  | null;

function ProductPickerAndActions() {
  const [searchInput, setSearchInput] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);

  const { results, status, loadMore } = usePaginatedQuery(
    api.products.list,
    { search: searchInput.trim() !== "" ? searchInput.trim() : undefined },
    { initialNumItems: 20 }
  );

  function closeDialog() {
    setDialog(null);
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-gray-800 mb-3">Products</h2>

      <div className="mb-3">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search products..."
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Product
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  SKU
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Stock
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {status === "LoadingFirstPage" ? (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-gray-400 text-sm">
                    Loading...
                  </td>
                </tr>
              ) : results.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-10 text-gray-400 text-sm">
                    No products found.
                  </td>
                </tr>
              ) : (
                results.map((product) => {
                  const isLowStock = product.stockQty <= product.reorderThreshold;
                  return (
                    <tr
                      key={product._id}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {product.name}
                        {!product.isActive && (
                          <span className="ml-2 text-xs text-gray-400">(inactive)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {product.sku}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-medium ${
                            isLowStock ? "text-red-700" : "text-gray-700"
                          }`}
                        >
                          {product.stockQty}
                          {isLowStock && (
                            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                              Low
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() =>
                              setDialog({ type: "stockIn", product: product as ProductDoc })
                            }
                            className="text-xs px-2 py-1 rounded bg-green-50 hover:bg-green-100 text-green-700 transition-colors font-medium"
                          >
                            Stock In
                          </button>
                          <button
                            onClick={() =>
                              setDialog({ type: "adjust", product: product as ProductDoc })
                            }
                            className="text-xs px-2 py-1 rounded bg-orange-50 hover:bg-orange-100 text-orange-700 transition-colors font-medium"
                          >
                            Adjust
                          </button>
                          <button
                            onClick={() =>
                              setDialog({ type: "ledger", product: product as ProductDoc })
                            }
                            className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors font-medium"
                          >
                            Ledger
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

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

      {/* Dialogs */}
      {dialog?.type === "stockIn" && (
        <StockInDialog
          productId={dialog.product._id}
          productName={dialog.product.name}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "adjust" && (
        <AdjustDialog
          productId={dialog.product._id}
          productName={dialog.product.name}
          currentQty={dialog.product.stockQty}
          onClose={closeDialog}
        />
      )}
      {dialog?.type === "ledger" && (
        <LedgerDrawer
          productId={dialog.product._id}
          productName={dialog.product.name}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}

function LowStockSection() {
  const lowStock = useQuery(api.products.lowStock, {});

  if (!lowStock || lowStock.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-base font-semibold text-gray-800">Low Stock Alerts</h2>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
          {lowStock.length}
        </span>
      </div>
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {lowStock.map((product) => (
            <div
              key={product._id}
              className="bg-white rounded-lg border border-red-200 px-4 py-3 flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{product.name}</p>
                <p className="text-xs text-gray-500">{product.sku}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-red-700">{product.stockQty}</p>
                <p className="text-xs text-gray-400">threshold: {product.reorderThreshold}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const currentUser = useQuery(api.users.currentUser);

  if (currentUser === undefined) return null;

  if (currentUser?.role !== "admin") {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Inventory</h1>
        <p className="text-red-600">Admins only.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Inventory</h1>
      <LowStockSection />
      <ProductPickerAndActions />
    </div>
  );
}
