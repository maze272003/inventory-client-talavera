# Supplier Invoice OCR Auto-Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-extract supplier-invoice line items and header info from an uploaded PDF/photo using Tesseract compiled to WASM (client-side), pre-filling the existing import form for the user to review and confirm.

**Architecture:** A client-side `lib/ocr/` pipeline renders the PDF to images (pdf.js), preprocesses them, runs Tesseract WASM (`tesseract.js`) to get word-level boxes, and a pure `parseInvoice` function reconstructs the table into structured lines. The import page runs this on upload and pre-fills the existing line-row drafts; the user reviews/edits and confirms via the unchanged `createPurchase`.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, `tesseract.js` (Tesseract WASM), `pdfjs-dist` (PDF→canvas), vitest.

## Global Constraints

- OCR runs **client-side** in the browser. No server/Convex action, no AI API, no API key, no per-use cost. Must work offline.
- Vendored WASM assets in `public/` (Tesseract worker + core wasm + `eng.traineddata`; pdf.js worker); libraries configured to load from those local paths, NOT a CDN.
- Extraction is **best-effort pre-fill only** — nothing is committed to inventory without the user's review and explicit Import (reuse the existing atomic `api.purchases.createPurchase`; do NOT change it or the schema).
- `parseInvoice` is a **pure function** and the unit-tested core; the browser/WASM pipeline (`renderToImages`/`preprocess`/`runOcr`) is verified manually.
- New deps allowed for this feature: `tesseract.js`, `pdfjs-dist` (explicitly overrides the v2 "no new deps" rule). No other new deps.
- Reuse the existing `PurchaseLineDraft` shape and `emptyDraft()` from `components/PurchaseLineRow.tsx`. Pre-filled rows default to `mode: "new"`.
- `crypto.randomUUID()` is client-side only (never in any `convex/` file).
- Verify each task with `npm run typecheck`, `npm run lint` (0 new errors), and `npm run test`; UI tasks also `npx next build`.

---

### Task 1: `parseInvoice` pure table-reconstruction core — TDD

**Files:**
- Create: `lib/ocr/types.ts`
- Create: `lib/ocr/parseInvoice.ts`
- Create: `lib/ocr/parseInvoice.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `OcrWord = { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }`; `OcrResult = { text: string; words: OcrWord[] }`; `ParsedLine = { quantity?: number; model?: string; item?: string; unitCost?: number }`; `ParsedInvoice = { supplierName?: string; referenceNumber?: string; lines: ParsedLine[] }`.
  - `parseInvoice(words: OcrWord[]): ParsedInvoice`; plus helper `groupRows(words: OcrWord[]): OcrWord[][]` (exported for testing).

- [ ] **Step 1: Create `lib/ocr/types.ts`**

```ts
export type OcrWord = {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};
export type OcrResult = { text: string; words: OcrWord[] };
export type ParsedLine = {
  quantity?: number;
  model?: string;
  item?: string;
  unitCost?: number;
};
export type ParsedInvoice = {
  supplierName?: string;
  referenceNumber?: string;
  lines: ParsedLine[];
};
```

- [ ] **Step 2: Write the failing test `lib/ocr/parseInvoice.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseInvoice, groupRows } from "./parseInvoice";
import { OcrWord } from "./types";

// Helper: a word at a given row (y) and column (x) center, ~20px tall.
function w(text: string, x: number, y: number): OcrWord {
  return { text, bbox: { x0: x, y0: y, x1: x + text.length * 10, y1: y + 20 } };
}

// Column x-centers: QTY~50, UNIT~150, MODEL~260, ITEM~480, WSALE~760, TOTAL~900
const HEADER = [
  w("QTY", 50, 100), w("UNIT", 150, 100), w("MODEL", 260, 100),
  w("ITEM", 480, 100), w("W.SALE", 760, 100), w("TOTAL", 900, 100),
];

describe("groupRows", () => {
  it("groups words on the same line and orders rows top-to-bottom", () => {
    const rows = groupRows([w("b", 200, 200), w("a", 50, 200), w("z", 50, 400)]);
    expect(rows.length).toBe(2);
    expect(rows[0].map((x) => x.text)).toEqual(["a", "b"]); // sorted by x within row
    expect(rows[1][0].text).toBe("z");
  });
});

