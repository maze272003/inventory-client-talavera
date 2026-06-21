"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import PurchaseLineRow, {
  PurchaseLineDraft,
  emptyDraft,
  isDraftValid,
} from "@/components/PurchaseLineRow";
import { formatPeso } from "@/lib/format";

type CreateLine =
  | { existingProductId: Id<"products">; quantity: number; unitCost: number }
  | {
      newProduct: { name: string; model?: string; category: string; sellPrice: number };
      quantity: number;
      unitCost: number;
    };

type Summary = {
  linesImported: number;
  productsCreated: number;
  total: number;
};

function todayString(): string {
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tz).toISOString().slice(0, 10);
}

/** Maps a valid draft to the exact createPurchase line shape. */
function draftToLine(d: PurchaseLineDraft): CreateLine {
  const quantity = Number(d.quantity);
  const unitCost = Number(d.unitCost);
  if (d.mode === "existing") {
    return { existingProductId: d.existingProductId as Id<"products">, quantity, unitCost };
  }
  return {
    newProduct: {
      name: d.newName.trim(),
      model: d.newModel.trim() !== "" ? d.newModel.trim() : undefined,
      category: d.newCategory.trim(),
      sellPrice: Number(d.newSellPrice),
    },
    quantity,
    unitCost,
  };
}

export default function ImportPage() {
  const currentUser = useQuery(api.users.currentUser);
  const generateUploadUrl = useMutation(api.files.generateUploadUrl);
  const createPurchase = useMutation(api.purchases.createPurchase);

  // File / upload state
  const [storageId, setStorageId] = useState<Id<"_storage"> | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Header fields
  const [supplierName, setSupplierName] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayString());

  // Line drafts (parent is source of truth)
  const [drafts, setDrafts] = useState<PurchaseLineDraft[]>([emptyDraft()]);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  // Revoke object URL on change / unmount
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  if (currentUser === undefined) return null;
  if (currentUser?.role !== "admin") {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Import Invoice</h1>
        <p className="text-red-600">Admins only.</p>
      </div>
    );
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;
    setUploadError(null);
    setSummary(null);
    // Show the PDF immediately via a local object URL.
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setStorageId(null);
    setUploading(true);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId: id } = await res.json();
      setStorageId(id as Id<"_storage">);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function updateDraft(index: number, draft: PurchaseLineDraft) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? draft : d)));
  }

  function addLine() {
    setDrafts((prev) => [...prev, emptyDraft()]);
  }

  function removeLine(index: number) {
    setDrafts((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  const validDrafts = drafts.filter(isDraftValid);
  const runningTotal = validDrafts.reduce(
    (sum, d) => sum + Number(d.unitCost) * Number(d.quantity),
    0,
  );
  const totalUnits = validDrafts.reduce((sum, d) => sum + Number(d.quantity), 0);

  const canImport =
    storageId !== null &&
    !uploading &&
    supplierName.trim() !== "" &&
    validDrafts.length > 0 &&
    !submitting;

  async function handleImport() {
    if (!canImport || storageId === null) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const lines = validDrafts.map(draftToLine);
      const result = await createPurchase({
        fileId: storageId,
        supplierName: supplierName.trim(),
        referenceNumber: referenceNumber.trim() !== "" ? referenceNumber.trim() : undefined,
        purchaseDate: new Date(purchaseDate).getTime(),
        lines,
      });
      setSummary({
        linesImported: result.linesImported,
        productsCreated: result.productsCreated,
        total: result.total,
      });
      resetForm();
    } catch (err: unknown) {
      // Do NOT clear the form on error.
      setSubmitError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setStorageId(null);
    setSupplierName("");
    setReferenceNumber("");
    setPurchaseDate(todayString());
    setDrafts([emptyDraft()]);
    setSubmitError(null);
    setUploadError(null);
  }

  function newImport() {
    resetForm();
    setSummary(null);
  }

  // Success screen
  if (summary) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Import Invoice</h1>
        <div className="max-w-md rounded-xl border border-green-200 bg-green-50 p-6">
          <h2 className="text-lg font-semibold text-green-800 mb-3">Import complete</h2>
          <dl className="space-y-1 text-sm text-gray-700">
            <div className="flex justify-between">
              <dt>Lines imported</dt>
              <dd className="font-medium">{summary.linesImported}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Products created</dt>
              <dd className="font-medium">{summary.productsCreated}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Total cost</dt>
              <dd className="font-medium">{formatPeso(summary.total)}</dd>
            </div>
          </dl>
          <div className="mt-5 flex gap-3">
            <button
              onClick={newImport}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              New import
            </button>
            <Link
              href="/inventory/purchases"
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              View purchases
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Import Invoice</h1>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: upload + PDF viewer */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Invoice PDF <span className="text-red-500">*</span>
          </label>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
          />
          {uploading && <p className="mt-2 text-xs text-gray-500">Uploading...</p>}
          {storageId && !uploading && (
            <p className="mt-2 text-xs text-green-700">Upload complete.</p>
          )}
          {uploadError && (
            <p className="mt-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {uploadError}
            </p>
          )}

          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
            {objectUrl ? (
              <iframe src={objectUrl} className="w-full h-[70vh]" title="Invoice PDF" />
            ) : (
              <div className="flex items-center justify-center h-[70vh] text-sm text-gray-400">
                Select a PDF to preview it here.
              </div>
            )}
          </div>
        </div>

        {/* Right: header fields + line entry */}
        <div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Supplier name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Supplier"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference #
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Purchase date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold text-gray-800">Line items</h2>
            <button
              type="button"
              onClick={addLine}
              className="text-sm px-3 py-1.5 rounded-lg font-medium text-blue-600 hover:bg-blue-50 transition-colors"
            >
              + Add line
            </button>
          </div>

          <div className="space-y-3">
            {drafts.map((draft, index) => (
              <PurchaseLineRow
                key={index}
                index={index}
                draft={draft}
                onChange={updateDraft}
                onRemove={removeLine}
              />
            ))}
          </div>

          {/* Totals */}
          <div className="mt-4 flex items-center justify-between rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm">
            <span className="text-gray-600">
              {validDrafts.length} valid line{validDrafts.length === 1 ? "" : "s"} ·{" "}
              {totalUnits} unit{totalUnits === 1 ? "" : "s"}
            </span>
            <span className="font-semibold text-gray-900">{formatPeso(runningTotal)}</span>
          </div>

          {submitError && (
            <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {submitError}
            </p>
          )}

          <button
            type="button"
            onClick={handleImport}
            disabled={!canImport}
            className="mt-4 w-full px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
    </div>
  );
}
