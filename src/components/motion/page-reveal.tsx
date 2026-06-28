"use client";

import * as React from "react";

/**
 * PageReveal — staggered entrance wrapper for page sections.
 * Mounts children with .t-rise CSS, then adds .is-shown after first paint
 * so transitions play. Honors prefers-reduced-motion via CSS guard.
 *
 * Forwards arbitrary DOM/ARIA props (aria-label, role, data-*, …) onto the
 * rendered element so callers can label named regions.
 *
 * Usage:
 *   <PageReveal as="section" delay={2}><Hero /></PageReveal>
 *   <PageReveal as="section" aria-label="Onboarding">…</PageReveal>
 */
export type PageRevealProps = Omit<
  React.HTMLAttributes<HTMLElement>,
  "className"
> & {
  children?: React.ReactNode;
  /** 1-6; each step delays entrance by 80ms */
  delay?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Element type to render (default div) */
  as?: React.ElementType;
  className?: string;
};

export function PageReveal({
  children,
  delay = 1,
  as: Comp = "div",
  className,
  ...rest
}: PageRevealProps) {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const delayClass = delay > 1 ? ` t-rise--${delay}` : "";
  return (
    <Comp
      className={`t-rise${delayClass}${shown ? " is-shown" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </Comp>
  );
}
