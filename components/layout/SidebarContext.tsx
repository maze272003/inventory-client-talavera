"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type SidebarState = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  toggle: () => void;
};

const COLLAPSE_KEY = "ui-sidebar-collapsed";
const SidebarContext = createContext<SidebarState | null>(null);

function readStored(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

/**
 * Controls desktop sidebar collapse/expand. Persisted to localStorage so the
 * cashier's preference survives reloads. The mobile drawer is independent.
 */
export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState<boolean>(readStored);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "collapsed" : "expanded");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const setCollapsed = useCallback((c: boolean) => setCollapsedState(c), []);
  const toggle = useCallback(() => setCollapsedState((p) => !p), []);

  const value = useMemo(
    () => ({ collapsed, setCollapsed, toggle }),
    [collapsed, setCollapsed, toggle],
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarState {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return ctx;
}
