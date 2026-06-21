"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export type CartItem = {
  productId: Id<"products">;
  name: string;
  sku: string;
  sellPrice: number;
  stockQty: number; // product's actual stock, for warning
  quantity: number;
};

type ProductHit = {
  _id: Id<"products">;
  name: string;
  sku: string;
  sellPrice: number;
  stockQty: number;
};

type Props = {
  onAddToCart: (item: CartItem) => void;
};

/**
 * Inner component that runs the SKU query and fires callbacks when the result
 * arrives. Remounted via `key` for each new lookup.
 */
function SkuLookup({
  sku,
  onFound,
  onNotFound,
}: {
  sku: string;
  onFound: (product: ProductHit) => void;
  onNotFound: (sku: string) => void;
}) {
  const result = useQuery(api.products.getBySku, { sku });

  useEffect(() => {
    if (result === undefined) return;
    if (result !== null) {
      onFound(result);
    } else {
      onNotFound(sku);
    }
  }, [result, sku, onFound, onNotFound]);

  return null;
}

export default function ProductSearch({ onAddToCart }: Props) {
  const [inputValue, setInputValue] = useState("");
  const [lookupSku, setLookupSku] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string | null>(null);
  const [skuNotFound, setSkuNotFound] = useState(false);
  // Key bumps to remount SkuLookup for a fresh query each time
  const [lookupKey, setLookupKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { results: searchResults } = usePaginatedQuery(
    api.products.list,
    searchTerm !== null ? { search: searchTerm, activeOnly: true } : "skip",
    { initialNumItems: 10 }
  );

  const handleSkuFound = useCallback(
    (product: ProductHit) => {
      const item: CartItem = {
        productId: product._id,
        name: product.name,
        sku: product.sku,
        sellPrice: product.sellPrice,
        stockQty: product.stockQty,
        quantity: 1,
      };
      onAddToCart(item);
      setInputValue("");
      setLookupSku(null);
      setSkuNotFound(false);
      setSearchTerm(null);
      inputRef.current?.focus();
    },
    [onAddToCart]
  );

  const handleSkuNotFound = useCallback((sku: string) => {
    setSkuNotFound(true);
    setSearchTerm(sku);
    setLookupSku(null);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const val = inputValue.trim();
      if (!val) return;
      setSkuNotFound(false);
      setSearchTerm(null);
      setLookupSku(val);
      setLookupKey((k) => k + 1);
    }
  }

  function handleSelectProduct(product: ProductHit) {
    const item: CartItem = {
      productId: product._id,
      name: product.name,
      sku: product.sku,
      sellPrice: product.sellPrice,
      stockQty: product.stockQty,
      quantity: 1,
    };
    onAddToCart(item);
    setInputValue("");
    setLookupSku(null);
    setSearchTerm(null);
    setSkuNotFound(false);
    inputRef.current?.focus();
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value);
    if (skuNotFound || searchTerm !== null) {
      setSkuNotFound(false);
      setSearchTerm(null);
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Barcode / SKU / Name
      </label>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder="Scan barcode or type SKU, then press Enter"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        autoFocus
      />

      {/* SKU lookup — mounted only when a lookup is in flight */}
      {lookupSku !== null && (
        <SkuLookup
          key={lookupKey}
          sku={lookupSku}
          onFound={handleSkuFound}
          onNotFound={handleSkuNotFound}
        />
      )}

      {skuNotFound && (
        <p className="text-xs text-amber-600">
          SKU not found — showing name search results below.
        </p>
      )}
      {searchResults && searchResults.length > 0 && (
        <ul className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white shadow-sm max-h-48 overflow-y-auto">
          {searchResults.map((product) => (
            <li key={product._id}>
              <button
                type="button"
                onClick={() => handleSelectProduct(product)}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors"
              >
                <span className="text-sm font-medium text-gray-900">
                  {product.name}
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  SKU: {product.sku}
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  Stock: {product.stockQty}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searchTerm !== null && searchResults && searchResults.length === 0 && (
        <p className="text-xs text-gray-500">No products found.</p>
      )}
    </div>
  );
}
