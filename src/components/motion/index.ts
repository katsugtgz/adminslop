/**
 * Motion primitives — lightweight React wrappers around the
 * transitions.dev CSS classes defined in src/app/globals.css.
 *
 * Each component:
 * - Adds `is-shown` after mount so transitions play
 * - Honors prefers-reduced-motion via the CSS guard
 * - Stays under 30 LOC to keep client bundle minimal
 *
 * See: https://transitions.dev/ for visual reference of each.
 */

export { PageReveal, type PageRevealProps } from "./page-reveal";
export { TextStagger, type TextStaggerProps } from "./text-stagger";
export { ShimmerText, type ShimmerTextProps } from "./shimmer-text";
export { CardHover, type CardHoverProps } from "./card-hover";
