"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, Icon } from "@/components/ui";

/**
 * In-shell error fallback. Catches render errors inside the (app) routes
 * while keeping the sidebar/topbar chrome mounted — only the <main> area
 * swaps to this fallback. Honors the same design tokens as ErrorBoundary.
 */
export default function AppRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app route error]", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-12 text-center"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
        <Icon name="alert-triangle" size={28} />
      </span>

      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold text-text">Something went wrong</h2>
        <p className="max-w-md text-sm text-text-muted">
          {error.message ||
            "An unexpected error occurred while rendering this page."}
        </p>
        {error.digest ? (
          <p className="text-xs text-text-subtle">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="primary"
          onClick={reset}
          leftIcon={<Icon name="refresh" size={16} />}
        >
          Try again
        </Button>
        <Link href="/dashboard">
          <Button
            variant="secondary"
            leftIcon={<Icon name="home" size={16} />}
          >
            Back to dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
