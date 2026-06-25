"use client";

import { useState, useRef, useEffect, useCallback, forwardRef } from "react";
import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Field, Input, Icon, Badge, Button } from "@/components/ui";
import CameraScanner from "@/components/CameraScanner";
import ScanConfirmDialog, {
  type ConfirmMode,
  type ConfirmReason,
  type ScannedProduct,
} from "@/components/ScanConfirmDialog";

export type CartItem = {
  productId: Id<"products">;
  name: string;
  sku: string;
  sellPrice: number;
  stockQty: number; // product's actual stock, for warning
  quantity: number;
};

type Props = {
  onAddToCart: (item: CartItem) => void;
  /** Current cart, so stock-ceiling / low-stock checks reflect what's already added. */
  cartItems: CartItem[];
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
  onFound: (product: ScannedProduct) => void;
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

/**
 * Inner component that runs the batch-number query and fires callbacks when
 * the result arrives. Remounted via `key` for each new lookup.
 */
function BatchLookup({
  batchNumber,
  onFound,
  onNotFound,
}: {
  batchNumber: string;
  onFound: (product: ScannedProduct) => void;
  onNotFound: (batchNumber: string) => void;
}) {
  const result = useQuery(api.batches.findByBatchNumber, { batchNumber });

  useEffect(() => {
    if (result === undefined) return;
    if (result !== null) {
      onFound(result.product);
    } else {
      onNotFound(batchNumber);
    }
  }, [result, batchNumber, onFound, onNotFound]);

  return null;
}

const ProductSearch = forwardRef<HTMLInputElement, Props>(function ProductSearch(
  { onAddToCart, cartItems },
  forwardedRef
) {
  const [inputValue, setInputValue] = useState("");
  const [lookupSku, setLookupSku] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string | null>(null);
  const [skuNotFound, setSkuNotFound] = useState(false);
  // Key bumps to remount SkuLookup / BatchLookup for a fresh query each time
  const [lookupKey, setLookupKey] = useState(0);
  // Batch-number lookup: set when an SKU miss reveals a BN- term
  const [batchLookupTerm, setBatchLookupTerm] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  // Confirm-dialog state — non-null only while a validation issue is pending.
  // `nonce` changes per confirmation so the dialog remounts (resetting its qty).
  const confirmNonceRef = useRef(0);
  const [confirm, setConfirm] = useState<{
    product: ScannedProduct;
    mode: ConfirmMode;
    reason: ConfirmReason;
    maxQty: number;
    inCartQty: number;
    nonce: number;
  } | null>(null);
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

  const qtyInCart = useCallback(
    (productId: Id<"products">) =>
      cartItems.filter((i) => i.productId === productId).reduce((s, i) => s + i.quantity, 0),
    [cartItems],
  );

  const resetSearch = useCallback(() => {
    setInputValue("");
    setLookupSku(null);
    setBatchLookupTerm(null);
    setSkuNotFound(false);
    setSearchTerm(null);
  }, []);

  const commitAdd = useCallback(
    (product: ScannedProduct, qty: number) => {
      onAddToCart({
        productId: product._id,
        name: product.name,
        sku: product.sku,
        sellPrice: product.sellPrice,
        stockQty: product.stockQty,
        quantity: qty,
      });
    },
    [onAddToCart],
  );

  /**
   * Validation router. Healthy items (active, in stock, above threshold) take
   * the fast path and are added directly — preserving POS scan speed. A confirm
   * dialog is shown ONLY for a validation issue: inactive, out-of-stock,
   * stock-limit already reached, or low-stock warning.
   */
  const tryAddProduct = useCallback(
    (product: ScannedProduct) => {
      const inCart = qtyInCart(product._id);
      const stock = product.stockQty;
      const available = stock - inCart;

      const openConfirm = (
        mode: ConfirmMode,
        reason: ConfirmReason,
        maxQty: number,
      ) => {
        confirmNonceRef.current += 1;
        setConfirm({ product, mode, reason, maxQty, inCartQty: inCart, nonce: confirmNonceRef.current });
      };

      if (!product.isActive) {
        resetSearch();
        openConfirm("blocked", "inactive", 0);
        return;
      }
      if (stock <= 0) {
        resetSearch();
        openConfirm("blocked", "out-of-stock", 0);
        return;
      }
      if (available <= 0) {
        resetSearch();
        openConfirm("blocked", "stock-limit", 0);
        return;
      }
      if (stock <= product.reorderThreshold) {
        resetSearch();
        openConfirm("warn", "low-stock", available);
        return;
      }
      // Healthy: add directly, keep the register fast.
      commitAdd(product, 1);
      resetSearch();
      inputRef.current?.focus();
    },
    [commitAdd, qtyInCart, resetSearch],
  );

  const handleSkuFound = useCallback(
    (product: ScannedProduct) => tryAddProduct(product),
    [tryAddProduct],
  );

  const handleSkuNotFound = useCallback((sku: string) => {
    setLookupSku(null);
    if (/^BN-/i.test(sku)) {
      // Term looks like a batch number — try BatchLookup before falling back.
      setBatchLookupTerm(sku);
    } else {
      setSkuNotFound(true);
      setSearchTerm(sku);
    }
  }, []);

  const handleBatchFound = useCallback(
    (product: ScannedProduct) => tryAddProduct(product),
    [tryAddProduct],
  );

  const handleBatchNotFound = useCallback((bn: string) => {
    setBatchLookupTerm(null);
    setSkuNotFound(true);
    setSearchTerm(bn);
  }, []);

  const submitValue = useCallback((raw: string) => {
    const val = raw.trim();
    if (!val) return;
    setSkuNotFound(false);
    setSearchTerm(null);
    setBatchLookupTerm(null);
    setLookupSku(val);
    setLookupKey((k) => k + 1);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitValue(inputValue);
    }
  }

  function handleSelectProduct(product: ScannedProduct) {
    tryAddProduct(product);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInputValue(e.target.value);
    if (skuNotFound || searchTerm !== null || batchLookupTerm !== null) {
      setSkuNotFound(false);
      setSearchTerm(null);
      setBatchLookupTerm(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <Field
          label="Barcode / SKU / Name"
          hint={skuNotFound ? undefined : "Scan a barcode or type a SKU, then press Enter."}
          className="flex-1"
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
        <Button
          type="button"
          variant="secondary"
          onClick={() => setScanOpen(true)}
          aria-label="Scan with camera"
          className="shrink-0"
        >
          Scan
        </Button>
      </div>

      <CameraScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={(text) => {
          setScanOpen(false);
          submitValue(text);
        }}
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

      {/* Batch-number lookup — mounted only when an SKU miss reveals a BN- term */}
      {batchLookupTerm !== null && (
        <BatchLookup
          key={`batch-${lookupKey}`}
          batchNumber={batchLookupTerm}
          onFound={handleBatchFound}
          onNotFound={handleBatchNotFound}
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

      <ScanConfirmDialog
        key={confirm?.nonce ?? 0}
        open={confirm !== null}
        product={confirm?.product ?? null}
        mode={confirm?.mode ?? "blocked"}
        reason={confirm?.reason ?? "out-of-stock"}
        maxQty={confirm?.maxQty ?? 0}
        inCartQty={confirm?.inCartQty ?? 0}
        onClose={() => {
          setConfirm(null);
          inputRef.current?.focus();
        }}
        onConfirm={(qty) => {
          if (confirm) commitAdd(confirm.product, qty);
          setConfirm(null);
          inputRef.current?.focus();
        }}
      />
    </div>
  );
});

export default ProductSearch;
