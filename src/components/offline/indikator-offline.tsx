"use client";

import { useSyncExternalStore } from "react";
import { CloudOff, Cloud } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Mode Offline (#21) — compact online/offline badge. Subscribes to the browser
 * `online` / `offline` events via `useSyncExternalStore` for SSR-safe initial
 * state (server renders "online"; client hydrates to the real value without a
 * mount-effect re-render).
 */
function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

export function IndikatorOffline({ className }: { className?: string }) {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const sedangOffline = online === false;
  const Ikon = sedangOffline ? CloudOff : Cloud;

  return (
    <output
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm",
        sedangOffline
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-success/30 bg-success/10 text-success",
        className
      )}
    >
      <Ikon className="h-3.5 w-3.5" aria-hidden="true" />
      {sedangOffline ? "Mode Offline" : "Online"}
    </output>
  );
}
