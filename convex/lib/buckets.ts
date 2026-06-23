export type Granularity = "hour" | "day" | "week" | "month";

const MIN_MS = 60 * 1000;
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Returns a Date whose getUTC* fields read the local wall-clock for utcMs.
function toLocal(utcMs: number, tzOffsetMinutes: number): Date {
  return new Date(utcMs - tzOffsetMinutes * MIN_MS);
}
function fromLocal(localMs: number, tzOffsetMinutes: number): number {
  return localMs + tzOffsetMinutes * MIN_MS;
}

export function bucketStartForTs(
  utcMs: number,
  granularity: Granularity,
  tzOffsetMinutes: number,
): number {
  const d = toLocal(utcMs, tzOffsetMinutes);
  let localStart: number;
  if (granularity === "hour") {
    localStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
  } else if (granularity === "day") {
    localStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  } else if (granularity === "week") {
    const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
    const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    localStart = dayStart - dow * 24 * 60 * MIN_MS;
  } else {
    localStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
  return fromLocal(localStart, tzOffsetMinutes);
}

function nextBucket(bucketStartMs: number, granularity: Granularity, tzOffsetMinutes: number): number {
  const d = toLocal(bucketStartMs, tzOffsetMinutes);
  let localNext: number;
  if (granularity === "hour") {
    localNext = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours() + 1);
  } else if (granularity === "day") {
    localNext = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  } else if (granularity === "week") {
    localNext = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 7);
  } else {
    localNext = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  return fromLocal(localNext, tzOffsetMinutes);
}

export function enumerateBuckets(
  startMs: number,
  endMs: number,
  granularity: Granularity,
  tzOffsetMinutes: number,
): number[] {
  const out: number[] = [];
  let cur = bucketStartForTs(startMs, granularity, tzOffsetMinutes);
  let guard = 0;
  while (cur <= endMs && guard < 100000) {
    out.push(cur);
    cur = nextBucket(cur, granularity, tzOffsetMinutes);
    guard++;
  }
  return out;
}

export function bucketLabel(
  bucketStartMs: number,
  granularity: Granularity,
  tzOffsetMinutes: number,
): string {
  const d = toLocal(bucketStartMs, tzOffsetMinutes);
  const mon = MONTHS[d.getUTCMonth()];
  if (granularity === "hour") {
    const h = d.getUTCHours();
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12} ${ampm}`;
  }
  if (granularity === "month") return `${mon} ${d.getUTCFullYear()}`;
  if (granularity === "week") return `Wk ${mon} ${d.getUTCDate()}`;
  return `${mon} ${d.getUTCDate()}`;
}
