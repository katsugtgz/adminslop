import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Shared input field styling. Extracted from the former `INPUT_CLASS` constant
 * that was duplicated across `cetak/` and `peserta-didik/` forms. Reused by
 * `<Input>` and by raw `<select>` elements that need identical field chrome
 * (a dedicated `<Select>` primitive is deferred until usage justifies it).
 *
 * `h-11` (44px) satisfies the WCAG 2.5.8 AAA / Apple HIG tap target minimum,
 * matching `Button`'s default size.
 */
export const inputVariants = cva(
  "h-11 rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
);

export type InputVariantProps = VariantProps<typeof inputVariants>;

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    InputVariantProps {
  ref?: React.Ref<HTMLInputElement>;
}

/** shadcn-style text input. Forwards all native `<input>` props. */
export function Input({ className, type, ref, ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(inputVariants(), className)}
      ref={ref}
      {...props}
    />
  );
}