describe("parseInvoice", () => {
  it("maps header-anchored columns into structured lines", () => {
    const words: OcrWord[] = [
      ...HEADER,
      // row 1: qty 2, model XRM, item "REAR AXLE", wsale 80.00
      w("2", 50, 140), w("pc", 150, 140), w("XRM", 260, 140),
      w("REAR", 460, 140), w("AXLE", 540, 140), w("80.00", 760, 140), w("160.00", 900, 140),
      // row 2: qty 24, item "HONDA OIL", wsale 305.00
      w("24", 50, 180), w("pc", 150, 180),
      w("HONDA", 460, 180), w("OIL", 560, 180), w("305.00", 760, 180), w("7320.00", 900, 180),
    ];
    const result = parseInvoice(words);
    expect(result.lines.length).toBe(2);
    expect(result.lines[0]).toMatchObject({ quantity: 2, model: "XRM", unitCost: 80 });
    expect(result.lines[0].item).toContain("REAR");
    expect(result.lines[1]).toMatchObject({ quantity: 24, unitCost: 305 });
    expect(result.lines[1].item).toContain("HONDA");
  });

  it("handles a row with missing cells without crashing or inventing lines", () => {
    const words: OcrWord[] = [
      ...HEADER,
      // a row with only an item and cost, no qty/model
      w("SEALANT", 460, 140), w("54.00", 760, 140),
    ];
    const result = parseInvoice(words);
    expect(result.lines.length).toBe(1);
    expect(result.lines[0].item).toContain("SEALANT");
    expect(result.lines[0].unitCost).toBe(54);
    expect(result.lines[0].quantity).toBeUndefined();
  });

  it("detects supplier name and reference number from labeled tokens", () => {
    const words: OcrWord[] = [
      w("Customer:", 40, 30), w("SAN", 160, 30), w("PEDRO", 220, 30),
      w("Number:", 600, 30), w("508238", 720, 30),
      ...HEADER,
      w("1", 50, 140), w("CHAIN", 460, 140), w("100.00", 760, 140),
    ];
    const result = parseInvoice(words);
    expect(result.supplierName).toContain("SAN");
    expect(result.referenceNumber).toBe("508238");
  });
});
```

- [ ] **Step 3: Run test, expect FAIL** — `npx vitest run lib/ocr/parseInvoice.test.ts` (module not found / not implemented).

- [ ] **Step 4: Implement `lib/ocr/parseInvoice.ts`**

```ts
import { OcrWord, ParsedInvoice, ParsedLine } from "./types";

const COLUMN_KEYS = ["qty", "unit", "model", "item", "wsale", "total"] as const;
type ColKey = (typeof COLUMN_KEYS)[number];

function normHeader(s: string): ColKey | null {
  const t = s.toLowerCase().replace(/[^a-z]/g, "");
  if (t.startsWith("qty") || t === "quantity") return "qty";
  if (t.startsWith("unit")) return "unit";
  if (t.startsWith("model")) return "model";
  if (t.startsWith("item") || t.startsWith("description")) return "item";
  if (t.startsWith("wsale") || t === "wholesale" || t === "price") return "wsale";
  if (t.startsWith("total") || t.startsWith("amount")) return "total";
  return null;
}

const cx = (wd: OcrWord) => (wd.bbox.x0 + wd.bbox.x1) / 2;
const cy = (wd: OcrWord) => (wd.bbox.y0 + wd.bbox.y1) / 2;

function parseNum(s: string): number | undefined {
  const cleaned = s.replace(/,/g, "").replace(/[^0-9.]/g, "");
  if (cleaned === "" || cleaned === ".") return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

export function groupRows(words: OcrWord[]): OcrWord[][] {
  if (words.length === 0) return [];
  const heights = words.map((wd) => wd.bbox.y1 - wd.bbox.y0).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 12;
  const tol = medianH * 0.6;
  const sorted = [...words].sort((a, b) => cy(a) - cy(b));
  const rows: OcrWord[][] = [];
  for (const wd of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(cy(wd) - cy(last[0])) <= tol) last.push(wd);
    else rows.push([wd]);
  }
  for (const r of rows) r.sort((a, b) => cx(a) - cx(b));
  return rows;
}

function findHeader(rows: OcrWord[][]): { rowIndex: number; anchors: Record<ColKey, number> } | null {
  for (let i = 0; i < rows.length; i++) {
    const anchors = {} as Record<ColKey, number>;
    let hits = 0;
    for (const wd of rows[i]) {
      const key = normHeader(wd.text);
      if (key && anchors[key] === undefined) {
        anchors[key] = cx(wd);
        hits++;
      }
    }
    if (hits >= 2 && anchors.item !== undefined) return { rowIndex: i, anchors };
  }
  return null;
}

