"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import ProductForm from "@/components/ProductForm";
import { formatPeso } from "@/lib/format";
import { toCsv, downloadCsv } from "@/lib/csv";

type ProductDoc = {
  _id: Id<"products">;
  name: string;
  sku: string;
  category: string;
  model?: string;
  costPrice: number;
  sellPrice: number;
  stockQty: number;
  reorderThreshold: number;
  isActive: boolean;
  imageId?: Id<"_storage">;
  imageUrl?: string | null;
};

const EXPORT_BOUND = 5000;

export default function ProductsPage() {
  const currentUser = useQuery(api.users.currentUser);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductDoc | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<Id<"products"> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setActive = useMutation(api.products.setActive);

  const { results, status, loadMore } = usePaginatedQuery(
    api.products.list,
    { search, category },
    { initialNumItems: 20 }
  );

  // Bounded full product set for export (no search/category filter — full inventory)
  const { results: exportResults, status: exportStatus } = usePaginatedQuery(
    api.products.list,
    {},
    { initialNumItems: EXPORT_BOUND }
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
    if (togglingId !== null) return;
    setTogglingId(product._id);
    setToggleError(null);
    try {
      await setActive({ id: product._id, isActive: !product.isActive });
    } catch (err: unknown) {
      setToggleError(err instanceof Error ? err.message : "Failed to update product status.");
    } finally {
      setTogglingId(null);
    }
  }

  const exportReady =
    exportStatus === "Exhausted" || exportStatus === "CanLoadMore";
  const hitBound = exportStatus === "CanLoadMore";

  const inventoryColumns = [
    { key: "name", header: "Name" },
    { key: "model", header: "Model" },
    { key: "sku", header: "SKU" },
    { key: "category", header: "Category" },
    { key: "costPrice", header: "Cost Price" },
    { key: "sellPrice", header: "Sell Price" },
    { key: "stockQty", header: "Stock Qty" },
    { key: "stockValue", header: "Stock Value" },
    { key: "lowStock", header: "Low Stock" },
  ];

  function buildInventoryRows(products: ProductDoc[]) {
    return products.map((p) => ({
      name: p.name,
      model: p.model ?? "",
      sku: p.sku,
      category: p.category,
      costPrice: p.costPrice,
      sellPrice: p.sellPrice,
      stockQty: p.stockQty,
      stockValue: p.costPrice * p.stockQty,
      lowStock: p.stockQty <= p.reorderThreshold ? "Yes" : "No",
    }));
  }

  function handleExportCsv() {
    if (!exportReady) return;
    const rows = buildInventoryRows(exportResults as ProductDoc[]);
    const csv = toCsv(rows, inventoryColumns);
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`inventory-${today}.csv`, csv);
  }

  function handlePrint() {
    document.body.classList.add("printing-report");
    const cleanup = () => {
      document.body.classList.remove("printing-report");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  const printProducts = exportReady ? (exportResults as ProductDoc[]) : results as ProductDoc[];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Products</h1>
        <div className="flex gap-2">
          <div className="flex gap-2 screen-only">
            <button
              onClick={handleExportCsv}
              disabled={!exportReady}
              className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Export CSV
            </button>
            <button
              onClick={handlePrint}
              disabled={!exportReady}
              className="px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Print / PDF
            </button>
          </div>
          <button
            onClick={openAdd}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors screen-only"
          >
            + Add Product
          </button>
        </div>
      </div>

      {toggleError && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 screen-only">
          {toggleError}
        </div>
      )}

      {hitBound && (
        <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 screen-only">
          Showing first {EXPORT_BOUND} products for export. There may be more records not included.
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap screen-only">
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

      {/* Printable inventory table */}
      <div className="report-print">
        <h2 className="text-lg font-bold text-gray-900 mb-4 hidden print:block">
          Inventory Report — {new Date().toLocaleDateString()}
        </h2>

        {/* Screen table (paginated with search/category) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden screen-table">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">
                    Photo
                  </th>
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
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide screen-only">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {status === "LoadingFirstPage" ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-gray-400 text-sm">
                      Loading...
                    </td>
                  </tr>
                ) : results.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-gray-400 text-sm">
                      No products found.
                    </td>
                  </tr>
                ) : (
                  results.map((product) => {
                    const isLowStock = product.stockQty <= product.reorderThreshold;
                    const margin = product.sellPrice - product.costPrice;
                    return (
                      <tr key={product._id} className="hover:bg-gray-50">
                        {/* Thumbnail */}
                        <td className="px-3 py-2 screen-only">
                          <div className="w-10 h-10 rounded overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0">
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <svg
                                className="w-5 h-5 text-gray-300"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={1.5}
                                  d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9H5"
                                />
                              </svg>
                            )}
                          </div>
                        </td>
                        {/* Name + model */}
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900">{product.name}</span>
                          {product.model && (
                            <p className="text-xs text-gray-400 mt-0.5">{product.model}</p>
                          )}
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
                        <td className="px-4 py-3 text-right screen-only">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => openEdit(product as ProductDoc)}
                              className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => toggleActive(product as ProductDoc)}
                              disabled={togglingId === product._id}
                              className={`text-xs px-2 py-1 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                product.isActive
                                  ? "bg-red-50 hover:bg-red-100 text-red-700"
                                  : "bg-green-50 hover:bg-green-100 text-green-700"
                              }`}
                            >
                              {togglingId === product._id
                                ? "..."
                                : product.isActive
                                  ? "Deactivate"
                                  : "Activate"}
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
            <div className="flex justify-center py-4 border-t border-gray-100 screen-only">
              <button
                onClick={() => loadMore(20)}
                className="px-4 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Load more
              </button>
            </div>
          )}
          {status === "LoadingMore" && (
            <div className="flex justify-center py-4 text-sm text-gray-400 border-t border-gray-100 screen-only">
              Loading...
            </div>
          )}
        </div>

        {/* Print-only full inventory table */}
        <div className="hidden print:block mt-4">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-800">
                <th className="text-left py-1 pr-2">Name</th>
                <th className="text-left py-1 pr-2">SKU</th>
                <th className="text-left py-1 pr-2">Category</th>
                <th className="text-right py-1 pr-2">Cost</th>
                <th className="text-right py-1 pr-2">Sell</th>
                <th className="text-right py-1 pr-2">Stock</th>
                <th className="text-right py-1 pr-2">Stock Value</th>
                <th className="text-center py-1">Low Stock</th>
              </tr>
            </thead>
            <tbody>
              {printProducts.map((p) => {
                const isLow = p.stockQty <= p.reorderThreshold;
                return (
                  <tr key={p._id} className="border-b border-gray-200">
                    <td className="py-1 pr-2 font-medium">{p.name}{p.model ? ` (${p.model})` : ""}</td>
                    <td className="py-1 pr-2 font-mono">{p.sku}</td>
                    <td className="py-1 pr-2">{p.category}</td>
                    <td className="py-1 pr-2 text-right">{formatPeso(p.costPrice)}</td>
                    <td className="py-1 pr-2 text-right">{formatPeso(p.sellPrice)}</td>
                    <td className="py-1 pr-2 text-right">{p.stockQty}</td>
                    <td className="py-1 pr-2 text-right">{formatPeso(p.costPrice * p.stockQty)}</td>
                    <td className="py-1 text-center">{isLow ? "YES" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
