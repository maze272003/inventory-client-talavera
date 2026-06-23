import { expect, test } from "vitest";
import { deriveGranularity, previousPeriod, presetRange } from "./dateRange";

const DAY = 24 * 60 * 60 * 1000;

test("deriveGranularity picks bucket size by span", () => {
  expect(deriveGranularity(0, DAY)).toBe("hour");          // 1 day
  expect(deriveGranularity(0, 30 * DAY)).toBe("day");       // 30 days
  expect(deriveGranularity(0, 200 * DAY)).toBe("week");     // ~7 months
  expect(deriveGranularity(0, 800 * DAY)).toBe("month");    // >1 year
});

test("previousPeriod is the immediately preceding equal window", () => {
  const r = previousPeriod(1000, 1000 + 30 * DAY);
  expect(r.endMs).toBe(1000);
  expect(r.startMs).toBe(1000 - 30 * DAY);
});

test("presetRange '7d' spans seven local days ending today", () => {
  const now = new Date(2026, 5, 23, 15, 0, 0); // Jun 23 2026, local
  const { startMs, endMs } = presetRange("7d", now);
  expect(endMs).toBeGreaterThan(startMs);
  // start is at 00:00 six days before; end is 23:59:59.999 today
  expect(new Date(startMs).getDate()).toBe(17);
  expect(new Date(endMs).getDate()).toBe(23);
});
