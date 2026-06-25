"use client";

import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Icon } from "./Icon";

export type ErrorBoundaryProps = {
  children: ReactNode;
  /**
   * Custom fallback. Receives the error and a reset() to retry rendering.
   * When omitted, a friendly default card with a Retry button is shown.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Optional error reporter. */
  onError?: (error: Error, info: ErrorInfo) => void;
};

type State = { error: Error | null };

/**
 * Per-route error boundary with a friendly fallback + retry. Wrap route content
 * so a render error in one page never blanks the whole app.
 *
 * <ErrorBoundary><DashboardPage /></ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return (
        <div className="flex flex-col items-center justify-center text-center gap-3 px-6 py-12">
          <span className="flex items-center justify-center h-12 w-12 rounded-full bg-destructive/10 text-destructive">
            <Icon name="alert-triangle" size={24} />
          </span>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              Something went wrong
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {error.message || "An unexpected error occurred while rendering."}
            </p>
          </div>
          <button
            type="button"
            onClick={this.reset}
            className="inline-flex items-center gap-2 h-11 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Icon name="refresh" size={16} />
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
