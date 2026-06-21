"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import ProductForm from "@/components/ProductForm";
import { formatPeso } from "@/lib/format";

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

export default function ProductsPage() {
  const currentUser = useQuery(api.users.currentUser);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductDoc | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setActive = useMutation(api.products.setActive);

  const { results, status, loadMore } = usePaginatedQuery(
    api.products.list,
    { search, category },
    { initialNumItems: 20 }
  );

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const trimmed = searchInput.trim();
      setSearch(trimmed !== "" ? trimmed : undefined);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  if (currentUser === undefined) return null;

  if (currentUser?.role !== "admin") {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Products</h1>
        <p className="text-red-600">Admins only.</p>
      </div>
    );
  }

  function openAdd() {
    setEditProduct(null);
    setShowForm(true);
  }

  function openEdit(product: ProductDoc) {
    setEditProduct(product);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditProduct(null);
  }

  async function toggleActive(product: ProductDoc) {
    await setActive({ id: product._id, isActive: !product.isActive });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Products</h1>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          + Add Product
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name..."
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="text"
          value={category ?? ""}
          onChange={(e) =>
            setCategory(e.target.value.trim() !== "" ? e.target.value.trim() : undefined)
          }
          placeholder="Filter by category..."
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  SKU
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Category
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Cost
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Sell
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Margin
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Stock
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Status
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {status === "LoadingFirstPage" ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-gray-400 text-sm">
                    Loading...
                  </td>
                </tr>
              ) : results.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-gray-400 text-sm">
                    No products found.
                  </td>
                </tr>
              ) : (
                results.map((product) => {
                  const isLowStock = product.stockQty <= product.reorderThreshold;
                  const margin = product.sellPrice - product.costPrice;
                  return (
                    <tr key={product._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {product.name}
                      </td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                        {product.sku}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{product.category}</td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {formatPeso(product.costPrice)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {formatPeso(product.sellPrice)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          margin >= 0 ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        {formatPeso(margin)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
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
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            product.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {product.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => openEdit(product as ProductDoc)}
                            className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => toggleActive(product as ProductDoc)}
                            className={`text-xs px-2 py-1 rounded transition-colors ${
                              product.isActive
                                ? "bg-red-50 hover:bg-red-100 text-red-700"
                                : "bg-green-50 hover:bg-green-100 text-green-700"
                            }`}
                          >
                            {product.isActive ? "Deactivate" : "Activate"}
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

      {showForm && (
        <ProductForm
          product={editProduct ?? undefined}
          onClose={closeForm}
        />
      )}
    </div>
  );
}
