"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import ProductSearch, { CartItem } from "@/components/ProductSearch";
import ProductGrid, { type AddSource } from "@/components/ProductGrid";
import CategoryChips from "@/components/pos/CategoryChips";
import PosFilters from "@/components/pos/PosFilters";
import Cart from "@/components/Cart";
import Receipt from "@/components/Receipt";
import { formatPeso } from "@/lib/format";
import { flyToCart, findCartTarget } from "@/lib/flyToCart";
import {
  Alert,
  AlertDescription,
  PageHeader,
  Card,
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
  const [completedSaleId, setCompletedSaleId] = useState<Id<"sales"> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gridSearch, setGridSearch] = useState("");
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [stockFilter, setStockFilter] = useState<
    "all" | "inStock" | "low" | "out"
  >("all");
  const [helpOpen, setHelpOpen] = useState(false);
  // Bumps each time an item is added — drives the cart-icon bounce.
  const [cartBump, setCartBump] = useState(0);

  const createSale = useMutation(api.sales.createSale);
  const { success, error: toastError } = useToast();

  const searchRef = useRef<HTMLInputElement>(null);
  const mobileCartIconRef = useRef<HTMLSpanElement>(null);

  // Bump the mobile cart icon whenever an item is added (desktop icon is
  // bumped inside <Cart /> via the same bumpKey prop).
  useEffect(() => {
    if (cartBump === 0) return;
    const el = mobileCartIconRef.current;
    if (!el) return;
    el.classList.remove("cart-bump");
    void el.offsetWidth;
    el.classList.add("cart-bump");
  }, [cartBump]);

  const total = cart.reduce(
    (sum, item) => sum + item.sellPrice * item.quantity,
    0,
  );
  const tendered = parseFloat(cashTendered) || 0;
  const change = tendered - total;
  const canComplete = cart.length > 0 && tendered >= total && !isSubmitting;
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function handleAddToCart(item: CartItem, source: AddSource = null) {
    // Guard: never let the cart exceed on-hand stock. (Grid cards disable at
    // the ceiling, but this protects against rapid taps and scan paths.)
    const existing = cart.find((i) => i.productId === item.productId);
    const inCart = existing?.quantity ?? 0;
    if (inCart + item.quantity > item.stockQty) {
      toastError("No stocks available.");
      return;
    }

    setCart((prev) => {
      const existingIdx = prev.findIndex((i) => i.productId === item.productId);
      if (existingIdx >= 0) {
        return prev.map((i, idx) =>
          idx === existingIdx
            ? { ...i, quantity: i.quantity + item.quantity }
            : i,
        );
      }
      return [...prev, item];
    });

    // Fly-to-cart animation from the tapped card (grid only).
    if (source) {
      const target = findCartTarget();
      if (target)
        flyToCart({
          sourceRect: source.rect,
          target,
          imageUrl: source.imageUrl,
        });
    }
    setCartBump((k) => k + 1);
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
        items: cart.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
        })),
        cashTendered: tendered,
      });
      setCompletedSaleId(result.saleId);
      success("Sale complete", `Change due ${formatPeso(change)}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(message);
      toastError("Sale failed", message);
    } finally {
      setIsSubmitting(false);
    }
  }, [canComplete, createSale, cart, tendered, change, success, toastError]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "?" && !inField) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (e.key === "/" && !inField) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (completedSaleId === null) {
          void handleCompleteSale();
        }
        return;
      }
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
          <div
            key={row.keys}
            className="flex items-center justify-between gap-4"
          >
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

  if (completedSaleId !== null) {
    return (
      <div>
        <div className="mb-6 flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success-bg text-success-fg">
              <Icon name="check-circle" size={26} />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-text sm:text-2xl">
                Sale complete
              </h1>
              <p className="mt-0.5 text-sm text-text-muted">
                Change due{" "}
                <span className="font-semibold text-success-fg">
                  {formatPeso(change)}
                </span>
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            onClick={handleNewSale}
            leftIcon={<Icon name="plus" size={18} />}
            className="shadow-primary!"
          >
            New Sale
          </Button>
        </div>
        <Receipt saleId={completedSaleId} />
        {helpDialog}
      </div>
    );
  }

  const paymentPanel = (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-2">
        <span className="text-sm font-medium text-text-muted">Total</span>
        <span className="text-2xl font-bold tabular-nums text-text">
          {formatPeso(total)}
        </span>
      </div>

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

      {tendered >= total && tendered > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-success-bg px-4 py-3">
          <span className="flex items-center gap-1.5 text-sm font-medium text-success-fg">
            <Icon name="wallet" size={16} />
            Change
          </span>
          <span className="text-xl font-bold tabular-nums text-success-fg">
            {formatPeso(change)}
          </span>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <Icon name="alert-triangle" size={16} />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        size="lg"
        fullWidth
        onClick={handleCompleteSale}
        disabled={!canComplete}
        loading={isSubmitting}
        rightIcon={<Icon name="arrow-right" size={18} />}
        className="shadow-primary!"
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

  return (
    <div>
      <div className="pb-28 xl:pb-0 xl:flex xl:h-[calc(100vh-var(--topbar-h)-3rem)] xl:flex-col">
        <PageHeader
          className="xl:shrink-0"
          title="Point of Sale"
          subtitle={
            cart.length > 0
              ? `${itemCount} item(s) in cart`
              : "Scan or browse to start a sale"
          }
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

        <div className="grid grid-cols-1 gap-4 xl:min-h-0 xl:flex-1 xl:grid-cols-[1fr_22rem] xl:gap-6">
          <section className="space-y-4 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
            <Card>
              <CardBody>
                <ProductSearch
                  ref={searchRef}
                  onAddToCart={handleAddToCart}
                  cartItems={cart}
                />
              </CardBody>
            </Card>

            <Card>
              <CardBody className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
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
              </CardBody>
            </Card>

            <ProductGrid
              search={gridSearch}
              category={category}
              stockFilter={stockFilter}
              cartItems={cart}
              onAdd={handleAddToCart}
            />
          </section>

          <aside className="flex xl:min-h-0">
            <Card className="flex w-full flex-col overflow-hidden xl:h-full xl:min-h-0">
              <Cart items={cart} onUpdate={setCart} bumpKey={cartBump} />
              <div className="hidden shrink-0 border-t border-border p-cell xl:block">
                {paymentPanel}
              </div>
            </Card>
          </aside>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 border-t border-border bg-surface/95 shadow-[0_-4px_12px_-4px_rgb(15_23_42/0.12)] backdrop-blur xl:hidden">
        <details className="group">
          <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <span
                ref={mobileCartIconRef}
                data-cart-fly-target
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"
              >
                <Icon name="shopping-cart" size={18} />
              </span>
              <span className="text-sm font-semibold text-text">Cart</span>
              {cart.length > 0 && (
                <Badge key={itemCount} variant="primary" className="count-pop">
                  {itemCount}
                </Badge>
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
          <div className="max-h-[70vh] overflow-y-auto border-t border-border px-4 py-4">
            {paymentPanel}
          </div>
        </details>
      </div>

      {helpDialog}
    </div>
  );
}
