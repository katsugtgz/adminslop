"use client";

import * as React from "react";

/**
 * CardHover — wraps an element with the .t-lift hover lift transition.
 * Pass through props to a div by default; override via `as`.
 *
 * For hover lift to be visible, the wrapped element should already
 * have a background + shadow (the lift replaces the shadow).
 *
 * Usage:
 *   <CardHover asChild><Link className="...">…</Link></CardHover>
 *   <CardHover className="rounded-xl bg-card p-5 shadow-warm">…</CardHover>
 */
export type CardHoverProps = {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
  asChild?: boolean;
};

export function CardHover({
  children,
  className,
  as: Comp = "div",
  asChild = false,
}: CardHoverProps) {
  const cls = `t-lift${className ? ` ${className}` : ""}`;
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ className?: string }>, {
      className: cnMerge((children.props as { className?: string }).className, cls),
    });
  }
  return <Comp className={cls}>{children}</Comp>;
}

// Tiny merge to avoid pulling tailwind-merge into a tiny client component
function cnMerge(a: string | undefined, b: string) {
  return a ? `${a} ${b}` : b;
}
