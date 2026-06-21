"use client";

import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CartItem } from "@/components/ProductSearch";
import { formatPeso } from "@/lib/format";

type Props = {
  search: string;
  onAdd: (item: CartItem) => void;
};

export default function ProductGrid({ search, onAdd }: Props) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.products.list,
    { search: search.trim() || undefined, activeOnly: true },
    { initialNumItems: 24 }
  );

  if (status === "LoadingFirstPage") {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        Loading products…
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-gray-400">
        {search.trim() ? `No products found for "${search.trim()}"` : "No products available."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {results.map((product) => {
          const outOfStock = product.stockQty <= 0;
          const lowStock = product.stockQty > 0 && product.stockQty <= 5;

          return (
            <button
              key={product._id}
              type="button"
              disabled={outOfStock}
              onClick={() =>
                onAdd({
                  productId: product._id,
                  name: product.name,
                  sku: product.sku,
                  sellPrice: product.sellPrice,
                  stockQty: product.stockQty,
                  quantity: 1,
                })
              }
              className={[
                "flex flex-col rounded-xl border text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 overflow-hidden",
                outOfStock
                  ? "border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed"
                  : "border-gray-200 bg-white hover:border-blue-400 hover:shadow-md active:scale-95 cursor-pointer",
              ].join(" ")}
            >
              {/* Product image */}
              <div className="w-full aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center w-full h-full text-gray-300">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-10 w-10"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                )}
              </div>

              {/* Product info */}
              <div className="p-2 flex flex-col gap-1 flex-1">
                <p className="text-xs font-semibold text-gray-900 leading-tight line-clamp-2">
                  {product.name}
                </p>
                {product.model && (
                  <p className="text-xs text-gray-400 truncate">{product.model}</p>
                )}
                <p className="text-sm font-bold text-blue-700 tabular-nums mt-auto">
                  {formatPeso(product.sellPrice)}
                </p>

                {/* Stock badge */}
                {outOfStock ? (
                  <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    Out of stock
                  </span>
                ) : lowStock ? (
                  <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Stock: {product.stockQty}
                  </span>
                ) : (
                  <span className="inline-block rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                    Stock: {product.stockQty}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {status === "CanLoadMore" && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => loadMore(24)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Load more
          </button>
        </div>
      )}
    </div>
  );
}
