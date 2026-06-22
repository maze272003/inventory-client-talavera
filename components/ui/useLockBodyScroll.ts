"use client";

import { useEffect } from "react";

/**
 * Locks <body> scroll while `locked` is true (used by Dialog / Drawer). Restores
 * the previous overflow value on unlock/unmount, and is safe to nest because it
 * captures the prior value each time it engages.
 */
export function useLockBodyScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}