function nearestCol(x: number, anchors: Record<ColKey, number>): ColKey {
  let best: ColKey = "item";
  let bestD = Infinity;
  for (const key of COLUMN_KEYS) {
    const ax = anchors[key];
    if (ax === undefined) continue;
    const d = Math.abs(x - ax);
    if (d < bestD) { bestD = d; best = key; }
  }
  return best;
}

function detectHeaderFields(rows: OcrWord[][]): { supplierName?: string; referenceNumber?: string } {
  let supplierName: string | undefined;
  let referenceNumber: string | undefined;
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const label = row[i].text.toLowerCase().replace(/[^a-z]/g, "");
      const rest = row.slice(i + 1).map((w) => w.text);
      if ((label === "customer" || label === "supplier") && !supplierName) {
        supplierName = rest.slice(0, 3).join(" ").trim() || undefined;
      }
      if ((label === "number" || label === "no" || label === "invoice") && !referenceNumber) {
        const num = rest.map((t) => t.replace(/[^0-9]/g, "")).find((t) => t.length >= 3);
        if (num) referenceNumber = num;
      }
    }
  }
  return { supplierName, referenceNumber };
}

export function parseInvoice(words: OcrWord[]): ParsedInvoice {
  const rows = groupRows(words);
  const header = findHeader(rows);
  const { supplierName, referenceNumber } = detectHeaderFields(rows);
  if (!header) return { supplierName, referenceNumber, lines: [] };

  const anchors = header.anchors;
  const lines: ParsedLine[] = [];
  for (let i = header.rowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const buckets: Record<ColKey, string[]> = { qty: [], unit: [], model: [], item: [], wsale: [], total: [] };
    for (const wd of row) buckets[nearestCol(cx(wd), anchors)].push(wd.text);

    const quantity = parseNum(buckets.qty.join(""));
    const unitCost = parseNum(buckets.wsale.join("")) ?? parseNum(buckets.total.join(""));
    const model = buckets.model.join(" ").trim() || undefined;
    const item = buckets.item.join(" ").trim() || undefined;

    // Skip rows that carry no item text AND no money — likely separators/blank.
    if (!item && unitCost === undefined) continue;
    // Skip an obvious grand-total row (no item text, no qty, has a total only).
    if (!item && quantity === undefined && model === undefined) continue;

    lines.push({ quantity, model, item, unitCost });
  }
  return { supplierName, referenceNumber, lines };
}
```

- [ ] **Step 5: Run test, expect PASS** — `npx vitest run lib/ocr/parseInvoice.test.ts`.

- [ ] **Step 6: Full suite + checks** — `npm run test` (all prior tests still pass), `npm run typecheck`, `npm run lint`.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: parseInvoice OCR table reconstruction core with tests"`

---

### Task 2: Browser OCR pipeline + vendored WASM assets

**Files:**
- Modify: `package.json` (add `tesseract.js`, `pdfjs-dist`)
- Create: `lib/ocr/renderToImages.ts`, `lib/ocr/preprocess.ts`, `lib/ocr/runOcr.ts`, `lib/ocr/extractInvoice.ts`
- Create (vendored assets): under `public/tesseract/` and `public/pdf/`

**Interfaces:**
- Consumes: `parseInvoice`, types from Task 1.
- Produces: `extractInvoice(file: File, onProgress: (p: { stage: string; fraction: number }) => void): Promise<ParsedInvoice>` — the single entry point the UI calls.

- [ ] **Step 1: Install deps** — `npm install tesseract.js pdfjs-dist`

- [ ] **Step 2: Vendor the WASM assets into `public/`**

The libraries must NOT fetch from a CDN. Copy the installed assets so they're served locally:

```bash
mkdir -p public/tesseract public/pdf
# Tesseract worker + wasm core (paths from the installed packages):
cp node_modules/tesseract.js/dist/worker.min.js public/tesseract/worker.min.js
cp node_modules/tesseract.js-core/tesseract-core.wasm.js public/tesseract/tesseract-core.wasm.js
cp node_modules/tesseract.js-core/tesseract-core.wasm public/tesseract/tesseract-core.wasm
# pdf.js worker (file name/extension may be .mjs in pdfjs-dist v4):
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf/pdf.worker.min.mjs
```

Then download the English traineddata into `public/tesseract/` (the lang file tesseract.js loads):

```bash
# eng.traineddata.gz expected by tesseract.js langPath:
curl -L -o public/tesseract/eng.traineddata.gz https://raw.githubusercontent.com/naptha/tessdata/4.0.0_best/eng.traineddata.gz
```

