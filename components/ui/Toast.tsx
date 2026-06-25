"use client";

import type { ReactNode } from "react";
import { Toaster as SonnerToaster, toast as sonner } from "sonner";
import { useTheme } from "@/components/ThemeProvider";
import { toToastArgs, type ToastOptions, type ToastVariant } from "@/lib/toast";

export type { ToastOptions, ToastVariant };

type ToastId = string | number;

type ToastApi = {
  toast: (opts: ToastOptions) => ToastId;
  success: (title: string, description?: string) => ToastId;
  error: (title: string, description?: string) => ToastId;
  info: (title: string, description?: string) => ToastId;
  warning: (title: string, description?: string) => ToastId;
  dismiss: (id?: ToastId) => void;
};

function push(opts: ToastOptions): ToastId {
  const { method, message, data } = toToastArgs(opts);
  return sonner[method](message, data);
}

/**
 * Backward-compatible toast API, now backed by Sonner. The hook no longer needs
 * a React context (Sonner is a global singleton), but the signature is frozen
 * so all existing call sites keep working unchanged.
 *
 *   const { success, error } = useToast();
 *   success("Sale complete", "Receipt #1042 saved");
 */
export function useToast(): ToastApi {
  return {
    toast: push,
    success: (title, description) =>
      push({ title, description, variant: "success" }),
    error: (title, description) =>
      push({ title, description, variant: "danger" }),
    info: (title, description) => push({ title, description, variant: "info" }),
    warning: (title, description) =>
      push({ title, description, variant: "warning" }),
    dismiss: (id) => sonner.dismiss(id),
  };
}

/**
 * Mounts the Sonner toaster, themed off the app's manual .dark toggle, with
 * rich colors so success/error/warning render with semantic accents. Kept as
 * `ToastProvider` so app/layout.tsx wiring is unchanged.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <>
      {children}
      <SonnerToaster
        theme={theme}
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{ duration: 4000 }}
      />
    </>
  );
}

export default ToastProvider;
