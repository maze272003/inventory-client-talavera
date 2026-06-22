/**
 * Tiny class-name combiner. Joins truthy class strings with a single space.
 * No external deps (no clsx / tailwind-merge) — keeps the UI layer dependency-free.
 *
 * Usage: cn("base", isActive && "active", className)
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(" ");
}
