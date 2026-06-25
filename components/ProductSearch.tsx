"use client";

import { useState, useRef, useEffect, useCallback, forwardRef } from "react";
import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Field, Input, Icon, Badge, Button, useToast } from "@/components/ui";
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
  barcode?: string;
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
 * Inner component that runs the identity (barcode-or-SKU) query and fires
 * callbacks when the result arrives. Remounted via `key` for each new lookup.
 * Barcode is checked first (primary scan identifier), then SKU.
 */
function IdentityLookup({
  code,
  onFound,
  onNotFound,
}: {
  code: string;
  onFound: (product: ScannedProduct) => void;
  onNotFound: (code: string) => void;
}) {
  const result = useQuery(api.products.getByIdentity, { code });

  useEffect(() => {
    if (result === undefined) return;
    if (result !== null) {
      onFound(result);
    } else {
      onNotFound(code);
    }
  }, [result, code, onFound, onNotFound]);

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

const ProductSearch = forwardRef<HTMLInputElement, Props>(
  function ProductSearch({ onAddToCart, cartItems }, forwardedRef) {
    const { error: toastError } = useToast();
    const [inputValue, setInputValue] = useState("");
    const [lookupCode, setLookupCode] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState<string | null>(null);
    const [codeNotFound, setCodeNotFound] = useState(false);
    // Key bumps to remount IdentityLookup / BatchLookup for a fresh query each time
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
      reason: ConfirmReason | undefined;
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
      [forwardedRef],
    );

    const { results: searchResults } = usePaginatedQuery(
      api.products.list,
      searchTerm !== null ? { search: searchTerm, activeOnly: true } : "skip",
      { initialNumItems: 10 },
    );

    const qtyInCart = useCallback(
      (productId: Id<"products">) =>
        cartItems
          .filter((i) => i.productId === productId)
          .reduce((s, i) => s + i.quantity, 0),
      [cartItems],
    );

    const resetSearch = useCallback(() => {
      setInputValue("");
      setLookupCode(null);
      setBatchLookupTerm(null);
      setCodeNotFound(false);
      setSearchTerm(null);
    }, []);

    const commitAdd = useCallback(
      (product: ScannedProduct, qty: number) => {
        onAddToCart({
          productId: product._id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
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
          reason: ConfirmReason | undefined,
          maxQty: number,
        ) => {
          confirmNonceRef.current += 1;
          setConfirm({
            product,
            mode,
            reason,
            maxQty,
            inCartQty: inCart,
            nonce: confirmNonceRef.current,
          });
        };

        if (!product.isActive) {
          resetSearch();
          openConfirm("blocked", "inactive", 0);
          return;
        }
        // Zero on-hand OR every unit already reserved in the cart: block the add
        // with the required toast. Validation runs before any cart mutation.
        if (stock <= 0 || available <= 0) {
          resetSearch();
          toastError("No stocks available.");
          inputRef.current?.focus();
          return;
        }
        if (stock <= product.reorderThreshold) {
          resetSearch();
          openConfirm("warn", "low-stock", available);
          return;
        }
        // Healthy: still show the product for verification before adding.
        resetSearch();
        openConfirm("confirm", undefined, available);
      },
      [qtyInCart, resetSearch, toastError],
    );

    const handleCodeFound = useCallback(
      (product: ScannedProduct) => tryAddProduct(product),
      [tryAddProduct],
    );

    const handleCodeNotFound = useCallback((code: string) => {
      setLookupCode(null);
      if (/^BN-/i.test(code)) {
        // Term looks like a batch number — try BatchLookup before falling back.
        setBatchLookupTerm(code);
      } else {
        setCodeNotFound(true);
        setSearchTerm(code);
      }
    }, []);

    const handleBatchFound = useCallback(
      (product: ScannedProduct) => tryAddProduct(product),
      [tryAddProduct],
    );

    const handleBatchNotFound = useCallback((bn: string) => {
      setBatchLookupTerm(null);
      setCodeNotFound(true);
      setSearchTerm(bn);
    }, []);

    const submitValue = useCallback((raw: string) => {
      const val = raw.trim();
      if (!val) return;
      setCodeNotFound(false);
      setSearchTerm(null);
      setBatchLookupTerm(null);
      setLookupCode(val);
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
      if (codeNotFound || searchTerm !== null || batchLookupTerm !== null) {
        setCodeNotFound(false);
        setSearchTerm(null);
        setBatchLookupTerm(null);
      }
    }

    return (
      <div className="space-y-2">
        <div className="flex items-end gap-2">
          <Field
            label="Barcode / SKU / Name"
            hint={
              codeNotFound
                ? undefined
                : "Scan a barcode or type a SKU, then press Enter."
            }
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

        {/* Identity (barcode-or-SKU) lookup — mounted only when a lookup is in flight */}
        {lookupCode !== null && (
          <IdentityLookup
            key={lookupKey}
            code={lookupCode}
            onFound={handleCodeFound}
            onNotFound={handleCodeNotFound}
          />
        )}

        {/* Batch-number lookup — mounted only when an identity miss reveals a BN- term */}
        {batchLookupTerm !== null && (
          <BatchLookup
            key={`batch-${lookupKey}`}
            batchNumber={batchLookupTerm}
            onFound={handleBatchFound}
            onNotFound={handleBatchNotFound}
          />
        )}

        {codeNotFound && (
          <p
            className="flex items-center gap-1.5 text-xs text-warning-fg"
            role="status"
          >
            <Icon name="alert-triangle" size={14} />
            No barcode/SKU match — showing name search results below.
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
  },
);

export default ProductSearch;
