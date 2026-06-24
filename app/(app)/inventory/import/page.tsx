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
  lineTotal,
} from "@/components/PurchaseLineRow";
import type { ParsedInvoice } from "@/lib/ocr/types";
import { formatPeso } from "@/lib/format";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Icon,
  Input,
  PageHeader,
  Skeleton,
  SkeletonText,
  Spinner,
  useToast,
} from "@/components/ui";

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
  const { success, error: toastError } = useToast();

  // File / upload state
  const [storageId, setStorageId] = useState<Id<"_storage"> | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // OCR auto-extract state
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [ocrStage, setOcrStage] = useState<string | null>(null);
  const [ocrFraction, setOcrFraction] = useState(0);
  const [ocrError, setOcrError] = useState<string | null>(null);

  // Header fields
  const [supplierName, setSupplierName] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
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

  if (currentUser === undefined) {
    return (
      <div>
        <PageHeader title="Import Invoice" icon="upload" />
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardBody className="space-y-3">
              <Skeleton height={20} width="40%" />
              <Skeleton height={40} />
              <Skeleton height="60vh" />
            </CardBody>
          </Card>
          <Card>
            <CardBody className="space-y-3">
              <SkeletonText lines={4} />
              <Skeleton height={80} />
              <Skeleton height={80} />
            </CardBody>
          </Card>
        </div>
      </div>
    );
  }
  if (currentUser?.role !== "admin") {
    return (
      <div>
        <PageHeader title="Import Invoice" icon="upload" />
        <EmptyState
          icon="alert-triangle"
          title="Admins only"
          description="You do not have permission to import invoices."
        />
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
    // Keep the raw File so "Re-extract" can re-run; kick off OCR on the local
    // File in parallel with the storage upload (independent of it).
    setCurrentFile(file);
    void runExtraction(file);
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

  async function runExtraction(file: File) {
    setOcrError(null);
    setOcrStage("Starting");
    setOcrFraction(0);
    try {
      const { extractInvoice } = await import("@/lib/ocr/extractInvoice");
      const parsed = await extractInvoice(file, ({ stage, fraction }) => {
        setOcrStage(stage);
        setOcrFraction(fraction);
      });
      applyParsed(parsed);
    } catch (e) {
      setOcrError(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setOcrStage(null);
    }
  }

  function applyParsed(parsed: ParsedInvoice) {
    if (parsed.supplierName && supplierName.trim() === "")
      setSupplierName(parsed.supplierName);
    if (parsed.supplierAddress && supplierAddress.trim() === "")
      setSupplierAddress(parsed.supplierAddress);
    if (parsed.referenceNumber && referenceNumber.trim() === "")
      setReferenceNumber(parsed.referenceNumber);
    if (parsed.purchaseDate) setPurchaseDate(parsed.purchaseDate);
    const newDrafts: PurchaseLineDraft[] = parsed.lines.map((l) => ({
      ...emptyDraft(),
      mode: "new" as const,
      newName: l.item ?? "",
      newModel: l.model ?? "",
      newCategory: "",
      newSellPrice: "",
      quantity: l.quantity != null ? String(l.quantity) : "1",
      unitCost: l.unitCost != null ? String(l.unitCost) : "",
    }));
    setDrafts(newDrafts.length > 0 ? newDrafts : [emptyDraft()]);
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
  // Totals reflect every line that has a quantity and a unit cost — even before
  // its Category/Sell Price are filled — so the grand total matches the sum of
  // the per-line "Total due" values shown on each row.
  const runningTotal = drafts.reduce((sum, d) => sum + lineTotal(d), 0);
  const totalUnits = drafts.reduce((sum, d) => {
    const q = Number(d.quantity);
    return sum + (Number.isFinite(q) && q > 0 ? q : 0);
  }, 0);

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
        supplierAddress: supplierAddress.trim() !== "" ? supplierAddress.trim() : undefined,
        referenceNumber: referenceNumber.trim() !== "" ? referenceNumber.trim() : undefined,
        purchaseDate: new Date(purchaseDate + "T00:00:00").getTime(),
        lines,
      });
      setSummary({
        linesImported: result.linesImported,
        productsCreated: result.productsCreated,
        total: result.total,
      });
      success(
        "Import complete",
        `${result.linesImported} line${result.linesImported === 1 ? "" : "s"} imported.`,
      );
      resetForm();
    } catch (err: unknown) {
      // Do NOT clear the form on error.
      const message = err instanceof Error ? err.message : "Import failed.";
      setSubmitError(message);
      toastError("Import failed", message);
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
    setSupplierAddress("");
    setReferenceNumber("");
    setPurchaseDate(todayString());
    setDrafts([emptyDraft()]);
    setSubmitError(null);
    setUploadError(null);
    setCurrentFile(null);
    setOcrStage(null);
    setOcrFraction(0);
    setOcrError(null);
  }

  function newImport() {
    resetForm();
    setSummary(null);
  }

  // Success screen
  if (summary) {
    return (
      <div>
        <PageHeader title="Import Invoice" icon="upload" />
        <Card className="max-w-md">
          <CardHeader className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-gradient-soft ring-1 ring-success-fg/30 text-success-fg">
              <Icon name="check" size={20} />
            </span>
            <span className="text-lg font-semibold text-text">Import complete</span>
          </CardHeader>
          <CardBody>
            <dl className="space-y-2 text-sm text-text">
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Lines imported</dt>
                <dd className="font-medium tabular-nums">{summary.linesImported}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Products created</dt>
                <dd className="font-medium tabular-nums">{summary.productsCreated}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Total cost</dt>
                <dd className="font-medium tabular-nums">{formatPeso(summary.total)}</dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={newImport} leftIcon={<Icon name="plus" />}>
                New import
              </Button>
              <Link
                href="/inventory/purchases"
                className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-border bg-surface px-4 text-sm font-medium text-text shadow-sm transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                <Icon name="truck" size={16} />
                View purchases
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  const pct = Math.round(ocrFraction * 100);

  return (
    <div>
      <PageHeader
        title="Import Invoice"
        subtitle="Upload a supplier invoice PDF, review the extracted lines, then import."
        icon="upload"
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Left: upload + PDF viewer */}
        <Card>
          <CardBody className="space-y-3">
            <Field label="Invoice PDF" required>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                className="block w-full cursor-pointer text-sm text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-fg hover:file:bg-primary-hover"
              />
            </Field>

            {uploading && (
              <p className="flex items-center gap-2 text-xs text-text-muted">
                <Spinner size={14} /> Uploading...
              </p>
            )}
            {storageId && !uploading && (
              <p className="flex items-center gap-1.5 text-xs text-success-fg">
                <Icon name="check" /> Upload complete.
              </p>
            )}
            {uploadError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-danger bg-danger-bg px-3 py-2 text-sm text-danger-fg"
              >
                <Icon name="alert-triangle" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* OCR auto-extract status */}
            {ocrStage !== null && (
              <div>
                <div
                  className="mb-1 flex items-center justify-between text-xs text-text-muted"
                  aria-live="polite"
                >
                  <span className="flex items-center gap-1.5">
                    <Spinner size={12} /> Reading invoice: {ocrStage}
                  </span>
                  <span className="tabular-nums">{pct}%</span>
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Invoice extraction progress"
                >
                  <div
                    className="h-full bg-primary transition-all motion-reduce:transition-none"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            {ocrError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-warning bg-warning-bg px-3 py-2 text-sm text-warning-fg"
              >
                <Icon name="alert-triangle" />
                <span>
                  Auto-extract failed: {ocrError}. You can still fill in the lines
                  manually below.
                </span>
              </div>
            )}

            {currentFile && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={ocrStage !== null}
                  leftIcon={ocrStage === null ? <Icon name="refresh" /> : undefined}
                  onClick={() => {
                    if (currentFile) void runExtraction(currentFile);
                  }}
                >
                  {ocrStage !== null ? "Extracting..." : "Re-extract"}
                </Button>
                <p className="text-xs text-text-muted">
                  Review the extracted rows against the document and correct any
                  mistakes before importing.
                </p>
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-border bg-surface-2">
              {objectUrl ? (
                <iframe
                  src={objectUrl}
                  className="h-[70vh] w-full"
                  title="Invoice PDF"
                />
              ) : (
                <div className="flex h-[70vh] items-center justify-center">
                  <EmptyState
                    icon="receipt"
                    title="No invoice selected"
                    description="Select a PDF to preview it here."
                  />
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Right: header fields + line entry */}
        <Card>
          <CardBody>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Supplier name" required>
                  <Input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Supplier"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Address">
                  <Input
                    type="text"
                    value={supplierAddress}
                    onChange={(e) => setSupplierAddress(e.target.value)}
                    placeholder="Optional"
                  />
                </Field>
              </div>
              <Field label="Reference #">
                <Input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Optional"
                />
              </Field>
              <Field label="Purchase date" required>
                <Input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                />
              </Field>
            </div>

            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-text">Line items</h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                leftIcon={<Icon name="plus" />}
                onClick={addLine}
              >
                Add line
              </Button>
            </div>

            {drafts.some((d) => d.mode === "new" && !isDraftValid(d)) && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-warning bg-warning-bg px-3 py-2 text-xs text-warning-fg">
                <Icon name="alert-triangle" />
                <span>
                  Extracted rows need a Category and Sell Price before they can be
                  imported.
                </span>
              </div>
            )}

            <div className="space-y-3">
              {drafts.map((draft, index) => (
                <PurchaseLineRow
                  key={draft.id}
                  index={index}
                  draft={draft}
                  onChange={updateDraft}
                  onRemove={removeLine}
                />
              ))}
            </div>

            {/* Totals */}
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-cell py-row text-sm">
              <span className="text-text-muted">
                <span className="tabular-nums">{validDrafts.length}</span> valid line
                {validDrafts.length === 1 ? "" : "s"} ·{" "}
                <span className="tabular-nums">{totalUnits}</span> unit
                {totalUnits === 1 ? "" : "s"}
              </span>
              <span className="font-semibold text-text tabular-nums">
                {formatPeso(runningTotal)}
              </span>
            </div>

            {submitError && (
              <div
                role="alert"
                className="mt-3 flex items-start gap-2 rounded-md border border-danger bg-danger-bg px-3 py-2 text-sm text-danger-fg"
              >
                <Icon name="alert-triangle" />
                <span>{submitError}</span>
              </div>
            )}

            <Button
              type="button"
              fullWidth
              className="mt-4"
              loading={submitting}
              disabled={!canImport}
              onClick={handleImport}
            >
              {submitting ? "Importing..." : "Import"}
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
