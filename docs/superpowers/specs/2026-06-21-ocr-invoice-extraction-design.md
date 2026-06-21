# Supplier Invoice OCR Auto-Extraction Design Spec

**Date:** 2026-06-21
**Status:** Approved design, ready for implementation planning
**Builds on:** `2026-06-21-v2-enhancements-design.md` (the supplier-invoice import feature)

## 1. Overview

Replace the fully-manual line entry of the supplier-invoice import with
**automatic OCR extraction**: when the user uploads the supplier PDF (or photo),
the app reads it client-side with Tesseract (compiled to WebAssembly) and
pre-fills the import line rows and header fields. The user then reviews, edits,
and confirms — no key, no server, no cost, works offline.

### Goals

- On upload, auto-extract line items (quantity, model, item name, unit cost)
  and header info (supplier name, reference number) from the document.
- Pre-fill the existing import form so the user does not type rows manually.
- Keep the human review/confirm step: extraction is best-effort; nothing is
  committed to inventory until the user confirms (uses the existing atomic
  `createPurchase`).
- Run entirely in the browser via Tesseract WASM (`tesseract.js`); no AI API,
  no API key, no per-use cost, offline-capable.

### Non-goals (YAGNI)

- No AI/LLM vision API (no Anthropic/OpenAI key).
- No server-side OCR (Convex action); OCR runs client-side.
- No guarantee of perfect accuracy on photographed/skewed documents — the
  review step is the correctness safeguard.
- No training of custom OCR models; use the stock English Tesseract data.
- No automatic commit — extraction only pre-fills; the user always confirms.

## 2. Accuracy expectations

The real input is often a phone photo of a dense, slightly skewed printed
quotation with handwriting (see the v2 sample). Tesseract reads most printed
text, but reconstructing the **table** (mapping words to QTY / MODEL / ITEM /
W.SALE columns) from such an image is inherently error-prone. Therefore:

- Extraction produces a **best-effort pre-fill**, displayed beside the rendered
  document image so the user can compare against the source.
- Image preprocessing (grayscale + threshold, ~2× upscale) is applied to
  improve results.
- The user-review-and-confirm step (already built) is mandatory and is what
  makes the feature safe despite imperfect OCR.

## 3. Architecture

Entirely client-side, inside the existing import page
(`app/(app)/inventory/import/page.tsx`). The browser already holds the uploaded
`File`; OCR runs on it locally. The file is still uploaded to Convex storage for
the record (existing behavior, unchanged).

### OCR pipeline module — `lib/ocr/`

Small, single-responsibility units:

- **`renderToImages(file: File): Promise<HTMLCanvasElement[]>`**
  - PDF → render each page to a canvas at ~2× scale using `pdfjs-dist`.
  - Image (jpeg/png) → draw onto a single canvas.
  - Bounded to a sane max page count (e.g. first 5 pages) to avoid runaway work;
    if more pages exist, note it to the caller.
- **`preprocess(canvas: HTMLCanvasElement): HTMLCanvasElement`**
  - Grayscale + simple threshold/contrast to improve OCR on photos.
- **`runOcr(canvas, onProgress): Promise<OcrResult>`**
  - `tesseract.js` `recognize()` with the `eng` language, returning the full
    text plus **word-level entries** `{ text, bbox: { x0, y0, x1, y1 } }` and a
    progress fraction reported via `onProgress(fraction)`.
- **`parseInvoice(words: OcrWord[]): ParsedInvoice`** — pure function, the
  accuracy-critical and unit-tested core:
  - Group words into rows by vertical overlap (y bands).
  - Infer column x-bands: when header words (QTY, UNIT, MODEL, ITEM, W.SALE,
    TOTAL, or close variants) are detected, anchor columns on their x-centers;
    otherwise fall back to detecting the rightmost numeric column as unit
    cost / total and the leftmost small-integer column as quantity.
  - Emit `ParsedInvoice = { supplierName?: string; referenceNumber?: string;
    lines: ParsedLine[] }` where
    `ParsedLine = { quantity?: number; model?: string; item?: string;
    unitCost?: number }`.
  - Detect `supplierName`/`referenceNumber` from labeled tokens
    (e.g. "Customer", "Number", "Date") when present.
  - Robust to missing cells: a field that can't be parsed is left `undefined`
    (the review form shows it blank for the user to fill).

