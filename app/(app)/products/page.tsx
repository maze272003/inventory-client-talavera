"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import ProductForm from "@/components/ProductForm";
import { formatPeso } from "@/lib/format";
import { toCsv, downloadCsv } from "@/lib/csv";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Icon,
  Input,
  PageHeader,
  ResponsiveTable,
  Skeleton,
  useToast,
  type Column,
} from "@/components/ui";

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
  const { success, error: errorToast } = useToast();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductDoc | null>(null);
  const [togglingId, setTogglingId] = useState<Id<"products"> | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ProductDoc | null>(null);
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

  if (currentUser === undefined) {
    return (
      <div>
        <PageHeader title="Products" />
        <Card className="screen-only">
          <div className="p-cell space-y-3">
            <Skeleton height={40} />
            <Skeleton height={40} />
            <Skeleton height={40} />
            <Skeleton height={40} />
            <Skeleton height={40} />
          </div>
        </Card>
      </div>
    );
  }

  if (currentUser?.role !== "admin") {
    return (
      <div>
        <PageHeader title="Products" />
        <EmptyState
          icon="user"
          title="Admins only"
          description="You do not have permission to view this page."
        />
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
    try {
      await setActive({ id: product._id, isActive: !product.isActive });
      success(
        product.isActive ? "Product deactivated" : "Product activated",
        product.name
      );
    } catch (err: unknown) {
      errorToast(
        "Could not update status",
        err instanceof Error ? err.message : "Failed to update product status."
      );
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

  const printProducts = exportReady ? (exportResults as ProductDoc[]) : (results as ProductDoc[]);

  const rows = results as ProductDoc[];

  const columns: Column<ProductDoc>[] = [
    {
      key: "photo",
      header: "Photo",
      hideLabelOnCard: true,
      cell: (product) => (
        <div className="w-10 h-10 rounded-md overflow-hidden bg-surface-2 flex items-center justify-center flex-shrink-0 text-text-muted">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Icon name="package" className="w-5 h-5" />
          )}
        </div>
      ),
    },
    {
      key: "name",
      header: "Name",
      cell: (product) => (
        <div>
          <span className="font-medium text-text">{product.name}</span>
          {product.model && (
            <p className="text-xs text-text-muted mt-0.5">{product.model}</p>
          )}
        </div>
      ),
    },
    {
      key: "sku",
      header: "SKU",
      cell: (product) => (
        <span className="text-text-muted font-mono text-xs">{product.sku}</span>
      ),
    },
    {
      key: "category",
      header: "Category",
      cell: (product) => <span className="text-text-muted">{product.category}</span>,
    },
    {
      key: "costPrice",
      header: "Cost",
      align: "right",
      cell: (product) => (
        <span className="text-text tabular-nums">{formatPeso(product.costPrice)}</span>
      ),
    },
    {
      key: "sellPrice",
      header: "Sell",
      align: "right",
      cell: (product) => (
        <span className="text-text tabular-nums">{formatPeso(product.sellPrice)}</span>
      ),
    },
    {
      key: "margin",
      header: "Margin",
      align: "right",
      cell: (product) => {
        const margin = product.sellPrice - product.costPrice;
        return (
          <span
            className={`font-medium tabular-nums ${
              margin >= 0 ? "text-success-fg" : "text-danger-fg"
            }`}
          >
            {formatPeso(margin)}
          </span>
        );
      },
    },
    {
      key: "stock",
      header: "Stock",
      align: "right",
      cell: (product) => {
        const isLowStock = product.stockQty <= product.reorderThreshold;
        return (
          <span
            className={`inline-flex items-center gap-1.5 font-medium tabular-nums ${
              isLowStock ? "text-danger-fg" : "text-text"
            }`}
          >
            {product.stockQty}
            {isLowStock && <Badge variant="danger">Low</Badge>}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      cell: (product) => (
        <Badge variant={product.isActive ? "success" : "neutral"}>
          {product.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      hideLabelOnCard: true,
      cell: (product) => (
        <div className="flex justify-end gap-2 screen-only">
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Icon name="edit" className="w-4 h-4" />}
            onClick={() => openEdit(product)}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant={product.isActive ? "danger" : "secondary"}
            loading={togglingId === product._id}
            disabled={togglingId === product._id}
            onClick={() => {
              if (product.isActive) {
                setConfirmTarget(product);
              } else {
                void toggleActive(product);
              }
            }}
          >
            {product.isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Products"
        actions={
          <div className="flex flex-wrap gap-2 screen-only">
            <Button
              variant="secondary"
              disabled={!exportReady}
              onClick={handleExportCsv}
              leftIcon={<Icon name="download" className="w-4 h-4" />}
            >
              Export CSV
            </Button>
            <Button
              variant="secondary"
              disabled={!exportReady}
              onClick={handlePrint}
              leftIcon={<Icon name="printer" className="w-4 h-4" />}
            >
              Print / PDF
            </Button>
            <Button
              onClick={openAdd}
              leftIcon={<Icon name="plus" className="w-4 h-4" />}
            >
              Add Product
            </Button>
          </div>
        }
      />

      {hitBound && (
        <div className="mb-4 text-sm text-warning-fg bg-warning-bg border border-warning-fg/20 rounded-md px-3 py-2 screen-only">
          Showing first {EXPORT_BOUND} products for export. There may be more records not included.
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap screen-only">
        <Input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name..."
          aria-label="Search products by name"
          className="w-full sm:w-64"
        />
        <Input
          type="text"
          value={category ?? ""}
          onChange={(e) =>
            setCategory(e.target.value.trim() !== "" ? e.target.value.trim() : undefined)
          }
          placeholder="Filter by category..."
          aria-label="Filter products by category"
          className="w-full sm:w-48"
        />
      </div>

      {/* Printable inventory table */}
      <div className="report-print">
        <h2 className="text-lg font-bold text-text mb-4 hidden print:block">
          Inventory Report — {new Date().toLocaleDateString()}
        </h2>

        {/* Screen table (paginated with search/category) */}
        <div className="screen-table">
          {status === "LoadingFirstPage" ? (
            <Card>
              <div className="p-cell space-y-3">
                <Skeleton height={40} />
                <Skeleton height={40} />
                <Skeleton height={40} />
                <Skeleton height={40} />
                <Skeleton height={40} />
              </div>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <ResponsiveTable<ProductDoc>
                caption="Product inventory"
                rows={rows}
                rowKey={(p) => p._id}
                columns={columns}
                empty={
                  <EmptyState
                    icon="package"
                    title="No products found"
                    description={
                      search || category
                        ? "Try adjusting your search or category filter."
                        : "Add your first product to get started."
                    }
                    action={
                      !search && !category ? (
                        <Button
                          onClick={openAdd}
                          leftIcon={<Icon name="plus" className="w-4 h-4" />}
                        >
                          Add Product
                        </Button>
                      ) : undefined
                    }
                  />
                }
              />

              {status === "CanLoadMore" && (
                <div className="flex justify-center py-row border-t border-border screen-only">
                  <Button variant="ghost" onClick={() => loadMore(20)}>
                    Load more
                  </Button>
                </div>
              )}
              {status === "LoadingMore" && (
                <div className="flex justify-center py-row border-t border-border screen-only">
                  <Skeleton height={20} width={120} />
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Print-only full inventory table */}
        <div className="hidden print:block mt-4">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-text">
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
                  <tr key={p._id} className="border-b border-border">
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
          key={editProduct?._id ?? "new"}
          product={editProduct ?? undefined}
          open={showForm}
          onClose={closeForm}
        />
      )}

      <ConfirmDialog
        open={confirmTarget !== null}
        onClose={() => setConfirmTarget(null)}
        onConfirm={async () => {
          if (!confirmTarget) return;
          await toggleActive(confirmTarget);
          setConfirmTarget(null);
        }}
        title="Deactivate product?"
        description={
          confirmTarget
            ? `"${confirmTarget.name}" will be hidden from active inventory and the POS. You can reactivate it later.`
            : undefined
        }
        confirmLabel="Deactivate"
        loading={confirmTarget !== null && togglingId === confirmTarget._id}
      />
    </div>
  );
}
