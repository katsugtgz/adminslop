"use client";

import * as React from "react";

/**
 * ShimmerText — shimmer sweep across a status / loading label.
 * Port of transitions.dev's `t-shimmer` pattern.
 *
 * The visible string is duplicated into data-text so the ::before
 * mask layer can sweep across the same glyphs. Keep them in sync.
 *
 * Usage:
 *   <ShimmerText>Memuat data sekolah...</ShimmerText>
 */
export type ShimmerTextProps = {
  children: string;
  className?: string;
};

export function ShimmerText({ children, className }: ShimmerTextProps) {
  return (
    <span
      className={`t-shimmer${className ? ` ${className}` : ""}`}
      data-text={children}
    >
      {children}
    </span>
  );
}
