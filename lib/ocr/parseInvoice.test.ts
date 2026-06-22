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

  it("merges multi-line wrapped ITEM cells into one product line", () => {
    // Real-invoice layout: each product's QTY/UNIT/W.SALE/TOTAL are on the top
    // line, but the ITEM (product name) wraps down several lines in the ITEM
    // column. groupRows sees each wrapped line as its own row; parseInvoice must
    // merge them into one logical product line.
    const words: OcrWord[] = [
      ...HEADER, // y=100
      // Product 1 — top line + wrapped ITEM
      w("5", 50, 140), w("Pcs", 150, 140), w("300X17", 480, 140),
      w("670.00", 760, 140), w("3,350.00", 900, 140),
      w("RUDDER", 480, 162), w("SPL", 480, 184), w("NEW", 560, 184),
      // Product 2 — top line + wrapped ITEM
      w("24", 50, 210), w("Pcs", 150, 210), w("HONDA", 480, 210),
      w("305.00", 760, 210), w("7,320.00", 900, 210),
      w("OIL", 480, 232), w("4T", 480, 254),
    ];
    const result = parseInvoice(words);
    expect(result.lines.length).toBe(2);
    expect(result.lines[0].quantity).toBe(5);
    expect(result.lines[0].unitCost).toBe(670);
    expect(result.lines[0].item).toContain("300X17");
    expect(result.lines[0].item).toContain("RUDDER");
    expect(result.lines[0].item).toContain("NEW");
    expect(result.lines[1].quantity).toBe(24);
    expect(result.lines[1].unitCost).toBe(305);
    expect(result.lines[1].item).toContain("HONDA");
    expect(result.lines[1].item).toContain("OIL");
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

  it("falls back to heuristic parsing when no header row is detected", () => {
    // No header row — two data rows with positional tokens.
    // row A: qty=2, model=XRM (non-numeric, precedes item), item="REAR AXLE", unitCost=80.00, total=160.00
    // row B: qty=24, item="HONDA OIL", unitCost=305.00, total=7320.00
    const words: OcrWord[] = [
      // row A
      w("2", 50, 140),
      w("XRM", 260, 140),
      w("REAR", 460, 140),
      w("AXLE", 540, 140),
      w("80.00", 760, 140),
      w("160.00", 900, 140),
      // row B
      w("24", 50, 180),
      w("HONDA", 460, 180),
      w("OIL", 560, 180),
      w("305.00", 760, 180),
      w("7320.00", 900, 180),
    ];
    const result = parseInvoice(words);
    expect(result.lines.length).toBe(2);
    // line 0
    expect(result.lines[0].quantity).toBe(2);
    expect(result.lines[0].item).toContain("REAR");
    expect(result.lines[0].item).toContain("AXLE");
    expect(result.lines[0].unitCost).toBe(80);
    // line 1
    expect(result.lines[1].quantity).toBe(24);
    expect(result.lines[1].item).toContain("HONDA");
    expect(result.lines[1].unitCost).toBe(305);
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
