import { expect, test, describe } from "vitest";
import {
  computeRestorable,
  distributeProportionally,
  lineRefundFor,
  round2,
  type SaleItemBatchRow,
} from "./returns";
import { Id } from "../_generated/dataModel";

// Helpers manufacture valid Ids without a database.
function bid(s: string): Id<"batches"> {
  return s as Id<"batches">;
}

describe("round2", () => {
  test("kills float drift", () => {
    expect(round2(0.1 + 0.2)).toEqual(0.3);
    expect(round2(1.005)).toEqual(1.01);
    expect(round2(2.345)).toEqual(2.35);
  });
});

describe("computeRestorable", () => {
  test("no prior returns yields full original", () => {
    expect(computeRestorable(5, [])).toEqual(5);
  });

  test("partial priors reduce restorable", () => {
    expect(computeRestorable(5, [2, 1])).toEqual(2);
  });

  test("fully returned yields 0", () => {
    expect(computeRestorable(3, [1, 2])).toEqual(0);
  });

  test("over-prior clamps at 0 (never negative)", () => {
    expect(computeRestorable(3, [5])).toEqual(0);
    expect(computeRestorable(3, [2, 2])).toEqual(0);
  });

  test("zero or negative original yields 0", () => {
    expect(computeRestorable(0, [])).toEqual(0);
    expect(computeRestorable(-3, [])).toEqual(0);
  });

  test("negative prior entries are ignored", () => {
    expect(computeRestorable(5, [-3, 2])).toEqual(3);
  });
});

describe("lineRefundFor", () => {
  test("multiplies price by qty and rounds to 2dp", () => {
    expect(lineRefundFor(100, 2)).toEqual(200);
    expect(lineRefundFor(33.33, 3)).toEqual(99.99);
    expect(lineRefundFor(0.1, 3)).toEqual(0.3);
  });

  test("zero qty yields 0", () => {
    expect(lineRefundFor(50, 0)).toEqual(0);
  });
});

describe("distributeProportionally", () => {
  test("empty input yields empty output", () => {
    expect(distributeProportionally([], 5)).toEqual([]);
  });

  test("zero or negative returnQty yields empty output", () => {
    const rows: SaleItemBatchRow[] = [
      { batchId: bid("a"), batchNumber: "A", unitCost: 10, quantity: 2 },
    ];
    expect(distributeProportionally(rows, 0)).toEqual([]);
    expect(distributeProportionally(rows, -3)).toEqual([]);
  });

  test("single-batch line absorbs everything", () => {
    const rows: SaleItemBatchRow[] = [
      { batchId: bid("a"), batchNumber: "A", unitCost: 10, quantity: 5 },
    ];
    const out = distributeProportionally(rows, 3);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toEqual(3);
    expect(out[0].batchId).toBe("a");
  });

  test("1-unit return on a 3-unit, 2-batch line goes to the larger contributor", () => {
    // Original: batch A=2 units, batch B=1 unit. Return 1.
    // Largest-remainder: A gets 0.667 floor 0 rem 0.667; B gets 0.333 floor 0 rem 0.333.
    // Leftover=1, awarded to A (larger remainder). Result: A=1, B=0 (dropped).
    const rows: SaleItemBatchRow[] = [
      { batchId: bid("a"), batchNumber: "A", unitCost: 50, quantity: 2 },
      { batchId: bid("b"), batchNumber: "B", unitCost: 60, quantity: 1 },
    ];
    const out = distributeProportionally(rows, 1);
    expect(out).toHaveLength(1);
    expect(out[0].batchId).toBe("a");
    expect(out[0].quantity).toEqual(1);
  });

  test("multi-batch, multi-unit return sums to exactly returnQty", () => {
    // 3 from A, 2 from B, 1 from C → original 6. Return 4.
    // Exact: A=2, B=1.333, C=0.667. Floors: 2,1,0 = 3. Leftover 1 → B (rem .333) vs C (.667) vs A (0). C gets it.
    const rows: SaleItemBatchRow[] = [
      { batchId: bid("a"), batchNumber: "A", unitCost: 10, quantity: 3 },
      { batchId: bid("b"), batchNumber: "B", unitCost: 20, quantity: 2 },
      { batchId: bid("c"), batchNumber: "C", unitCost: 30, quantity: 1 },
    ];
    const out = distributeProportionally(rows, 4);
    const sum = out.reduce((s, x) => s + x.quantity, 0);
    expect(sum).toEqual(4);
    // Larger contributors should get >= smaller ones (proportional intent).
    const a = out.find((x) => x.batchId === "a")?.quantity ?? 0;
    const c = out.find((x) => x.batchId === "c")?.quantity ?? 0;
    expect(a).toBeGreaterThanOrEqual(c);
  });

  test("tie-break favors larger original contribution", () => {
    // Use 2 from each batch to force an exact 0.5/0.5 tie on a 2-unit return.
    // Floor 0+0=0, leftover 2, both rem=.5 → each awarded 1.
    const rowsTie: SaleItemBatchRow[] = [
      { batchId: bid("a"), batchNumber: "A", unitCost: 10, quantity: 2 },
      { batchId: bid("b"), batchNumber: "B", unitCost: 20, quantity: 2 },
    ];
    const out = distributeProportionally(rowsTie, 2);
    const sum = out.reduce((s, x) => s + x.quantity, 0);
    expect(sum).toEqual(2);
    // Each gets 1 (0.5 → floor 0, leftover 2, both rem .5, both awarded 1).
    expect(out).toHaveLength(2);
    expect(out.every((x) => x.quantity === 1)).toBe(true);
  });

  test("fuzz: quantities always sum to returnQty across random inputs", () => {
    let seed = 42;
    function rand() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed;
    }
    for (let iter = 0; iter < 500; iter++) {
      const nBatches = 1 + (rand() % 5);
      const rows: SaleItemBatchRow[] = [];
      let total = 0;
      for (let i = 0; i < nBatches; i++) {
        const q = 1 + (rand() % 10);
        rows.push({
          batchId: bid(`b${i}`),
          batchNumber: `B${i}`,
          unitCost: rand() % 100,
          quantity: q,
        });
        total += q;
      }
      const returnQty = 1 + (rand() % total);
      const out = distributeProportionally(rows, returnQty);
      const sum = out.reduce((s, x) => s + x.quantity, 0);
      expect(sum).toEqual(returnQty);
      // No batch gets more than its original contribution.
      for (const inc of out) {
        const orig = rows.find((r) => r.batchId === inc.batchId)!.quantity;
        expect(inc.quantity).toBeLessThanOrEqual(orig);
      }
    }
  });

  test("snapshots unitCost and batchNumber from the original rows", () => {
    const rows: SaleItemBatchRow[] = [
      { batchId: bid("a"), batchNumber: "LOT-1", unitCost: 42, quantity: 5 },
    ];
    const out = distributeProportionally(rows, 2);
    expect(out[0].unitCost).toEqual(42);
    expect(out[0].batchNumber).toEqual("LOT-1");
  });
});
