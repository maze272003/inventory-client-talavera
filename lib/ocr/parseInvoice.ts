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
