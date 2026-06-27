"use client";

import * as React from "react";

/**
 * CardHover — wraps an element with the .t-lift hover lift transition.
 * Forwards arbitrary DOM/ARIA props (aria-current, aria-label, role, …)
 * onto the rendered element (or cloned child when `asChild`).
 *
 * For hover lift to be visible, the wrapped element should already
 * have a background + shadow (the lift replaces the shadow).
 *
 * Usage:
 *   <CardHover asChild><Link className="...">…</Link></CardHover>
 *   <CardHover as="li" aria-current="true" className="rounded-xl bg-card p-5 shadow-warm">…</CardHover>
 */
export type CardHoverProps = Omit<
  React.HTMLAttributes<HTMLElement>,
  "className"
> & {
  children?: React.ReactNode;
  as?: React.ElementType;
  asChild?: boolean;
  className?: string;
};

export function CardHover({
  children,
  className,
  as: Comp = "div",
  asChild = false,
  ...rest
}: CardHoverProps) {
  const cls = `t-lift${className ? ` ${className}` : ""}`;
  if (asChild && React.isValidElement(children)) {
    const childProps = (children.props ?? {}) as Record<string, unknown>;
    // Spread `rest` first, then the child's own props, so the child wins for
    // behaviour (onClick, aria-*, …); className is always merged.
    return React.cloneElement(
      children as React.ReactElement<Record<string, unknown>>,
      {
        ...rest,
        ...childProps,
        className: cnMerge(childProps.className as string | undefined, cls),
      },
    );
  }
  return (
    <Comp className={cls} {...rest}>
      {children}
    </Comp>
  );
}

// Tiny merge to avoid pulling tailwind-merge into a tiny client component
function cnMerge(a: string | undefined, b: string) {
  return a ? `${a} ${b}` : b;
}
