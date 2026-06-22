"use client";

import { useState, useRef, useEffect, useCallback, forwardRef } from "react";
import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Field, Input, Icon, Badge } from "@/components/ui";

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

const ProductSearch = forwardRef<HTMLInputElement, Props>(function ProductSearch(
  { onAddToCart },
  forwardedRef
) {
  const [inputValue, setInputValue] = useState("");
  const [lookupSku, setLookupSku] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string | null>(null);
  const [skuNotFound, setSkuNotFound] = useState(false);
  // Key bumps to remount SkuLookup for a fresh query each time
  const [lookupKey, setLookupKey] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Expose the input element to a forwarded ref (for the focus-search shortcut)
  // while keeping the internal ref for self-refocus after a scan.
  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef]
  );

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
      <Field
        label="Barcode / SKU / Name"
        hint={skuNotFound ? undefined : "Scan a barcode or type a SKU, then press Enter."}
      >
        <Input
          ref={setInputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Scan barcode or type SKU, then press Enter"
          autoFocus
          aria-label="Barcode, SKU, or product name"
        />
      </Field>

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
        <p className="flex items-center gap-1.5 text-xs text-warning-fg" role="status">
          <Icon name="alert-triangle" size={14} />
          SKU not found — showing name search results below.
        </p>
      )}
      {searchResults && searchResults.length > 0 && (
        <ul className="border border-border rounded-lg divide-y divide-border bg-surface shadow-sm max-h-60 overflow-y-auto">
          {searchResults.map((product) => (
            <li key={product._id}>
              <button
                type="button"
                onClick={() => handleSelectProduct(product)}
                className="flex w-full min-h-[44px] items-center justify-between gap-2 px-cell py-row text-left transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-text">
                    {product.name}
                  </span>
                  <span className="block text-xs text-text-muted">
                    SKU: {product.sku}
                  </span>
                </span>
                <Badge
                  variant={product.stockQty <= 0 ? "danger" : "neutral"}
                  className="shrink-0"
                >
                  Stock: {product.stockQty}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searchTerm !== null && searchResults && searchResults.length === 0 && (
        <p className="text-xs text-text-muted">No products found.</p>
      )}
    </div>
  );
});

export default ProductSearch;
