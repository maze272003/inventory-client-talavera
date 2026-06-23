import { expect, test } from "vitest";
import { bucketStartForTs, enumerateBuckets, bucketLabel } from "./buckets";

// Philippines is UTC+8 → getTimezoneOffset() === -480
const PH = -480;

test("bucketStartForTs snaps to the local day start (UTC+8)", () => {
  // 2026-06-23T01:00:00+08:00  ==  2026-06-22T17:00:00Z
  const utc = Date.UTC(2026, 5, 22, 17, 0, 0);
  const bs = bucketStartForTs(utc, "day", PH);
  // local day start = 2026-06-23T00:00+08 = 2026-06-22T16:00Z
  expect(bs).toBe(Date.UTC(2026, 5, 22, 16, 0, 0));
});

test("enumerateBuckets covers the range inclusively by day", () => {
  const start = Date.UTC(2026, 5, 1, 0, 0, 0);
  const end = Date.UTC(2026, 5, 4, 23, 0, 0);
  const buckets = enumerateBuckets(start, end, "day", 0); // UTC
  expect(buckets.length).toBe(4); // Jun 1,2,3,4
  expect(buckets[0]).toBe(Date.UTC(2026, 5, 1));
  expect(buckets[3]).toBe(Date.UTC(2026, 5, 4));
});

test("enumerateBuckets steps months across a year boundary", () => {
  const start = Date.UTC(2025, 10, 15); // Nov 2025
  const end = Date.UTC(2026, 1, 10);    // Feb 2026
  const buckets = enumerateBuckets(start, end, "month", 0);
  expect(buckets.length).toBe(4); // Nov, Dec, Jan, Feb
  expect(buckets[0]).toBe(Date.UTC(2025, 10, 1));
  expect(buckets[3]).toBe(Date.UTC(2026, 1, 1));
});

test("bucketLabel formats by granularity (UTC)", () => {
  expect(bucketLabel(Date.UTC(2026, 5, 3), "day", 0)).toBe("Jun 3");
  expect(bucketLabel(Date.UTC(2026, 5, 1), "month", 0)).toBe("Jun 2026");
  expect(bucketLabel(Date.UTC(2026, 5, 3, 14), "hour", 0)).toBe("2 PM");
});