If a path differs for the installed versions, locate the equivalent file under `node_modules/tesseract.js*/` and `node_modules/pdfjs-dist/build/` and copy that; record the exact versions/paths used in the report. Commit the vendored assets.

- [ ] **Step 3: `lib/ocr/renderToImages.ts`**

```ts
import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf/pdf.worker.min.mjs";

const MAX_PAGES = 5;
const SCALE = 2;

export async function renderToImages(file: File): Promise<HTMLCanvasElement[]> {
  if (file.type === "application/pdf") {
    const data = await file.arrayBuffer();
    const doc = await pdfjsLib.getDocument({ data }).promise;
    const pageCount = Math.min(doc.numPages, MAX_PAGES);
    const canvases: HTMLCanvasElement[] = [];
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport }).promise;
      canvases.push(canvas);
    }
    return canvases;
  }
  // Image file: draw onto a canvas.
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    return [canvas];
  } finally {
    URL.revokeObjectURL(url);
  }
}
```

- [ ] **Step 4: `lib/ocr/preprocess.ts`**

```ts
// Grayscale + simple threshold to improve OCR on photos.
export function preprocess(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = gray > 160 ? 255 : gray < 90 ? 0 : gray; // soft threshold
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
```

- [ ] **Step 5: `lib/ocr/runOcr.ts`**

```ts
import { createWorker } from "tesseract.js";
import { OcrResult, OcrWord } from "./types";

export async function runOcr(
  canvas: HTMLCanvasElement,
  onProgress: (fraction: number) => void,
): Promise<OcrResult> {
  const worker = await createWorker("eng", 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/tesseract-core.wasm.js",
    langPath: "/tesseract",
    logger: (m) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        onProgress(m.progress);
      }
    },
  });
  try {
    const { data } = await worker.recognize(canvas);
    const words: OcrWord[] = (data.words ?? []).map((wd: any) => ({
      text: wd.text,
      bbox: { x0: wd.bbox.x0, y0: wd.bbox.y0, x1: wd.bbox.x1, y1: wd.bbox.y1 },
    }));
    return { text: data.text, words };
  } finally {
    await worker.terminate();
  }
}
```

> Note: confirm against the installed `tesseract.js` version that `data.words` is populated (in v5 word boxes are included by default; if not, set the appropriate parameter to include word-level output). Record any adjustment in the report.

- [ ] **Step 6: `lib/ocr/extractInvoice.ts`** (orchestrator)

```ts
import { renderToImages } from "./renderToImages";
import { preprocess } from "./preprocess";
import { runOcr } from "./runOcr";
import { parseInvoice } from "./parseInvoice";
import { OcrWord, ParsedInvoice } from "./types";

export async function extractInvoice(
  file: File,
  onProgress: (p: { stage: string; fraction: number }) => void,
): Promise<ParsedInvoice> {
  onProgress({ stage: "Rendering document", fraction: 0 });
  const canvases = await renderToImages(file);
  const allWords: OcrWord[] = [];
  for (let i = 0; i < canvases.length; i++) {
    onProgress({ stage: `Reading page ${i + 1} of ${canvases.length}`, fraction: 0 });
    const pre = preprocess(canvases[i]);
    const { words } = await runOcr(pre, (f) =>
      onProgress({ stage: `Reading page ${i + 1} of ${canvases.length}`, fraction: f }),
    );
    // Offset y by page so multi-page rows don't collide (page height + gap).
    const yOffset = i * (canvases[i].height + 50);
    for (const w of words) {
      allWords.push({ ...w, bbox: { ...w.bbox, y0: w.bbox.y0 + yOffset, y1: w.bbox.y1 + yOffset } });
    }
  }
  onProgress({ stage: "Parsing", fraction: 1 });
  return parseInvoice(allWords);
}
```

- [ ] **Step 7: Verify build/types** — `npm run typecheck`, `npm run lint` (0 new errors), `npx next build` completes (the dynamic imports of pdfjs/tesseract must not break SSR — these modules are only imported in client components / async functions called from the client; confirm the build passes). `npm run test` still green (Task 1 tests unaffected).

- [ ] **Step 8: Commit** — `git add -A && git commit -m "feat: client-side OCR pipeline (tesseract.js + pdf.js) with vendored assets"`

---

### Task 3: Wire OCR auto-extract into the import page

**Files:**
- Modify: `app/(app)/inventory/import/page.tsx`

