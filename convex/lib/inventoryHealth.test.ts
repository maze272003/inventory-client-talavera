import { describe, expect, it } from "vitest";
import {
  classifyAging,
  computeValuation,
  computeVelocity,
  daysToStockout,
  suggestReorder,
  DEFAULT_AGING_BANDS,
} from "./inventoryHealth";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000_000_000_000; // fixed "now" so tests are deterministic

describe("computeVelocity", () => {
  it("sums units in the window and divides by windowDays", () => {
    const lines = [
      { productId: "p1", quantity: 4, ts: NOW - 2 * DAY },
      { productId: "p1", quantity: 6, ts: NOW - 5 * DAY },
      { productId: "p2", quantity: 3, ts: NOW - 1 * DAY },
    ];
    const v = computeVelocity(lines, 30, NOW);
    // p1: 10 units / 30 days
    expect(v.p1).toBeCloseTo(10 / 30, 10);
    expect(v.p2).toBeCloseTo(3 / 30, 10);
  });

  it("drops lines outside the lookback window", () => {
    const lines = [
      { productId: "p1", quantity: 10, ts: NOW - 31 * DAY }, // outside 30d
      { productId: "p1", quantity: 5, ts: NOW - 1 * DAY }, // inside
    ];
    const v = computeVelocity(lines, 30, NOW);
    expect(v.p1).toBeCloseTo(5 / 30, 10);
  });

  it("returns empty record when no lines qualify", () => {
    expect(computeVelocity([], 30, NOW)).toEqual({});
    expect(computeVelocity([{ productId: "p1", quantity: 1, ts: NOW - 100 * DAY }], 30, NOW)).toEqual({});
  });

  it("ignores non-positive quantities", () => {
    const v = computeVelocity(
      [{ productId: "p1", quantity: 0, ts: NOW }, { productId: "p1", quantity: -3, ts: NOW }],
      30,
      NOW,
    );
    expect(v).toEqual({});
  });
});

describe("daysToStockout", () => {
  it("projects stock divided by velocity", () => {
    expect(daysToStockout(10, 2)).toBeCloseTo(5, 10);
  });

  it("returns null for zero velocity (infinite)", () => {
    expect(daysToStockout(10, 0)).toBeNull();
  });

  it("returns null for negative velocity", () => {
    expect(daysToStockout(10, -1)).toBeNull();
  });

  it("treats negative stock as zero", () => {
    expect(daysToStockout(-5, 2)).toBeCloseTo(0, 10);
  });
});

describe("classifyAging", () => {
  it("excludes a batch that moved within the 30-day band", () => {
    const out = classifyAging(
      [{ batchId: "b1", productId: "p1", batchNumber: "B1", qtyRemaining: 5, unitCost: 10, lastMovementMs: NOW - 10 * DAY }],
      NOW,
    );
    expect(out).toHaveLength(0);
  });

  it("lands a 45-day-stale batch in the 30-day band, not 90/180", () => {
    const out = classifyAging(
      [{ batchId: "b1", productId: "p1", batchNumber: "B1", qtyRemaining: 5, unitCost: 10, lastMovementMs: NOW - 45 * DAY }],
      NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].band).toBe("30");
    expect(out[0].cashValue).toBe(50);
    expect(out[0].daysSinceMovement).toBeCloseTo(45, 5);
  });

  it("lands a 95-day-stale batch in the 90-day band", () => {
    const out = classifyAging(
      [{ batchId: "b1", productId: "p1", batchNumber: "B1", qtyRemaining: 2, unitCost: 7, lastMovementMs: NOW - 95 * DAY }],
      NOW,
    );
    expect(out[0].band).toBe("90");
  });

  it("lands a 200-day-stale batch in the 180-day band", () => {
    const out = classifyAging(
      [{ batchId: "b1", productId: "p1", batchNumber: "B1", qtyRemaining: 1, unitCost: 3, lastMovementMs: NOW - 200 * DAY }],
      NOW,
    );
    expect(out[0].band).toBe("180");
  });

  it("sorts oldest (most dead) first", () => {
    const out = classifyAging(
      [
        { batchId: "b1", productId: "p1", batchNumber: "B1", qtyRemaining: 1, unitCost: 1, lastMovementMs: NOW - 40 * DAY },
        { batchId: "b2", productId: "p1", batchNumber: "B2", qtyRemaining: 1, unitCost: 1, lastMovementMs: NOW - 200 * DAY },
      ],
      NOW,
    );
    expect(out[0].batchId).toBe("b2");
    expect(out[1].batchId).toBe("b1");
  });

  it("uses last MOVEMENT not creation: an old batch that moved recently is alive", () => {
    const out = classifyAging(
      [
        // created 200d ago (simulated) but lastMovement is 5d ago
        { batchId: "b1", productId: "p1", batchNumber: "B1", qtyRemaining: 5, unitCost: 10, lastMovementMs: NOW - 5 * DAY },
      ],
      NOW,
    );
    expect(out).toHaveLength(0);
  });

  it("ignores depleted batches", () => {
    const out = classifyAging(
      [{ batchId: "b1", productId: "p1", batchNumber: "B1", qtyRemaining: 0, unitCost: 10, lastMovementMs: NOW - 300 * DAY }],
      NOW,
    );
    expect(out).toHaveLength(0);
  });

  it("respects custom bands", () => {
    const out = classifyAging(
      [{ batchId: "b1", productId: "p1", batchNumber: "B1", qtyRemaining: 1, unitCost: 1, lastMovementMs: NOW - 15 * DAY }],
      NOW,
      { d30: 10, d90: 20, d180: 40 },
    );
    expect(out[0].band).toBe("30"); // 15 >= 10 but < 20
  });

  it("DEFAULT_AGING_BANDS is 30/90/180", () => {
    expect(DEFAULT_AGING_BANDS).toEqual({ d30: 30, d90: 90, d180: 180 });
  });
});

