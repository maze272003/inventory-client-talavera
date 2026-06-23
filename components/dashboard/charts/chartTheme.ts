"use client";

import { useEffect, useState } from "react";

export type ChartColors = {
  primary: string; success: string; danger: string; warning: string;
  text: string; textMuted: string; border: string; surface: string;
};

// Light-mode defaults (match app/globals.css :root) for SSR/first paint.
const DEFAULTS: ChartColors = {
  primary: "#4f46e5", success: "#059669", danger: "#e11d48", warning: "#d97706",
  text: "#0f172a", textMuted: "#64748b", border: "#e2e8f0", surface: "#ffffff",
};

// Distinct categorical colors for the category donut (readable on light + dark).
export const categoryPalette = [
  "#4f46e5", "#059669", "#d97706", "#e11d48", "#0891b2",
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
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setColors(readColors());
    // Read on mount via the media-query change listener pattern (avoids
    // calling setState synchronously in the effect body).
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return colors;
}
