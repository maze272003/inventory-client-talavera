export type Preset = "today" | "7d" | "30d" | "90d" | "year" | "custom";
export type Granularity = "hour" | "day" | "week" | "month";

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
export function parseLocalDate(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function presetRange(
  preset: Exclude<Preset, "custom">,
  now: Date = new Date(),
): { startMs: number; endMs: number } {
  const endMs = endOfDay(now).getTime();
  if (preset === "today") {
    return { startMs: startOfDay(now).getTime(), endMs };
  }
  if (preset === "year") {
    return { startMs: startOfDay(new Date(now.getFullYear(), 0, 1)).getTime(), endMs };
  }
  const daysBack = preset === "7d" ? 6 : preset === "30d" ? 29 : 89; // "90d"
  const start = new Date(now);
  start.setDate(now.getDate() - daysBack);
  return { startMs: startOfDay(start).getTime(), endMs };
}

export function deriveGranularity(startMs: number, endMs: number): Granularity {
  const spanDays = (endMs - startMs) / DAY_MS;
  if (spanDays <= 1.5) return "hour";
  if (spanDays <= 60) return "day";
  if (spanDays <= 365) return "week";
  return "month";
}

export function previousPeriod(startMs: number, endMs: number): { startMs: number; endMs: number } {
  const span = endMs - startMs;
  return { startMs: startMs - span, endMs: startMs };
}

export function tzOffsetMinutes(now: Date = new Date()): number {
  return now.getTimezoneOffset();
}