describe("computeValuation", () => {
  const products = {
    p1: { sellPrice: 50, category: "Tools" },
    p2: { sellPrice: 12, category: "Tools" },
    p3: { sellPrice: 100, category: "Oil" },
  };

  it("keeps cost and retail distinct; retail >= cost for positive margins", () => {
    const v = computeValuation(
      [
        { productId: "p1", qtyRemaining: 4, unitCost: 30 },
        { productId: "p3", qtyRemaining: 2, unitCost: 60 },
      ],
      products,
    );
    // cost: 4*30 + 2*60 = 240 ; retail: 4*50 + 2*100 = 400
    expect(v.totalCostValue).toBe(240);
    expect(v.totalRetailValue).toBe(400);
    expect(v.totalRetailValue).toBeGreaterThanOrEqual(v.totalCostValue);
  });

  it("byCategory sums back to totalCostValue", () => {
    const v = computeValuation(
      [
        { productId: "p1", qtyRemaining: 4, unitCost: 30 }, // Tools 120
        { productId: "p2", qtyRemaining: 2, unitCost: 5 }, // Tools 10
        { productId: "p3", qtyRemaining: 1, unitCost: 60 }, // Oil 60
      ],
      products,
    );
    const sum = v.byCategory.reduce((s, c) => s + c.costValue, 0);
    expect(sum).toBeCloseTo(v.totalCostValue, 5);
    // Tools = 130, Oil = 60 → Tools first
    expect(v.byCategory[0].category).toBe("Tools");
    expect(v.byCategory[0].costValue).toBe(130);
    expect(v.byCategory[1].category).toBe("Oil");
  });

  it("skips non-positive remainders", () => {
    const v = computeValuation(
      [{ productId: "p1", qtyRemaining: 0, unitCost: 30 }, { productId: "p1", qtyRemaining: 4, unitCost: 30 }],
      products,
    );
    expect(v.totalCostValue).toBe(120);
  });

  it("buckets unknown products under Uncategorized", () => {
    const v = computeValuation(
      [{ productId: "ghost", qtyRemaining: 3, unitCost: 2 }],
      products,
    );
    expect(v.totalCostValue).toBe(6);
    expect(v.byCategory[0].category).toBe("Uncategorized");
    expect(v.byCategory[0].costValue).toBe(6);
  });
});

describe("suggestReorder", () => {
  it("fast seller gets a larger qty than slow seller at the same stock", () => {
    const fast = suggestReorder({ stockQty: 0, threshold: 5, velocityPerDay: 2, targetDays: 30 });
    const slow = suggestReorder({ stockQty: 0, threshold: 5, velocityPerDay: 0.2, targetDays: 30 });
    expect(fast).toBeGreaterThan(slow);
    expect(fast).toBe(2 * 30); // 60
  });

  it("returns zero when stock already covers target days of velocity", () => {
    const q = suggestReorder({ stockQty: 100, threshold: 5, velocityPerDay: 1, targetDays: 30 });
    expect(q).toBe(0);
  });

  it("zero-velocity product at threshold yields threshold floor", () => {
    // stock 3, threshold 5 → floor 2
    const q = suggestReorder({ stockQty: 3, threshold: 5, velocityPerDay: 0, targetDays: 30 });
    expect(q).toBe(2);
  });

  it("takes the max of velocity-based and threshold floor", () => {
    // velocity-based: 2*30 - 2 = 58 ; floor: 5 - 2 = 3 → 58
    const q = suggestReorder({ stockQty: 2, threshold: 5, velocityPerDay: 2, targetDays: 30 });
    expect(q).toBe(58);
  });

  it("never returns negative", () => {
    const q = suggestReorder({ stockQty: 500, threshold: 5, velocityPerDay: 0.1, targetDays: 30 });
    expect(q).toBe(0);
  });
});
