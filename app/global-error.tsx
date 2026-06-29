"use client";

import { useEffect } from "react";

/**
 * Last-resort fallback. Activates when the root layout itself throws, which
 * means providers, fonts, and globals.css may all be unavailable. Must render
 * its own <html>/<body> and use inline styles — no design tokens, no
 * Tailwind classes, no Provider dependencies. Keep it tiny and bulletproof.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          background: "#f1f5f9",
          color: "#0f172a",
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div
          role="alert"
          style={{
            maxWidth: "28rem",
            textAlign: "center",
            background: "#ffffff",
            borderRadius: "0.75rem",
            boxShadow:
              "0 12px 32px -8px rgb(15 23 42 / 0.18), 0 4px 12px -4px rgb(15 23 42 / 0.1)",
            padding: "2rem",
          }}
        >
          <div
            style={{
              width: "3.5rem",
              height: "3.5rem",
              borderRadius: "9999px",
              background: "#ffe4e6",
              color: "#e11d48",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "1rem",
            }}
            aria-hidden="true"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <h1
            style={{
              margin: "0 0 0.5rem",
              fontSize: "1.125rem",
              fontWeight: 600,
            }}
          >
            The app hit an unexpected error
          </h1>
          <p
            style={{
              margin: "0 0 0.25rem",
              fontSize: "0.875rem",
              color: "#64748b",
              lineHeight: 1.5,
            }}
          >
            {error.message ||
              "An unexpected error occurred and the application could not recover."}
          </p>
          {error.digest ? (
            <p
              style={{
                margin: "0 0 1.25rem",
                fontSize: "0.75rem",
                color: "#94a3b8",
                fontFamily:
                  'ui-monospace, "SF Mono", "Cascadia Code", "Roboto Mono", monospace',
              }}
            >
              Reference: {error.digest}
            </p>
          ) : (
            <div style={{ height: "1.25rem" }} />
          )}

          <button
            type="button"
            onClick={reset}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              height: "2.75rem",
              padding: "0 1rem",
              borderRadius: "0.375rem",
              border: "1px solid transparent",
              background: "#e1232f",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