`OcrWord`, `OcrResult`, `ParsedInvoice`, `ParsedLine` are exported types from
`lib/ocr/`.

### Self-hosted WASM assets

`tesseract.js` and `pdfjs-dist` fetch their worker / WASM core / language data
from a CDN by default. To keep the feature offline and CSP-safe, vendor the
assets into `public/` and point the libraries at local paths:

- `public/tesseract/` — `worker.min.js`, `tesseract-core.wasm(.js)`, and
  `eng.traineddata` (gzipped as the lib expects); configure
  `createWorker` with `workerPath`/`corePath`/`langPath` pointing at
  `/tesseract/...`.
- `public/pdf/` — the `pdfjs-dist` worker; set
  `GlobalWorkerOptions.workerSrc` to `/pdf/pdf.worker.min.mjs`.

Document the exact vendored file versions so they match the installed package
versions.

## 4. Integration into the import page

`app/(app)/inventory/import/page.tsx` (admin-only, unchanged guard):

- On file upload (existing upload-to-storage flow retained), kick off OCR on the
  local `File`. Show a progress indicator ("Reading… 47%", per-page status).
  Provide a **"Re-extract"** button to run it again, and allow the user to skip
  OCR and enter manually.
- On completion, **pre-fill**:
  - Header: `supplierName` / `referenceNumber` if detected (user can edit;
    purchase date still defaults to today).
  - Line rows: one draft per parsed line, defaulting to **New product** mode
    with `name = item`, `model = model`, `unitCost = unitCost`,
    `quantity = quantity` (blank fields stay blank). Category and sell price are
    left for the user (category required before import, per existing
    validation).
- The user reviews each row beside the rendered image, edits any misread value,
  switches a row to **match an existing product** where appropriate, then clicks
  **Import** — the existing atomic `createPurchase` mutation (unchanged) writes
  products + `stock_in` ledger rows.
- Manual **"Add line"** remains available. Errors during OCR (e.g. unreadable
  file) surface inline and fall back to manual entry — the page never blocks on
  OCR failure.

No backend/schema change. `createPurchase`, `purchases`, the ledger, and the
review/confirm UX are all reused as-is.

## 5. Testing

- **`parseInvoice` unit tests** (vitest) — the meaningful coverage:
  - A clean multi-row fixture (word list with bboxes simulating QTY/MODEL/ITEM/
    W.SALE columns) → asserts the correct number of lines and correct
    quantity / item / unitCost per line, in column order.
  - A messy fixture (missing cells, a row with no model, a stray word) → asserts
    graceful handling (missing fields `undefined`, no crash, no phantom lines).
  - Header detection: a fixture containing "Customer: SAN PEDRO" / "Number:
    508238" → asserts `supplierName` / `referenceNumber` parsed.
- `renderToImages`, `preprocess`, and `runOcr` rely on browser/WASM APIs
  (canvas, workers) and are verified manually in the running app, not unit
  tested (heavy, environment-bound). Keep these thin so the testable logic lives
  in `parseInvoice`.

## 6. Dependencies

Adds **`tesseract.js`** and **`pdfjs-dist`** (this intentionally overrides the
v2 plan's "no new dependencies" constraint, per explicit user request for a
Tesseract-WASM OCR approach). No other new dependencies; no API keys.

## 7. Build Order (drives the implementation plan)

1. OCR pipeline module `lib/ocr/` (`renderToImages`, `preprocess`, `runOcr`,
   `parseInvoice`) + vendored WASM assets in `public/` + `parseInvoice` unit
   tests.
2. Wire OCR into the import page: auto-run on upload, progress UI, pre-fill
   header + line drafts, "Re-extract" / skip-to-manual, graceful error
   fallback.
3. Preprocessing/accuracy tuning pass and responsive/UX polish (progress states,
   large-file/page-count guardrails, clear "review before import" messaging).
