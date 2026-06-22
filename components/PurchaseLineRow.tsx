"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatPeso } from "@/lib/format";
import {
  Badge,
  Button,
  Field,
  Icon,
  Input,
  SegmentedControl,
  cn,
} from "@/components/ui";

/** Per-line total due = quantity x unit cost; 0 when either is missing/invalid. */
export function lineTotal(d: PurchaseLineDraft): number {
  const q = Number(d.quantity);
  const c = Number(d.unitCost);
  if (!Number.isFinite(q) || !Number.isFinite(c) || q <= 0 || c < 0) return 0;
  return q * c;
}

export type PurchaseLineDraft = {
  id: string;
  mode: "existing" | "new";
  // existing
  existingProductId: Id<"products"> | null;
  existingLabel: string;
  // new
  newName: string;
  newModel: string;
  newCategory: string;
  newSellPrice: string;
  // shared
  quantity: string;
  unitCost: string;
};

export function emptyDraft(): PurchaseLineDraft {
  return {
    id: crypto.randomUUID(),
    mode: "existing",
    existingProductId: null,
    existingLabel: "",
    newName: "",
    newModel: "",
    newCategory: "",
    newSellPrice: "",
    quantity: "1",
    unitCost: "",
  };
}

/** Whole-number parse helper: returns the integer or null if not a valid whole number. */
function parseInteger(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n)) return null;
  return n;
}

function parseNonNegFloat(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Validity check used by the parent to decide whether a draft maps to a line. */
export function isDraftValid(d: PurchaseLineDraft): boolean {
  const qty = parseInteger(d.quantity);
  if (qty === null || qty < 1) return false;
  const cost = parseNonNegFloat(d.unitCost);
  if (cost === null) return false;
  if (d.mode === "existing") {
    return d.existingProductId !== null;
  }
  // new
  if (d.newName.trim() === "") return false;
  if (d.newCategory.trim() === "") return false;
  const sell = parseNonNegFloat(d.newSellPrice);
  if (sell === null) return false;
  return true;
}

type Props = {
  index: number;
  draft: PurchaseLineDraft;
  onChange: (index: number, draft: PurchaseLineDraft) => void;
  onRemove: (index: number) => void;
};

export default function PurchaseLineRow({ index, draft, onChange, onRemove }: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState<string | undefined>(undefined);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the autocomplete search (~300ms)
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

  const products = useQuery(
    api.products.list,
    draft.mode === "existing" && search
      ? { paginationOpts: { numItems: 8, cursor: null }, search, activeOnly: true }
      : "skip",
  );

  function set(patch: Partial<PurchaseLineDraft>) {
    onChange(index, { ...draft, ...patch });
  }

  function selectMode(mode: "existing" | "new") {
    if (mode === "new") {
      setSearchInput("");
      setShowResults(false);
      set({ mode, existingProductId: null, existingLabel: "" });
    } else {
      set({ mode, newName: "", newModel: "", newCategory: "", newSellPrice: "" });
    }
  }

  function selectProduct(p: { _id: Id<"products">; name: string; model?: string; sku: string }) {
    const label = `${p.name}${p.model ? ` · ${p.model}` : ""} (${p.sku || "no sku"})`;
    setSearchInput(label);
    setShowResults(false);
    set({ existingProductId: p._id, existingLabel: label });
  }

  const valid = isDraftValid(draft);
  const results = products?.page ?? [];

  return (
    <div
      className={cn(
        "rounded-lg border p-cell transition-colors",
        valid ? "border-border bg-surface" : "border-warning bg-warning-bg",
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        {/* Mode toggle */}
        <SegmentedControl
          ariaLabel="Line item type"
          size="sm"
          value={draft.mode}
          onChange={(mode) => selectMode(mode)}
          options={[
            { value: "existing", label: "Existing" },
            { value: "new", label: "New product" },
          ]}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          leftIcon={<Icon name="trash" />}
          onClick={() => onRemove(index)}
          aria-label={`Remove line ${index + 1}`}
          className="text-danger-fg"
        >
          Remove
        </Button>
      </div>

      {draft.mode === "existing" ? (
        <div className="relative mb-3">
          <Field label="Match product" required>
            <Input
              type="text"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setShowResults(true);
                // Typing invalidates a prior selection.
                if (draft.existingProductId !== null) {
                  set({ existingProductId: null, existingLabel: "" });
                }
              }}
              onFocus={() => setShowResults(true)}
              placeholder="Search products by name..."
              role="combobox"
              aria-expanded={showResults && !!search && !draft.existingProductId}
              aria-autocomplete="list"
            />
          </Field>
          {draft.existingProductId && (
            <p className="mt-1 text-xs text-success-fg">
              Selected: {draft.existingLabel}
            </p>
          )}
          {showResults && search && !draft.existingProductId && (
            <div
              role="listbox"
              className="absolute z-dropdown mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-md"
            >
              {products === undefined ? (
                <p className="px-cell py-2 text-xs text-text-muted">Searching...</p>
              ) : results.length === 0 ? (
                <p className="px-cell py-2 text-xs text-text-muted">No matches.</p>
              ) : (
                results.map((p) => (
                  <button
                    key={p._id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => selectProduct(p)}
                    className="block w-full px-cell py-2 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                  >
                    <span className="font-medium text-text">{p.name}</span>
                    {p.model && <span className="text-text-muted"> · {p.model}</span>}
                    <span className="block font-mono text-xs text-text-muted">
                      {p.sku || "no sku"}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name" required>
              <Input
                type="text"
                value={draft.newName}
                onChange={(e) => set({ newName: e.target.value })}
                placeholder="Product name"
              />
            </Field>
          </div>
          <Field label="Model">
            <Input
              type="text"
              value={draft.newModel}
              onChange={(e) => set({ newModel: e.target.value })}
              placeholder="Optional"
            />
          </Field>
          <Field label="Category" required>
            <Input
              type="text"
              value={draft.newCategory}
              onChange={(e) => set({ newCategory: e.target.value })}
              placeholder="e.g. Brakes"
            />
          </Field>
          <Field label="Sell price (₱)" required>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={draft.newSellPrice}
              onChange={(e) => set({ newSellPrice: e.target.value })}
              placeholder="0.00"
              className="figure-nums"
            />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Quantity" required>
          <Input
            type="number"
            min="1"
            step="1"
            value={draft.quantity}
            onChange={(e) => set({ quantity: e.target.value })}
            placeholder="1"
            className="figure-nums"
          />
        </Field>
        <Field label="Unit cost (₱)" required>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={draft.unitCost}
            onChange={(e) => set({ unitCost: e.target.value })}
            placeholder="0.00"
            className="figure-nums"
          />
        </Field>
      </div>

      {/* Per-line total due = quantity x unit cost */}
      <div className="mt-2 flex items-center justify-between gap-2 text-sm">
        {!valid ? (
          <Badge variant="warning">Incomplete</Badge>
        ) : (
          <span aria-hidden="true" />
        )}
        <span className="flex items-center gap-2">
          <span className="text-text-muted">Total due:</span>
          <span className="font-semibold text-text tabular-nums">
            {formatPeso(lineTotal(draft))}
          </span>
        </span>
      </div>
    </div>
  );
}
