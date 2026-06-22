"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Theme = "light" | "dark";
export type Density = "comfortable" | "compact";

const THEME_KEY = "ui-theme";
const DENSITY_KEY = "ui-density";

type ThemeContextValue = {
  theme: Theme;
  density: Density;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setDensity: (density: Density) => void;
  toggleDensity: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Inline no-flash script. Injected in <head> (layout.tsx) so the .dark class
 * and data-density attribute are set on <html> before first paint, avoiding a
 * flash of the wrong theme/density (FOUC). Mirrors the defaults below.
 */
export const themeNoFlashScript = `(function(){try{
var t=localStorage.getItem('${THEME_KEY}');
if(t!=='light'&&t!=='dark'){t='light';}
var d=localStorage.getItem('${DENSITY_KEY}');
if(d!=='comfortable'&&d!=='compact'){d='comfortable';}
var e=document.documentElement;
if(t==='dark'){e.classList.add('dark');}else{e.classList.remove('dark');}
e.setAttribute('data-density',d);
}catch(_){}})();`;

function readStored<T extends string>(key: string, fallback: T, valid: T[]): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key) as T | null;
    return v && valid.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialize from storage; the no-flash script already applied DOM state,
  // so these match what's painted and avoid a hydration mismatch.
  const [theme, setThemeState] = useState<Theme>(() =>
    readStored<Theme>(THEME_KEY, "light", ["light", "dark"]),
  );
  const [density, setDensityState] = useState<Density>(() =>
    readStored<Density>(DENSITY_KEY, "comfortable", ["comfortable", "compact"]),
  );

  // Apply theme to <html> + persist.
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // Apply density to <html> + persist.
  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
    try {
      window.localStorage.setItem(DENSITY_KEY, density);
    } catch {
      /* ignore */
    }
  }, [density]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggleTheme = useCallback(
    () => setThemeState((p) => (p === "dark" ? "light" : "dark")),
    [],
  );
  const setDensity = useCallback((d: Density) => setDensityState(d), []);
  const toggleDensity = useCallback(
    () =>
      setDensityState((p) => (p === "compact" ? "comfortable" : "compact")),
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, density, setTheme, toggleTheme, setDensity, toggleDensity }),
    [theme, density, setTheme, toggleTheme, setDensity, toggleDensity],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
