import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";
import { buttonVariants, type ButtonVariantProps } from "@/components/ui/button-variants";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonVariantProps {
  asChild?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ref,
  disabled = false,
  "aria-busy": ariaBusy,
  "aria-disabled": ariaDisabled,
  tabIndex,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  const busy = ariaBusy === true || ariaBusy === "true";
  const disabledState = disabled || busy;
  const interactionProps = asChild
    ? {
        "aria-disabled": ariaDisabled ?? (disabledState ? true : undefined),
        tabIndex: disabledState ? -1 : tabIndex,
      }
    : {
        "aria-disabled": ariaDisabled,
        disabled: disabledState,
        tabIndex,
      };

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      aria-busy={ariaBusy}
      {...interactionProps}
      {...props}
    />
  );
}
