"use client";

import { useSyncExternalStore } from "react";
import { useConvexConnectionState } from "convex/react";
import { cn } from "./cn";
import { Icon } from "./Icon";

/** Subscribe to navigator online/offline via useSyncExternalStore. */
function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
function useNavigatorOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true, // assume online during SSR
  );
}

export type ConnectionStatusProps = {
  /** Hide the text label and show only the dot + icon (compact rail). */
  iconOnly?: boolean;
  className?: string;
};

type Status = "online" | "reconnecting" | "offline";

/**
 * Live connection indicator driven by Convex's WebSocket state plus
 * navigator.onLine. Shows online / reconnecting / offline.
 *
 * <ConnectionStatus />          // dot + label
 * <ConnectionStatus iconOnly /> // dot only (icon rail)
 */
export function ConnectionStatus({ iconOnly, className }: ConnectionStatusProps) {
  const convexState = useConvexConnectionState();
  const navOnline = useNavigatorOnline();

  let status: Status;
  if (!navOnline) {
    status = "offline";
  } else if (convexState.isWebSocketConnected) {
    status = "online";
  } else {
    // Network is up but the WS isn't connected — connecting/reconnecting.
    status = "reconnecting";
  }

  const config: Record<
    Status,
    { label: string; dot: string; text: string; icon: "wifi" | "wifi-off" }
  > = {
    online: {
      label: "Connected",
      dot: "bg-success",
      text: "text-text-muted",
      icon: "wifi",
    },
    reconnecting: {
      label: "Reconnecting…",
      dot: "bg-warning",
      text: "text-warning",
      icon: "wifi",
    },
    offline: {
      label: "Offline",
      dot: "bg-danger",
      text: "text-danger",
      icon: "wifi-off",
    },
  };
  const c = config[status];

  return (
    <div
      className={cn("inline-flex items-center gap-2 text-xs", c.text, className)}
      role="status"
      aria-label={`Connection: ${c.label}`}
      title={c.label}
    >
      <span
        className={cn(
          "inline-block h-2 w-2 rounded-full shrink-0",
          c.dot,
          status === "reconnecting" && "animate-pulse",
        )}
        aria-hidden="true"
      />
      {iconOnly ? (
        <Icon name={c.icon} size={14} aria-hidden="true" />
      ) : (
        <span>{c.label}</span>
      )}
    </div>
  );
}

export default ConnectionStatus;
