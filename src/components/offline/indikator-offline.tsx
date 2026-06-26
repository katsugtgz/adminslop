"use client";

import { useEffect, useState } from "react";
import { CloudOff, Cloud } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Mode Offline (#21) — compact online/offline badge. Subscribes to the browser
 * `online` / `offline` events so it updates live. Renders neutral on the server
 * (no `navigator` yet) and on first paint, then snaps to the real status after
 * mount.
 */
export function IndikatorOffline({ className }: { className?: string }) {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const sedangOffline = online === false;
  const Ikon = sedangOffline ? CloudOff : Cloud;

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        sedangOffline
          ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        className
      )}
    >
      <Ikon className="h-3.5 w-3.5" aria-hidden="true" />
      {online === null
        ? "Memeriksa koneksi"
        : sedangOffline
          ? "Mode Offline"
          : "Online"}
    </span>
  );
}