**Interfaces:**
- Consumes: `extractInvoice` (Task 2), `PurchaseLineDraft` + `emptyDraft` from `components/PurchaseLineRow.tsx`.

`PurchaseLineDraft` shape (existing): `{ id, mode: "existing"|"new", existingProductId, existingLabel?, newName, newModel, newCategory, newSellPrice, quantity, unitCost }` (string fields for inputs). `emptyDraft()` returns one with `mode:"existing"`, `quantity:"1"`.

- [ ] **Step 1: Add extraction state + trigger to the import page**

After the file is selected/uploaded (existing handler keeps the upload-to-storage + objectUrl logic), run OCR on the **local `File`**. Add state:

```tsx
const [ocrStage, setOcrStage] = useState<string | null>(null);
const [ocrFraction, setOcrFraction] = useState(0);
const [ocrError, setOcrError] = useState<string | null>(null);
```

Add an async function `runExtraction(file: File)` that imports the orchestrator dynamically (keep it out of the initial bundle / SSR):

```tsx
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
```

Call `runExtraction(file)` from the file-select handler after the upload begins (OCR uses the local `File`, independent of the storage upload). Keep the existing upload logic intact.

- [ ] **Step 2: Map parsed result into drafts + header (`applyParsed`)**

```tsx
function applyParsed(parsed: ParsedInvoice) {
  if (parsed.supplierName && supplierName.trim() === "") setSupplierName(parsed.supplierName);
  if (parsed.referenceNumber && referenceNumber.trim() === "") setReferenceNumber(parsed.referenceNumber);
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
  // Replace the drafts list with the extracted rows (fall back to one empty row if none found).
  setDrafts(newDrafts.length > 0 ? newDrafts : [emptyDraft()]);
}
```

(Use the actual state setters present in the page — `setSupplierName`, `setReferenceNumber`, `setDrafts`, and the `supplierName`/`referenceNumber` values. Import `ParsedInvoice` type from `@/lib/ocr/types` and `PurchaseLineDraft`/`emptyDraft` from `@/components/PurchaseLineRow`.)

- [ ] **Step 3: Progress + controls UI**

- While `ocrStage !== null`, show a progress line near the PDF viewer: the stage text + a bar at `Math.round(ocrFraction * 100)%`. Mark it `.screen-only` is not needed here (this is screen UI).
- Add a **"Re-extract"** button (enabled when a file is present and not currently extracting) that calls `runExtraction(currentFile)`.
- Add a hint: "Review the extracted rows against the document and correct any mistakes before importing." (OCR is best-effort.)
- On `ocrError`, show the message inline and leave the form usable for manual entry (the existing "Add line" + manual editing remain). OCR failure never blocks import.
- Keep the file `File` object in state (e.g. `currentFile`) so "Re-extract" can re-run.

- [ ] **Step 4: Verify** — `npm run typecheck`, `npm run lint` (0 new errors), `npx next build` completes, `npm run test` green. Confirm the import page still renders and the existing manual flow + `createPurchase` confirm path are unchanged.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: auto-extract supplier invoice via OCR and pre-fill import form"`

---

## Self-Review

**Spec coverage:** OCR pipeline `lib/ocr/` with `renderToImages`/`preprocess`/`runOcr`/`parseInvoice` (T1 parseInvoice+types, T2 the rest + orchestrator) ✅ · vendored WASM assets in `public/`, no CDN (T2) ✅ · client-side, no API key/server (T2/T3) ✅ · pre-fill header + line drafts then user review/confirm via unchanged `createPurchase` (T3) ✅ · progress UI + re-extract + graceful error fallback to manual (T3) ✅ · `parseInvoice` unit-tested incl. clean/messy/header fixtures (T1) ✅ · deps tesseract.js + pdfjs-dist (T2) ✅. All spec sections mapped.

**Placeholders:** T1 carries full code + tests. T2 carries full pipeline code; asset-vendoring uses concrete copy/curl commands with a "record exact versions/paths" instruction (real action, not a TODO). T3 specifies exact state, the `applyParsed` mapping, and integration points against the existing page's real setters.

**Type consistency:** `OcrWord`/`OcrResult`/`ParsedInvoice`/`ParsedLine` defined in T1 `types.ts` and consumed unchanged in T2/T3. `extractInvoice(file, onProgress)` signature consistent T2↔T3. `PurchaseLineDraft`/`emptyDraft` reused exactly as defined in `components/PurchaseLineRow.tsx`. `parseInvoice(words)` signature consistent across tasks.
