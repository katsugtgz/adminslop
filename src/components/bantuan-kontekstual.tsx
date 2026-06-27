"use client";

import { useId, useReducer } from "react";
import { HelpCircle } from "lucide-react";

import { cn } from "@/lib/utils";

type State = { open: boolean };

type Action = { type: "open" } | { type: "close" } | { type: "toggle" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "open":
      return { open: true };
    case "close":
      return { open: false };
    case "toggle":
      return { open: !state.open };
  }
}

/**
 * Bantuan Kontekstual — inline help tooltip that wraps a help icon next to a
 * label or field. Reveals the `teks` on hover, focus, or click; keyboard users
 * tab to it and press Enter/Esc.
 */
export function BantuanKontekstual({
  teks,
  label,
  className,
}: {
  teks: string;
  label?: string;
  className?: string;
}) {
  const [state, dispatch] = useReducer(reducer, { open: false });
  const tooltipId = useId();
  const accessibleLabel = label ?? "Bantuan";

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <button
        type="button"
        aria-label={accessibleLabel}
        aria-describedby={state.open ? tooltipId : undefined}
        aria-expanded={state.open}
        aria-haspopup="true"
        onClick={() => dispatch({ type: "toggle" })}
        onFocus={() => dispatch({ type: "open" })}
        onBlur={() => dispatch({ type: "close" })}
        onMouseEnter={() => dispatch({ type: "open" })}
        onMouseLeave={() => dispatch({ type: "close" })}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
      </button>
      {state.open && (
        <span
          role="tooltip"
          id={tooltipId}
          className="absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-xs -translate-x-1/2 rounded-md border border-border/60 bg-popover p-3 text-xs text-popover-foreground shadow-warm"
        >
          {teks}
        </span>
      )}
    </span>
  );
}
