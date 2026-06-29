import Link from "next/link";
import type { Metadata } from "next";
import { Button, Icon } from "@/components/ui";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * 404 fallback for unmatched routes. Rendered inside the root layout, so
 * providers + design tokens are available.
 */
export default function NotFound() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 py-12 text-center"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon name="search" size={28} />
      </span>

      <div className="space-y-1.5">
        <p className="text-sm font-semibold uppercase tracking-wider text-primary">
          404
        </p>
        <h2 className="text-lg font-semibold text-text">
          We couldn&apos;t find that page
        </h2>
        <p className="max-w-md text-sm text-text-muted">
          The link may be broken or the page may have been moved.
        </p>
      </div>

      <Link href="/dashboard">
        <Button variant="primary" leftIcon={<Icon name="home" size={16} />}>
          Back to dashboard
        </Button>
      </Link>
    </div>
  );
}
