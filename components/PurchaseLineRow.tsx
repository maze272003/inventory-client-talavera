"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatPeso } from "@/lib/format";

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
      className={`rounded-lg border p-3 ${
        valid ? "border-gray-200 bg-white" : "border-amber-200 bg-amber-50/40"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        {/* Mode toggle */}
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
          <button
            type="button"
            onClick={() => selectMode("existing")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              draft.mode === "existing"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Existing
          </button>
          <button
            type="button"
            onClick={() => selectMode("new")}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              draft.mode === "new"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            New product
          </button>
        </div>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-xs px-2 py-1 rounded text-red-600 hover:bg-red-50 transition-colors"
        >
          Remove
        </button>
      </div>

      {draft.mode === "existing" ? (
        <div className="relative mb-3">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Match product <span className="text-red-500">*</span>
          </label>
          <input
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
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {draft.existingProductId && (
            <p className="mt-1 text-xs text-green-700">Selected: {draft.existingLabel}</p>
          )}
          {showResults && search && !draft.existingProductId && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg max-h-56 overflow-y-auto">
              {products === undefined ? (
                <p className="px-3 py-2 text-xs text-gray-400">Searching...</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-400">No matches.</p>
              ) : (
                results.map((p) => (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => selectProduct(p)}
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                  >
                    <span className="font-medium text-gray-900">{p.name}</span>
                    {p.model && <span className="text-gray-500"> · {p.model}</span>}
                    <span className="block text-xs text-gray-400 font-mono">
                      {p.sku || "no sku"}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={draft.newName}
              onChange={(e) => set({ newName: e.target.value })}
              placeholder="Product name"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Model</label>
            <input
              type="text"
              value={draft.newModel}
              onChange={(e) => set({ newModel: e.target.value })}
              placeholder="Optional"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Category <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={draft.newCategory}
              onChange={(e) => set({ newCategory: e.target.value })}
              placeholder="e.g. Brakes"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Sell price (₱) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.newSellPrice}
              onChange={(e) => set({ newSellPrice: e.target.value })}
              placeholder="0.00"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Quantity <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={draft.quantity}
            onChange={(e) => set({ quantity: e.target.value })}
            placeholder="1"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Unit cost (₱) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.unitCost}
            onChange={(e) => set({ unitCost: e.target.value })}
            placeholder="0.00"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Per-line total due = quantity x unit cost */}
      <div className="mt-2 flex items-center justify-end gap-2 text-sm">
        <span className="text-gray-500">Total due:</span>
        <span className="font-semibold text-gray-900">{formatPeso(lineTotal(draft))}</span>
      </div>
    </div>
  );
}
