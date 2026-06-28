"use client";

import * as React from "react";

/**
 * TextStagger — staggered blur-rise entrance for hero copy / empty states.
 * Port of transitions.dev's `t-stagger` pattern.
 *
 * Usage:
 *   <TextStagger lines={["Selamat datang di", "EduAdmin Pro Premium"]} />
 *   <TextStagger lines={["Headline", <>with <em>emphasis</em></>]} />
 *   <TextStagger lines="Single line" />
 *
 * Each line receives .t-stagger-line--N (1-4 supported for delay).
 */
export type TextStaggerProps = {
  lines: React.ReactNode | React.ReactNode[];
  as?: React.ElementType;
  className?: string;
  lineClassName?: string;
};

export function TextStagger({
  lines,
  as: Comp = "div",
  className,
  lineClassName,
}: TextStaggerProps) {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const arr = Array.isArray(lines) ? lines : [lines];

  return (
    <Comp
      className={`t-stagger${shown ? " is-shown" : ""}${className ? ` ${className}` : ""}`}
    >
      {arr.map((line, i) => {
        const idx = i + 1;
        // Only delay lines 2-4 (line 1 plays immediately)
        const delayClass = idx > 1 && idx <= 4 ? ` t-stagger-line--${idx}` : "";
        return (
          // Positional stagger: index is the semantic line position (the
          // animation delay is derived from it) and lines never reorder.
          // react-doctor-disable-next-line no-array-index-as-key
          <span
            key={i}
            className={`t-stagger-line${delayClass}${lineClassName ? ` ${lineClassName}` : ""}`}
          >
            {line}
          </span>
        );
      })}
    </Comp>
  );
}
