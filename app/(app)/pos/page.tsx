"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import ProductSearch, { CartItem } from "@/components/ProductSearch";
import ProductGrid from "@/components/ProductGrid";
import CategoryChips from "@/components/pos/CategoryChips";
import PosFilters from "@/components/pos/PosFilters";
import Cart from "@/components/Cart";
import Receipt from "@/components/Receipt";
import { formatPeso } from "@/lib/format";
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Button,
  Field,
  Input,
  Dialog,
  Icon,
  Badge,
  useToast,
} from "@/components/ui";

export default function PosPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cashTendered, setCashTendered] = useState("");
  const [completedSaleId, setCompletedSaleId] = useState<Id<"sales"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gridSearch, setGridSearch] = useState("");
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [stockFilter, setStockFilter] = useState<"all" | "inStock" | "low" | "out">("all");
  const [helpOpen, setHelpOpen] = useState(false);

  const createSale = useMutation(api.sales.createSale);
  const { success, error: toastError } = useToast();

  const searchRef = useRef<HTMLInputElement>(null);

  const total = cart.reduce((sum, item) => sum + item.sellPrice * item.quantity, 0);
  const tendered = parseFloat(cashTendered) || 0;
  const change = tendered - total;
  const canComplete = cart.length > 0 && tendered >= total && !isSubmitting;
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function handleAddToCart(item: CartItem) {
    setCart((prev) => {
      // If the same product already exists, increment its quantity
      const existing = prev.findIndex((i) => i.productId === item.productId);
      if (existing >= 0) {
        return prev.map((i, idx) =>
          idx === existing ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, item];
    });
  }

  function handleNewSale() {
    setCart([]);
    setCashTendered("");
    setCompletedSaleId(null);
    setError(null);
  }

  const handleCompleteSale = useCallback(async () => {
    if (!canComplete) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await createSale({
        items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        cashTendered: tendered,
      });
      setCompletedSaleId(result.saleId);
      success("Sale complete", `Change due ${formatPeso(change)}`);
      // Don't clear cart yet — keep visible until "New Sale" is clicked
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
      toastError("Sale failed", message);
    } finally {
      setIsSubmitting(false);
    }
  }, [canComplete, createSale, cart, tendered, change, success, toastError]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't hijack typing in inputs except for the documented combos.
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      // "?" opens help (only when not typing).
      if (e.key === "?" && !inField) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      // "/" focuses the search box.
      if (e.key === "/" && !inField) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      // Ctrl/Cmd+Enter completes the sale.
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (completedSaleId === null) {
          void handleCompleteSale();
        }
        return;
      }
      // Ctrl/Cmd+N starts a new sale.
      if ((e.ctrlKey || e.metaKey) && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        handleNewSale();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [completedSaleId, handleCompleteSale]);

  const helpDialog = (
    <Dialog
      open={helpOpen}
      onClose={() => setHelpOpen(false)}
      title="Keyboard shortcuts"
      size="sm"
    >
      <dl className="space-y-2 text-sm">
        {[
          { keys: "/", label: "Focus search / scan box" },
          { keys: "Ctrl / ⌘ + Enter", label: "Complete sale" },
          { keys: "Ctrl / ⌘ + N", label: "New sale" },
          { keys: "?", label: "Show this help" },
        ].map((row) => (
          <div key={row.keys} className="flex items-center justify-between gap-4">
            <dt className="order-2">
              <kbd className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs font-medium text-text">
                {row.keys}
              </kbd>
            </dt>
            <dd className="order-1 text-text-muted">{row.label}</dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );

  // ── Receipt view (after successful sale) ──────────────────────────────────
  if (completedSaleId !== null) {
    return (
      <div>
        <PageHeader
          title="Sale complete"
          subtitle="Receipt ready to print"
          actions={
            <Button
              variant="primary"
              onClick={handleNewSale}
              leftIcon={<Icon name="plus" size={18} />}
            >
              New Sale
            </Button>
          }
        />
        <Receipt saleId={completedSaleId} />
        {helpDialog}
      </div>
    );
  }

  // ── Payment panel (shared between desktop column and mobile sheet) ─────────
  const paymentPanel = (
    <div className="space-y-4">
      {/* Order total */}
      <div className="flex items-center justify-between border-y border-border py-3">
        <span className="text-sm text-text-muted">Order Total</span>
        <span className="text-2xl font-bold tabular-nums text-text">
          {formatPeso(total)}
        </span>
      </div>

      {/* Cash tendered */}
      <Field label="Cash Tendered (₱)">
        <Input
          id="cash-tendered"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={cashTendered}
          onChange={(e) => setCashTendered(e.target.value)}
          placeholder="0.00"
          className="tabular-nums"
        />
      </Field>

      {/* Change */}
      {tendered >= total && tendered > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-success-bg px-4 py-3">
          <span className="text-sm font-medium text-success-fg">Change</span>
          <span className="text-xl font-bold tabular-nums text-success-fg">
            {formatPeso(change)}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger-fg/30 bg-danger-bg px-4 py-3 text-sm text-danger-fg"
        >
          <Icon name="alert-triangle" size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Complete Sale */}
      <Button
        size="lg"
        fullWidth
        onClick={handleCompleteSale}
        disabled={!canComplete}
        loading={isSubmitting}
      >
        {isSubmitting ? "Processing" : "Complete Sale"}
      </Button>

      {cart.length === 0 && (
        <p className="text-center text-xs text-text-muted">
          Add items to the cart to begin.
        </p>
      )}
      {cart.length > 0 && tendered < total && (
        <p className="text-center text-xs text-warning-fg">
          Enter cash tendered ≥ {formatPeso(total)} to proceed.
        </p>
      )}
    </div>
  );

  // ── POS view ──────────────────────────────────────────────────────────────
  return (
    <div className="pb-28 xl:pb-0">
      <PageHeader
        title="Point of Sale"
        subtitle={cart.length > 0 ? `${itemCount} item(s) in cart` : "Scan or browse to start a sale"}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHelpOpen(true)}
            aria-label="Keyboard shortcuts"
            leftIcon={<Icon name="info" size={16} />}
          >
            Shortcuts
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left + centre: scan box, product grid, cart */}
        <div className="space-y-4 xl:col-span-2">
          {/* Scan / SKU lookup */}
          <Card>
            <CardBody>
              <ProductSearch ref={searchRef} onAddToCart={handleAddToCart} />
            </CardBody>
          </Card>

          {/* Browse grid */}
          <Card>
            <CardBody className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Field label="Browse products" className="flex-1">
                  <Input
                    id="grid-search"
                    type="text"
                    value={gridSearch}
                    onChange={(e) => setGridSearch(e.target.value)}
                    placeholder="Filter by name…"
                  />
                </Field>
                <PosFilters value={stockFilter} onChange={setStockFilter} />
              </div>
              <CategoryChips value={category} onChange={setCategory} />
              <div className="max-h-[60vh] overflow-y-auto sm:max-h-[70vh]">
                <ProductGrid
                  search={gridSearch}
                  category={category}
                  stockFilter={stockFilter}
                  onAdd={handleAddToCart}
                />
              </div>
            </CardBody>
          </Card>

          {/* Cart */}
          <Card>
            <CardBody className="min-h-[200px]">
              <Cart items={cart} onUpdate={setCart} />
            </CardBody>
          </Card>
        </div>

        {/* Right column: payment (desktop) */}
        <Card className="hidden self-start xl:block">
          <CardHeader>
            <h2 className="flex items-center gap-2 text-base font-semibold text-text">
              <Icon name="receipt" size={18} className="text-text-muted" />
              Payment
            </h2>
          </CardHeader>
          <CardBody>{paymentPanel}</CardBody>
        </Card>
      </div>

      {/* Mobile/tablet: payment as a sticky bottom sheet */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface shadow-md xl:hidden">
        <details className="group">
          <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <Icon name="shopping-cart" size={20} className="text-text-muted" />
              <span className="text-sm font-medium text-text">Payment</span>
              {cart.length > 0 && (
                <Badge variant="primary">{itemCount}</Badge>
              )}
            </span>
            <span className="flex items-center gap-2">
              <span className="text-lg font-bold tabular-nums text-text">
                {formatPeso(total)}
              </span>
              <Icon
                name="chevron-up"
                size={18}
                className="text-text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
              />
            </span>
          </summary>
          <div className="max-h-[60vh] overflow-y-auto border-t border-border px-4 py-4">
            {paymentPanel}
          </div>
        </details>
      </div>

      {helpDialog}
    </div>
  );
}
