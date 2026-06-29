"use client";

import { useEffect, useState } from "react";

export type ChartColors = {
  primary: string; success: string; danger: string; warning: string;
  text: string; textMuted: string; border: string; surface: string;
};

// Light-mode defaults (match app/globals.css :root) for SSR/first paint.
const DEFAULTS: ChartColors = {
  primary: "#e1232f", success: "#059669", danger: "#e11d48", warning: "#d97706",
  text: "#0f172a", textMuted: "#64748b", border: "#e2e8f0", surface: "#ffffff",
};

// Distinct categorical colors for the category donut (readable on light + dark).
// Brand red leads; index 3 swapped indigo→blue so it stays distinct from the
// scarlet brand color and the rose danger hue in the same chart.
export const categoryPalette = [
  "#e1232f", "#059669", "#d97706", "#2563eb", "#0891b2",
  "#7c3aed", "#0d9488", "#db2777", "#65a30d", "#ea580c",
];

function readColors(): ChartColors {
  if (typeof window === "undefined") return DEFAULTS;
  const s = getComputedStyle(document.documentElement);
  const get = (n: string, fallback: string) => s.getPropertyValue(n).trim() || fallback;
  return {
    primary: get("--color-primary", DEFAULTS.primary),
    success: get("--color-success", DEFAULTS.success),
    danger: get("--color-danger", DEFAULTS.danger),
    warning: get("--color-warning", DEFAULTS.warning),
    text: get("--color-text", DEFAULTS.text),
    textMuted: get("--color-text-muted", DEFAULTS.textMuted),
    border: get("--color-border", DEFAULTS.border),
    surface: get("--color-surface", DEFAULTS.surface),
  };
}

// Recharts sets stroke/fill as SVG attributes, which don't resolve CSS var();
// so we read the resolved design-token values and pass real hex to the charts.
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(DEFAULTS);
  useEffect(() => {
    if (typeof window === "undefined") return;
    // This app toggles dark mode by adding/removing the .dark class on <html>
    // (see ThemeProvider.tsx) — NOT via prefers-color-scheme. Watch the class
    // attribute with a MutationObserver so charts recolor on manual theme flips.
    const setColorsHandler = () => setColors(readColors());
    setColorsHandler(); // read on mount
    const observer = new MutationObserver(() => setColorsHandler());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return colors;
}

/**
 * Shared Recharts tooltip contentStyle — shadcn popover look, theme-aware.
 * Replaces the per-chart duplicated inline objects.
 */
export function chartTooltipStyle(
  c: ChartColors,
): Record<string, string | number> {
  return {
    background: c.surface,
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    color: c.text,
    fontSize: 12,
    boxShadow:
      "0 4px 6px -1px rgb(15 23 42 / 0.07), 0 2px 4px -2px rgb(15 23 42 / 0.05)",
  };
}
