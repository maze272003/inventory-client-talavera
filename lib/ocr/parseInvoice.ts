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

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** Parse a date out of free text into YYYY-MM-DD. Handles "June 1, 2026",
 * "2026-06-01", and "06/01/2026" (month/day/year). Returns undefined if none. */
function parseDateString(s: string): string | undefined {
  const pad = (n: number) => String(n).padStart(2, "0");
  let m = s.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m) {
    const mon = MONTHS[m[1].toLowerCase()];
    if (mon) return `${m[3]}-${pad(mon)}-${pad(Number(m[2]))}`;
  }
  m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
  return undefined;
}

// Header metadata lines may arrive as one text run ("Customer: SAN PEDRO")
// from a PDF text layer, or as separate OCR words on the same row. Joining the
// row's words handles both, then we match by label.
function detectHeaderFields(rows: OcrWord[][]): {
  supplierName?: string;
  referenceNumber?: string;
  supplierAddress?: string;
  purchaseDate?: string;
} {
  let supplierName: string | undefined;
  let referenceNumber: string | undefined;
  let supplierAddress: string | undefined;
  let purchaseDate: string | undefined;
  const clean = (s: string) => s.trim().replace(/\s+/g, " ") || undefined;

  for (const row of rows) {
    const text = row.map((w) => w.text).join(" ");
    let m: RegExpMatchArray | null;
    if (!supplierName && (m = text.match(/(?:customer|supplier)\s*:?\s*(.+)/i))) {
      supplierName = clean(m[1]);
    }
    if (!supplierAddress && (m = text.match(/address\s*:?\s*(.+)/i))) {
      supplierAddress = clean(m[1]);
    }
    if (
      !referenceNumber &&
      (m = text.match(/(?:quotation\s*)?(?:no|number|invoice|ref(?:erence)?)\b\.?\s*:?\s*([A-Za-z0-9][A-Za-z0-9-]*)/i))
    ) {
      referenceNumber = m[1];
    }
    if (!purchaseDate && (m = text.match(/date\s*:?\s*(.+)/i))) {
      purchaseDate = parseDateString(m[1]);
    }
  }
  return { supplierName, referenceNumber, supplierAddress, purchaseDate };
}

function parseWithoutHeader(rows: OcrWord[][]): ParsedLine[] {
  const lines: ParsedLine[] = [];
  for (const row of rows) {
    const tokens = row.map((wd) => wd.text);

    // Determine if the first token is a quantity candidate.
    let quantityToken: string | undefined;
    let quantity: number | undefined;
    const firstToken = tokens[0];
    if (firstToken !== undefined) {
      const firstNum = parseNum(firstToken);
      if (
        /^[\d.,]+$/.test(firstToken) &&
        firstNum !== undefined &&
        Number.isFinite(firstNum) &&
        Number.isInteger(firstNum) &&
        firstNum < 1000
      ) {
        quantityToken = firstToken;
        quantity = firstNum;
      }
    }

    const remaining = quantityToken !== undefined ? tokens.slice(1) : tokens;

    // Split remaining into numeric and non-numeric tokens.
    const moneyTokens: string[] = [];
    const itemTokens: string[] = [];
    for (const token of remaining) {
      const n = parseNum(token);
      if (/^[\d.,]+$/.test(token) && n !== undefined && Number.isFinite(n)) {
        moneyTokens.push(token);
      } else {
        itemTokens.push(token);
      }
    }

    // unitCost: second-to-last money token if >= 2, first if exactly 1, else undefined.
    let unitCost: number | undefined;
    if (moneyTokens.length >= 2) {
      unitCost = parseNum(moneyTokens[moneyTokens.length - 2]);
    } else if (moneyTokens.length === 1) {
      unitCost = parseNum(moneyTokens[0]);
    }

    const itemStr = itemTokens.join(" ").trim();
    const item = itemStr !== "" ? itemStr : undefined;

    // model is always undefined in fallback — can't infer without a header.
    const model = undefined;

    // Skip if both item and unitCost are absent.
    if (item === undefined && unitCost === undefined) continue;
    // Skip single numeric token rows with no item and no quantity (grand-total row).
    if (item === undefined && quantity === undefined && moneyTokens.length <= 1 && itemTokens.length === 0) continue;

    lines.push({ quantity, model, item, unitCost });
  }
  return lines;
}

export function parseInvoice(words: OcrWord[]): ParsedInvoice {
  const rows = groupRows(words);
  const header = findHeader(rows);
  const meta = detectHeaderFields(rows);
  if (!header) {
    return { ...meta, lines: parseWithoutHeader(rows) };
  }

  const anchors = header.anchors;
  const lines: ParsedLine[] = [];

  // A product's QTY/UNIT/W.SALE/TOTAL sit on its top line, but the ITEM (and
  // occasionally MODEL) cell wraps across several lines below. groupRows yields
  // each wrapped line as its own row, so we assemble LOGICAL rows: a row that
  // carries a quantity or a price starts a new product line; rows that carry
  // only ITEM/MODEL text are continuations and append to the current product.
  let current: ParsedLine | null = null;
  const pushCurrent = () => {
    if (!current) return;
    const item = current.item?.trim() || undefined;
    // A real product line must have a name (the ITEM). This also drops the
    // grand-total row and blank separators, which have no item text.
    if (item) {
      lines.push({
        quantity: current.quantity,
        model: current.model?.trim() || undefined,
        item,
        unitCost: current.unitCost,
      });
    }
    current = null;
  };

  for (let i = header.rowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const buckets: Record<ColKey, string[]> = { qty: [], unit: [], model: [], item: [], wsale: [], total: [] };
    for (const wd of row) buckets[nearestCol(cx(wd), anchors)].push(wd.text);

    const quantity = parseNum(buckets.qty.join(""));
    const unitCost = parseNum(buckets.wsale.join("")) ?? parseNum(buckets.total.join(""));
    const model = buckets.model.join(" ").trim() || undefined;
    const item = buckets.item.join(" ").trim() || undefined;

    const isAnchor = quantity !== undefined || unitCost !== undefined;
    if (isAnchor) {
      pushCurrent();
      current = { quantity, model, item, unitCost };
    } else if (current) {
      // Continuation line — append wrapped ITEM / MODEL text to the product.
      if (item) current.item = current.item ? `${current.item} ${item}` : item;
      if (model) current.model = current.model ? `${current.model} ${model}` : model;
    }
    // A continuation with no current product (stray pre-table text) is ignored.
  }
  pushCurrent();
  return { ...meta, lines };
}
