/**
 * Backward-compatible alias. The canonical implementation now lives in
 * `@/lib/utils` (clsx + tailwind-merge). Existing `./cn` importers keep working.
 */
export { cn, type ClassValue } from "@/lib/utils";
